// Customer accounts: phone + SMS code or email + email code registration, password and email-code login,
// password reset, Telegram login and linking, sessions. Customer sessions use "Authorization: Customer <token>" so they can never be confused with
// staff bearer tokens or per-order access tokens.
import { z } from 'zod';
import type { App, Customer } from './lib';
import { clientIp, fail, isProduction, limitOr429, parse, sha256, strongPassword, uzPhone } from './lib';
import { OTP_MAX_ATTEMPTS, OTP_TTL_SECONDS, generateCode, hashCode, sendSms, smsStatus } from './otp';
import { codeEmail, emailStatus, sendEmail } from './email';
import { DUMMY_PASSWORD_HASH, passwordHash, randomToken, verifyPassword } from './password';
import { botIdFromToken, verifyTelegramLogin } from './telegram';
import { customerOrderView } from './delivery';

const SESSION_DAYS = 30;
type CustomerRow = { id: number; phone: string | null; phone_verified_at: string | null; email: string | null; email_verified_at: string | null; name: string; password_hash: string | null; telegram_id: string | null; telegram_username: string };
const view = (row: CustomerRow) => ({ id: row.id, name: row.name, phone: row.phone, phoneVerified: !!row.phone_verified_at, email: row.email ?? null, emailVerified: !!row.email_verified_at, telegram: row.telegram_id ? { username: row.telegram_username || null } : null, hasPassword: !!row.password_hash });

async function startSession(db: D1Database, customerId: number) {
  const token = randomToken();
  await db.prepare(`INSERT INTO customer_sessions(token_hash,customer_id,expires_at) VALUES(?,?,datetime('now','+${SESSION_DAYS} days'))`).bind(await sha256(token), customerId).run();
  return token;
}

/** Optional customer authentication; sets c.var.customer when a valid session header is present. */
export async function customerSession(c: any, next: () => Promise<void>) {
  const token = c.req.header('Authorization')?.match(/^Customer ([a-f0-9]{64})$/)?.[1];
  if (token) {
    const row = await c.env.DB.prepare('SELECT c.id,c.phone,c.name,c.telegram_id FROM customer_sessions s JOIN customers c ON c.id=s.customer_id WHERE s.token_hash=? AND s.expires_at>CURRENT_TIMESTAMP').bind(await sha256(token)).first();
    if (!row) fail(401, 'SESSION_EXPIRED', 'Sessiya tugagan. Qayta kiring');
    c.set('customer', { id: row.id, phone: row.phone, name: row.name, telegramId: row.telegram_id } satisfies Customer);
  }
  await next();
}
const requireCustomer = (c: any): Customer => { const customer = c.get('customer'); if (!customer) fail(401, 'UNAUTHORIZED', 'Avval tizimga kiring'); return customer; };

const emailSchema = z.string().trim().toLowerCase().max(254).email('Email manzili notoʻgʻri');
type CodeStore = { table: 'otp_codes'; column: 'phone' } | { table: 'email_codes'; column: 'email' };
const SMS: CodeStore = { table: 'otp_codes', column: 'phone' }, EMAIL: CodeStore = { table: 'email_codes', column: 'email' };

async function consumeOtp(db: D1Database, phone: string, purpose: string, code: string, store: CodeStore = SMS) {
  const row = await db.prepare(`SELECT id,code_hash,attempts FROM ${store.table} WHERE ${store.column}=? AND purpose=? AND consumed_at IS NULL AND expires_at>CURRENT_TIMESTAMP ORDER BY id DESC LIMIT 1`).bind(phone, purpose).first<{ id: number; code_hash: string; attempts: number }>();
  if (!row) fail(400, 'CODE_EXPIRED', 'Kod muddati tugagan yoki soʻralmagan. Yangi kod oling');
  if (row!.attempts >= OTP_MAX_ATTEMPTS) fail(429, 'TOO_MANY_ATTEMPTS', 'Urinishlar tugadi. Yangi kod oling');
  const attempt = await db.prepare(`UPDATE ${store.table} SET attempts=attempts+1 WHERE id=? AND attempts<? AND consumed_at IS NULL AND expires_at>CURRENT_TIMESTAMP RETURNING attempts`).bind(row!.id, OTP_MAX_ATTEMPTS).first<{ attempts: number }>();
  if (!attempt) fail(429, 'TOO_MANY_ATTEMPTS', 'Urinishlar tugadi. Yangi kod oling');
  const [salt, hash] = row!.code_hash.split(':');
  if (!/^\d{6}$/.test(code) || (await hashCode(code, phone, salt)) !== hash) fail(400, 'INVALID_CODE', `Kod notoʻgʻri. Qolgan urinish: ${Math.max(0, OTP_MAX_ATTEMPTS - attempt!.attempts)}`);
  const used = await db.prepare(`UPDATE ${store.table} SET consumed_at=CURRENT_TIMESTAMP WHERE id=? AND consumed_at IS NULL`).bind(row!.id).run();
  if (!used.meta.changes) fail(400, 'CODE_EXPIRED', 'Kod allaqachon ishlatilgan');
}

