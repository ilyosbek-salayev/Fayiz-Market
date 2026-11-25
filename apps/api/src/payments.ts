// Checkout payment/fulfilment options, order payment status, and the Payme / Click merchant endpoints.
//
// Rules that hold everywhere (API code + D1 triggers in 0007_v1_storefront.sql):
//  • The amount is always the order total computed by the server; a client-sent amount is never trusted.
//  • An order becomes "paid" only when money is in the ledger (an employee recorded it) or a provider performed
//    the exact total. Creating an order never marks it paid.
//  • Every provider callback is idempotent (UNIQUE(provider, provider_txn_id)); at most one live transaction per order.
//  • Payme requests are authenticated with the merchant key (HTTP Basic), Click requests with the MD5 signature.
//  • Card numbers / CVV never reach this server — online payment happens on the provider's own page.
import { z } from 'zod';
import type { App, Bindings } from './lib';
import { audit, fail, idFrom, limitOr429, orderEvent, ownerOnly, parse, putSettings, settingsMap, staffOnly } from './lib';
import { safeEqual } from './password';
import { authorizedOrder } from './delivery';
import { notify, pushCustomer } from './push';

export const PAYMENT_METHODS = ['cash', 'card_terminal', 'bank_transfer', 'payme', 'click'] as const;
export type PaymentMethod = typeof PAYMENT_METHODS[number];
export const PAYMENT_LABELS: Record<PaymentMethod, string> = { cash: 'Naqd pul', card_terminal: 'Karta (terminal orqali)', bank_transfer: 'Bank oʻtkazmasi', payme: 'Payme', click: 'Click' };
const OFFLINE = ['cash', 'card_terminal', 'bank_transfer'] as const;
const ONLINE = ['payme', 'click'] as const;
type Store = { address: string; lat: number | null; lng: number | null };
type OrderPayRow = { id: number; order_number: string; total: number; status: string; payment_method: PaymentMethod; payment_status: string; customer_id: number | null; paid_at?: string | null; payment_note?: string };
const ctxOf = (c: { executionCtx: unknown }) => { try { return c.executionCtx as { waitUntil(p: Promise<unknown>): void }; } catch { return undefined; } };

export const paymeKey = (env: Bindings, s: Record<string, string>) => (s.payme_mode === 'production' ? env.PAYME_KEY : env.PAYME_TEST_KEY) || '';
/** An online method is offered only when it is switched on AND its merchant credentials exist. */
export const onlineReady: Record<'payme' | 'click', (env: Bindings, s: Record<string, string>) => boolean> = {
  payme: (env, s) => s.payme_enabled === '1' && /^[0-9a-f]{24}$/i.test(s.payme_merchant_id || '') && !!paymeKey(env, s),
  click: (env, s) => s.click_enabled === '1' && /^\d{1,12}$/.test(s.click_service_id || '') && /^\d{1,12}$/.test(s.click_merchant_id || '') && !!env.CLICK_SECRET_KEY,
};

const wholeSoum = (v: string | undefined) => { const n = Math.trunc(Number(v)); return Number.isFinite(n) && n > 0 ? n : 0; };
/** Courier fee added on top of the goods (0 for pickup, or when the goods reach the free-delivery threshold). */
export function deliveryFeeFor(s: Record<string, string>, itemsTotal: number, fulfillment: 'delivery' | 'pickup') {
  if (fulfillment === 'pickup') return 0;
  const fee = wholeSoum(s.delivery_fee), freeFrom = wholeSoum(s.delivery_free_from);
  return freeFrom > 0 && itemsTotal >= freeFrom ? 0 : fee;
}

export function checkoutOptions(env: Bindings, s: Record<string, string>, store: Store) {
  const offline = OFFLINE.filter(m => (s[`payment_${m}`] ?? (m === 'cash' ? '1' : '0')) === '1');
  const payments: { method: PaymentMethod; label: string; online: boolean }[] = [
    ...offline.map(method => ({ method, label: PAYMENT_LABELS[method], online: false })),
    ...ONLINE.filter(m => onlineReady[m](env, s)).map(method => ({ method, label: PAYMENT_LABELS[method], online: true })),
  ];
  if (!payments.length) payments.push({ method: 'cash', label: PAYMENT_LABELS.cash, online: false }); // checkout is never left without a way to pay
  const pickup = s.fulfillment_pickup === '1' && store.address.trim().length >= 5;
  return {
    deliveryFee: wholeSoum(s.delivery_fee), deliveryFreeFrom: wholeSoum(s.delivery_free_from),
    fulfillment: pickup ? ['delivery', 'pickup'] as const : ['delivery'] as const,
    payments,
    bankTransferDetails: offline.includes('bank_transfer') ? s.bank_transfer_details || '' : '',
    pickupAddress: pickup ? store.address : '',
  };
}

