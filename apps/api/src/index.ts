import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { z, ZodError } from 'zod';
import { DUMMY_PASSWORD_HASH, passwordHash, randomToken, safeEqual, verifyPassword } from './password';
import { adminLoginSchema, categorySchema, checkoutSchema, paymentSchema, productSchema, statusSchema, money } from '@fayz/shared';
import { audit, clientIp, limitOr429, coordinates, fail, idFrom, orderEvent, parse, settingsMap, sha256, storeLocation, type Env } from './lib';
import { customerSession, registerCustomers } from './customers';
import { adminOrderExtras, authorizedOrder, customerOrderView, getDelivery, registerDelivery } from './delivery';
import { notify, pushCustomer } from './push';
import { registerStaff } from './staff';
import { PAYMENT_METHODS, adminPaymentView, checkoutOptions, deliveryFeeFor, registerPayments, settleFromLedger } from './payments';
import { withManagedSecrets } from './secrets';
import { registerStorefront } from './storefront';

const app = new Hono<Env>();
app.use('*', (c, next) => bodyLimit({ maxSize: c.req.path === '/admin/images' ? 5_000_000 : c.req.path === '/admin/branding/logo' ? 1_100_000 : 65_536, onError: c => c.json({ error: { code: 'BODY_TOO_LARGE', message: 'Soʻrov hajmi juda katta' } }, 413) })(c, next));
const ctxOf = (c: { executionCtx: unknown }) => { try { return c.executionCtx as { waitUntil(p: Promise<unknown>): void }; } catch { return undefined; } };
const pageFrom = (raw: string | undefined) => Math.min(1000, Math.max(1, Number(raw) || 1));
const limitFrom = (raw: string | undefined) => Math.min(50, Math.max(1, Number(raw) || 20));
const rowProduct = (row: Record<string, unknown>) => ({
  id: row.id, name: row.name, slug: row.slug, description: row.description, categoryId: row.category_id,
  categoryName: row.category_name, price: row.price, stock: row.stock, active: Boolean(row.active),
  featured: Boolean(row.featured), createdAt: row.created_at,
  images: JSON.parse(String(row.images || '[]')) as string[]
});
const productSelect = `SELECT p.*, c.name AS category_name, (SELECT json_group_array(url) FROM (SELECT url FROM product_images WHERE product_id=p.id ORDER BY position)) AS images FROM products p JOIN categories c ON c.id=p.category_id`;

app.use('*', async (c, next) => {
  const origin = c.req.header('Origin');
  if (origin && origin === c.env.APP_ORIGIN) {
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Vary', 'Origin');
    c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Bootstrap-Secret');
    c.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  }
  if (c.req.method === 'OPTIONS') return c.body(null, origin === c.env.APP_ORIGIN ? 204 : 403);
  await next();
});
// Credentials an owner entered in Admin → Integratsiyalar (encrypted in D1) override same-named Cloudflare secrets.
app.use('*', withManagedSecrets);

app.onError((error, c) => {
  if (error instanceof ZodError) return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Kiritilgan maʼlumot notoʻgʻri', details: error.flatten() } }, 400);
  if (error instanceof HTTPException) {
    let details: { code: string; message: string };
    try { details = JSON.parse(error.message); } catch { details = { code: 'HTTP_ERROR', message: error.message }; }
    return c.json({ error: details }, error.status);
  }
  console.error(JSON.stringify({ event: 'api_error', path: c.req.path, error: String(error) }));
  if (String(error).includes('UNIQUE constraint failed')) return c.json({ error: { code: 'CONFLICT', message: 'Bu qiymat allaqachon mavjud' } }, 409);
  if (String(error).includes('OUT_OF_STOCK')) return c.json({ error: { code: 'OUT_OF_STOCK', message: 'Mahsulot qoldigʻi yetarli emas' } }, 409);
  if (String(error).includes('PRICE_CHANGED')) return c.json({ error: { code: 'PRICE_CHANGED', message: 'Narx oʻzgardi, qayta urinib koʻring' } }, 409);
  if (String(error).includes('INVALID_TRANSITION')) return c.json({ error: { code: 'INVALID_TRANSITION', message: 'Buyurtma holati oʻzgardi' } }, 409);
  if (String(error).includes('STOCK_CONFLICT')) return c.json({ error: { code: 'STOCK_CONFLICT', message: 'Qoldiq yetarli emas' } }, 409);
  if (String(error).includes('OVERPAYMENT')) return c.json({ error: { code: 'OVERPAYMENT', message: 'Toʻlov buyurtma summasidan oshadi' } }, 409);
  if (String(error).includes('CANCELLED_ORDER')) return c.json({ error: { code: 'CANCELLED_ORDER', message: 'Bekor qilingan buyurtmaga toʻlov yozilmaydi' } }, 409);
  if (String(error).includes('PAID_ORDER')) return c.json({ error: { code: 'PAID_ORDER', message: 'Toʻlov qayd etilgan buyurtmani bekor qilib boʻlmaydi' } }, 409);
  if (String(error).includes('ALREADY_PAID')) return c.json({ error: { code: 'ALREADY_PAID', message: 'Buyurtma allaqachon toʻlangan' } }, 409);
  if (String(error).includes('DUPLICATE_PAYMENT')) return c.json({ error: { code: 'DUPLICATE_PAYMENT', message: 'Bu tranzaksiya raqami allaqachon qayd etilgan' } }, 409);
  if (String(error).includes('INVALID_PAYMENT_TRANSITION')) return c.json({ error: { code: 'INVALID_PAYMENT_TRANSITION', message: 'Toʻlov holatini bunday oʻzgartirib boʻlmaydi' } }, 409);
  if (String(error).includes('PAYMENT_NOT_RECEIVED')) return c.json({ error: { code: 'PAYMENT_NOT_RECEIVED', message: 'Toʻlov summasi toʻliq qabul qilinmagan' } }, 409);
  return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Server xatosi' } }, 500);
});

