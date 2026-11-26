// Fayz Market V1 1.2.2 — API checks for the fixes after the owner's real-device test (Samsung Galaxy A17):
// product variants and characteristics, cart/checkout totals (discount, courier fee tariff), the staff login
// flow (normalised email, honest errors, lock-out, sign-out), and courier RBAC with a SEPARATE courier account.
//
// Runs against an ISOLATED local Worker with a brand-new D1 (never production).
//   node scripts/v1/real-device-fixes-verify.mjs        (QA_WORKER_PORT overrides the port)
import { spawn, execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '../..');
const sharp = createRequire(join(root, 'package.json'))('sharp');
const PORT = Number(process.env.QA_WORKER_PORT || 8806), API = `http://127.0.0.1:${PORT}`;
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && detail ? ' — ' + String(detail).slice(0, 400) : ''}`); if (!ok) failed++; console.log(results.at(-1)); };
const section = name => { results.push(`\n## ${name}`); console.log(`\n## ${name}`); };

const dir = mkdtempSync(join(tmpdir(), 'fayz-122-verify-')), dbDir = join(dir, 'db');
const worker = spawn('bash', [join(root, 'scripts/deploy-qa/local-worker.sh'), dbDir], { env: { ...process.env, QA_PORT: String(PORT), QA_MASTER_KEY: randomBytes(32).toString('base64') }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
let workerLog = ''; worker.stdout.on('data', d => { workerLog += d; }); worker.stderr.on('data', d => { workerLog += d; });
const shutdown = () => { try { process.kill(-worker.pid, 'SIGTERM'); } catch { /* gone */ } rmSync(dir, { recursive: true, force: true }); };
async function call(path, { method = 'GET', auth, body, headers = {}, raw, type } = {}) {
  const res = await fetch(API + path, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(type ? { 'Content-Type': type } : {}), ...(auth ? { Authorization: auth } : {}), ...headers }, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
  const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, text };
}
const d1 = sql => JSON.parse(execFileSync('npx', ['wrangler', 'd1', 'execute', 'fayz-market', '--local', '--persist-to', dbDir, '--json', '--command', sql], { cwd: join(root, 'apps/api'), encoding: 'utf8', env: { ...process.env, CI: '1' } }))[0].results;
const png = color => sharp({ create: { width: 64, height: 64, channels: 4, background: color } }).png().toBuffer();

try {
  for (let i = 0; i < 240; i++) { try { if ((await fetch(API + '/health')).ok) break; } catch { /* starting */ } await new Promise(r => setTimeout(r, 500)); }
  check('isolated local Worker started (fresh D1, migrations 0001–0009)', (await call('/health')).status === 200, workerLog.slice(-400));

  // ================================================================ Staff login (A01)
  section('Admin login, lock-out, sign-out (A01)');
  const OWNER = { email: 'owner@example.invalid', password: 'Owner-Password-2026' };
  await call('/admin/bootstrap', { method: 'POST', headers: { 'X-Bootstrap-Secret': 'qa-bootstrap' }, body: OWNER });
  let r = await call('/admin/login', { method: 'POST', body: { email: '  Owner@Example.INVALID ', password: OWNER.password } });
  check('login: email with spaces and capital letters (phone keyboard) → accepted', r.status === 200 && !!r.data.token, r.text);
  const ownerToken = r.data.token, owner = `Bearer ${ownerToken}`;
  r = await call('/admin/login', { method: 'POST', body: { email: OWNER.email, password: OWNER.password + ' ' } });
  check('login: password is exact (a trailing space is a different password)', r.status === 401);
  r = await call('/admin/login', { method: 'POST', body: { email: OWNER.email, password: 'Wrong-Password-1' } });
  check('wrong password → 401 with attempts left (not a silent "server error")', r.status === 401 && /Yana \d ta urinish qoldi/.test(r.data.error?.message), r.text);
  r = await call('/admin/login', { method: 'POST', body: { email: OWNER.email, password: OWNER.password } });
  check('correct password after a wrong one → 200 (counter reset)', r.status === 200, r.text);
  const second = r.data.token;
  r = await call('/admin/logout', { method: 'POST', auth: `Bearer ${second}` });
  r = await call('/admin/me', { auth: `Bearer ${second}` }); check('sign-out revokes that session on the server', r.status === 401);
  r = await call('/admin/me', { auth: owner }); check('sign-out of one device leaves the other session valid', r.status === 200);
  r = await call('/admin/login', { method: 'POST', body: { email: OWNER.email, password: OWNER.password } });
  check('sign in again after sign-out → 200 with a NEW token', r.status === 200 && r.data.token !== second);
  const victim = { email: 'lock@example.invalid', password: 'Lock-Password-2026' };
  await call('/admin/users', { method: 'POST', auth: owner, body: { ...victim, role: 'manager', name: 'Lock test' } });
  for (let i = 0; i < 5; i++) await call('/admin/login', { method: 'POST', body: { email: victim.email, password: 'Bad-Password-' + i } });
  r = await call('/admin/login', { method: 'POST', body: { email: victim.email, password: victim.password } });
  check('after 5 wrong passwords the account is paused: clear 429 message, not "wrong password"', r.status === 429 && /15 daqiqa/.test(r.data.error?.message) && !/notoʻgʻri\./.test(r.data.error?.message), r.text);

  // ================================================================ Catalogue setup
  section('Product variants and characteristics (C07, A06, A03)');
  const cat = (await call('/admin/categories', { method: 'POST', auth: owner, body: { name: 'Telefonlar', slug: 'telefonlar' } })).data.id;
  const cat2 = (await call('/admin/categories', { method: 'POST', auth: owner, body: { name: 'Soatlar', slug: 'soatlar' } })).data.id;
  const up = async color => (await call('/admin/images', { method: 'POST', auth: owner, raw: await png(color), type: 'image/png' })).data.url;
  const black = await up('#111111'), white = await up('#F5F5F5');
  const axes = [{ name: 'Rang', values: ['Qora', 'Oq'] }, { name: 'Xotira', values: ['64 GB', '128 GB'] }];
  const v = (rang, xotira, price, stock, extra = {}) => ({ options: { Rang: rang, Xotira: xotira }, price, stock, ...extra });
  const base = { name: 'Fayz Phone', slug: 'fayz-phone', description: 'Uzun tavsif. '.repeat(40), categoryId: cat, price: 2000000, stock: 0, active: true, featured: false, images: [black, white] };
  r = await call('/admin/products', { method: 'POST', auth: owner, body: { ...base, options: axes, variants: [v('Qora', '64 GB', 2000000, 3), v('Qora', '64 GB', 2100000, 1)] } });
  check('duplicate colour + memory combination → 409', r.status === 409 && r.data.error?.code === 'VARIANT_DUPLICATE', r.text);
  r = await call('/admin/products', { method: 'POST', auth: owner, body: { ...base, options: axes, variants: [v('Yashil', '64 GB', 2000000, 3)] } });
  check('value not in the axis list → 400', r.status === 400 && r.data.error?.code === 'VARIANT_OPTIONS', r.text);
  r = await call('/admin/products', { method: 'POST', auth: owner, body: { ...base, options: axes, variants: [{ options: { Rang: 'Qora' }, price: 1, stock: 1 }] } });
  check('variant missing an axis → 400', r.status === 400);
  r = await call('/admin/products', { method: 'POST', auth: owner, body: { ...base, options: axes, variants: [v('Qora', '64 GB', 2000000, 3, { image: 'https://evil.example/x.png' })] } });
  check('variant photo must be this shop’s own upload → 400', r.status === 400 && r.data.error?.code === 'INVALID_IMAGE', r.text);
  r = await call('/admin/products', { method: 'POST', auth: owner, body: { ...base, options: axes, variants: [v('Qora', '64 GB', 2000000, 3, { comparePrice: 1500000 })] } });
  check('compare-at price below the price → 400', r.status === 400 && r.data.error?.code === 'COMPARE_PRICE');
  check('a refused create leaves no half-made product (slug still free)', d1("SELECT COUNT(*) AS n FROM products WHERE slug='fayz-phone'")[0].n === 0);
  r = await call('/admin/products', { method: 'POST', auth: owner, body: { ...base,
    attributes: [{ name: 'Ekran', value: '6,5″' }, { name: 'Kafolat', value: '12 oy' }], options: axes,
    variants: [v('Qora', '64 GB', 2000000, 3, { image: black, comparePrice: 2300000 }), v('Qora', '128 GB', 2400000, 2, { image: black }), v('Oq', '64 GB', 2050000, 0, { image: white }), v('Oq', '128 GB', 2500000, 5, { image: white, active: false })] } });
  check('product with 4 variants (2 colours × 2 memory sizes) created', r.status === 201, r.text);
  const phone = r.data.id;
  r = await call('/products/fayz-phone');
  const pv = r.data.product;
  check('customer: only ACTIVE variants are returned (3 of 4)', pv.variants.length === 3 && pv.variants.every(x => x.active), JSON.stringify(pv.variants));
  check('customer: price = cheapest active variant, range given', pv.price === 2000000 && pv.priceFrom === 2000000 && pv.priceTo === 2400000);
  check('customer: stock = sum of active variants (3 + 2 + 0)', pv.stock === 5, String(pv.stock));
  check('customer: variant has label, own price, stock and photo', pv.variants.some(x => x.label === 'Qora · 128 GB' && x.price === 2400000 && x.stock === 2 && x.image === black));
  check('customer: characteristics returned in order', JSON.stringify(pv.attributes) === JSON.stringify([{ name: 'Ekran', value: '6,5″' }, { name: 'Kafolat', value: '12 oy' }]));
  check('customer: option values limited to sellable variants', JSON.stringify(pv.options) === JSON.stringify(axes));
  r = await call('/products?limit=20'); const listed = r.data.products.find(p => p.id === phone);
  check('catalogue list: variant count and "from" price for the card', listed.variantCount === 3 && listed.priceFrom === 2000000);
  r = await call(`/admin/products/${phone}`, { auth: owner });
  check('admin: all 4 variants incl. the switched-off one', r.data.product.variants.length === 4 && r.data.product.variants.some(x => !x.active));
  const ids = Object.fromEntries(r.data.product.variants.map(x => [x.label, x.id]));

  const simple = (await call('/admin/products', { method: 'POST', auth: owner, body: { name: 'Klassik soat', slug: 'klassik-soat', description: 'Qisqa', categoryId: cat2, price: 300000, comparePrice: 400000, stock: 10, active: true, featured: true, images: [] } })).data.id;
  const sameCat = (await call('/admin/products', { method: 'POST', auth: owner, body: { name: 'Fayz Phone Lite', slug: 'fayz-phone-lite', description: '', categoryId: cat, price: 900000, stock: 4, active: true, featured: false, images: [], attributes: [{ name: 'Kafolat', value: '12 oy' }] } })).data.id;
  const soldOut = (await call('/admin/products', { method: 'POST', auth: owner, body: { name: 'Eski telefon', slug: 'eski-telefon', description: '', categoryId: cat, price: 500000, stock: 0, active: true, featured: false, images: [] } })).data.id;

  // ================================================================ Orders with variants
  section('Cart and checkout with variants (server checks)');
  const shopper = { customerName: 'Sinov Mijoz', phone: '+998901112233', address: 'Toshkent, Chilonzor 1-uy', note: '' };
  const order = async (items, extra = {}) => call('/orders', { method: 'POST', body: { ...shopper, items, ...extra } });
  r = await order([{ productId: phone, quantity: 1 }]);
  check('variant product without a chosen variant → 409 VARIANT_REQUIRED', r.status === 409 && r.data.error?.code === 'VARIANT_REQUIRED', r.text);
  r = await order([{ productId: simple, variantId: ids['Qora · 64 GB'], quantity: 1 }]);
  check('variant of ANOTHER product → 409 VARIANT_INVALID', r.status === 409 && r.data.error?.code === 'VARIANT_INVALID', r.text);
  r = await order([{ productId: phone, variantId: ids['Oq · 128 GB'], quantity: 1 }]);
  check('switched-off variant → 409', r.status === 409);
  r = await order([{ productId: phone, variantId: ids['Oq · 64 GB'], quantity: 1 }]);
  check('variant with 0 stock → 409 OUT_OF_STOCK', r.status === 409 && r.data.error?.code === 'OUT_OF_STOCK');
  r = await order([{ productId: phone, variantId: ids['Qora · 128 GB'], quantity: 3 }]);
  check('more than the variant stock (3 > 2) → 409', r.status === 409);
  r = await order([{ productId: phone, variantId: ids['Qora · 128 GB'], quantity: 1 }, { productId: phone, variantId: ids['Qora · 128 GB'], quantity: 2 }]);
  check('same variant split over two lines is merged (1 + 2 > 2) → 409', r.status === 409);
  await call('/admin/payment-settings', { method: 'PUT', auth: owner, body: { cash: true, cardTerminal: true, bankTransfer: false, bankTransferDetails: '', pickup: false, deliveryFeeMode: 'free' } });
  r = await order([{ productId: phone, variantId: ids['Qora · 64 GB'], quantity: 2, price: 1 }, { productId: phone, variantId: ids['Qora · 128 GB'], quantity: 1 }, { productId: simple, quantity: 1 }], { total: 5 });
  check('valid mixed order → 201; total from D1 prices (client price/total ignored)', r.status === 201 && r.data.order.total === 2 * 2000000 + 2400000 + 300000, r.text);
  check('discount computed on the server: (2 300 000 − 2 000 000)×2 + (400 000 − 300 000)', r.data.order.discountTotal === 600000 + 100000, JSON.stringify(r.data.order));
  const vo = r.data.order;
  let items = d1(`SELECT name,price,quantity,variant_id,variant_label FROM order_items WHERE order_id=${vo.id} ORDER BY id`);
  check('order lines keep variant id, label, and "Name (label)" for every screen', items[0].variant_id === ids['Qora · 64 GB'] && items[0].variant_label === 'Qora · 64 GB' && items[0].name === 'Fayz Phone (Qora · 64 GB)' && items[2].variant_id === null, JSON.stringify(items));
  let stock = Object.fromEntries(d1(`SELECT id,stock FROM product_variants WHERE product_id=${phone}`).map(x => [x.id, x.stock]));
  check('stock taken from the chosen variants only (3→1, 2→1; others untouched)', stock[ids['Qora · 64 GB']] === 1 && stock[ids['Qora · 128 GB']] === 1 && stock[ids['Oq · 128 GB']] === 5);
  check('simple product stock still decremented as before (10→9)', d1(`SELECT stock FROM products WHERE id=${simple}`)[0].stock === 9);
  r = await call(`/orders/${vo.id}`, { headers: { Authorization: `Order ${vo.accessToken}` } });
  check('customer order view: variant label on the line, discount', r.data.order.items[0].variant === 'Qora · 64 GB' && r.data.order.discountTotal === 700000);
  r = await call(`/admin/orders/${vo.id}`, { auth: owner });
  check('admin order view: variant label on the line', r.data.order.items.some(i => i.variant === 'Qora · 128 GB'));
  await call(`/admin/orders/${vo.id}/status`, { method: 'PATCH', auth: owner, body: { status: 'cancelled' } });
  stock = Object.fromEntries(d1(`SELECT id,stock FROM product_variants WHERE product_id=${phone}`).map(x => [x.id, x.stock]));
  check('cancel restores the VARIANT stock (1→3, 1→2) and the simple product (9→10)', stock[ids['Qora · 64 GB']] === 3 && stock[ids['Qora · 128 GB']] === 2 && d1(`SELECT stock FROM products WHERE id=${simple}`)[0].stock === 10);
  r = await call(`/products/fayz-phone`); check('product stock after cancel = 5 again', r.data.product.stock === 5);

  section('Variant stock adjustments and editing');
  r = await call(`/admin/products/${phone}/adjust-stock`, { method: 'POST', auth: owner, body: { delta: 5, reason: 'Yangi partiya' } });
  check('stock change of a variant product without the variant → 400', r.status === 400 && r.data.error?.code === 'VARIANT_REQUIRED');
  r = await call(`/admin/products/${phone}/adjust-stock`, { method: 'POST', auth: owner, body: { delta: 4, reason: 'Yangi partiya', variantId: ids['Oq · 64 GB'] } });
  check('stock +4 for «Oq · 64 GB» → applied to that variant only', r.status === 200 && d1(`SELECT stock FROM product_variants WHERE id=${ids['Oq · 64 GB']}`)[0].stock === 4);
  r = await call(`/admin/products/${phone}/adjust-stock`, { method: 'POST', auth: owner, body: { delta: -10, reason: 'Xato', variantId: ids['Oq · 64 GB'] } });
  check('variant stock cannot go below 0 → 409', r.status === 409);
  r = await call(`/admin/products/${simple}/adjust-stock`, { method: 'POST', auth: owner, body: { delta: 1, reason: 'Kirim', variantId: ids['Oq · 64 GB'] } });
  check('variant id on a simple product → 400', r.status === 400);
  r = await call(`/admin/products/${phone}`, { method: 'PUT', auth: owner, body: { ...base, price: 1 } });
  r = await call(`/admin/products/${phone}`, { auth: owner });
  check('update from an OLDER admin app (no variant fields) keeps variants, axes and characteristics', r.data.product.variants.length === 4 && r.data.product.options.length === 2 && r.data.product.attributes.length === 2, JSON.stringify(r.data.product.options));
  const full = r.data.product;
  // Remove «Qora · 64 GB» (used by an order) and «Oq · 128 GB» (never ordered); change one price.
  const keep = full.variants.filter(x => !['Qora · 64 GB', 'Oq · 128 GB'].includes(x.label)).map(x => ({ id: x.id, options: x.options, price: x.label === 'Qora · 128 GB' ? 2350000 : x.price, comparePrice: 0, stock: x.stock, image: x.image, active: true }));
  r = await call(`/admin/products/${phone}`, { method: 'PUT', auth: owner, body: { ...base, options: axes, attributes: full.attributes, variants: keep } });
  check('save edited variants → 200', r.status === 200, r.text);
  const rows = d1(`SELECT id,active,price,stock FROM product_variants WHERE product_id=${phone}`);
  check('variant used by an order is switched off, not deleted (history stays intact)', rows.some(x => x.id === ids['Qora · 64 GB'] && x.active === 0));
  check('never-ordered variant left out → deleted', !rows.some(x => x.id === ids['Oq · 128 GB']));
  check('edited variant keeps its id and stock, new price saved', rows.some(x => x.id === ids['Qora · 128 GB'] && x.price === 2350000 && x.stock === 2));
  r = await call('/products/fayz-phone'); check('customer now sees 2 variants, from 2 050 000', r.data.product.variants.length === 2 && r.data.product.price === 2050000, JSON.stringify(r.data.product.variants.map(x => x.label)));
  r = await call('/admin/reports/summary', { auth: owner });
  check('report: units in stock count variant stock (phone 2+4, lite 4, watch 10)', r.data.inventory.units === 2 + 4 + 4 + 10 + 0, JSON.stringify(r.data.inventory));

  section('Related products (C05/C06)');
  r = await call('/products/fayz-phone/related');
  const rel = r.data.products.map(p => p.id);
  check('related: same category first, itself excluded, sold-out excluded', rel[0] === sameCat && !rel.includes(phone) && !rel.includes(soldOut), JSON.stringify(rel));
  check('related: other categories fill the list', rel.includes(simple));
  r = await call('/products/nope/related'); check('related for an unknown product → 404', r.status === 404);

  // ================================================================ Delivery tariff
  section('Checkout: pickup vs courier, courier fee tariff (C14, C15)');
  await call('/admin/store', { method: 'PUT', auth: owner, body: { placeName: 'Fayz Market', address: 'Toshkent sh., Chilonzor, 12-uy', lat: 41.2856, lng: 69.2034 } });
  const settings = { cash: true, cardTerminal: true, bankTransfer: false, bankTransferDetails: '', pickup: true };
  r = await call('/admin/payment-settings', { method: 'PUT', auth: owner, body: { ...settings, deliveryFeeMode: 'quote' } });
  r = await call('/storefront'); check('storefront: both choices (delivery + pickup) and the tariff mode', JSON.stringify(r.data.checkout.fulfillment) === '["delivery","pickup"]' && r.data.checkout.deliveryFeeMode === 'quote' && r.data.checkout.deliveryFee === 0);
  r = await order([{ productId: simple, quantity: 1 }]);
  check('no tariff: courier order accepted, fee NOT guessed (0, marked pending)', r.status === 201 && r.data.order.deliveryFee === 0 && r.data.order.deliveryFeePending === true && r.data.order.total === 300000, r.text);
  const pending = r.data.order;
  r = await order([{ productId: simple, quantity: 1 }], { fulfillment: 'pickup', address: '' });
  check('pickup: no courier fee and not pending', r.data.order.deliveryFee === 0 && r.data.order.deliveryFeePending === false);
  r = await call(`/orders/${pending.id}`, { headers: { Authorization: `Order ${pending.accessToken}` } });
  check('customer sees "fee pending" on the order', r.data.order.deliveryFeePending === true);
  r = await call(`/admin/orders/${pending.id}/delivery-fee`, { method: 'PATCH', auth: owner, body: { fee: 25000 } });
  check('staff confirm the courier fee → total 325 000', r.status === 200 && r.data.total === 325000, r.text);
  r = await call(`/orders/${pending.id}`, { headers: { Authorization: `Order ${pending.accessToken}` } });
  check('customer order now shows fee 25 000 and total 325 000', r.data.order.deliveryFee === 25000 && r.data.order.total === 325000 && r.data.order.deliveryFeePending === false);
  await call(`/admin/orders/${pending.id}/payments`, { method: 'POST', auth: owner, body: { amount: 1000, method: 'cash' } });
  r = await call(`/admin/orders/${pending.id}/delivery-fee`, { method: 'PATCH', auth: owner, body: { fee: 1 } });
  check('fee cannot change once a payment is recorded → 409', r.status === 409 && r.data.error?.code === 'PAYMENT_STARTED');
  r = await call(`/admin/orders/${vo.id}/delivery-fee`, { method: 'PATCH', auth: owner, body: { fee: 1 } });
  check('fee of a cancelled order cannot change → 409', r.status === 409);
  r = await call('/admin/payment-settings', { method: 'PUT', auth: owner, body: { ...settings, deliveryFeeMode: 'fixed', deliveryFee: 0 } });
  check('fixed tariff without an amount → 400', r.status === 400 && r.data.error?.code === 'DELIVERY_FEE');
  r = await call('/admin/payment-settings', { method: 'PUT', auth: owner, body: { ...settings, deliveryFee: 20000, deliveryFreeFrom: 1000000 } });
  r = await call('/storefront'); check('older admin app sends only an amount → fixed tariff', r.data.checkout.deliveryFeeMode === 'fixed' && r.data.checkout.deliveryFee === 20000);
  r = await order([{ productId: simple, quantity: 1 }]); check('fixed: fee added on top (300 000 + 20 000)', r.data.order.total === 320000 && r.data.order.deliveryFee === 20000 && !r.data.order.deliveryFeePending);
  r = await order([{ productId: sameCat, quantity: 2 }]); check('fixed: free above the threshold (1 800 000 ≥ 1 000 000)', r.data.order.deliveryFee === 0 && r.data.order.total === 1800000 && !r.data.order.deliveryFeePending);
  r = await call('/admin/payment-settings', { method: 'PUT', auth: owner, body: { ...settings, deliveryFeeMode: 'free' } });
  r = await order([{ productId: simple, quantity: 1 }]); check('free delivery: fee 0, not pending', r.data.order.deliveryFee === 0 && !r.data.order.deliveryFeePending);
  r = await call('/admin/payment-settings', { method: 'PUT', auth: owner, body: { ...settings, cash: false, cardTerminal: false } });
  check('every payment method off is still refused', r.status === 400);

  // ================================================================ Courier RBAC
  section('Courier RBAC with a separate courier account (K01–K04)');
  const COURIER = { email: 'kuryer1@example.invalid', password: 'Kuryer-Password-2026' }, OTHER = { email: 'kuryer2@example.invalid', password: 'Kuryer-Password-2027' };
  const c1 = (await call('/admin/users', { method: 'POST', auth: owner, body: { ...COURIER, role: 'courier', name: 'Aziz Kuryer', phone: '+998901234567' } })).data.id;
  await call('/admin/users', { method: 'POST', auth: owner, body: { ...OTHER, role: 'courier', name: 'Bobur Kuryer', phone: '+998907654321' } });
  const courier = `Bearer ${(await call('/admin/login', { method: 'POST', body: COURIER })).data.token}`;
  const other = `Bearer ${(await call('/admin/login', { method: 'POST', body: OTHER })).data.token}`;
  r = await call('/admin/me', { auth: courier }); check('courier signs in to the same app with role "courier"', r.data.admin?.role === 'courier');
  const forbidden = [['GET', '/admin/products'], ['GET', '/admin/orders'], ['GET', `/admin/orders/${pending.id}`], ['GET', '/admin/users'], ['GET', '/admin/integrations'], ['GET', '/admin/reports/summary'], ['PUT', '/admin/payment-settings'], ['POST', '/admin/products'], ['PATCH', `/admin/orders/${pending.id}/status`], ['PATCH', `/admin/orders/${pending.id}/delivery-fee`], ['POST', `/admin/orders/${pending.id}/payments`], ['POST', `/admin/orders/${pending.id}/assign`], ['PUT', '/admin/store'], ['POST', '/admin/banners']];
  const leaks = [];
  for (const [method, path] of forbidden) { const x = await call(path, { method, auth: courier, body: method === 'GET' ? undefined : {} }); if (x.status !== 403) leaks.push(`${method} ${path} → ${x.status}`); }
  check(`courier is refused every staff endpoint (${forbidden.length} checked) → 403`, !leaks.length, leaks.join(', '));
  const forOrder = (await order([{ productId: simple, quantity: 1 }], { location: { lat: 41.3, lng: 69.25 }, deliveryDetails: '2-podyezd' })).data.order;
  await call(`/admin/orders/${forOrder.id}/status`, { method: 'PATCH', auth: owner, body: { status: 'confirmed' } });
  r = await call(`/admin/orders/${forOrder.id}/assign`, { method: 'POST', auth: owner, body: { courierId: c1 } }); check('owner assigns the order to courier 1', r.status === 200, r.text);
  r = await call('/courier/deliveries', { auth: courier }); check('courier 1 sees the assigned delivery', r.data.deliveries?.some(d => d.orderId === forOrder.id || d.id === forOrder.id), r.text);
  r = await call('/courier/deliveries', { auth: other }); check('courier 2 does NOT see it', !r.data.deliveries?.some(d => d.orderId === forOrder.id || d.id === forOrder.id));
  r = await call(`/courier/deliveries/${forOrder.id}`, { auth: other }); check('courier 2 opening it directly → 404', r.status === 404);
  r = await call(`/courier/deliveries/${forOrder.id}`, { auth: courier });
  check('courier 1 sees the customer phone, address, details and point while working on it (K02/K03)', r.data.order?.phone === shopper.phone && r.data.order?.details === '2-podyezd' && !!r.data.order?.location, r.text);
  let ver = r.data.delivery.version;
  const act = async (action, auth = courier) => { const x = await call(`/courier/deliveries/${forOrder.id}/${action}`, { method: 'POST', auth, body: { version: ver } }); if (x.status === 200) ver = (await call(`/courier/deliveries/${forOrder.id}`, { auth: courier })).data.delivery.version; return x; };
  r = await act('pickup'); check('stage order enforced: pick up before accepting → 409', r.status === 409);
  r = await act('accept', other); check('courier 2 cannot act on courier 1’s delivery → 404', r.status === 404);
  for (const step of ['accept', 'pickup', 'depart', 'arrive', 'handover']) { r = await act(step); check(`courier stage «${step}» → 200 (K04)`, r.status === 200, r.text); }
  r = await call(`/admin/orders/${forOrder.id}`, { auth: owner }); check('order is "shipped" after pickup, waiting for the customer', r.data.order.status === 'shipped');
  r = await call(`/orders/${forOrder.id}/confirm-delivery`, { method: 'POST', headers: { Authorization: `Order ${forOrder.accessToken}` } });
  r = await call(`/admin/orders/${forOrder.id}`, { auth: owner }); check('customer confirmation → delivered', r.data.order.status === 'delivered');
  r = await call(`/courier/deliveries/${forOrder.id}`, { auth: courier }); check('after completion the courier no longer sees the phone/address', r.data.order.phone === null && r.data.order.address === null);
  await call(`/admin/users/${c1}`, { method: 'PATCH', auth: owner, body: { active: false } });
  r = await call('/courier/deliveries', { auth: courier }); check('switched-off courier is signed out everywhere → 401', r.status === 401);
} catch (error) {
  check('verification script completed', false, String(error?.stack || error));
} finally {
  shutdown();
  const out = join(root, 'docs/v1/evidence/real-device-fixes'); mkdirSync(out, { recursive: true });
  const passed = results.filter(x => x.startsWith('PASS')).length, total = results.filter(x => /^(PASS|FAIL)/.test(x)).length;
  writeFileSync(join(out, 'api-verify.txt'), `Fayz Market V1 1.2.2 — real-device fixes, API (isolated local Worker, fresh D1)\n${new Date().toISOString()}\n${results.join('\n')}\n\n${passed}/${total} passed\n`);
  console.log(`\n${passed}/${total} passed`);
  process.exitCode = failed ? 1 : 0;
}
