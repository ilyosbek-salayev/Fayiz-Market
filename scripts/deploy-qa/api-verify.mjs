// Live API verification for a deployed Fayz Market Worker.
// Usage (credentials are read from the environment, never from this file):
//   QA_API=https://<worker>.workers.dev ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/deploy-qa/api-verify.mjs
// Every record it creates is named "QA-PROD ..." and its ids are written to QA_OUT (default
// scripts/deploy-qa/created.json) so they can be removed afterwards. It never records a payment:
// payment handling is checked through the validation paths that reject a write.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = (process.env.QA_API || '').replace(/\/+$/, '');
const EMAIL = process.env.ADMIN_EMAIL, PASSWORD = process.env.ADMIN_PASSWORD;
const OUT = process.env.QA_OUT || join(dirname(fileURLToPath(import.meta.url)), 'created.json');
if (!API.startsWith('https://') || !EMAIL || !PASSWORD) { console.error('Set QA_API (https), ADMIN_EMAIL and ADMIN_PASSWORD'); process.exit(2); }

const results = []; const created = { categories: [], products: [], orders: [], admins: [], loginEmails: [] };
const stamp = Date.now().toString(36);
const check = (name, ok, detail = '') => { results.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };
async function call(path, { method = 'GET', token, orderToken, body, headers = {}, raw = false } = {}) {
  const response = await fetch(API + path, { method, headers: { ...(body !== undefined && !raw ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(orderToken ? { Authorization: `Order ${orderToken}` } : {}), ...headers }, body: body === undefined ? undefined : raw ? body : JSON.stringify(body) });
  const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data, headers: response.headers };
}