export function registerCustomers(app: App) {
  app.use('/auth/*', customerSession);
  app.use('/customer/*', customerSession);

  /** What sign-in methods are actually available (no secrets). */
  app.get('/auth/config', async c => {
    const sms = smsStatus(c.env);
    const username = (await c.env.DB.prepare("SELECT value FROM settings WHERE key='telegram_bot_username'").first<{ value: string }>())?.value || '';
    const email = emailStatus(c.env);
    return c.json({ phone: { enabled: sms.configured || sms.devEcho, devEcho: sms.devEcho, codeLogin: true }, email: { enabled: email.configured || email.devEcho, devEcho: email.devEcho }, telegram: { enabled: !!c.env.TELEGRAM_BOT_TOKEN && !!username, botUsername: username || null, botId: c.env.TELEGRAM_BOT_TOKEN ? botIdFromToken(c.env.TELEGRAM_BOT_TOKEN) : null }, password: true });
  });

  app.post('/auth/otp', async c => {
    const { phone, purpose } = await parse(c, z.object({ phone: uzPhone, purpose: z.enum(['register', 'reset', 'link', 'login']) }));
    const sms = smsStatus(c.env);
    if (!sms.configured && !sms.devEcho) fail(503, 'SMS_NOT_CONFIGURED', 'SMS orqali tasdiqlash hozircha ishlamaydi. Telegram orqali kiring yoki keyinroq urinib koʻring');
    if (purpose === 'link') requireCustomer(c);
    // The per-IP limit comes first so the "already registered" answer cannot be used for bulk enumeration.
    await limitOr429(c.env.DB, `otp-ip:${clientIp(c)}`, 20, 3600);
    const existing = await c.env.DB.prepare('SELECT id,password_hash FROM customers WHERE phone=?').bind(phone).first<{ id: number; password_hash: string | null }>();
    if (purpose === 'register' && existing) fail(409, 'PHONE_TAKEN', 'Bu raqam roʻyxatdan oʻtgan. Kiring yoki parolni tiklang');
    if (purpose === 'link' && existing) fail(409, 'PHONE_TAKEN', 'Bu raqam boshqa hisobga bogʻlangan. Shu raqam bilan kirib, Telegramni oʻsha yerda bogʻlang');
    const recent = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM otp_codes WHERE phone=? AND created_at>datetime('now','-60 seconds')").bind(phone).first<{ n: number }>();
    if (recent?.n) fail(429, 'RESEND_TOO_SOON', 'Yangi kodni 60 soniyadan keyin soʻrang');
    await limitOr429(c.env.DB, `otp-phone-hour:${phone}`, 5, 3600, 'Bu raqamga juda koʻp kod soʻraldi. 1 soatdan keyin urinib koʻring');
    // A reset for an unknown number answers like a success so the endpoint does not reveal who is registered.
    const send = purpose !== 'reset' || !!existing;
    const code = generateCode(), salt = randomToken().slice(0, 16);
    if (send) {
      await c.env.DB.prepare(`INSERT INTO otp_codes(phone,purpose,code_hash,expires_at) VALUES(?,?,?,datetime('now','+${OTP_TTL_SECONDS} seconds'))`).bind(phone, purpose, `${salt}:${await hashCode(code, phone, salt)}`).run();
      if (sms.configured) {
        try { await sendSms(c.env, phone, `Fayz Market tasdiqlash kodi: ${code}. Kodni hech kimga bermang.`); }
        catch (error) { console.error(JSON.stringify({ event: 'sms_failed', error: String(error) })); fail(502, 'SMS_FAILED', 'SMS yuborilmadi. Birozdan keyin qayta urinib koʻring'); }
      }
    }
    return c.json({ ok: true, expiresIn: OTP_TTL_SECONDS, resendIn: 60, ...(sms.devEcho && !isProduction(c.env) && send ? { devCode: code } : {}) });
  });

  // ---------- Email codes ----------
  app.post('/auth/email/otp', async c => {
    const { email, purpose } = await parse(c, z.object({ email: emailSchema, purpose: z.enum(['register', 'login', 'reset', 'link']) }));
    const status = emailStatus(c.env);
    if (!status.configured && !status.devEcho) fail(503, 'EMAIL_NOT_CONFIGURED', 'Email orqali tasdiqlash hozircha ishlamaydi. Telefon yoki Telegram orqali kiring');
    if (purpose === 'link') requireCustomer(c);
    await limitOr429(c.env.DB, `otp-ip:${clientIp(c)}`, 20, 3600);
    const existing = await c.env.DB.prepare('SELECT id,password_hash FROM customers WHERE email=?').bind(email).first<{ id: number; password_hash: string | null }>();
    if (purpose === 'register' && existing) fail(409, 'EMAIL_TAKEN', 'Bu email roʻyxatdan oʻtgan. Kiring yoki parolni tiklang');
    if (purpose === 'link' && existing) fail(409, 'EMAIL_TAKEN', 'Bu email boshqa hisobga bogʻlangan');
    const recent = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM email_codes WHERE email=? AND created_at>datetime('now','-60 seconds')").bind(email).first<{ n: number }>();
    if (recent?.n) fail(429, 'RESEND_TOO_SOON', 'Yangi kodni 60 soniyadan keyin soʻrang');
    await limitOr429(c.env.DB, `otp-email-hour:${email}`, 5, 3600, 'Bu emailga juda koʻp kod soʻraldi. 1 soatdan keyin urinib koʻring');
    // Login and reset for an unknown address answer like a success so the endpoint does not reveal who is registered.
    const send = purpose === 'register' || purpose === 'link' || !!existing;
    const code = generateCode(), salt = randomToken().slice(0, 16);
    if (send) {
      await c.env.DB.prepare(`INSERT INTO email_codes(email,purpose,code_hash,expires_at) VALUES(?,?,?,datetime('now','+${OTP_TTL_SECONDS} seconds'))`).bind(email, purpose, `${salt}:${await hashCode(code, email, salt)}`).run();
      if (status.configured) {
        try { await sendEmail(c.env, email, codeEmail(code, purpose)); }
        catch (error) { console.error(JSON.stringify({ event: 'email_failed', error: String(error) })); fail(502, 'EMAIL_FAILED', 'Xat yuborilmadi. Birozdan keyin qayta urinib koʻring'); }
      }
    }
    return c.json({ ok: true, expiresIn: OTP_TTL_SECONDS, resendIn: 60, ...(status.devEcho && !isProduction(c.env) && send ? { devCode: code } : {}) });
  });

  app.post('/auth/email/register', async c => {
    const input = await parse(c, z.object({ email: emailSchema, code: z.string(), name: z.string().trim().min(2).max(120), password: strongPassword.optional() }));
    await limitOr429(c.env.DB, `verify-ip:${clientIp(c)}`, 30, 3600);
    await consumeOtp(c.env.DB, input.email, 'register', input.code, EMAIL);
    if (await c.env.DB.prepare('SELECT id FROM customers WHERE email=?').bind(input.email).first()) fail(409, 'EMAIL_TAKEN', 'Bu email roʻyxatdan oʻtgan');
    const row = await c.env.DB.prepare('INSERT INTO customers(email,email_verified_at,name,password_hash) VALUES(?,CURRENT_TIMESTAMP,?,?) RETURNING *').bind(input.email, input.name, input.password ? await passwordHash(input.password) : null).first<CustomerRow>();
    return c.json({ token: await startSession(c.env.DB, row!.id), customer: view(row!) }, 201);
  });

  /** Passwordless sign-in with a code sent to a verified email address. */
  app.post('/auth/email/login', async c => {
    const input = await parse(c, z.object({ email: emailSchema, code: z.string() }));
    await limitOr429(c.env.DB, `verify-ip:${clientIp(c)}`, 30, 3600);
    await consumeOtp(c.env.DB, input.email, 'login', input.code, EMAIL);
    const row = await c.env.DB.prepare('SELECT * FROM customers WHERE email=? AND email_verified_at IS NOT NULL').bind(input.email).first<CustomerRow>();
    if (!row) fail(400, 'INVALID_CODE', 'Kod notoʻgʻri');
    return c.json({ token: await startSession(c.env.DB, row!.id), customer: view(row!) });
  });

  app.post('/auth/email/reset', async c => {
    const input = await parse(c, z.object({ email: emailSchema, code: z.string(), password: strongPassword }));
    await limitOr429(c.env.DB, `verify-ip:${clientIp(c)}`, 30, 3600);
    await consumeOtp(c.env.DB, input.email, 'reset', input.code, EMAIL);
    const row = await c.env.DB.prepare('UPDATE customers SET password_hash=?,updated_at=CURRENT_TIMESTAMP WHERE email=? RETURNING *').bind(await passwordHash(input.password), input.email).first<CustomerRow>();
    if (!row) fail(400, 'INVALID_CODE', 'Kod notoʻgʻri');
    await c.env.DB.prepare('DELETE FROM customer_sessions WHERE customer_id=?').bind(row!.id).run(); // log out every device
    return c.json({ token: await startSession(c.env.DB, row!.id), customer: view(row!) });
  });

  app.post('/auth/email/link', async c => {
    const me = requireCustomer(c);
    const input = await parse(c, z.object({ email: emailSchema, code: z.string() }));
    await consumeOtp(c.env.DB, input.email, 'link', input.code, EMAIL);
    if (await c.env.DB.prepare('SELECT id FROM customers WHERE email=? AND id!=?').bind(input.email, me.id).first()) fail(409, 'EMAIL_TAKEN', 'Bu email boshqa hisobga bogʻlangan');
    const row = await c.env.DB.prepare('UPDATE customers SET email=?,email_verified_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? RETURNING *').bind(input.email, me.id).first<CustomerRow>();
    return c.json({ customer: view(row!) });
  });

  /**
   * Phone + one-time code: signs in an existing customer or opens a new account for a new number (no password).
   * The code request (purpose 'login') is sent for any number, so this pair never reveals who is registered.
   */
  app.post('/auth/phone/login', async c => {
    const input = await parse(c, z.object({ phone: uzPhone, code: z.string().max(12), name: z.string().trim().max(120).optional() }));
    await limitOr429(c.env.DB, `verify-ip:${clientIp(c)}`, 30, 3600);
    await consumeOtp(c.env.DB, input.phone, 'login', input.code);
    let row = await c.env.DB.prepare('SELECT * FROM customers WHERE phone=?').bind(input.phone).first<CustomerRow>();
    const isNew = !row;
    if (row && !row.phone_verified_at) row = await c.env.DB.prepare('UPDATE customers SET phone_verified_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? RETURNING *').bind(row.id).first<CustomerRow>();
    if (!row) row = await c.env.DB.prepare('INSERT INTO customers(phone,phone_verified_at,name) VALUES(?,CURRENT_TIMESTAMP,?) RETURNING *').bind(input.phone, input.name && input.name.length >= 2 ? input.name : '').first<CustomerRow>();
    return c.json({ token: await startSession(c.env.DB, row!.id), customer: view(row!), isNew }, isNew ? 201 : 200);
  });

  app.post('/auth/register', async c => {
    const input = await parse(c, z.object({ phone: uzPhone, code: z.string(), password: strongPassword, name: z.string().trim().min(2).max(120) }));
    await limitOr429(c.env.DB, `verify-ip:${clientIp(c)}`, 30, 3600);
    await consumeOtp(c.env.DB, input.phone, 'register', input.code);
    const row = await c.env.DB.prepare('INSERT INTO customers(phone,phone_verified_at,name,password_hash) VALUES(?,CURRENT_TIMESTAMP,?,?) RETURNING *').bind(input.phone, input.name, await passwordHash(input.password)).first<CustomerRow>();
    return c.json({ token: await startSession(c.env.DB, row!.id), customer: view(row!) }, 201);
  });

  app.post('/auth/login', async c => {
    const input = await parse(c, z.union([z.object({ phone: uzPhone, password: z.string().min(1).max(200) }), z.object({ email: emailSchema, password: z.string().min(1).max(200) })]));
    const id = 'phone' in input ? input.phone : input.email;
    await limitOr429(c.env.DB, `cust-login-ip:${clientIp(c)}`, 30, 900);
    await limitOr429(c.env.DB, `cust-login:${id}`, 5, 900, '15 daqiqadan keyin qayta urinib koʻring');
    const row = 'phone' in input
      ? await c.env.DB.prepare('SELECT * FROM customers WHERE phone=?').bind(input.phone).first<CustomerRow>()
      : await c.env.DB.prepare('SELECT * FROM customers WHERE email=? AND email_verified_at IS NOT NULL').bind(input.email).first<CustomerRow>();
    const valid = await verifyPassword(input.password, row?.password_hash || DUMMY_PASSWORD_HASH);
    if (!row || !row.password_hash || !valid) fail(401, 'INVALID_CREDENTIALS', 'phone' in input ? 'Telefon yoki parol notoʻgʻri' : 'Email yoki parol notoʻgʻri');
    await c.env.DB.prepare('DELETE FROM rate_limits WHERE key=?').bind(`cust-login:${id}`).run();
    return c.json({ token: await startSession(c.env.DB, row!.id), customer: view(row!) });
  });

  app.post('/auth/password/reset', async c => {
    const input = await parse(c, z.object({ phone: uzPhone, code: z.string(), password: strongPassword }));
    await limitOr429(c.env.DB, `verify-ip:${clientIp(c)}`, 30, 3600);
    await consumeOtp(c.env.DB, input.phone, 'reset', input.code);
    const row = await c.env.DB.prepare('UPDATE customers SET password_hash=?,updated_at=CURRENT_TIMESTAMP WHERE phone=? RETURNING *').bind(await passwordHash(input.password), input.phone).first<CustomerRow>();
    if (!row) fail(400, 'INVALID_CODE', 'Kod notoʻgʻri');
    await c.env.DB.prepare('DELETE FROM customer_sessions WHERE customer_id=?').bind(row!.id).run(); // log out every device
    return c.json({ token: await startSession(c.env.DB, row!.id), customer: view(row!) });
  });

  async function checkTelegram(c: any) {
    if (!c.env.TELEGRAM_BOT_TOKEN) fail(503, 'TELEGRAM_NOT_CONFIGURED', 'Telegram orqali kirish hozircha sozlanmagan');
    await limitOr429(c.env.DB, `tg-ip:${clientIp(c)}`, 30, 3600);
    const { auth } = await parse(c, z.object({ auth: z.record(z.string(), z.union([z.string(), z.number()])) }));
    const result = await verifyTelegramLogin(auth, c.env.TELEGRAM_BOT_TOKEN);
    if (!result.ok) fail(401, `TELEGRAM_${result.reason}`, result.reason === 'EXPIRED' ? 'Telegram tasdigʻi eskirgan. Qayta urinib koʻring' : 'Telegram maʼlumoti tasdiqlanmadi');
    if (result.ok) {
      // A signed payload can be used once; replays are refused until it would have expired anyway.
      await c.env.DB.prepare("DELETE FROM telegram_auth_replays WHERE expires_at<CURRENT_TIMESTAMP").run();
      const fresh = await c.env.DB.prepare("INSERT INTO telegram_auth_replays(hash,expires_at) VALUES(?,datetime('now','+1 day')) ON CONFLICT(hash) DO NOTHING").bind(result.user.hash).run();
      if (!fresh.meta.changes) fail(401, 'TELEGRAM_REPLAYED', 'Bu Telegram tasdigʻi allaqachon ishlatilgan');
      return result.user;
    }
    throw new Error('unreachable');
  }

  app.post('/auth/telegram', async c => {
    const user = await checkTelegram(c);
    const name = [user.first_name, user.last_name].filter(Boolean).join(' ').slice(0, 120);
    let row = await c.env.DB.prepare('SELECT * FROM customers WHERE telegram_id=?').bind(user.id).first<CustomerRow>();
    if (row) await c.env.DB.prepare('UPDATE customers SET telegram_username=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(user.username || '', row.id).run();
    else row = await c.env.DB.prepare('INSERT INTO customers(telegram_id,telegram_username,name) VALUES(?,?,?) RETURNING *').bind(user.id, user.username || '', name).first<CustomerRow>();
    return c.json({ token: await startSession(c.env.DB, row!.id), customer: view(row!), created: !row!.phone && !row!.password_hash });
  });

  app.post('/auth/telegram/link', async c => {
    const me = requireCustomer(c);
    const user = await checkTelegram(c);
    const owner = await c.env.DB.prepare('SELECT id FROM customers WHERE telegram_id=?').bind(user.id).first<{ id: number }>();
    if (owner && owner.id !== me.id) fail(409, 'TELEGRAM_TAKEN', 'Bu Telegram hisobi boshqa profilga bogʻlangan');
    const row = await c.env.DB.prepare('UPDATE customers SET telegram_id=?,telegram_username=?,updated_at=CURRENT_TIMESTAMP WHERE id=? RETURNING *').bind(user.id, user.username || '', me.id).first<CustomerRow>();
    return c.json({ customer: view(row!) });
  });

  app.post('/auth/phone/link', async c => {
    const me = requireCustomer(c);
    const input = await parse(c, z.object({ phone: uzPhone, code: z.string() }));
    await consumeOtp(c.env.DB, input.phone, 'link', input.code);
    const taken = await c.env.DB.prepare('SELECT id FROM customers WHERE phone=? AND id!=?').bind(input.phone, me.id).first();
    if (taken) fail(409, 'PHONE_TAKEN', 'Bu raqam boshqa hisobga bogʻlangan');
    const row = await c.env.DB.prepare('UPDATE customers SET phone=?,phone_verified_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? RETURNING *').bind(input.phone, me.id).first<CustomerRow>();
    return c.json({ customer: view(row!) });
  });

  app.post('/auth/password', async c => {
    const me = requireCustomer(c);
    const input = await parse(c, z.object({ currentPassword: z.string().max(200).optional(), password: strongPassword }));
    const row = (await c.env.DB.prepare('SELECT * FROM customers WHERE id=?').bind(me.id).first<CustomerRow>())!;
    await limitOr429(c.env.DB, `customer-password-check:${me.id}`, 5, 900);
    if (row.password_hash && !(await verifyPassword(input.currentPassword || '', row.password_hash))) fail(401, 'INVALID_CREDENTIALS', 'Joriy parol notoʻgʻri');
    if (!row.phone_verified_at && !row.email_verified_at) fail(409, 'PHONE_REQUIRED', 'Parol oʻrnatishdan oldin telefon raqamingiz yoki emailingizni tasdiqlang');
    await c.env.DB.batch([
      c.env.DB.prepare('UPDATE customers SET password_hash=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(await passwordHash(input.password), me.id),
      c.env.DB.prepare('DELETE FROM customer_sessions WHERE customer_id=? AND token_hash!=?').bind(me.id, await sha256(c.req.header('Authorization')!.slice(9))),
    ]);
    return c.json({ ok: true });
  });

  app.get('/auth/me', async c => {
    const me = requireCustomer(c);
    return c.json({ customer: view((await c.env.DB.prepare('SELECT * FROM customers WHERE id=?').bind(me.id).first<CustomerRow>())!) });
  });
  app.patch('/auth/me', async c => {
    const me = requireCustomer(c);
    const { name } = await parse(c, z.object({ name: z.string().trim().min(2).max(120) }));
    return c.json({ customer: view((await c.env.DB.prepare('UPDATE customers SET name=?,updated_at=CURRENT_TIMESTAMP WHERE id=? RETURNING *').bind(name, me.id).first<CustomerRow>())!) });
  });
  app.post('/auth/logout', async c => {
    const token = c.req.header('Authorization')?.match(/^Customer ([a-f0-9]{64})$/)?.[1];
    if (token) await c.env.DB.prepare('DELETE FROM customer_sessions WHERE token_hash=?').bind(await sha256(token)).run();
    return c.json({ ok: true });
  });

  app.get('/customer/orders', async c => {
    const me = requireCustomer(c);
    const rows = await c.env.DB.prepare('SELECT * FROM orders WHERE customer_id=? ORDER BY id DESC LIMIT 50').bind(me.id).all<any>();
    return c.json({ orders: await Promise.all(rows.results.map(row => customerOrderView(c.env.DB, row))) });
  });

  /** Registers this device for push messages (used once FCM is configured in the Android shell). */
  app.delete('/customer/push-token', async c => {
    const me = requireCustomer(c);
    const { token } = await parse(c, z.object({ token: z.string().min(20).max(4096) }));
    await c.env.DB.prepare("DELETE FROM push_tokens WHERE token=? AND principal_id=? AND audience='customer'").bind(token, me.id).run();
    return c.json({ ok: true });
  });
  app.post('/customer/push-token', async c => {
    const me = requireCustomer(c);
    const { token, platform } = await parse(c, z.object({ token: z.string().min(20).max(4096), platform: z.enum(['android', 'desktop']) }));
    await c.env.DB.prepare("INSERT INTO push_tokens(token,platform,audience,principal_id) VALUES(?,?,'customer',?) ON CONFLICT(token) DO UPDATE SET audience='customer',principal_id=excluded.principal_id,last_seen_at=CURRENT_TIMESTAMP,failures=0").bind(token, platform, me.id).run();
    return c.json({ ok: true });
  });
}