app.use('/orders', customerSession);
app.use('/orders/*', customerSession);
app.get('/health', c => c.json({ ok: true, service: 'Fayz Market API' }));
app.get('/settings', async c => {
  const rows = await c.env.DB.prepare('SELECT key,value FROM settings').all<{ key: string; value: string }>();
  return c.json({ settings: Object.fromEntries(rows.results.map(row => [row.key, row.value])) });
});
app.get('/categories', async c => {
  const rows = await c.env.DB.prepare('SELECT id,name,slug FROM categories ORDER BY name').all();
  return c.json({ categories: rows.results });
});
app.get('/products', async c => {
  const page = pageFrom(c.req.query('page')), limit = limitFrom(c.req.query('limit'));
  const search = (c.req.query('q') || '').trim().slice(0, 100);
  const category = c.req.query('category');
  const featured = c.req.query('featured');
  const sort = c.req.query('sort') || 'newest';
  const order = ({ newest: 'p.created_at DESC,p.id DESC', price_asc: 'p.price ASC,p.id DESC', price_desc: 'p.price DESC,p.id DESC', name: 'p.name ASC,p.id DESC' } as Record<string, string>)[sort];
  if (!order) fail(400, 'INVALID_SORT', 'Saralash notoʻgʻri');
  const where = [`p.active=1`]; const values: (string | number)[] = [];
  if (search) { where.push('(p.name LIKE ? OR p.description LIKE ?)'); values.push(`%${search}%`, `%${search}%`); }
  if (category) { where.push('c.slug=?'); values.push(category); }
  if (featured === '1') where.push('p.featured=1');
  const sqlWhere = where.join(' AND ');
  const count = await c.env.DB.prepare(`SELECT COUNT(*) AS total FROM products p JOIN categories c ON c.id=p.category_id WHERE ${sqlWhere}`).bind(...values).first<{ total: number }>();
  const rows = await c.env.DB.prepare(`${productSelect} WHERE ${sqlWhere} ORDER BY ${order} LIMIT ? OFFSET ?`).bind(...values, limit, (page - 1) * limit).all();
  return c.json({ products: rows.results.map(rowProduct), page, limit, total: count?.total || 0 });
});
app.get('/products/:slug', async c => {
  const row = await c.env.DB.prepare(`${productSelect} WHERE p.slug=? AND p.active=1`).bind(c.req.param('slug')).first();
  if (!row) fail(404, 'NOT_FOUND', 'Mahsulot topilmadi');
  return c.json({ product: rowProduct(row!) });
});
app.get('/p/:slug', async c => {
  const row = await c.env.DB.prepare(`${productSelect} WHERE p.slug=? AND p.active=1`).bind(c.req.param('slug')).first();
  if (!row) fail(404, 'NOT_FOUND', 'Mahsulot topilmadi');
  const product = rowProduct(row!);
  const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] || char);
  const title = escape(product.name), description = escape(String(product.description).slice(0, 160));
  const url = `${c.env.PUBLIC_BASE_URL}/p/${product.slug}`;
  return c.html(`<!doctype html><html lang="uz"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} — Fayz Market</title><meta name="description" content="${description}"><meta property="og:title" content="${title} — Fayz Market"><meta property="og:description" content="${description}"><meta property="og:type" content="product"><meta property="og:url" content="${escape(url)}">${product.images[0] ? `<meta property="og:image" content="${escape(product.images[0])}">` : ''}</head><body style="font-family:system-ui;max-width:600px;margin:40px auto;padding:16px"><h1>${title}</h1>${product.images[0] ? `<img src="${escape(product.images[0])}" alt="${title}" style="max-width:100%;border-radius:16px">` : ''}<p>${description}</p><strong>${escape(product.price)} soʻm</strong><p><a href="fayzmarket://p/${escape(product.slug)}">Fayz Market ilovasida ochish</a></p></body></html>`);
});
app.get('/images/:key', async c => {
  const key = c.req.param('key');
  if (!/^[a-f0-9]{32}\.(jpg|png|webp)$/.test(key)) fail(400, 'INVALID_IMAGE', 'Rasm nomi notoʻgʻri');
  const image = await c.env.IMAGES.get(key);
  if (!image) fail(404, 'NOT_FOUND', 'Rasm topilmadi');
  return new Response(image!.body, { headers: { 'Content-Type': image!.httpMetadata?.contentType || 'image/jpeg', 'Cache-Control': 'public,max-age=86400' } });
});