/** Payment block of an order, as the customer sees it (no ledger internals). */
export function customerPaymentView(row: OrderPayRow & { fulfillment?: string }, s: Record<string, string>) {
  const open = ['pending', 'failed', 'verifying'].includes(row.payment_status) && row.status !== 'cancelled';
  return {
    method: row.payment_method, status: row.payment_status, paidAt: row.paid_at ?? null,
    note: row.payment_status === 'failed' ? row.payment_note || '' : '',
    bankTransferDetails: row.payment_method === 'bank_transfer' && open ? s.bank_transfer_details || '' : '',
    canClaimTransfer: row.payment_method === 'bank_transfer' && ['pending', 'failed'].includes(row.payment_status) && row.status !== 'cancelled',
    canPayOnline: (row.payment_method === 'payme' || row.payment_method === 'click') && open,
  };
}

/** Staff view: status plus manual ledger and provider transactions. */
export async function adminPaymentView(db: D1Database, orderId: number) {
  const txns = (await db.prepare('SELECT id,provider,provider_txn_id AS providerTxnId,amount,state,created_ms AS createdMs,performed_ms AS performedMs,cancelled_ms AS cancelledMs,cancel_reason AS cancelReason,detail FROM payment_transactions WHERE order_id=? ORDER BY id DESC').bind(orderId).all()).results;
  return { transactions: txns };
}

/** Marks an order paid when the manual ledger covers the total (called right after a payment row is inserted). */
export const settleFromLedger = (db: D1Database, orderId: number) => db.prepare(
  "UPDATE orders SET payment_status='paid',paid_at=CURRENT_TIMESTAMP,payment_note='',updated_at=CURRENT_TIMESTAMP WHERE id=? AND payment_status IN ('pending','verifying','failed') AND (SELECT COALESCE(SUM(amount),0) FROM payments WHERE order_id=?) >= total",
).bind(orderId, orderId);

// ======================================================================= Payme (Merchant API, JSON-RPC 2.0)
const PAYME_TIMEOUT_MS = 43_200_000; // 12 h: Payme's limit for an unperformed transaction
type Rpc = { result?: unknown; error?: { code: number; message: { uz: string; ru: string; en: string }; data?: string } };
const rpcError = (code: number, uz: string, ru: string, en: string, data?: string): Rpc => ({ error: { code, message: { uz, ru, en }, ...(data ? { data } : {}) } });
const PE = {
  parse: rpcError(-32700, 'JSON xato', 'Ошибка парсинга JSON', 'Parse error'),
  request: rpcError(-32600, 'Soʻrov notoʻgʻri', 'Неверный запрос', 'Invalid request'),
  auth: rpcError(-32504, 'Ruxsat yoʻq', 'Недостаточно привилегий для выполнения метода', 'Insufficient privileges'),
  method: rpcError(-32601, 'Metod topilmadi', 'Метод не найден', 'Method not found'),
  system: rpcError(-32400, 'Tizim xatosi', 'Системная ошибка', 'System error'),
  amount: rpcError(-31001, 'Summa notoʻgʻri', 'Неверная сумма', 'Invalid amount'),
  txn: rpcError(-31003, 'Tranzaksiya topilmadi', 'Транзакция не найдена', 'Transaction not found'),
  cannotCancel: rpcError(-31007, 'Buyurtma bajarilgan, bekor qilib boʻlmaydi', 'Заказ выполнен. Невозможно отменить транзакцию', 'Order completed, transaction cannot be cancelled'),
  cannotPerform: rpcError(-31008, 'Amalni bajarib boʻlmaydi', 'Невозможно выполнить операцию', 'Unable to perform operation'),
  order: rpcError(-31050, 'Buyurtma topilmadi', 'Заказ не найден', 'Order not found', 'order_id'),
  orderBusy: rpcError(-31051, 'Buyurtma toʻlangan yoki boshqa toʻlovni kutmoqda', 'Заказ оплачен или ожидает другую оплату', 'Order is paid or awaits another payment', 'order_id'),
};
type TxnRow = { id: number; order_id: number; provider: 'payme' | 'click'; provider_txn_id: string; amount: number; state: 'created' | 'performed' | 'cancelled' | 'refunded'; provider_time: number | null; created_ms: number; performed_ms: number | null; cancelled_ms: number | null; cancel_reason: number | null };
const paymeState = (t: TxnRow) => ({ created: 1, performed: 2, cancelled: -1, refunded: -2 })[t.state];
const txnBy = (db: D1Database, provider: string, providerId: string) => db.prepare('SELECT * FROM payment_transactions WHERE provider=? AND provider_txn_id=?').bind(provider, providerId).first<TxnRow>();
const orderFor = (db: D1Database, id: number) => db.prepare('SELECT id,order_number,total,status,payment_method,payment_status,customer_id FROM orders WHERE id=?').bind(id).first<OrderPayRow>();

