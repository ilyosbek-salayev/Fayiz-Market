import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z, ZodError } from 'zod';
import { adminLoginSchema, categorySchema, checkoutSchema, paymentSchema, productSchema, statusSchema } from '@fayz/shared';

type Bindings = { DB: D1Database; IMAGES: R2Bucket; APP_ORIGIN: string; PUBLIC_BASE_URL: string; BOOTSTRAP_SECRET: string };
type Variables = { admin: { id: number; role: 'owner' | 'manager' } };
const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const fail = (status: number, code: string, message: string): never => { throw new HTTPException(status as 400, { message: JSON.stringify({ code, message }) }); };
const parse = async <T extends z.ZodTypeAny>(c: { req: { json: () => Promise<unknown> } }, schema: T): Promise<z.infer<T>> => schema.parse(await c.req.json());
const sha256 = async (value: string): Promise<string> => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))).map(x => x.toString(16).padStart(2, '0')).join('');
const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32))).map(x => x.toString(16).padStart(2, '0')).join('');
const passwordHash = async (password: string, salt = randomToken()): Promise<string> => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 310000, hash: 'SHA-256' }, key, 256);
  return `${salt}:${Array.from(new Uint8Array(bits)).map(x => x.toString(16).padStart(2, '0')).join('')}`;
};
const safeEqual = (a: string, b: string) => { if (a.length !== b.length) return false; let result = 0; for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i); return result === 0; };
const idFrom = (raw: string): number => { const id = Number(raw); if (!Number.isSafeInteger(id) || id < 1) fail(400, 'INVALID_ID', 'ID notoʻgʻri'); return id; };
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
  return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Server xatosi' } }, 500);
});

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
  const input = await parse(c, checkoutSchema);
  const merged = new Map<number, number>();
  for (const item of input.items) merged.set(item.productId, (merged.get(item.productId) || 0) + item.quantity);
  if ([...merged.values()].some(q => q > 99)) fail(400, 'INVALID_QUANTITY', 'Miqdor juda koʻp');
  const ids = [...merged.keys()];
  const rows = await c.env.DB.prepare(`SELECT id,name,price,stock,active FROM products WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all<{ id: number; name: string; price: number; stock: number; active: number }>();
  if (rows.results.length !== ids.length || rows.results.some(row => !row.active || row.stock < (merged.get(row.id) || 0))) fail(409, 'OUT_OF_STOCK', 'Mahsulot qoldigʻi yetarli emas');
  const total = rows.results.reduce((sum, row) => sum + row.price * (merged.get(row.id) || 0), 0);
  const token = randomToken(), orderNumber = 'FM-' + Date.now().toString(36).toUpperCase() + '-' + randomToken().slice(0, 6).toUpperCase();
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO orders(order_number,access_hash,customer_name,phone,address,note,total) VALUES(?,?,?,?,?,?,?)').bind(orderNumber, await sha256(token), input.customerName, input.phone, input.address, input.note, total),
    ...rows.results.map(row => c.env.DB.prepare('INSERT INTO order_items(order_id,product_id,name,price,quantity) VALUES((SELECT id FROM orders WHERE order_number=?),?,?,?,?)').bind(orderNumber, row.id, row.name, row.price, merged.get(row.id)))
  ]);
  const order = await c.env.DB.prepare('SELECT id FROM orders WHERE order_number=?').bind(orderNumber).first<{ id: number }>();
  if (!order) fail(500, 'ORDER_FAILED', 'Buyurtma yaratilmadi');
  return c.json({ order: { id: order!.id, orderNumber, total, status: 'new', accessToken: token } }, 201);
});
app.get('/orders/:id', async c => {
  const id = idFrom(c.req.param('id'));
  const token = c.req.header('Authorization')?.match(/^Order ([a-f0-9]{64})$/)?.[1];
  if (!token) fail(401, 'UNAUTHORIZED', 'Buyurtma tokeni kerak');
  const row = await c.env.DB.prepare('SELECT * FROM orders WHERE id=? AND access_hash=?').bind(id, await sha256(token!)).first<Record<string, unknown>>();
  if (!row) fail(404, 'NOT_FOUND', 'Buyurtma topilmadi');
  const items = await c.env.DB.prepare('SELECT product_id AS productId,name,price,quantity FROM order_items WHERE order_id=?').bind(id).all();
  return c.json({ order: orderView(row!, items.results) });
});

async function requireAdmin(c: any, next: () => Promise<void>) {
  const token = c.req.header('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!token) fail(401, 'UNAUTHORIZED', 'Admin kirishi kerak');
  const row = await c.env.DB.prepare('SELECT a.id,a.role FROM sessions s JOIN admins a ON a.id=s.admin_id WHERE s.token_hash=? AND s.expires_at > CURRENT_TIMESTAMP').bind(await sha256(token!)).first();
  if (!row) fail(401, 'UNAUTHORIZED', 'Sessiya tugagan');
  c.set('admin', row); await next();
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
  const attempt = await c.env.DB.prepare("SELECT attempts FROM login_attempts WHERE email=? AND first_attempt>datetime('now','-15 minutes')").bind(normalizedEmail).first<{ attempts: number }>();
  if ((attempt?.attempts || 0) >= 5) fail(429, 'TOO_MANY_ATTEMPTS', '15 daqiqadan keyin qayta urinib koʻring');
  const admin = await c.env.DB.prepare('SELECT id,email,password_hash,role FROM admins WHERE email=?').bind(normalizedEmail).first<{ id: number; email: string; password_hash: string; role: string }>();
  const expected = admin?.password_hash || await passwordHash('invalid-password');
  const actual = await passwordHash(input.password, expected.split(':')[0]);
  if (!admin || !safeEqual(actual, expected)) {
    await c.env.DB.prepare("INSERT INTO login_attempts(email,attempts,first_attempt) VALUES(?,1,CURRENT_TIMESTAMP) ON CONFLICT(email) DO UPDATE SET attempts=CASE WHEN first_attempt<datetime('now','-15 minutes') THEN 1 ELSE attempts+1 END,first_attempt=CASE WHEN first_attempt<datetime('now','-15 minutes') THEN CURRENT_TIMESTAMP ELSE first_attempt END").bind(normalizedEmail).run();
    fail(401, 'INVALID_CREDENTIALS', 'Email yoki parol notoʻgʻri');
  }
  await c.env.DB.prepare('DELETE FROM login_attempts WHERE email=?').bind(normalizedEmail).run();
  const token = randomToken();
  await c.env.DB.prepare("INSERT INTO sessions(token_hash,admin_id,expires_at) VALUES(?,?,datetime('now','+7 days'))").bind(await sha256(token), admin!.id).run();
  return c.json({ token, admin: { id: admin!.id, email: admin!.email, role: admin!.role } });
});
app.use('/admin/*', requireAdmin);
app.post('/admin/logout', async c => { const token = c.req.header('Authorization')!.slice(7); await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha256(token)).run(); return c.json({ ok: true }); });
app.get('/admin/me', c => c.json({ admin: c.get('admin') }));
app.get('/admin/users', async c => { ownerOnly(c); const users = await c.env.DB.prepare('SELECT id,email,role,created_at AS createdAt FROM admins ORDER BY id').all(); return c.json({ users: users.results }); });
app.post('/admin/users', async c => { ownerOnly(c); const input = await parse(c, adminLoginSchema.extend({ role: z.enum(['manager', 'owner']).default('manager') })); const row = await c.env.DB.prepare('INSERT INTO admins(email,password_hash,role) VALUES(?,?,?) RETURNING id').bind(input.email.toLowerCase(), await passwordHash(input.password), input.role).first<{ id: number }>(); return c.json({ id: row?.id }, 201); });
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
  const key = `${randomToken().slice(0, 32)}.${ext}`;
  await c.env.IMAGES.put(key, bytes, { httpMetadata: { contentType: type } });
  return c.json({ url: `${c.env.PUBLIC_BASE_URL}/images/${key}` }, 201);
});

function orderView(row: Record<string, unknown>, items: unknown[]) { return { id: row.id, orderNumber: row.order_number, customerName: row.customer_name, phone: row.phone, address: row.address, note: row.note, status: row.status, total: row.total, createdAt: row.created_at, items }; }
app.get('/admin/orders', async c => {
  const page = pageFrom(c.req.query('page')), limit = limitFrom(c.req.query('limit')), status = c.req.query('status');
  if (status && !statusSchema.safeParse({ status }).success) fail(400, 'INVALID_STATUS', 'Holat notoʻgʻri');
  const where = status ? 'WHERE status=?' : '';
  const rows = await c.env.DB.prepare(`SELECT * FROM orders ${where} ORDER BY id DESC LIMIT ? OFFSET ?`).bind(...(status ? [status] : []), limit, (page - 1) * limit).all();
  const count = await c.env.DB.prepare(`SELECT COUNT(*) AS total FROM orders ${where}`).bind(...(status ? [status] : [])).first<{ total: number }>();
  return c.json({ orders: rows.results.map(row => orderView(row, [])), page, total: count?.total || 0 });
});
app.get('/admin/orders/:id', async c => { const id = idFrom(c.req.param('id')); const row = await c.env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(id).first(); if (!row) fail(404, 'NOT_FOUND', 'Buyurtma topilmadi'); const items = await c.env.DB.prepare('SELECT product_id AS productId,name,price,quantity FROM order_items WHERE order_id=?').bind(id).all(); const payments = await c.env.DB.prepare('SELECT id,amount,method,reference,note,created_at AS createdAt FROM payments WHERE order_id=? ORDER BY id DESC').bind(id).all(); return c.json({ order: orderView(row!, items.results), payments: payments.results }); });
app.patch('/admin/orders/:id/status', async c => {
  const id = idFrom(c.req.param('id')), { status } = await parse(c, statusSchema);
  const row = await c.env.DB.prepare('SELECT status FROM orders WHERE id=?').bind(id).first<{ status: string }>();
  if (!row) fail(404, 'NOT_FOUND', 'Buyurtma topilmadi');
  const transitions: Record<string, string[]> = { new: ['confirmed', 'cancelled'], confirmed: ['preparing', 'cancelled'], preparing: ['shipped', 'cancelled'], shipped: ['delivered'], delivered: [], cancelled: [] };
  if (!transitions[row!.status]?.includes(status)) fail(409, 'INVALID_TRANSITION', 'Holat oʻtishi mumkin emas');
  const updated = await c.env.DB.prepare('UPDATE orders SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status=?').bind(status, id, row!.status).run();
  if (!updated.meta.changes) fail(409, 'INVALID_TRANSITION', 'Buyurtma holati oʻzgardi');
  return c.json({ ok: true });
});
app.post('/admin/orders/:id/payments', async c => {
  const id = idFrom(c.req.param('id')), input = await parse(c, paymentSchema);
  const order = await c.env.DB.prepare('SELECT total,status FROM orders WHERE id=?').bind(id).first<{ total: number; status: string }>();
  if (!order) fail(404, 'NOT_FOUND', 'Buyurtma topilmadi');
  if (order!.status === 'cancelled') fail(409, 'CANCELLED_ORDER', 'Bekor qilingan buyurtmaga toʻlov yozilmaydi');
  const paid = await c.env.DB.prepare('SELECT COALESCE(SUM(amount),0) AS paid FROM payments WHERE order_id=?').bind(id).first<{ paid: number }>();
  if ((paid?.paid || 0) + input.amount > order!.total) fail(409, 'OVERPAYMENT', 'Toʻlov buyurtma summasidan oshadi');
  const row = await c.env.DB.prepare('INSERT INTO payments(order_id,amount,method,reference,note,recorded_by) VALUES(?,?,?,?,?,?) RETURNING id').bind(id, input.amount, input.method, input.reference, input.note, c.get('admin').id).first<{ id: number }>();
  return c.json({ id: row?.id }, 201);
});
app.get('/admin/reports/summary', async c => {
  const orders = await c.env.DB.prepare("SELECT COUNT(*) AS orders,COALESCE(SUM(CASE WHEN status!='cancelled' THEN total ELSE 0 END),0) AS ordered_total,COALESCE(SUM(CASE WHEN status='delivered' THEN total ELSE 0 END),0) AS delivered_total FROM orders").first();
  const payments = await c.env.DB.prepare('SELECT COALESCE(SUM(amount),0) AS received_total FROM payments').first();
  const inventory = await c.env.DB.prepare('SELECT COUNT(*) AS products,COALESCE(SUM(stock),0) AS units FROM products WHERE active=1').first();
  const daily = await c.env.DB.prepare("SELECT date(created_at) AS day,COUNT(*) AS orders,SUM(total) AS total FROM orders WHERE status!='cancelled' GROUP BY date(created_at) ORDER BY day DESC LIMIT 30").all();
  return c.json({ orders, payments, inventory, daily: daily.results });
});
app.put('/admin/settings', async c => { ownerOnly(c); const input = await parse(c, z.object({ contact_phone: z.string().max(40), delivery_info: z.string().max(500), banner_title: z.string().max(120), banner_subtitle: z.string().max(200) })); await c.env.DB.batch(Object.entries(input).map(([key, value]) => c.env.DB.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key, value))); return c.json({ ok: true }); });

export default app;