try {
  // ── Public / customer endpoints
  let r = await call('/health'); check('GET /health', r.status === 200 && r.data.ok === true);
  r = await call('/settings'); check('GET /settings (customer home banner, admin settings)', r.status === 200 && typeof r.data.settings?.banner_title === 'string', Object.keys(r.data.settings || {}).join(','));
  const originalSettings = r.data.settings;
  r = await call('/categories'); check('GET /categories', r.status === 200 && Array.isArray(r.data.categories));
  r = await call('/products'); check('GET /products', r.status === 200 && Array.isArray(r.data.products) && typeof r.data.total === 'number', `total=${r.data.total}`);
  r = await call('/products?sort=bogus'); check('GET /products invalid sort → 400', r.status === 400 && r.data.error?.code === 'INVALID_SORT');
  r = await call('/products/does-not-exist-' + stamp); check('GET /products/:slug unknown → 404', r.status === 404);

  // ── Admin authentication and authorization
  r = await call('/admin/me'); check('GET /admin/me without token → 401', r.status === 401);
  r = await call('/admin/products', { token: 'f'.repeat(64) }); check('admin route with forged token → 401', r.status === 401);
  for (const [m, p] of [['GET', '/admin/orders'], ['GET', '/admin/reports/summary'], ['GET', '/admin/users'], ['POST', '/admin/categories'], ['PUT', '/admin/settings'], ['POST', '/admin/images']]) {
    r = await call(p, { method: m, body: m === 'GET' ? undefined : {} }); check(`${m} ${p} without token → 401`, r.status === 401);
  }
  const wrongEmail = `qa-prod-wrong-${stamp}@example.com`; created.loginEmails.push(wrongEmail);
  r = await call('/admin/login', { method: 'POST', body: { email: wrongEmail, password: 'definitely-wrong-1' } }); check('POST /admin/login wrong credentials → 401', r.status === 401 && r.data.error?.code === 'INVALID_CREDENTIALS');
  r = await call('/admin/login', { method: 'POST', body: { email: 'not-an-email', password: 'x' } }); check('POST /admin/login invalid input → 400', r.status === 400);
  const t0 = Date.now();
  r = await call('/admin/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD } });
  check('POST /admin/login owner (PBKDF2 fix on Cloudflare)', r.status === 200 && /^[a-f0-9]{64}$/.test(r.data.token || '') && r.data.admin?.role === 'owner', `${Date.now() - t0} ms`);
  const token = r.data.token;
  r = await call('/admin/me', { token }); check('GET /admin/me', r.status === 200 && r.data.admin.role === 'owner');

  // ── Dashboard / reports baseline
  r = await call('/admin/reports/summary', { token }); check('GET /admin/reports/summary', r.status === 200 && r.data.orders && r.data.inventory && Array.isArray(r.data.daily));
  const before = r.data;

  // ── Categories
  r = await call('/admin/categories', { method: 'POST', token, body: { name: `QA-PROD Kategoriya ${stamp}`, slug: `qa-prod-${stamp}` } });
  check('POST /admin/categories', r.status === 201 && r.data.id > 0); const categoryId = r.data.id; created.categories.push(categoryId);
  r = await call(`/admin/categories/${categoryId}`, { method: 'PUT', token, body: { name: `QA-PROD Kategoriya ${stamp} (tahrir)`, slug: `qa-prod-${stamp}` } }); check('PUT /admin/categories/:id', r.status === 200);
  r = await call('/admin/categories', { method: 'POST', token, body: { name: 'dup', slug: `qa-prod-${stamp}` } }); check('duplicate category slug → 409', r.status === 409 && r.data.error?.code === 'CONFLICT');
  r = await call('/admin/categories', { method: 'POST', token, body: { name: `QA-PROD Bo‘sh ${stamp}`, slug: `qa-prod-empty-${stamp}` } }); const emptyCat = r.data.id; created.categories.push(emptyCat);
  r = await call(`/admin/categories/${emptyCat}`, { method: 'DELETE', token }); check('DELETE /admin/categories/:id (owner)', r.status === 200);
  if (r.status === 200) created.categories = created.categories.filter(id => id !== emptyCat);

  // ── Products
  const slug = `qa-prod-mahsulot-${stamp}`;
  const product = { name: `QA-PROD Mahsulot ${stamp}`, slug, description: 'Production API sinovi uchun vaqtinchalik yozuv', categoryId, price: 125000, stock: 4, active: true, featured: false, images: [] };
  r = await call('/admin/products', { method: 'POST', token, body: product }); check('POST /admin/products', r.status === 201 && r.data.id > 0); const productId = r.data.id; created.products.push(productId);
  r = await call('/admin/products', { method: 'POST', token, body: { ...product, price: -5 } }); check('POST /admin/products negative price → 400', r.status === 400);
  r = await call(`/admin/products/${productId}`, { method: 'PUT', token, body: { ...product, price: 130000 } }); check('PUT /admin/products/:id', r.status === 200);
  r = await call('/admin/products', { token }); check('GET /admin/products lists new product', r.status === 200 && r.data.products.some(p => p.id === productId && p.price === 130000));
  r = await call(`/admin/products/${productId}/adjust-stock`, { method: 'POST', token, body: { delta: 2, reason: 'QA-PROD qoldiq sinovi' } }); check('POST /admin/products/:id/adjust-stock +2', r.status === 200);
  r = await call(`/admin/products/${productId}/adjust-stock`, { method: 'POST', token, body: { delta: -100, reason: 'QA-PROD manfiy sinov' } }); check('adjust-stock below zero → 409 STOCK_CONFLICT', r.status === 409 && r.data.error?.code === 'STOCK_CONFLICT');

  // ── Customer sees the admin's product
  r = await call(`/products?q=${encodeURIComponent('QA-PROD Mahsulot ' + stamp)}`); check('customer search finds admin product', r.status === 200 && r.data.products.some(p => p.id === productId));
  r = await call(`/products?category=qa-prod-${stamp}`); check('customer category filter', r.status === 200 && r.data.total === 1);
  r = await call(`/products?sort=price_asc&limit=50`); check('customer sort price_asc', r.status === 200 && r.data.products.every((p, i, a) => i === 0 || a[i - 1].price <= p.price));
  r = await call(`/products/${slug}`); check('GET /products/:slug detail', r.status === 200 && r.data.product.price === 130000 && r.data.product.stock === 6, `stock=${r.data.product?.stock}`);
  r = await call(`/p/${slug}`); check('GET /p/:slug share page uses HTTPS base URL', r.status === 200 && String(r.data).includes(`${API}/p/${slug}`));

  // ── Checkout
  const customer = { customerName: 'QA-PROD Sinov Xaridor', phone: '+998900000000', address: 'QA-PROD sinov manzili, Toshkent', note: 'Production API sinovi', items: [{ productId, quantity: 2 }] };
  r = await call('/orders', { method: 'POST', body: { ...customer, phone: '12345' } }); check('POST /orders invalid phone → 400', r.status === 400);
  r = await call('/orders', { method: 'POST', body: { ...customer, items: [{ productId, quantity: 50 }] } }); check('POST /orders over stock → 409 OUT_OF_STOCK', r.status === 409);
  r = await call('/orders', { method: 'POST', body: customer });
  check('POST /orders creates order', r.status === 201 && r.data.order.total === 260000 && r.data.order.status === 'new', r.data.order?.orderNumber);
  const order = r.data.order; created.orders.push(order.id);
  r = await call(`/orders/${order.id}`, { orderToken: order.accessToken }); check('GET /orders/:id with order token', r.status === 200 && r.data.order.items.length === 1);
  r = await call(`/orders/${order.id}`); check('GET /orders/:id without token → 401', r.status === 401);
  r = await call(`/orders/${order.id}`, { orderToken: 'a'.repeat(64) }); check('GET /orders/:id wrong token → 404', r.status === 404);
  r = await call(`/products/${slug}`); check('stock decremented by order (6 → 4)', r.data.product?.stock === 4);

  // ── Admin order management
  r = await call('/admin/orders', { token }); check('GET /admin/orders sees customer order', r.status === 200 && r.data.orders.some(o => o.id === order.id));
  r = await call('/admin/orders?status=new', { token }); check('GET /admin/orders?status=new filter', r.status === 200 && r.data.orders.every(o => o.status === 'new'));
  r = await call(`/admin/orders/${order.id}`, { token }); check('GET /admin/orders/:id detail + payments', r.status === 200 && r.data.order.items.length === 1 && Array.isArray(r.data.payments));
  r = await call(`/admin/orders/${order.id}/status`, { method: 'PATCH', token, body: { status: 'delivered' } }); check('invalid status jump new→delivered → 409', r.status === 409);
  r = await call(`/admin/orders/${order.id}/status`, { method: 'PATCH', token, body: { status: 'confirmed' } }); check('PATCH status new→confirmed', r.status === 200);
  r = await call(`/orders/${order.id}`, { orderToken: order.accessToken }); check('customer sees updated status', r.data.order?.status === 'confirmed');
  r = await call(`/admin/orders/${order.id}/payments`, { method: 'POST', token, body: { amount: 999999999, method: 'cash', reference: 'QA-PROD', note: 'must be rejected' } }); check('payment over order total → 409 OVERPAYMENT (nothing written)', r.status === 409 && r.data.error?.code === 'OVERPAYMENT');
  r = await call(`/admin/orders/${order.id}/payments`, { method: 'POST', token, body: { amount: -1, method: 'cash' } }); check('payment invalid amount → 400', r.status === 400);
  r = await call('/admin/reports/summary', { token });
  check('reports reflect the new order', r.status === 200 && r.data.orders.orders === before.orders.orders + 1 && r.data.orders.ordered_total === before.orders.ordered_total + 260000 && r.data.payments.received_total === before.payments.received_total, `orders ${before.orders.orders}→${r.data.orders.orders}`);
  r = await call(`/admin/orders/${order.id}/status`, { method: 'PATCH', token, body: { status: 'cancelled' } }); check('cancel test order', r.status === 200);
  r = await call(`/products/${slug}`); check('cancel restores stock (4 → 6)', r.data.product?.stock === 6);
  r = await call(`/admin/orders/${order.id}/payments`, { method: 'POST', token, body: { amount: 1000, method: 'cash' } }); check('payment on cancelled order → 409 (nothing written)', r.status === 409 && r.data.error?.code === 'CANCELLED_ORDER');

  // ── Settings (written back unchanged) and administrators
  r = await call('/admin/settings', { method: 'PUT', token, body: { contact_phone: originalSettings.contact_phone, delivery_info: originalSettings.delivery_info, banner_title: originalSettings.banner_title, banner_subtitle: originalSettings.banner_subtitle } });
  check('PUT /admin/settings (same values saved)', r.status === 200);
  r = await call('/settings'); check('settings unchanged after save', JSON.stringify(r.data.settings) === JSON.stringify(originalSettings));
  r = await call('/admin/users', { token }); check('GET /admin/users', r.status === 200 && r.data.users.length >= 1);
  const managerEmail = `qa-prod-manager-${stamp}@example.com`, managerPassword = `QaProd-${stamp}-${Math.random().toString(36).slice(2)}`;
  r = await call('/admin/users', { method: 'POST', token, body: { email: managerEmail, password: managerPassword, role: 'manager' } }); check('POST /admin/users (manager)', r.status === 201 && r.data.id > 0); created.admins.push(r.data.id);
  r = await call('/admin/login', { method: 'POST', body: { email: managerEmail, password: managerPassword } }); const managerToken = r.data.token; check('manager login', r.status === 200 && r.data.admin.role === 'manager');
  r = await call('/admin/users', { token: managerToken }); check('manager GET /admin/users → 403', r.status === 403);
  r = await call('/admin/settings', { method: 'PUT', token: managerToken, body: originalSettings }); check('manager PUT /admin/settings → 403', r.status === 403);
  r = await call(`/admin/categories/${categoryId}`, { method: 'DELETE', token: managerToken }); check('manager DELETE category → 403', r.status === 403);
  r = await call('/admin/orders', { token: managerToken }); check('manager can read orders', r.status === 200);
  await call('/admin/logout', { method: 'POST', token: managerToken });
  r = await call('/admin/me', { token: managerToken }); check('logout invalidates session → 401', r.status === 401);

  // ── Images (R2)
  r = await call('/images/not-valid'); check('GET /images/:key rejects bad key → 400', r.status === 400);
  const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
  r = await call('/admin/images', { method: 'POST', token, body: Buffer.from('not an image'), raw: true, headers: { 'Content-Type': 'image/png' } }); check('POST /admin/images rejects non-image → 415', r.status === 415);
  r = await call('/admin/images', { method: 'POST', token, body: png, raw: true, headers: { 'Content-Type': 'image/png' } });
  const uploaded = r.status === 201 ? r.data.url : '';
  check('POST /admin/images uploads to R2', r.status === 201 && uploaded.startsWith(`${API}/images/`), r.status === 201 ? uploaded : `HTTP ${r.status} ${JSON.stringify(r.data)}`);
  if (uploaded) {
    const img = await fetch(uploaded); const bytes = new Uint8Array(await img.arrayBuffer());
    check('GET uploaded image from R2', img.status === 200 && img.headers.get('content-type') === 'image/png' && bytes.length === png.length);
    r = await call(`/admin/products/${productId}`, { method: 'PUT', token, body: { ...product, price: 130000, images: [uploaded] } }); check('attach R2 image to product', r.status === 200);
    r = await call(`/products/${slug}`); check('customer product shows R2 image', r.data.product?.images?.[0] === uploaded);
    created.images = [uploaded.split('/').pop()];
  }

  // ── CORS and transport
  r = await call('/settings', { headers: { Origin: 'https://evil.example' } }); check('foreign Origin gets no CORS grant', !r.headers.get('access-control-allow-origin'));
  r = await call('/admin/products', { method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'GET' } }); check('foreign preflight → 403', r.status === 403);
  r = await call('/admin/products', { method: 'POST', token, body: '{not json', raw: true, headers: { 'Content-Type': 'application/json' } }); check('malformed JSON body is rejected (4xx/5xx, no write)', r.status >= 400);

  // ── Hide the test product through the normal admin action
  r = await call(`/admin/products/${productId}`, { method: 'DELETE', token }); check('DELETE /admin/products/:id hides product', r.status === 200);
  r = await call(`/products/${slug}`); check('hidden product not visible to customer', r.status === 404);
  await call('/admin/logout', { method: 'POST', token });
} catch (error) {
  check('script completed without exception', false, String(error?.stack || error));
} finally {
  writeFileSync(OUT, JSON.stringify({ api: API, at: new Date().toISOString(), created, results }, null, 2));
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exitCode = failed.length ? 1 : 0;
}