async function paymeOrder(db: D1Database, account: unknown, amount: unknown): Promise<{ order?: OrderPayRow; error?: Rpc }> {
  const orderId = Number((account as { order_id?: unknown } | null)?.order_id);
  if (!Number.isSafeInteger(orderId) || orderId < 1) return { error: PE.order };
  const order = await orderFor(db, orderId);
  if (!order || order.payment_method !== 'payme') return { error: PE.order };
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount !== order.total * 100) return { error: PE.amount };
  if (order.status === 'cancelled' || ['paid', 'refunded', 'cancelled'].includes(order.payment_status)) return { error: PE.orderBusy };
  return { order };
}
type Ctx = { waitUntil(p: Promise<unknown>): void } | undefined;
async function closeTxn(env: Bindings, t: TxnRow, reason: number, note: string) {
  const now = Date.now();
  if (t.state === 'created') {
    await env.DB.batch([
      env.DB.prepare("UPDATE payment_transactions SET state='cancelled',cancelled_ms=?,cancel_reason=? WHERE id=? AND state='created'").bind(now, reason, t.id),
      env.DB.prepare("UPDATE orders SET payment_status='failed',payment_note=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND payment_status='verifying'").bind(note, t.order_id),
    ]);
    await orderEvent(env.DB, t.order_id, 'system', null, 'payment_failed', { provider: t.provider, reason });
    return { state: 'cancelled' as const, at: now };
  }
  await env.DB.batch([
    env.DB.prepare("UPDATE payment_transactions SET state='refunded',cancelled_ms=?,cancel_reason=? WHERE id=? AND state='performed'").bind(now, reason, t.id),
    env.DB.prepare("UPDATE orders SET payment_status='refunded',payment_note=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND payment_status='paid'").bind(note, t.order_id),
  ]);
  await orderEvent(env.DB, t.order_id, 'system', null, 'payment_refunded', { provider: t.provider, reason });
  return { state: 'refunded' as const, at: now };
}
async function performTxn(env: Bindings, ctx: Ctx, t: TxnRow): Promise<number | null> {
  const now = Date.now();
  try {
    await env.DB.batch([
      env.DB.prepare("UPDATE payment_transactions SET state='performed',performed_ms=? WHERE id=? AND state='created'").bind(now, t.id),
      env.DB.prepare("UPDATE orders SET payment_status='paid',paid_at=CURRENT_TIMESTAMP,payment_note='',updated_at=CURRENT_TIMESTAMP WHERE id=? AND payment_status IN ('pending','verifying','failed')").bind(t.order_id),
    ]);
  } catch (error) { console.error(JSON.stringify({ event: 'payment_perform_refused', provider: t.provider, txn: t.id, error: String(error) })); return null; }
  const order = (await orderFor(env.DB, t.order_id))!;
  if (order.payment_status !== 'paid') return null;
  await orderEvent(env.DB, t.order_id, 'system', null, 'payment_received', { provider: t.provider, amount: t.amount });
  await notify(env, ctx, { audience: 'staff', orderId: t.order_id, kind: 'payment', title: `Toʻlov qabul qilindi ${order.order_number}`, body: `${PAYMENT_LABELS[t.provider]} orqali` });
  await pushCustomer(env, ctx, order.customer_id, { orderId: t.order_id, kind: 'payment_paid', title: 'Toʻlov qabul qilindi', body: order.order_number });
  return now;
}

