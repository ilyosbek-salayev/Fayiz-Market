import assert from 'node:assert/strict';

const BASE = process.env.TEST_API_URL || 'http://127.0.0.1:8787';
const secret = process.env.TEST_BOOTSTRAP_SECRET || 'local-test-secret-only-not-for-production';
const email = `owner-${Date.now()}@example.invalid`;
const password = 'LocalTestPassword123!';
let passed = 0;
async function call(path, method = 'GET', body, token, extraHeaders = {}) {
  const response = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extraHeaders }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
function check(condition, label) { assert.ok(condition, label); passed++; console.log(`PASS ${label}`); }

const health = await call('/health'); check(health.status === 200 && health.body.ok, 'health');
const unauthorized = await call('/admin/products'); check(unauthorized.status === 401, 'admin protection');
const bootstrap = await call('/admin/bootstrap', 'POST', { email, password }, undefined, { 'X-Bootstrap-Secret': secret });
check(bootstrap.status === 201 || bootstrap.body.error?.code === 'ALREADY_INITIALIZED', 'bootstrap protected');
if (bootstrap.status !== 201) throw new Error('Local D1 already initialized; reset local test database before running this suite');
const wrongLogin = await call('/admin/login', 'POST', { email, password: 'WrongPassword123!' }); check(wrongLogin.status === 401, 'wrong password denied');
for (let i = 0; i < 5; i++) await call('/admin/login', 'POST', { email: 'unknown@example.invalid', password: 'WrongPassword123!' });
const rateLimit = await call('/admin/login', 'POST', { email: 'unknown@example.invalid', password: 'WrongPassword123!' }); check(rateLimit.status === 429, 'login rate limit');
const login = await call('/admin/login', 'POST', { email, password }); check(login.status === 200 && login.body.token, 'admin login');
const token = login.body.token;
const managerEmail = `manager-${Date.now()}@example.invalid`;
const manager = await call('/admin/users', 'POST', { email: managerEmail, password: 'ManagerPassword123!', role: 'manager' }, token); check(manager.status === 201, 'manager created');
const managerLogin = await call('/admin/login', 'POST', { email: managerEmail, password: 'ManagerPassword123!' }); check(managerLogin.status === 200, 'manager login');
const deniedSettings = await call('/admin/settings', 'PUT', { contact_phone: 'test', delivery_info: 'test' }, managerLogin.body.token); check(deniedSettings.status === 403, 'manager denied owner setting');
const category = await call('/admin/categories', 'POST', { name: 'Test aksessuarlar', slug: 'test-aksessuarlar' }, token); check(category.status === 201, 'category creation');
const product = await call('/admin/products', 'POST', { name: 'Test sumka', slug: 'test-sumka', description: 'Sinov mahsuloti', categoryId: category.body.id, price: 120000, stock: 3, active: true, featured: true, images: [] }, token); check(product.status === 201, 'product creation');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+XKZkAAAAASUVORK5CYII=', 'base64');
const uploadResponse = await fetch(BASE + '/admin/images', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/png' }, body: png }); const upload = await uploadResponse.json(); check(uploadResponse.status === 201 && upload.url, 'R2 image upload');
const imageResponse = await fetch(upload.url); check(imageResponse.status === 200 && imageResponse.headers.get('content-type') === 'image/png', 'R2 image serving');
const catalog = await call('/products?q=Test%20sumka'); check(catalog.status === 200 && catalog.body.products.length === 1, 'catalog search');
const featured = await call('/products?featured=1'); check(featured.status === 200 && featured.body.products.length === 1, 'featured catalog');
const detail = await call('/products/test-sumka'); check(detail.status === 200 && detail.body.product.stock === 3, 'product detail');
const share = await fetch(BASE + '/p/test-sumka'); check(share.status === 200 && (await share.text()).includes('og:title'), 'social share page');
const settingsUpdate = await call('/admin/settings', 'PUT', { contact_phone: '+998901234567', delivery_info: 'Toshkent shahri', banner_title: 'Yangi aksessuarlar', banner_subtitle: 'Fayz Market' }, token); check(settingsUpdate.status === 200, 'store settings update');
const settingsRead = await call('/settings'); check(settingsRead.body.settings.banner_title === 'Yangi aksessuarlar', 'store banner persistence');
const checkout = { customerName: 'Test Xaridor', phone: '+998901234567', address: 'Toshkent shahar, test manzil', note: '', items: [{ productId: product.body.id, quantity: 2 }] };
const order = await call('/orders', 'POST', checkout); check(order.status === 201 && order.body.order.total === 240000, 'order checkout');
const afterStock = await call('/products/test-sumka'); check(afterStock.body.product.stock === 1, 'stock decremented');
const overstock = await call('/orders', 'POST', checkout); check(overstock.status === 409, 'oversell rejected');
const orderDenied = await call(`/orders/${order.body.order.id}`); check(orderDenied.status === 401, 'order access protected');
const customerOrder = await call(`/orders/${order.body.order.id}`, 'GET', undefined, undefined, { Authorization: `Order ${order.body.order.accessToken}` }); check(customerOrder.status === 200 && customerOrder.body.order.items.length === 1, 'customer order lookup');
const adminOrder = await call(`/admin/orders/${order.body.order.id}`, 'GET', undefined, token); check(adminOrder.status === 200, 'admin order detail');
const invalidStatus = await call(`/admin/orders/${order.body.order.id}/status`, 'PATCH', { status: 'delivered' }, token); check(invalidStatus.status === 409, 'invalid status denied');
const confirm = await call(`/admin/orders/${order.body.order.id}/status`, 'PATCH', { status: 'confirmed' }, token); check(confirm.status === 200, 'order confirmed');
const payment = await call(`/admin/orders/${order.body.order.id}/payments`, 'POST', { amount: 100000, method: 'cash', reference: '', note: '' }, token); check(payment.status === 201, 'payment recorded');
const overpayment = await call(`/admin/orders/${order.body.order.id}/payments`, 'POST', { amount: 200000, method: 'cash', reference: '', note: '' }, token); check(overpayment.status === 409, 'overpayment rejected');
const paidCancel = await call(`/admin/orders/${order.body.order.id}/status`, 'PATCH', { status: 'cancelled' }, token); check(paidCancel.status === 409, 'paid order cancellation denied');
const secondOrder = await call('/orders', 'POST', { ...checkout, items: [{ productId: product.body.id, quantity: 1 }] }); check(secondOrder.status === 201, 'second order created');
const cancel = await call(`/admin/orders/${secondOrder.body.order.id}/status`, 'PATCH', { status: 'cancelled' }, token); check(cancel.status === 200, 'unpaid order cancelled');
const restored = await call('/products/test-sumka'); check(restored.body.product.stock === 1, 'stock restored on cancellation');
const adjustment = await call(`/admin/products/${product.body.id}/adjust-stock`, 'POST', { delta: 2, reason: 'Sinov kirimi' }, token); check(adjustment.status === 200, 'inventory adjustment');
const adjusted = await call('/products/test-sumka'); check(adjusted.body.product.stock === 3, 'inventory adjustment persisted');
const report = await call('/admin/reports/summary', 'GET', undefined, token); check(report.status === 200 && report.body.payments.received_total === 100000, 'financial report');
const logout = await call('/admin/logout', 'POST', undefined, token); check(logout.status === 200, 'logout');
const deniedAfterLogout = await call('/admin/products', 'GET', undefined, token); check(deniedAfterLogout.status === 401, 'session invalidated');
console.log(`${passed} integration checks passed`);