app.post('/orders', async c => {
  // `fulfillment` and `paymentMethod` are optional so the 1.1.x apps keep working (delivery + cash, as before).
  const input = await parse(c, checkoutSchema.extend({
    address: z.string().trim().max(500).default(''),
    location: coordinates.optional(), deliveryDetails: z.string().trim().max(300).default(''),
    fulfillment: z.enum(['delivery', 'pickup']).default('delivery'), paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  }));
  const s = await settingsMap(c.env.DB), store = await storeLocation(c.env.DB), options = checkoutOptions(c.env, s, store);
  if (input.fulfillment === 'delivery' && input.address.length < 5) fail(400, 'VALIDATION_ERROR', 'Yetkazib berish manzilini toʻliq kiriting');
  if (!(options.fulfillment as readonly string[]).includes(input.fulfillment)) fail(409, 'FULFILLMENT_UNAVAILABLE', 'Doʻkondan olib ketish hozircha mavjud emas');
  const paymentMethod = input.paymentMethod ?? 'cash';
  if (input.paymentMethod && !options.payments.some(p => p.method === input.paymentMethod)) fail(409, 'PAYMENT_METHOD_UNAVAILABLE', 'Bu toʻlov usuli hozircha mavjud emas — boshqasini tanlang');
  const pickup = input.fulfillment === 'pickup';
  const address = pickup ? `Doʻkondan olib ketish: ${store.address}`.slice(0, 500) : input.address;
  const location = pickup ? undefined : input.location;
  const customer = c.get('customer');
  const merged = new Map<number, number>();
  for (const item of input.items) merged.set(item.productId, (merged.get(item.productId) || 0) + item.quantity);
  if ([...merged.values()].some(q => q > 99)) fail(400, 'INVALID_QUANTITY', 'Miqdor juda koʻp');
  const ids = [...merged.keys()];
  const rows = await c.env.DB.prepare(`SELECT id,name,price,stock,active FROM products WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all<{ id: number; name: string; price: number; stock: number; active: number }>();
  if (rows.results.length !== ids.length || rows.results.some(row => !row.active || row.stock < (merged.get(row.id) || 0))) fail(409, 'OUT_OF_STOCK', 'Mahsulot qoldigʻi yetarli emas');
  // The total is always computed here from current prices — a client-sent amount is never used.
  const itemsTotal = rows.results.reduce((sum, row) => sum + row.price * (merged.get(row.id) || 0), 0);
  // The courier fee is a separate line added on top of the goods (never taken from the client).
  const deliveryFee = deliveryFeeFor(s, itemsTotal, input.fulfillment);
  const total = itemsTotal + deliveryFee;
  const token = randomToken(), orderNumber = 'FM-' + Date.now().toString(36).toUpperCase() + '-' + randomToken().slice(0, 6).toUpperCase();
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO orders(order_number,access_hash,customer_name,phone,address,note,total,customer_id,delivery_lat,delivery_lng,delivery_details,fulfillment,payment_method,delivery_fee) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(orderNumber, await sha256(token), input.customerName, input.phone, address, input.note, total, customer?.id ?? null, location?.lat ?? null, location?.lng ?? null, pickup ? '' : input.deliveryDetails, input.fulfillment, paymentMethod, deliveryFee),
    ...rows.results.map(row => c.env.DB.prepare('INSERT INTO order_items(order_id,product_id,name,price,quantity) VALUES((SELECT id FROM orders WHERE order_number=?),?,?,?,?)').bind(orderNumber, row.id, row.name, row.price, merged.get(row.id)))
  ]);
  const order = await c.env.DB.prepare('SELECT id FROM orders WHERE order_number=?').bind(orderNumber).first<{ id: number }>();
  if (!order) fail(500, 'ORDER_FAILED', 'Buyurtma yaratilmadi');
  await orderEvent(c.env.DB, order!.id, 'customer', customer?.id ?? null, 'order_created', { location: !!location, fulfillment: input.fulfillment, payment: paymentMethod });
  // Lock-screen safe: order reference, item count and total only — no name, phone or address.
  const units = [...merged.values()].reduce((a, b) => a + b, 0);
  await notify(c.env, ctxOf(c), { audience: 'staff', orderId: order!.id, kind: 'new_order', title: `Yangi buyurtma ${orderNumber}`, body: `${units} dona · ${money(total)}${pickup ? ' · olib ketish' : ''}` });
  return c.json({ order: { id: order!.id, orderNumber, total, status: 'new', accessToken: token, fulfillment: input.fulfillment, paymentMethod, paymentStatus: 'pending', deliveryFee } }, 201);
});
app.get('/orders/:id', async c => {
  const row = await authorizedOrder(c, idFrom(c.req.param('id')));
  return c.json({ order: await customerOrderView(c.env.DB, row) });
});

async function requireAdmin(c: any, next: () => Promise<void>) {
  const token = c.req.header('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!token) fail(401, 'UNAUTHORIZED', 'Admin kirishi kerak');
  const row = await c.env.DB.prepare('SELECT a.id,a.role FROM sessions s JOIN admins a ON a.id=s.admin_id WHERE s.token_hash=? AND s.expires_at > CURRENT_TIMESTAMP AND a.active=1').bind(await sha256(token!)).first();
  if (!row) fail(401, 'UNAUTHORIZED', 'Sessiya tugagan');
  c.set('admin', row); await next();
}
/** Couriers share the admin app but may only reach their own account endpoints under /admin. */
const COURIER_ADMIN_PATHS = new Set(['/admin/me', '/admin/logout', '/admin/password', '/admin/notifications', '/admin/push-token']);
async function confineCourier(c: any, next: () => Promise<void>) {
  if (c.get('admin').role === 'courier' && !COURIER_ADMIN_PATHS.has(c.req.path)) fail(403, 'FORBIDDEN', 'Kuryer uchun ruxsat yoʻq');
  await next();
}
async function courierOnly(c: any, next: () => Promise<void>) {
  if (c.get('admin').role !== 'courier') fail(403, 'FORBIDDEN', 'Faqat kuryerlar uchun');
  await next();
}
const ownerOnly = (c: any) => { if (c.get('admin').role !== 'owner') fail(403, 'FORBIDDEN', 'Faqat egasi ruxsat etilgan'); };
app.post('/admin/bootstrap', async c => {
  if (!c.env.BOOTSTRAP_SECRET || !safeEqual(c.req.header('X-Bootstrap-Secret') || '', c.env.BOOTSTRAP_SECRET)) fail(403, 'FORBIDDEN', 'Ruxsat yoʻq');
  const existing = await c.env.DB.prepare('SELECT id FROM admins LIMIT 1').first();
  if (existing) fail(409, 'ALREADY_INITIALIZED', 'Admin mavjud');
  const input = await parse(c, adminLoginSchema);
  await c.env.DB.prepare('INSERT INTO admins(email,password_hash,role) VALUES(?,?,?)').bind(input.email.toLowerCase(), await passwordHash(input.password), 'owner').run();
  return c.json({ ok: true }, 201);
});
app.post('/admin/login', async c => {
  const input = await parse(c, adminLoginSchema);
  const normalizedEmail = input.email.toLowerCase();
  await limitOr429(c.env.DB, `admin-login-ip:${clientIp(c)}`, 30, 900);
  const attempt = await c.env.DB.prepare("SELECT attempts FROM login_attempts WHERE email=? AND first_attempt>datetime('now','-15 minutes')").bind(normalizedEmail).first<{ attempts: number }>();
  if ((attempt?.attempts || 0) >= 5) fail(429, 'TOO_MANY_ATTEMPTS', '15 daqiqadan keyin qayta urinib koʻring');
  const admin = await c.env.DB.prepare('SELECT id,email,password_hash,role,name FROM admins WHERE email=? AND active=1').bind(normalizedEmail).first<{ id: number; email: string; password_hash: string; role: string; name: string }>();
  // An unknown email still runs one key derivation so response time does not reveal which emails exist.
  const valid = await verifyPassword(input.password, admin?.password_hash || DUMMY_PASSWORD_HASH);
  if (!admin || !valid) {
    await c.env.DB.prepare("INSERT INTO login_attempts(email,attempts,first_attempt) VALUES(?,1,CURRENT_TIMESTAMP) ON CONFLICT(email) DO UPDATE SET attempts=CASE WHEN first_attempt<datetime('now','-15 minutes') THEN 1 ELSE attempts+1 END,first_attempt=CASE WHEN first_attempt<datetime('now','-15 minutes') THEN CURRENT_TIMESTAMP ELSE first_attempt END").bind(normalizedEmail).run();
    fail(401, 'INVALID_CREDENTIALS', 'Email yoki parol notoʻgʻri');
  }
  await c.env.DB.prepare('DELETE FROM login_attempts WHERE email=?').bind(normalizedEmail).run();
  const token = randomToken();
  await c.env.DB.prepare("INSERT INTO sessions(token_hash,admin_id,expires_at) VALUES(?,?,datetime('now','+7 days'))").bind(await sha256(token), admin!.id).run();
  return c.json({ token, admin: { id: admin!.id, email: admin!.email, role: admin!.role, name: admin!.name } });
});
app.use('/admin/*', requireAdmin);
app.use('/admin/*', confineCourier);
app.use('/courier/*', requireAdmin);
app.use('/courier/*', courierOnly);
app.post('/admin/logout', async c => { const token = c.req.header('Authorization')!.slice(7); await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha256(token)).run(); return c.json({ ok: true }); });
app.get('/admin/me', async c => {
  const me = await c.env.DB.prepare('SELECT id,email,role,name,phone FROM admins WHERE id=?').bind(c.get('admin').id).first();
  return c.json({ admin: me });
});
app.get('/admin/users', async c => { ownerOnly(c); const users = await c.env.DB.prepare('SELECT id,email,role,name,phone,active,created_at AS createdAt FROM admins ORDER BY active DESC,id').all(); return c.json({ users: users.results }); });
app.post('/admin/users', async c => {
  ownerOnly(c);
  const input = await parse(c, adminLoginSchema.extend({ role: z.enum(['manager', 'owner', 'courier']).default('manager'), name: z.string().trim().max(120).default(''), phone: z.string().trim().max(40).default('') }));
  if (input.role === 'courier' && (input.name.length < 2 || !/^\+998\d{9}$/.test(input.phone))) fail(400, 'COURIER_CONTACT', 'Kuryer uchun ism va +998 telefon raqami kerak');
  const row = await c.env.DB.prepare('INSERT INTO admins(email,password_hash,role,name,phone) VALUES(?,?,?,?,?) RETURNING id').bind(input.email.toLowerCase(), await passwordHash(input.password), input.role, input.name, input.phone).first<{ id: number }>();
  await audit(c.env.DB, c.get('admin').id, 'staff.create', `admin:${row?.id}`, { role: input.role });
  return c.json({ id: row?.id }, 201);
});
app.get('/admin/products', async c => {
  const page = pageFrom(c.req.query('page')), limit = limitFrom(c.req.query('limit'));
  const rows = await c.env.DB.prepare(`${productSelect} ORDER BY p.id DESC LIMIT ? OFFSET ?`).bind(limit, (page - 1) * limit).all();
  const count = await c.env.DB.prepare('SELECT COUNT(*) AS total FROM products').first<{ total: number }>();
  return c.json({ products: rows.results.map(rowProduct), page, total: count?.total || 0 });
});
app.post('/admin/products', async c => {
  const input = await parse(c, productSchema);
  const category = await c.env.DB.prepare('SELECT id FROM categories WHERE id=?').bind(input.categoryId).first();
  if (!category) fail(400, 'INVALID_CATEGORY', 'Kategoriya topilmadi');
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO products(name,slug,description,category_id,price,stock,active,featured) VALUES(?,?,?,?,?,?,?,?)').bind(input.name, input.slug, input.description, input.categoryId, input.price, input.stock, Number(input.active), Number(input.featured)),
    ...input.images.map((url, position) => c.env.DB.prepare('INSERT INTO product_images(product_id,url,position) VALUES((SELECT id FROM products WHERE slug=?),?,?)').bind(input.slug, url, position))
  ]);
  const row = await c.env.DB.prepare('SELECT id FROM products WHERE slug=?').bind(input.slug).first<{ id: number }>();
  if (!row) fail(500, 'CREATE_FAILED', 'Mahsulot yaratilmadi');
  return c.json({ id: row!.id }, 201);
});
app.put('/admin/products/:id', async c => {
  const id = idFrom(c.req.param('id')), input = await parse(c, productSchema);
  const exists = await c.env.DB.prepare('SELECT id FROM products WHERE id=?').bind(id).first();
  if (!exists) fail(404, 'NOT_FOUND', 'Mahsulot topilmadi');
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE products SET name=?,slug=?,description=?,category_id=?,price=?,active=?,featured=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(input.name, input.slug, input.description, input.categoryId, input.price, Number(input.active), Number(input.featured), id),
    c.env.DB.prepare('DELETE FROM product_images WHERE product_id=?').bind(id),
    ...input.images.map((url, position) => c.env.DB.prepare('INSERT INTO product_images(product_id,url,position) VALUES(?,?,?)').bind(id, url, position))
  ]);
  return c.json({ ok: true });
});
app.delete('/admin/products/:id', async c => { const id = idFrom(c.req.param('id')); const row = await c.env.DB.prepare('UPDATE products SET active=0,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(id).run(); if (!row.meta.changes) fail(404, 'NOT_FOUND', 'Mahsulot topilmadi'); return c.json({ ok: true }); });
app.post('/admin/categories', async c => { const input = await parse(c, categorySchema); const row = await c.env.DB.prepare('INSERT INTO categories(name,slug) VALUES(?,?) RETURNING id').bind(input.name, input.slug).first<{ id: number }>(); return c.json({ id: row?.id }, 201); });
app.put('/admin/categories/:id', async c => { const input = await parse(c, categorySchema); const row = await c.env.DB.prepare('UPDATE categories SET name=?,slug=? WHERE id=?').bind(input.name, input.slug, idFrom(c.req.param('id'))).run(); if (!row.meta.changes) fail(404, 'NOT_FOUND', 'Kategoriya topilmadi'); return c.json({ ok: true }); });
app.delete('/admin/categories/:id', async c => { ownerOnly(c); const row = await c.env.DB.prepare('DELETE FROM categories WHERE id=?').bind(idFrom(c.req.param('id'))).run(); if (!row.meta.changes) fail(404, 'NOT_FOUND', 'Kategoriya topilmadi'); return c.json({ ok: true }); });
app.post('/admin/products/:id/adjust-stock', async c => {
  const id = idFrom(c.req.param('id'));
  const input = await parse(c, z.object({ delta: z.number().int().refine(n => n !== 0), reason: z.string().trim().min(3).max(250) }));
  const product = await c.env.DB.prepare('SELECT id FROM products WHERE id=?').bind(id).first();
  if (!product) fail(404, 'NOT_FOUND', 'Mahsulot topilmadi');
  await c.env.DB.prepare('INSERT INTO inventory_adjustments(product_id,admin_id,delta,reason) VALUES(?,?,?,?)').bind(id, c.get('admin').id, input.delta, input.reason).run();
  return c.json({ ok: true });
});
app.post('/admin/images', async c => {
  const type = c.req.header('Content-Type') || '';
  const ext = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as Record<string, string>)[type];
  if (!ext) fail(415, 'INVALID_IMAGE_TYPE', 'JPEG, PNG yoki WebP kerak');
  const bytes = await c.req.arrayBuffer();
  if (bytes.byteLength < 10 || bytes.byteLength > 5_000_000) fail(413, 'INVALID_IMAGE_SIZE', 'Rasm 5 MB dan kichik boʻlishi kerak');
  const header = new Uint8Array(bytes.slice(0, 12));
  const valid = ext === 'jpg' ? header[0] === 0xff && header[1] === 0xd8 : ext === 'png' ? header.slice(0, 4).every((v, i) => v === [137, 80, 78, 71][i]) : String.fromCharCode(...header.slice(0, 4)) === 'RIFF' && String.fromCharCode(...header.slice(8, 12)) === 'WEBP';
  if (!valid) fail(415, 'INVALID_IMAGE', 'Rasm fayli notoʻgʻri');
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const key = `${Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, '0')).join('').slice(0, 32)}.${ext}`;
  await c.env.IMAGES.put(key, bytes, { httpMetadata: { contentType: type } });
  return c.json({ url: `${c.env.PUBLIC_BASE_URL}/images/${key}` }, 201);
});

function orderView(row: Record<string, unknown>, items: unknown[]) { return { id: row.id, orderNumber: row.order_number, customerName: row.customer_name, phone: row.phone, address: row.address, note: row.note, status: row.status, total: row.total, createdAt: row.created_at, items, location: row.delivery_lat != null ? { lat: row.delivery_lat, lng: row.delivery_lng, details: row.delivery_details } : null, deliveryStatus: row.delivery_status ?? null, courierName: row.courier_name ?? null, fulfillment: row.fulfillment ?? 'delivery', paymentMethod: row.payment_method ?? 'cash', paymentStatus: row.payment_status ?? 'pending', paidAt: row.paid_at ?? null, paymentNote: row.payment_note ?? '', deliveryFee: row.delivery_fee ?? 0 }; }
app.get('/admin/orders', async c => {
  const page = pageFrom(c.req.query('page')), limit = limitFrom(c.req.query('limit')), status = c.req.query('status'), payment = c.req.query('payment');
  if (status && !statusSchema.safeParse({ status }).success) fail(400, 'INVALID_STATUS', 'Holat notoʻgʻri');
  if (payment && !['pending', 'verifying', 'paid', 'failed', 'cancelled', 'refunded'].includes(payment)) fail(400, 'INVALID_STATUS', 'Toʻlov holati notoʻgʻri');
  const where: string[] = [], binds: string[] = [];
  if (status) { where.push('o.status=?'); binds.push(status); }
  if (payment) { where.push('o.payment_status=?'); binds.push(payment); }
  const sqlWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await c.env.DB.prepare(`SELECT o.*,d.status AS delivery_status,a.name AS courier_name FROM orders o LEFT JOIN deliveries d ON d.order_id=o.id LEFT JOIN admins a ON a.id=d.courier_id ${sqlWhere} ORDER BY o.id DESC LIMIT ? OFFSET ?`).bind(...binds, limit, (page - 1) * limit).all();
  const count = await c.env.DB.prepare(`SELECT COUNT(*) AS total FROM orders o ${sqlWhere}`).bind(...binds).first<{ total: number }>();
  return c.json({ orders: rows.results.map(row => orderView(row, [])), page, total: count?.total || 0 });
});
app.get('/admin/orders/:id', async c => { const id = idFrom(c.req.param('id')); const row = await c.env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(id).first(); if (!row) fail(404, 'NOT_FOUND', 'Buyurtma topilmadi'); const items = await c.env.DB.prepare('SELECT product_id AS productId,name,price,quantity FROM order_items WHERE order_id=?').bind(id).all(); const payments = await c.env.DB.prepare('SELECT p.id,p.amount,p.method,p.reference,p.note,p.created_at AS createdAt,a.name AS recordedByName,a.email AS recordedByEmail FROM payments p LEFT JOIN admins a ON a.id=p.recorded_by WHERE p.order_id=? ORDER BY p.id DESC').bind(id).all(); return c.json({ order: orderView(row!, items.results), payments: payments.results, ...(await adminPaymentView(c.env.DB, id)), ...(await adminOrderExtras(c.env.DB, id)) }); });
app.patch('/admin/orders/:id/status', async c => {
  const id = idFrom(c.req.param('id')), { status } = await parse(c, statusSchema);
  const row = await c.env.DB.prepare('SELECT status FROM orders WHERE id=?').bind(id).first<{ status: string }>();
  if (!row) fail(404, 'NOT_FOUND', 'Buyurtma topilmadi');
  const transitions: Record<string, string[]> = { new: ['confirmed', 'cancelled'], confirmed: ['preparing', 'cancelled'], preparing: ['shipped', 'cancelled'], shipped: ['delivered'], delivered: [], cancelled: [] };
  if (!transitions[row!.status]?.includes(status)) fail(409, 'INVALID_TRANSITION', 'Holat oʻtishi mumkin emas');
  const delivery = await getDelivery(c.env.DB, id);
  const courierBusy = delivery && !['declined', 'cancelled'].includes(delivery.status);
  // With a courier on the order, "shipped" is set by the courier's pickup and "delivered" needs the customer's
  // confirmation (or an audited admin resolution) — the plain status buttons cannot skip those steps.
  if (courierBusy && (status === 'shipped' || status === 'delivered')) fail(409, 'DELIVERY_IN_PROGRESS', 'Buyurtma kuryerda — holat kuryer va mijoz tasdigʻi orqali oʻzgaradi');
  const statements = [c.env.DB.prepare('UPDATE orders SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status=?').bind(status, id, row!.status)];
  if (status === 'cancelled') statements.push(
    c.env.DB.prepare("UPDATE orders SET payment_status='cancelled' WHERE id=? AND status='cancelled' AND payment_status IN ('pending','verifying','failed')").bind(id),
    c.env.DB.prepare("UPDATE deliveries SET status='cancelled',updated_at=CURRENT_TIMESTAMP,version=version+1 WHERE order_id=? AND status NOT IN ('declined','cancelled') AND EXISTS(SELECT 1 FROM orders WHERE id=? AND status='cancelled')").bind(id, id),
    c.env.DB.prepare("DELETE FROM delivery_locations WHERE order_id=? AND EXISTS(SELECT 1 FROM orders WHERE id=? AND status='cancelled')").bind(id, id),
  );
  const [updated] = await c.env.DB.batch(statements);
  if (!updated.meta.changes) fail(409, 'INVALID_TRANSITION', 'Buyurtma holati oʻzgardi');
  const admin = c.get('admin'), ctx = ctxOf(c);
  await orderEvent(c.env.DB, id, 'admin', admin.id, `status_${status}`);
  const order = (await c.env.DB.prepare('SELECT order_number,customer_id FROM orders WHERE id=?').bind(id).first<{ order_number: string; customer_id: number | null }>())!;
  if (status === 'cancelled' && delivery && !['declined', 'cancelled'].includes(delivery.status)) {
    await notify(c.env, ctx, { audience: 'courier', recipientId: delivery.courier_id, orderId: id, kind: 'cancelled', title: `${order.order_number} bekor qilindi`, body: 'Bu yetkazishni bajarish shart emas' });
  }
  const customerText: Record<string, string> = { confirmed: 'Buyurtmangiz tasdiqlandi', cancelled: 'Buyurtmangiz bekor qilindi', delivered: 'Buyurtmangiz yetkazildi' };
  if (customerText[status]) await pushCustomer(c.env, ctx, order.customer_id, { orderId: id, kind: `order_${status}`, title: customerText[status], body: order.order_number });
  return c.json({ ok: true });
});
app.post('/admin/orders/:id/payments', async c => {
  const id = idFrom(c.req.param('id')), input = await parse(c, paymentSchema), me = c.get('admin');
  const order = await c.env.DB.prepare('SELECT total,status,payment_status FROM orders WHERE id=?').bind(id).first<{ total: number; status: string; payment_status: string }>();
  if (!order) fail(404, 'NOT_FOUND', 'Buyurtma topilmadi');
  if (order!.status === 'cancelled') fail(409, 'CANCELLED_ORDER', 'Bekor qilingan buyurtmaga toʻlov yozilmaydi');
  if (['paid', 'refunded'].includes(order!.payment_status)) fail(409, 'ALREADY_PAID', 'Buyurtma allaqachon toʻlangan');
  const paid = await c.env.DB.prepare('SELECT COALESCE(SUM(amount),0) AS paid FROM payments WHERE order_id=?').bind(id).first<{ paid: number }>();
  if ((paid?.paid || 0) + input.amount > order!.total) fail(409, 'OVERPAYMENT', 'Toʻlov buyurtma summasidan oshadi');
  // Ledger row and (when the total is covered) the "paid" status are written in one transaction.
  const [row] = await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO payments(order_id,amount,method,reference,note,recorded_by) VALUES(?,?,?,?,?,?) RETURNING id').bind(id, input.amount, input.method, input.reference.trim(), input.note, me.id),
    settleFromLedger(c.env.DB, id),
  ]);
  await orderEvent(c.env.DB, id, 'admin', me.id, 'payment_recorded', { amount: input.amount, method: input.method });
  await audit(c.env.DB, me.id, 'payment.record', `order:${id}`, { amount: input.amount, method: input.method, reference: input.reference ? 'set' : '' });
  return c.json({ id: (row.results as { id: number }[])[0]?.id }, 201);
});
app.get('/admin/reports/summary', async c => {
  const orders = await c.env.DB.prepare("SELECT COUNT(*) AS orders,COALESCE(SUM(CASE WHEN status!='cancelled' THEN total ELSE 0 END),0) AS ordered_total,COALESCE(SUM(CASE WHEN status='delivered' THEN total ELSE 0 END),0) AS delivered_total FROM orders").first();
  // Money actually received: manual ledger + provider-performed transactions, minus orders marked refunded.
  const payments = await c.env.DB.prepare("SELECT (SELECT COALESCE(SUM(p.amount),0) FROM payments p JOIN orders o ON o.id=p.order_id WHERE o.payment_status!='refunded') + (SELECT COALESCE(SUM(amount),0) FROM payment_transactions WHERE state='performed') AS received_total, (SELECT COUNT(*) FROM orders WHERE payment_status='verifying') AS verifying").first();
  const inventory = await c.env.DB.prepare('SELECT COUNT(*) AS products,COALESCE(SUM(stock),0) AS units FROM products WHERE active=1').first();
  const daily = await c.env.DB.prepare("SELECT date(created_at) AS day,COUNT(*) AS orders,SUM(total) AS total FROM orders WHERE status!='cancelled' GROUP BY date(created_at) ORDER BY day DESC LIMIT 30").all();
  return c.json({ orders, payments, inventory, daily: daily.results });
});
app.put('/admin/settings', async c => { ownerOnly(c); const input = await parse(c, z.object({ contact_phone: z.string().max(40), delivery_info: z.string().max(500), banner_title: z.string().max(120), banner_subtitle: z.string().max(200) }).partial().strip()); await c.env.DB.batch(Object.entries(input).map(([key, value]) => c.env.DB.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key, value))); return c.json({ ok: true }); });

registerCustomers(app);
registerDelivery(app);
registerStaff(app);
registerStorefront(app);
registerPayments(app);

export default app;