export async function handlePayme(env: Bindings, ctx: Ctx, authorization: string, body: unknown): Promise<{ id: unknown } & Rpc> {
  const req = body as { id?: unknown; method?: string; params?: Record<string, any> } | null;
  const id = req?.id ?? null;
  const s = await settingsMap(env.DB), key = paymeKey(env, s);
  let given = '';
  try { given = authorization.startsWith('Basic ') ? atob(authorization.slice(6).trim()) : ''; } catch { given = ''; }
  if (s.payme_enabled !== '1' || !key || !safeEqual(given, `Paycom:${key}`)) return { id, ...PE.auth };
  if (!req || typeof req.method !== 'string' || typeof req.params !== 'object' || !req.params) return { id, ...PE.request };
  const p = req.params;
  const db = env.DB;
  switch (req.method) {
    case 'CheckPerformTransaction': {
      const check = await paymeOrder(db, p.account, p.amount);
      if (check.error) return { id, ...check.error };
      const live = await db.prepare("SELECT id FROM payment_transactions WHERE order_id=? AND state IN ('created','performed')").bind(check.order!.id).first();
      return live ? { id, ...PE.orderBusy } : { id, result: { allow: true } };
    }
    case 'CreateTransaction': {
      if (typeof p.id !== 'string' || !p.id || p.id.length > 64) return { id, ...PE.request };
      const existing = await txnBy(db, 'payme', p.id);
      if (existing) {
        if (existing.state !== 'created') return { id, ...PE.cannotPerform };
        if (Date.now() - existing.created_ms > PAYME_TIMEOUT_MS) { await closeTxn(env, existing, 4, 'Payme: muddati oʻtdi'); return { id, ...PE.cannotPerform }; }
        return { id, result: { create_time: existing.created_ms, transaction: String(existing.id), state: 1 } };
      }
      const check = await paymeOrder(db, p.account, p.amount);
      if (check.error) return { id, ...check.error };
      const order = check.order!, now = Date.now();
      try {
        const [inserted] = await db.batch([
          db.prepare("INSERT INTO payment_transactions(order_id,provider,provider_txn_id,amount,state,provider_time,created_ms) VALUES(?,'payme',?,?,'created',?,?) RETURNING id").bind(order.id, p.id, order.total, Number(p.time) || now, now),
          db.prepare("UPDATE orders SET payment_status='verifying',payment_note='',updated_at=CURRENT_TIMESTAMP WHERE id=? AND payment_status IN ('pending','failed')").bind(order.id),
        ]);
        const txnId = (inserted.results as { id: number }[])[0].id;
        await orderEvent(db, order.id, 'system', null, 'payment_started', { provider: 'payme' });
        return { id, result: { create_time: now, transaction: String(txnId), state: 1 } };
      } catch (error) {
        if (String(error).includes('UNIQUE')) return { id, ...PE.orderBusy }; // another live transaction won the race
        throw error;
      }
    }
    case 'PerformTransaction': {
      const t = typeof p.id === 'string' ? await txnBy(db, 'payme', p.id) : null;
      if (!t) return { id, ...PE.txn };
      if (t.state === 'performed') return { id, result: { transaction: String(t.id), perform_time: t.performed_ms, state: 2 } };
      if (t.state !== 'created') return { id, ...PE.cannotPerform };
      if (Date.now() - t.created_ms > PAYME_TIMEOUT_MS) { await closeTxn(env, t, 4, 'Payme: muddati oʻtdi'); return { id, ...PE.cannotPerform }; }
      const at = await performTxn(env, ctx, t);
      return at ? { id, result: { transaction: String(t.id), perform_time: at, state: 2 } } : { id, ...PE.cannotPerform };
    }
    case 'CancelTransaction': {
      const t = typeof p.id === 'string' ? await txnBy(db, 'payme', p.id) : null;
      if (!t) return { id, ...PE.txn };
      const reason = Number.isSafeInteger(p.reason) ? p.reason : 0;
      if (t.state === 'cancelled' || t.state === 'refunded') return { id, result: { transaction: String(t.id), cancel_time: t.cancelled_ms, state: paymeState(t) } };
      if (t.state === 'performed') {
        const order = await orderFor(db, t.order_id);
        if (order?.status === 'delivered') return { id, ...PE.cannotCancel };
      }
      const closed = await closeTxn(env, t, reason, `Payme bekor qildi (sabab ${reason})`);
      return { id, result: { transaction: String(t.id), cancel_time: closed.at, state: closed.state === 'cancelled' ? -1 : -2 } };
    }
    case 'CheckTransaction': {
      const t = typeof p.id === 'string' ? await txnBy(db, 'payme', p.id) : null;
      if (!t) return { id, ...PE.txn };
      return { id, result: { create_time: t.created_ms, perform_time: t.performed_ms || 0, cancel_time: t.cancelled_ms || 0, transaction: String(t.id), state: paymeState(t), reason: t.cancel_reason ?? null } };
    }
    case 'GetStatement': {
      const from = Number(p.from), to = Number(p.to);
      if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to)) return { id, ...PE.request };
      const rows = (await db.prepare("SELECT * FROM payment_transactions WHERE provider='payme' AND provider_time BETWEEN ? AND ? ORDER BY provider_time LIMIT 1000").bind(from, to).all<TxnRow>()).results;
      return { id, result: { transactions: rows.map(t => ({ id: t.provider_txn_id, time: t.provider_time, amount: t.amount * 100, account: { order_id: String(t.order_id) }, create_time: t.created_ms, perform_time: t.performed_ms || 0, cancel_time: t.cancelled_ms || 0, transaction: String(t.id), state: paymeState(t), reason: t.cancel_reason ?? null, receivers: null })) } };
    }
    default: return { id, ...PE.method };
  }
}

