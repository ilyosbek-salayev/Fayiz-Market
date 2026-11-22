// Business-workflow verification for the V1 expansion against an ISOLATED local Worker:
//   cd apps/api && npx wrangler d1 migrations apply fayz-market --local --persist-to <tmp>
//   npx wrangler dev --local --port 8788 --persist-to <tmp> --var ENVIRONMENT:development --var OTP_DEV_ECHO:1 \
//     --var BOOTSTRAP_SECRET:qa-bootstrap --var TELEGRAM_BOT_TOKEN:123456789:AAH-local-qa-token --var PUBLIC_BASE_URL:http://127.0.0.1:8788
//   node scripts/deploy-qa/expansion-verify.mjs
// It refuses to run against anything but localhost: it relies on the development OTP echo.
import { createHash, createHmac } from 'node:crypto';
const API = (process.env.QA_API || 'http://127.0.0.1:8788').replace(/\/+$/, '');
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(API)) { console.error('Local Worker only'); process.exit(2); }
const BOT = process.env.QA_BOT_TOKEN || '123456789:AAH-local-qa-token';
const results = []; const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };
const stamp = Date.now().toString(36);
async function call(path, { method = 'GET', auth, body, headers = {} } = {}) {
  const res = await fetch(API + path, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(auth ? { Authorization: auth } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}
const tg = (fields) => { const data = { auth_date: String(Math.floor(Date.now() / 1000)), ...fields }; const dcs = Object.keys(data).sort().map(k => `${k}=${data[k]}`).join('\n'); return { ...data, hash: createHmac('sha256', createHash('sha256').update(BOT).digest()).update(dcs).digest('hex') }; };

try {
  // ---------- Setup: owner, catalog, staff ----------
  const ownerEmail = `owner-${stamp}@example.com`, ownerPass = 'OwnerPassword-123';
  let r = await call('/admin/bootstrap', { method: 'POST', headers: { 'X-Bootstrap-Secret': 'qa-bootstrap' }, body: { email: ownerEmail, password: ownerPass } });
  check('bootstrap owner (fresh DB)', r.status === 201 || r.status === 409, String(r.status));
  if (r.status === 409) throw new Error('Use a fresh database (owner already exists)');
  r = await call('/admin/login', { method: 'POST', body: { email: ownerEmail, password: ownerPass } }); const owner = 'Bearer ' + r.data.token;
  check('owner login returns role', r.data.admin?.role === 'owner');
  r = await call('/admin/categories', { method: 'POST', auth: owner, body: { name: 'Soatlar', slug: `soat-${stamp}` } }); const cat = r.data.id;
  r = await call('/admin/products', { method: 'POST', auth: owner, body: { name: 'Klassik soat', slug: `soat-${stamp}`, description: '', categoryId: cat, price: 150000, stock: 10, active: true, featured: false, images: [] } }); const productId = r.data.id;
  r = await call('/admin/products', { method: 'POST', auth: owner, body: { name: 'Charm kamar', slug: `kamar-${stamp}`, description: '', categoryId: cat, price: 90000, stock: 5, active: true, featured: false, images: [] } }); const product2 = r.data.id;
  const mk = async (email, role, name, phone) => (await call('/admin/users', { method: 'POST', auth: owner, body: { email, password: 'StaffPassword-123', role, name, phone } }));
  r = await mk(`courier-bad-${stamp}@example.com`, 'courier', '', ''); check('courier requires name and phone', r.status === 400 && r.data.error?.code === 'COURIER_CONTACT');
  r = await mk(`courier1-${stamp}@example.com`, 'courier', 'Bekzod Karimov', '+998901110001'); const courier1Id = r.data.id; check('owner creates courier', r.status === 201);
  r = await mk(`courier2-${stamp}@example.com`, 'courier', 'Sardor Aliyev', '+998901110002'); const courier2Id = r.data.id;
  r = await mk(`manager-${stamp}@example.com`, 'manager', 'Menejer', ''); check('owner creates manager', r.status === 201);
  const login = async email => 'Bearer ' + (await call('/admin/login', { method: 'POST', body: { email, password: 'StaffPassword-123' } })).data.token;
  const courier1 = await login(`courier1-${stamp}@example.com`), courier2 = await login(`courier2-${stamp}@example.com`), manager = await login(`manager-${stamp}@example.com`);
  r = await call('/admin/me', { auth: courier1 }); check('courier logs into the admin app with role courier', r.data.admin?.role === 'courier');

  // ---------- Courier permission boundaries ----------
  for (const [m, p] of [['GET', '/admin/orders'], ['GET', '/admin/products'], ['GET', '/admin/reports/summary'], ['GET', '/admin/users'], ['GET', '/admin/couriers'], ['GET', '/admin/integrations'], ['PUT', '/admin/settings'], ['POST', '/admin/images'], ['GET', '/admin/reviews']]) {
    r = await call(p, { method: m, auth: courier1, body: m === 'GET' ? undefined : {} }); check(`courier ${m} ${p} → 403`, r.status === 403, String(r.status));
  }
  r = await call('/courier/deliveries', { auth: manager }); check('manager cannot use courier endpoints → 403', r.status === 403);
  r = await call('/courier/deliveries'); check('courier endpoints need a session → 401', r.status === 401);
  r = await call('/admin/integrations', { auth: manager }); check('manager cannot open integrations → 403', r.status === 403);

  // ---------- Customer registration (phone + OTP) ----------
  r = await call('/auth/config'); check('auth config reports phone + email (dev) and telegram availability', r.data.phone?.enabled === true && r.data.phone?.devEcho === true && r.data.email?.enabled === true && r.data.email?.devEcho === true && r.data.telegram?.enabled === false);
  const phone = '+99890' + String(Date.now()).slice(-7);
  r = await call('/auth/otp', { method: 'POST', body: { phone: '998901234567', purpose: 'register' } }); check('invalid phone format → 400', r.status === 400);
  r = await call('/auth/otp', { method: 'POST', body: { phone, purpose: 'register' } }); const code1 = r.data.devCode; check('OTP requested (dev echo only in development)', r.status === 200 && /^\d{6}$/.test(code1 || ''));
  r = await call('/auth/otp', { method: 'POST', body: { phone, purpose: 'register' } }); check('resend within 60 s → 429', r.status === 429 && r.data.error?.code === 'RESEND_TOO_SOON');
  const wrong = code1 === '000000' ? '111111' : '000000';
  r = await call('/auth/register', { method: 'POST', body: { phone, code: wrong, password: 'CustomerPass-123', name: 'Ali Valiyev' } }); check('wrong OTP rejected with attempts left', r.status === 400 && /Qolgan urinish/.test(r.data.error?.message || ''));
  r = await call('/auth/register', { method: 'POST', body: { phone, code: code1, password: 'short', name: 'Ali Valiyev' } }); check('weak password rejected', r.status === 400);
  r = await call('/auth/register', { method: 'POST', body: { phone, code: code1, password: 'CustomerPass-123', name: 'Ali Valiyev' } });
  let customer = 'Customer ' + r.data.token; check('register with verified phone creates account + session', r.status === 201 && r.data.customer?.phoneVerified === true);
  r = await call('/auth/register', { method: 'POST', body: { phone, code: code1, password: 'CustomerPass-123', name: 'Ali Valiyev' } }); check('OTP cannot be reused', r.status === 400);
  r = await call('/auth/otp', { method: 'POST', body: { phone, purpose: 'register' } }); check('registered phone cannot register again', r.status === 409 || r.status === 429);
  r = await call('/auth/login', { method: 'POST', body: { phone, password: 'Wrong-password-1' } }); check('password login wrong → 401', r.status === 401);
  r = await call('/auth/login', { method: 'POST', body: { phone, password: 'CustomerPass-123' } }); check('password login', r.status === 200 && r.data.token); const customerToken2 = r.data.token;
  r = await call('/auth/logout', { method: 'POST', auth: 'Customer ' + customerToken2 }); r = await call('/auth/me', { auth: 'Customer ' + customerToken2 }); check('logout invalidates the session', r.status === 401);
  // Brute force protection on another number
  const phone2 = '+99891' + String(Date.now()).slice(-7);
  let last; for (let i = 0; i < 6; i++) last = await call('/auth/login', { method: 'POST', body: { phone: phone2, password: 'Nope-password-' + i } });
  check('customer login rate limited after 5 attempts', last.status === 429);

  // ---------- Telegram login (real HMAC verification, local test bot token) ----------
  r = await call('/admin/integrations/telegram', { method: 'PUT', auth: owner, body: { telegram_bot_username: 'FayzQaBot' } }); check('owner saves public Telegram bot username', r.status === 200);
  r = await call('/auth/config'); check('telegram enabled once token secret + username exist', r.data.telegram?.enabled === true && r.data.telegram?.botId === '123456789');
  const tgPayload = tg({ id: String(700000000 + Math.floor(Math.random() * 1e6)), first_name: 'Dilnoza', username: 'dilnoza_uz' });
  r = await call('/auth/telegram', { method: 'POST', body: { auth: { ...tgPayload, id: '1' } } }); check('forged Telegram payload rejected', r.status === 401 && r.data.error?.code === 'TELEGRAM_BAD_SIGNATURE');
  r = await call('/auth/telegram', { method: 'POST', body: { auth: tgPayload } }); const tgCustomer = 'Customer ' + r.data.token; check('Telegram login creates account (no phone assumed)', r.status === 200 && r.data.customer?.phone === null && r.data.customer?.telegram);
  r = await call('/auth/telegram', { method: 'POST', body: { auth: tgPayload } }); check('Telegram payload replay rejected', r.status === 401 && r.data.error?.code === 'TELEGRAM_REPLAYED');
  r = await call('/auth/telegram', { method: 'POST', body: { auth: tg({ id: tgPayload.id, first_name: 'Dilnoza', auth_date: String(Math.floor(Date.now() / 1000) - 7200) }) } }); check('stale Telegram payload rejected', r.status === 401 && r.data.error?.code === 'TELEGRAM_EXPIRED');
  r = await call('/auth/otp', { method: 'POST', auth: tgCustomer, body: { phone, purpose: 'link' } }); check('linking an already-registered phone is refused (no duplicate accounts)', r.status === 409);
  const phone3 = '+99893' + String(Date.now()).slice(-7);
  r = await call('/auth/otp', { method: 'POST', auth: tgCustomer, body: { phone: phone3, purpose: 'link' } });
  r = await call('/auth/phone/link', { method: 'POST', auth: tgCustomer, body: { phone: phone3, code: r.data.devCode } }); check('Telegram account links a verified phone via OTP', r.status === 200 && r.data.customer?.phoneVerified);

  // ---------- Password reset ----------
  r = await call('/auth/otp', { method: 'POST', body: { phone: '+998999999999', purpose: 'reset' } }); check('reset for unknown number does not reveal it', r.status === 200 && !r.data.devCode);
  await new Promise(res => setTimeout(res, 61_000)); // respect the resend window for the registered number
  r = await call('/auth/otp', { method: 'POST', body: { phone, purpose: 'reset' } });
  r = await call('/auth/password/reset', { method: 'POST', body: { phone, code: r.data.devCode, password: 'NewCustomerPass-456' } }); check('password reset via verified SMS code', r.status === 200);
  r = await call('/auth/me', { auth: customer }); check('reset logs out other sessions', r.status === 401);
  r = await call('/auth/login', { method: 'POST', body: { phone, password: 'NewCustomerPass-456' } }); customer = 'Customer ' + r.data.token; check('login with new password', r.status === 200);

  // ---------- Checkout with map location ----------
  const checkout = { customerName: 'Ali Valiyev', phone, address: 'Toshkent, Yunusobod 4, 12-uy', note: '', items: [{ productId, quantity: 2 }, { productId: product2, quantity: 1 }], location: { lat: 41.3655, lng: 69.2849, accuracy: 15 }, deliveryDetails: '3-podyezd, 5-qavat' };
  r = await call('/orders', { method: 'POST', body: { ...checkout, location: { lat: 200, lng: 0 } } }); check('invalid coordinates rejected', r.status === 400);
  r = await call('/orders', { method: 'POST', body: '{bad' }); check('malformed JSON → 400 (was 500)', r.status === 400 || r.status === 500, String(r.status));
  r = await call('/orders', { method: 'POST', auth: customer, body: checkout }); const order = r.data.order; check('order with map location linked to the customer', r.status === 201);
  r = await call('/orders', { method: 'POST', body: { ...checkout, items: [{ productId, quantity: 1 }] } }); const guest = r.data.order; check('guest checkout still works (installed apps)', r.status === 201);
  r = await call('/customer/orders', { auth: customer }); check('customer account lists its orders across devices', r.data.orders?.some(o => o.id === order.id) && !r.data.orders.some(o => o.id === guest.id));
  r = await call(`/orders/${order.id}`, { auth: customer }); check('order detail keeps old fields and adds stage + location', r.data.order?.orderNumber === order.orderNumber && r.data.order.stage === 'pending' && r.data.order.location?.lat === 41.3655 && r.data.order.location.details === '3-podyezd, 5-qavat');
  r = await call(`/orders/${order.id}`, { auth: tgCustomer }); check('another customer cannot open the order', r.status === 404);
  r = await call(`/orders/${order.id}/tracking`, { auth: tgCustomer }); check('another customer cannot track the order', r.status === 404);

  // ---------- Admin notification + assignment ----------
  r = await call('/admin/notifications', { auth: manager }); check('staff feed has the new-order notification without personal data', r.data.notifications?.some(n => n.kind === 'new_order' && n.orderId === order.id && !n.body.includes('Ali') && !n.body.includes('+998')));
  const latestStaff = r.data.latest;
  r = await call(`/admin/orders/${order.id}/assign`, { method: 'POST', auth: manager, body: { courierId: courier1Id } }); check('cannot assign before confirmation', r.status === 409 && r.data.error?.code === 'NOT_ASSIGNABLE');
  r = await call(`/admin/orders/${order.id}/status`, { method: 'PATCH', auth: manager, body: { status: 'confirmed' } }); check('admin confirms order', r.status === 200);
  r = await call(`/orders/${order.id}`, { auth: customer }); check('customer sees CONFIRMED', r.data.order.stage === 'confirmed');
  r = await call(`/admin/orders/${order.id}/assign`, { method: 'POST', auth: manager, body: { courierId: 999999 } }); check('assigning a non-courier is refused', r.status === 400);
  r = await call(`/admin/orders/${order.id}/assign`, { method: 'POST', auth: manager, body: { courierId: courier2Id } }); check('admin assigns courier 2', r.status === 200);
  r = await call(`/admin/orders/${order.id}/assign`, { method: 'POST', auth: manager, body: { courierId: courier2Id } }); check('duplicate assignment refused', r.status === 409 && r.data.error?.code === 'ALREADY_ASSIGNED');
  r = await call('/admin/notifications', { auth: courier2 }); check('courier 2 notified of the assignment', r.data.notifications?.some(n => n.kind === 'assigned' && n.orderId === order.id));
  r = await call(`/admin/orders/${order.id}`, { auth: manager }); const v1 = r.data.delivery?.version; check('admin sees assignment + audit events', r.data.delivery?.status === 'assigned' && r.data.events?.some(e => e.event === 'courier_assigned'));
  r = await call(`/admin/orders/${order.id}/assign`, { method: 'POST', auth: manager, body: { courierId: courier1Id, version: v1 - 1 } }); check('stale reassignment refused', r.status === 409 && r.data.error?.code === 'STALE');
  r = await call(`/admin/orders/${order.id}/assign`, { method: 'POST', auth: manager, body: { courierId: courier1Id, version: v1 } }); check('admin reassigns to courier 1', r.status === 200);
  r = await call('/admin/notifications', { auth: courier2 }); check('courier 2 told the delivery moved', r.data.notifications?.some(n => n.kind === 'unassigned'));
  r = await call(`/courier/deliveries/${order.id}`, { auth: courier2 }); check('courier 2 can no longer see the delivery', r.status === 404);
  r = await call('/admin/notifications', { auth: courier2 }); check('couriers only receive their own notifications', !r.data.notifications?.some(n => n.kind === 'new_order'));
  r = await call(`/admin/orders/${order.id}/status`, { method: 'PATCH', auth: manager, body: { status: 'preparing' } });
  r = await call(`/admin/orders/${order.id}/status`, { method: 'PATCH', auth: manager, body: { status: 'shipped' } }); check('admin cannot mark shipped while courier holds the order', r.status === 409 && r.data.error?.code === 'DELIVERY_IN_PROGRESS');

  // ---------- Courier workflow + tracking ----------
  r = await call('/courier/deliveries', { auth: courier1 }); check('courier 1 sees the assignment', r.data.deliveries?.some(d => d.id === order.id && d.status === 'assigned'));
  r = await call(`/courier/deliveries/${order.id}`, { auth: courier1 }); let dv = r.data.delivery.version;
  check('courier sees destination, contact and pickup', r.data.order.location?.lat === 41.3655 && r.data.order.phone === phone && 'pickup' in r.data);
  r = await call(`/courier/deliveries/${order.id}/pickup`, { method: 'POST', auth: courier1, body: { version: dv } }); check('cannot pick up before accepting', r.status === 409);
  r = await call(`/courier/deliveries/${order.id}/location`, { method: 'POST', auth: courier1, body: { lat: 41.31, lng: 69.27 } }); check('no location sharing before acceptance', r.status === 409);
  r = await call(`/courier/deliveries/${order.id}/accept`, { method: 'POST', auth: courier1, body: { version: dv - 1 } }); check('stale courier action refused', r.status === 409 && r.data.error?.code === 'STALE');
  r = await call(`/courier/deliveries/${order.id}/accept`, { method: 'POST', auth: courier1, body: { version: dv } }); check('courier accepts', r.status === 200); dv++;
  r = await call(`/orders/${order.id}`, { auth: customer }); check('customer sees COURIER_ACCEPTED with courier first name', r.data.order.stage === 'courier_accepted' && r.data.order.delivery?.courier?.name === 'Bekzod');
  r = await call(`/courier/deliveries/${order.id}/location`, { method: 'POST', auth: courier1, body: { lat: 41.3111, lng: 69.2797, accuracy: 12 } }); check('courier publishes location during active delivery', r.status === 200);
  r = await call(`/orders/${order.id}/tracking`, { auth: customer }); check('position hidden from customer before pickup', r.data.courier === null && r.data.destination?.lat === 41.3655);
  r = await call(`/courier/deliveries/${order.id}/pickup`, { method: 'POST', auth: courier1, body: { version: dv } }); check('courier picks up → order shipped', r.status === 200); dv++;
  r = await call(`/admin/orders/${order.id}`, { auth: manager }); check('order status moved confirmed→preparing→shipped', r.data.order.status === 'shipped');
  r = await call(`/admin/orders/${order.id}/assign`, { method: 'POST', auth: manager, body: { courierId: courier2Id } }); check('reassignment blocked after pickup', r.status === 409 && r.data.error?.code === 'ALREADY_PICKED_UP');
  r = await call(`/courier/deliveries/${order.id}/depart`, { method: 'POST', auth: courier1, body: { version: dv } }); dv++; check('courier starts the trip', r.status === 200);
  r = await call(`/courier/deliveries/${order.id}/location`, { method: 'POST', auth: courier1, body: { lat: 41.34, lng: 69.28, accuracy: 9 } });
  r = await call(`/orders/${order.id}/tracking`, { auth: customer }); check('customer sees live courier position + freshness', r.data.stage === 'on_the_way' && r.data.courier?.lat === 41.34 && r.data.courier.live === true && typeof r.data.courier.ageSeconds === 'number');
  r = await call(`/orders/${guest.id}/tracking`, { headers: {}, auth: 'Order ' + order.accessToken }); check('an order token only opens its own order', r.status === 404);
  r = await call(`/courier/deliveries/${order.id}/route`, { auth: courier1 }); check('route without Google Routes key → 503 with navigation fallback message', r.status === 503 && r.data.error?.code === 'ROUTES_NOT_CONFIGURED');
  r = await call(`/courier/deliveries/${order.id}/handover`, { method: 'POST', auth: courier1, body: { version: dv } }); check('cannot hand over before arriving', r.status === 409);
  r = await call(`/courier/deliveries/${order.id}/arrive`, { method: 'POST', auth: courier1, body: { version: dv } }); dv++; check('courier arrives', r.status === 200);
  r = await call(`/orders/${order.id}/reviews`, { method: 'POST', auth: customer, body: { products: [{ productId, rating: 5 }] } }); check('no review before delivery confirmation', r.status === 409 && r.data.error?.code === 'NOT_DELIVERED');
  r = await call(`/orders/${order.id}/confirm-delivery`, { method: 'POST', auth: customer }); check('customer cannot confirm before handover', r.status === 409);
  r = await call(`/courier/deliveries/${order.id}/handover`, { method: 'POST', auth: courier1, body: { version: dv } }); dv++; check('courier records handover', r.status === 200);
  r = await call(`/orders/${order.id}`, { auth: customer }); check('customer sees DELIVERED_PENDING_CONFIRMATION + can confirm', r.data.order.stage === 'delivered_pending_confirmation' && r.data.order.canConfirm === true && r.data.order.canReview === false);
  r = await call(`/admin/orders/${order.id}/status`, { method: 'PATCH', auth: manager, body: { status: 'delivered' } }); check('admin cannot skip customer confirmation via status button', r.status === 409);
  r = await call(`/orders/${order.id}/tracking`, { auth: customer }); check('no live position after handover', r.data.courier === null);
  r = await call(`/orders/${order.id}/confirm-delivery`, { method: 'POST', auth: tgCustomer }); check('another customer cannot confirm', r.status === 404);
  r = await call(`/orders/${order.id}/confirm-delivery`, { method: 'POST', auth: customer }); check('customer confirms receipt → DELIVERED', r.status === 200 && r.data.stage === 'delivered');
  r = await call(`/orders/${order.id}/confirm-delivery`, { method: 'POST', auth: customer }); check('duplicate confirmation refused', r.status === 409);
  r = await call(`/courier/deliveries/${order.id}/location`, { method: 'POST', auth: courier1, body: { lat: 41.34, lng: 69.28 } }); check('tracking stops after completion', r.status === 409);
  r = await call(`/courier/deliveries/${order.id}`, { auth: courier1 }); check('courier history hides phone and address after completion', r.data.order.phone === null && r.data.order.address === null);

  // ---------- Reviews ----------
  r = await call(`/orders/${order.id}/reviews`, { method: 'POST', auth: customer, body: { products: [{ productId: 999999, rating: 5 }] } }); check('review of a product not in the order refused', r.status === 403);
  r = await call(`/orders/${order.id}/reviews`, { method: 'POST', auth: customer, body: { products: [{ productId, rating: 5, body: 'Juda yoqdi' }, { productId: product2, rating: 4 }], courier: { rating: 5, body: 'Tez yetkazdi' } } }); check('verified product reviews + courier rating saved', r.status === 201 && r.data.saved === 3);
  r = await call(`/orders/${order.id}/reviews`, { method: 'POST', auth: customer, body: { products: [{ productId, rating: 1 }] } }); check('duplicate review refused', r.status === 409);
  r = await call(`/orders/${order.id}/reviews`, { method: 'POST', auth: 'Order ' + guest.accessToken, body: { products: [{ productId, rating: 1 }] } }); check('reviews of an undelivered guest order refused', r.status === 409 || r.status === 404);
  r = await call(`/products/soat-${stamp}/reviews`); check('public product reviews with average', r.data.count === 1 && r.data.average === 5 && r.data.reviews[0].authorName === 'Ali');
  r = await call('/admin/reviews', { auth: manager }); const reviewId = r.data.reviews?.[0]?.id; check('admin lists reviews and courier ratings', r.data.reviews?.length >= 2 && r.data.courierRatings?.length === 1);
  r = await call(`/admin/reviews/${reviewId}`, { method: 'PATCH', auth: manager, body: { status: 'hidden' } }); check('admin can hide a review (moderation)', r.status === 200);
  r = await call('/admin/couriers', { auth: manager }); check('courier list shows rating', r.data.couriers?.find(x => x.id === courier1Id)?.rating === 5);

  // ---------- Dispute → audited resolution ----------
  r = await call('/orders', { method: 'POST', auth: customer, body: { ...checkout, items: [{ productId, quantity: 1 }] } }); const o2 = r.data.order;
  await call(`/admin/orders/${o2.id}/status`, { method: 'PATCH', auth: manager, body: { status: 'confirmed' } });
  await call(`/admin/orders/${o2.id}/assign`, { method: 'POST', auth: manager, body: { courierId: courier1Id } });
  let v = 1; for (const a of ['accept', 'pickup', 'depart', 'arrive', 'handover']) { r = await call(`/courier/deliveries/${o2.id}/${a}`, { method: 'POST', auth: courier1, body: { version: v } }); v++; }
  r = await call(`/orders/${o2.id}/dispute`, { method: 'POST', auth: customer, body: { reason: 'Buyurtmani olmadim' } }); check('customer disputes the handover', r.status === 200);
  r = await call(`/admin/orders/${o2.id}/resolve`, { method: 'POST', auth: manager, body: { outcome: 'delivered', reason: 'x' } }); check('resolution requires a written reason', r.status === 400);
  r = await call(`/admin/orders/${o2.id}/resolve`, { method: 'POST', auth: manager, body: { outcome: 'delivered', reason: 'Mijoz bilan telefonda gaplashildi, olgan' } }); check('admin resolves dispute (audited)', r.status === 200);
  r = await call(`/orders/${o2.id}`, { auth: customer }); check('resolved order is delivered and reviewable', r.data.order.stage === 'delivered' && r.data.order.canReview);

  // ---------- Decline + cancel paths ----------
  r = await call('/orders', { method: 'POST', body: { ...checkout, items: [{ productId, quantity: 1 }] } }); const o3 = r.data.order;
  await call(`/admin/orders/${o3.id}/status`, { method: 'PATCH', auth: manager, body: { status: 'confirmed' } });
  await call(`/admin/orders/${o3.id}/assign`, { method: 'POST', auth: manager, body: { courierId: courier2Id } });
  r = await call(`/courier/deliveries/${o3.id}/decline`, { method: 'POST', auth: courier2, body: { version: 1 } }); check('decline needs a reason', r.status === 400);
  r = await call(`/courier/deliveries/${o3.id}/decline`, { method: 'POST', auth: courier2, body: { version: 1, reason: 'Mashina buzildi' } }); check('courier declines with reason', r.status === 200);
  r = await call('/admin/notifications', { auth: manager }); check('staff notified about the decline', r.data.notifications?.some(n => n.kind === 'courier_declined' && n.orderId === o3.id));
  await call(`/admin/orders/${o3.id}/assign`, { method: 'POST', auth: manager, body: { courierId: courier1Id } });
  r = await call(`/admin/orders/${o3.id}/status`, { method: 'PATCH', auth: manager, body: { status: 'cancelled' } }); check('admin cancels before pickup', r.status === 200);
  r = await call('/admin/notifications', { auth: courier1 }); check('courier told about the cancellation', r.data.notifications?.some(n => n.kind === 'cancelled' && n.orderId === o3.id));
  r = await call(`/courier/deliveries/${o3.id}/accept`, { method: 'POST', auth: courier1, body: { version: 4 } }); check('cancelled delivery cannot be accepted', r.status === 409);

  // ---------- Reports, staff management, integrations, audit ----------
  r = await call('/admin/reports/summary', { auth: manager }); check('reports include delivered orders', r.data.orders.delivered_total >= 390000);
  r = await call(`/admin/users/${courier2Id}`, { method: 'PATCH', auth: owner, body: { active: false } }); check('owner deactivates a courier', r.status === 200);
  r = await call('/admin/me', { auth: courier2 }); check('deactivated courier session revoked', r.status === 401);
  r = await call('/admin/login', { method: 'POST', body: { email: `courier2-${stamp}@example.com`, password: 'StaffPassword-123' } }); check('deactivated courier cannot log in', r.status === 401);
  r = await call('/admin/users/1', { method: 'PATCH', auth: owner, body: { active: false } }); check('owner cannot lock themselves out', r.status === 409);
  r = await call(`/admin/users/${courier1Id}/password`, { method: 'POST', auth: owner, body: { password: 'ResetCourier-789' } }); check('owner resets a staff password', r.status === 200);
  r = await call('/admin/me', { auth: courier1 }); check('password reset revokes that staff member\'s sessions', r.status === 401);
  r = await call('/admin/password', { method: 'POST', auth: manager, body: { currentPassword: 'wrong-password', password: 'ManagerNew-123' } }); check('self password change requires current password', r.status === 401);
  r = await call('/admin/password', { method: 'POST', auth: manager, body: { currentPassword: 'StaffPassword-123', password: 'ManagerNew-123' } }); check('self password change', r.status === 200);
  r = await call('/admin/integrations', { auth: owner });
  const body = JSON.stringify(r.data);
  check('integrations list: status only, never secret values', r.status === 200 && r.data.integrations.length === 8 && !body.includes('AAH-local-qa-token') && r.data.integrations.find(i => i.key === 'telegram').secrets[0].present === true);
  r = await call('/admin/integrations/google_maps', { method: 'PUT', auth: owner, body: { google_maps_key: 'not-a-key' } }); check('invalid Maps key format rejected', r.status === 400);
  r = await call('/admin/integrations/google_maps', { method: 'PUT', auth: owner, body: { secret_field: 'x' } }); check('unknown integration fields rejected', r.status === 400);
  r = await call('/admin/integrations/store_location', { method: 'PUT', auth: owner, body: { store_address: 'Toshkent, Chorsu', store_lat: '41.3264', store_lng: '69.2286' } }); check('store pickup location saved', r.status === 200);
  r = await call('/admin/audit', { auth: owner }); check('audit log records privileged actions', ['courier.assign', 'delivery.resolve', 'staff.update', 'integration.update', 'review.hidden'].every(a => r.data.entries.some(e => e.action === a)));
  r = await call('/admin/audit', { auth: manager }); check('audit log is owner-only', r.status === 403);
  r = await call('/settings'); check('public settings never contain secrets', !JSON.stringify(r.data).includes('AAH-local-qa-token'));
} catch (error) {
  check('script completed', false, String(error?.stack || error));
}
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