// ======================================================================= Click (SHOP API: prepare / complete)
type ClickReply = Record<string, string | number>;
const md5 = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('MD5', new TextEncoder().encode(value)))).map(b => b.toString(16).padStart(2, '0')).join('');
export const clickSignString = (f: Record<string, string>, key: string) => `${f.click_trans_id ?? ''}${f.service_id ?? ''}${key}${f.merchant_trans_id ?? ''}${f.action === '1' ? f.merchant_prepare_id ?? '' : ''}${f.amount ?? ''}${f.action ?? ''}${f.sign_time ?? ''}`;

export async function handleClick(env: Bindings, ctx: Ctx, action: 0 | 1, f: Record<string, string>): Promise<ClickReply> {
  const base = { click_trans_id: f.click_trans_id ?? '', merchant_trans_id: f.merchant_trans_id ?? '' };
  const err = (error: number, error_note: string): ClickReply => ({ ...base, error, error_note });
  const s = await settingsMap(env.DB), key = env.CLICK_SECRET_KEY || '';
  if (s.click_enabled !== '1' || !key) return err(-8, 'Error in request from click');
  if (!/^[0-9a-f]{32}$/i.test(f.sign_string || '') || !safeEqual((await md5(clickSignString(f, key))).toLowerCase(), f.sign_string.toLowerCase())) return err(-1, 'SIGN CHECK FAILED!');
  if (f.action !== String(action)) return err(-3, 'Action not found');
  if (f.service_id !== s.click_service_id) return err(-8, 'Error in request from click');
  if (!/^\d{1,30}$/.test(f.click_trans_id || '')) return err(-8, 'Error in request from click');
  const orderId = Number(f.merchant_trans_id);
  const order = Number.isSafeInteger(orderId) && orderId > 0 ? await orderFor(env.DB, orderId) : null;
  if (!order || order.payment_method !== 'click') return err(-5, 'User does not exist');
  if (Math.round(Number(f.amount) * 100) !== order.total * 100) return err(-2, 'Incorrect parameter amount');
  const db = env.DB;
  if (action === 0) {
    if (['paid', 'refunded'].includes(order.payment_status)) return err(-4, 'Already paid');
    if (order.status === 'cancelled' || order.payment_status === 'cancelled') return err(-9, 'Transaction cancelled');
    const existing = await txnBy(db, 'click', f.click_trans_id);
    if (existing) return existing.state === 'created' ? { ...base, merchant_prepare_id: existing.id, error: 0, error_note: 'Success' } : existing.state === 'performed' ? err(-4, 'Already paid') : err(-9, 'Transaction cancelled');
    // A newer Click attempt supersedes an unfinished older one for the same order.
    await db.prepare("UPDATE payment_transactions SET state='cancelled',cancelled_ms=?,cancel_reason=0 WHERE order_id=? AND provider='click' AND state='created'").bind(Date.now(), order.id).run();
    const now = Date.now();
    try {
      const [inserted] = await db.batch([
        db.prepare("INSERT INTO payment_transactions(order_id,provider,provider_txn_id,amount,state,provider_time,created_ms) VALUES(?,'click',?,?,'created',?,?) RETURNING id").bind(order.id, f.click_trans_id, order.total, now, now),
        db.prepare("UPDATE orders SET payment_status='verifying',payment_note='',updated_at=CURRENT_TIMESTAMP WHERE id=? AND payment_status IN ('pending','failed','verifying')").bind(order.id),
      ]);
      await orderEvent(db, order.id, 'system', null, 'payment_started', { provider: 'click' });
      return { ...base, merchant_prepare_id: (inserted.results as { id: number }[])[0].id, error: 0, error_note: 'Success' };
    } catch (error) { if (String(error).includes('UNIQUE')) return err(-4, 'Already paid'); throw error; }
  }
  const t = await db.prepare("SELECT * FROM payment_transactions WHERE id=? AND provider='click' AND provider_txn_id=?").bind(Number(f.merchant_prepare_id) || 0, f.click_trans_id).first<TxnRow>();
  if (!t) return err(-6, 'Transaction does not exist');
  if (t.state === 'performed') return err(-4, 'Already paid');
  if (t.state !== 'created') return err(-9, 'Transaction cancelled');
  if (Number(f.error) < 0) { await closeTxn(env, t, Number(f.error), `Click: ${(f.error_note || 'toʻlov bekor qilindi').slice(0, 120)}`); return err(-9, 'Transaction cancelled'); }
  const at = await performTxn(env, ctx, t);
  if (!at) return order.status === 'cancelled' ? err(-9, 'Transaction cancelled') : err(-7, 'Failed to update user');
  return { ...base, merchant_confirm_id: t.id, error: 0, error_note: 'Success' };
}

// ======================================================================= Self-tests for Admin → Integratsiyalar
/** Calls the real Payme handler with the stored key (and with a wrong one) — proves endpoint + key, not the bank. */
export async function paymeSelfTest(env: Bindings, s: Record<string, string>) {
  const key = paymeKey(env, s);
  const auth = 'Basic ' + btoa(`Paycom:${key}`);
  const ok = await handlePayme(env, undefined, auth, { id: 1, method: 'CheckPerformTransaction', params: { amount: 100, account: { order_id: '0' } } });
  const bad = await handlePayme(env, undefined, 'Basic ' + btoa('Paycom:wrong-key'), { id: 2, method: 'CheckPerformTransaction', params: { amount: 100, account: { order_id: '0' } } });
  if (ok.error?.code !== -31050) throw new Error(`Endpoint kutilgan javob bermadi (${ok.error?.code ?? 'natija'})`);
  if (bad.error?.code !== -32504) throw new Error('Notoʻgʻri kalit rad etilmadi');
  return `Ichki tekshiruv: /payments/payme endpointi ${s.payme_mode === 'production' ? 'production' : 'test (sandbox)'} kaliti bilan ishlaydi, notoʻgʻri kalit rad etiladi. Toʻliq tekshiruv — Payme kabinetidagi sandbox testlari.`;
}
export async function clickSelfTest(env: Bindings, s: Record<string, string>) {
  const f: Record<string, string> = { click_trans_id: '1', service_id: s.click_service_id, click_paydoc_id: '1', merchant_trans_id: '0', amount: '1000', action: '0', error: '0', error_note: 'Success', sign_time: '2026-01-01 00:00:00' };
  const signed = await handleClick(env, undefined, 0, { ...f, sign_string: await md5(clickSignString(f, env.CLICK_SECRET_KEY || '')) });
  const forged = await handleClick(env, undefined, 0, { ...f, sign_string: await md5(clickSignString(f, 'wrong-key')) });
  if (signed.error !== -5) throw new Error(`Endpoint kutilgan javob bermadi (${signed.error})`);
  if (forged.error !== -1) throw new Error('Soxta imzo rad etilmadi');
  return 'Ichki tekshiruv: /payments/click endpointi imzoni secret key bilan tekshiradi, soxta imzo rad etiladi. Toʻliq tekshiruv — Click merchant kabinetidagi test toʻlovi.';
}

// ======================================================================= Routes
export function registerPayments(app: App) {
  // ---------- Provider callbacks (server-to-server) ----------
  app.post('/payments/payme', async c => {
    let body: unknown;
    try { body = await c.req.json(); } catch { return c.json({ jsonrpc: '2.0', id: null, ...PE.parse }); }
    try { return c.json({ jsonrpc: '2.0', ...(await handlePayme(c.env, ctxOf(c), c.req.header('Authorization') || '', body)) }); }
    catch (error) { console.error(JSON.stringify({ event: 'payme_error', error: String(error) })); return c.json({ jsonrpc: '2.0', id: (body as { id?: unknown })?.id ?? null, ...PE.system }); }
  });
  for (const [path, action] of [['/payments/click/prepare', 0], ['/payments/click/complete', 1]] as const) {
    app.post(path, async c => {
      const form = Object.fromEntries(Object.entries(await c.req.parseBody().catch(() => ({}))).map(([k, v]) => [k, String(v)]));
      try { return c.json(await handleClick(c.env, ctxOf(c), action, form)); }
      catch (error) { console.error(JSON.stringify({ event: 'click_error', error: String(error) })); return c.json({ click_trans_id: form.click_trans_id ?? '', merchant_trans_id: form.merchant_trans_id ?? '', error: -7, error_note: 'Failed to update user' }); }
    });
  }

  // ---------- Customer (order token or account; see authorizedOrder) ----------
  app.post('/orders/:id/payment/claim', async c => {
    const row = await authorizedOrder(c, idFrom(c.req.param('id'))) as unknown as OrderPayRow;
    await limitOr429(c.env.DB, `pay-claim:${row.id}`, 5, 3600);
    if (row.payment_method !== 'bank_transfer') fail(409, 'NOT_BANK_TRANSFER', 'Bu buyurtma bank oʻtkazmasi bilan toʻlanmaydi');
    if (row.status === 'cancelled') fail(409, 'CANCELLED_ORDER', 'Buyurtma bekor qilingan');
    const res = await c.env.DB.prepare("UPDATE orders SET payment_status='verifying',payment_note='',updated_at=CURRENT_TIMESTAMP WHERE id=? AND payment_status IN ('pending','failed')").bind(row.id).run();
    if (!res.meta.changes) fail(409, 'PAYMENT_STATE', 'Toʻlov holati allaqachon oʻzgargan');
    await orderEvent(c.env.DB, row.id, 'customer', row.customer_id, 'payment_claimed', { method: 'bank_transfer' });
    await notify(c.env, ctxOf(c), { audience: 'staff', orderId: row.id, kind: 'payment_claim', title: `Bank oʻtkazmasini tekshiring ${row.order_number}`, body: 'Mijoz pul oʻtkazganini bildirdi' });
    return c.json({ ok: true, status: 'verifying' });
  });
  /** Provider checkout page for an online-paid order; the amount comes from the order, never from the client. */
  app.get('/orders/:id/payment/link', async c => {
    const row = await authorizedOrder(c, idFrom(c.req.param('id'))) as unknown as OrderPayRow;
    const s = await settingsMap(c.env.DB);
    if (row.status === 'cancelled' || !['pending', 'failed', 'verifying'].includes(row.payment_status)) fail(409, 'PAYMENT_CLOSED', 'Bu buyurtma uchun toʻlov ochiq emas');
    if (row.payment_method === 'payme' && onlineReady.payme(c.env, s)) {
      const host = s.payme_mode === 'production' ? 'https://checkout.paycom.uz' : 'https://test.paycom.uz';
      return c.json({ provider: 'payme', url: `${host}/${btoa(`m=${s.payme_merchant_id};ac.order_id=${row.id};a=${row.total * 100};l=uz`)}` });
    }
    if (row.payment_method === 'click' && onlineReady.click(c.env, s)) {
      const q = new URLSearchParams({ service_id: s.click_service_id, merchant_id: s.click_merchant_id, amount: String(row.total), transaction_param: String(row.id), ...(s.click_merchant_user_id ? { merchant_user_id: s.click_merchant_user_id } : {}) });
      return c.json({ provider: 'click', url: `https://my.click.uz/services/pay?${q}` });
    }
    fail(409, 'ONLINE_UNAVAILABLE', 'Onlayn toʻlov hozircha mavjud emas — doʻkon bilan bogʻlaning');
  });

  // ---------- Owner: which methods checkout offers ----------
  app.put('/admin/payment-settings', async c => {
    ownerOnly(c);
    const input = await parse(c, z.object({ cash: z.boolean(), cardTerminal: z.boolean(), bankTransfer: z.boolean(), bankTransferDetails: z.string().trim().max(600), pickup: z.boolean(), deliveryFee: z.number().int().min(0).max(10_000_000).optional(), deliveryFreeFrom: z.number().int().min(0).max(1_000_000_000).optional() }).strict());
    const s = await settingsMap(c.env.DB);
    if (input.bankTransfer && input.bankTransferDetails.length < 10) fail(400, 'BANK_DETAILS', 'Bank oʻtkazmasi uchun rekvizitlarni toʻliq yozing (oluvchi, bank, hisob raqami)');
    if (input.pickup && (s.store_address || '').trim().length < 5) fail(400, 'STORE_ADDRESS', 'Olib ketish uchun avval doʻkon manzilini kiriting');
    if (!input.cash && !input.cardTerminal && !input.bankTransfer && !ONLINE.some(m => onlineReady[m](c.env, s))) fail(400, 'NO_METHOD', 'Kamida bitta toʻlov usuli yoqilgan boʻlishi kerak');
    await c.env.DB.batch(putSettings(c.env.DB, [['payment_cash', input.cash ? '1' : '0'], ['payment_card_terminal', input.cardTerminal ? '1' : '0'], ['payment_bank_transfer', input.bankTransfer ? '1' : '0'], ['bank_transfer_details', input.bankTransferDetails], ['fulfillment_pickup', input.pickup ? '1' : '0'], ...(input.deliveryFee !== undefined ? [['delivery_fee', String(input.deliveryFee)] as [string, string]] : []), ...(input.deliveryFreeFrom !== undefined ? [['delivery_free_from', String(input.deliveryFreeFrom)] as [string, string]] : [])]));
    await audit(c.env.DB, c.get('admin').id, 'payment.settings', 'checkout', { ...input, bankTransferDetails: input.bankTransferDetails ? 'set' : '' });
    return c.json({ ok: true });
  });

  // ---------- Staff ----------
  app.patch('/admin/orders/:id/payment', async c => {
    staffOnly(c);
    const id = idFrom(c.req.param('id')), me = c.get('admin');
    const input = await parse(c, z.object({ from: z.enum(['pending', 'verifying', 'failed']), status: z.enum(['pending', 'verifying', 'failed']), note: z.string().trim().max(300).default('') }).strict());
    if (input.status === 'failed' && input.note.length < 3) fail(400, 'NOTE_REQUIRED', 'Sababini yozing (mijozga koʻrinadi)');
    const res = await c.env.DB.prepare("UPDATE orders SET payment_status=?,payment_note=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND payment_status=? AND status!='cancelled'").bind(input.status, input.note, id, input.from).run();
    if (!res.meta.changes) fail(409, 'PAYMENT_STATE', 'Toʻlov holati boshqa xodim tomonidan oʻzgartirilgan — sahifani yangilang');
    await orderEvent(c.env.DB, id, 'admin', me.id, 'payment_status', { from: input.from, to: input.status, note: input.note });
    await audit(c.env.DB, me.id, 'payment.status', `order:${id}`, { from: input.from, to: input.status });
    return c.json({ ok: true });
  });
  app.post('/admin/orders/:id/refund', async c => {
    ownerOnly(c);
    const id = idFrom(c.req.param('id')), me = c.get('admin');
    const { reason } = await parse(c, z.object({ reason: z.string().trim().min(5, 'Sababini yozing').max(300) }).strict());
    const online = await c.env.DB.prepare("SELECT provider FROM payment_transactions WHERE order_id=? AND state='performed'").bind(id).first<{ provider: string }>();
    if (online) fail(409, 'ONLINE_REFUND', `Bu buyurtma ${PAYMENT_LABELS[online.provider as PaymentMethod]} orqali toʻlangan — pul ${PAYMENT_LABELS[online.provider as PaymentMethod]} kabinetida qaytariladi, holat avtomatik yangilanadi`);
    const res = await c.env.DB.prepare("UPDATE orders SET payment_status='refunded',payment_note=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND payment_status='paid'").bind(reason, id).run();
    if (!res.meta.changes) fail(409, 'PAYMENT_STATE', 'Faqat toʻlangan buyurtma qaytarilgan deb belgilanadi');
    await orderEvent(c.env.DB, id, 'admin', me.id, 'payment_refunded', { reason });
    await audit(c.env.DB, me.id, 'payment.refund', `order:${id}`, { reason });
    return c.json({ ok: true });
  });
}
