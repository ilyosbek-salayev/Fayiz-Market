// Courier assignment, courier workflow, live tracking, customer delivery confirmation and verified reviews.
// Every permission is enforced here; the apps only show what the API allows.
import { z } from 'zod';
import { money } from '@fayz/shared';
import type { App, Bindings, Staff } from './lib';
import { audit, coordinates, fail, idFrom, limitOr429, orderEvent, parse, sha256 } from './lib';
import { ACTIVE, FINISHED, REASSIGNABLE, TRACKABLE, courierTransitions, nextDeliveryStatus, stageOf, stepsToShipped, type CourierAction, type DeliveryStatus } from './lifecycle';
import { notify, pushCustomer } from './push';

type OrderRow = { id: number; order_number: string; customer_name: string; phone: string; address: string; note: string; status: string; total: number; created_at: string; customer_id: number | null; delivery_lat: number | null; delivery_lng: number | null; delivery_details: string };
type DeliveryRow = { order_id: number; courier_id: number; status: DeliveryStatus; version: number; assigned_at: string; accepted_at: string | null; picked_up_at: string | null; arrived_at: string | null; handed_over_at: string | null; confirmed_at: string | null; updated_at: string; decline_reason: string; courier_name: string; courier_phone: string };
const ctxOf = (c: { executionCtx: unknown }) => { try { return c.executionCtx as { waitUntil(p: Promise<unknown>): void }; } catch { return undefined; } };
/** A location older than this is shown as "last known", never as live. */
export const LIVE_SECONDS = 120;

export const getDelivery = (db: D1Database, orderId: number) => db.prepare('SELECT d.*,a.name AS courier_name,a.phone AS courier_phone FROM deliveries d JOIN admins a ON a.id=d.courier_id WHERE d.order_id=?').bind(orderId).first<DeliveryRow>();
const items = (db: D1Database, orderId: number) => db.prepare('SELECT product_id AS productId,name,price,quantity FROM order_items WHERE order_id=?').bind(orderId).all<{ productId: number; name: string; price: number; quantity: number }>().then(r => r.results);
const storeLocation = async (db: D1Database) => {
  const rows = (await db.prepare("SELECT key,value FROM settings WHERE key IN ('store_lat','store_lng','store_address')").all<{ key: string; value: string }>()).results;
  const s = Object.fromEntries(rows.map(r => [r.key, r.value]));
  const lat = Number(s.store_lat), lng = Number(s.store_lng);
  return { address: s.store_address || '', lat: s.store_lat && Number.isFinite(lat) ? lat : null, lng: s.store_lng && Number.isFinite(lng) ? lng : null };
};
const firstName = (name: string) => name.trim().split(/\s+/)[0] || 'Kuryer';

/** Customer-facing order: original fields plus stage, location, delivery and review eligibility. */
export async function customerOrderView(db: D1Database, row: OrderRow) {
  const [lineItems, delivery, reviews, rating] = await Promise.all([
    items(db, row.id), getDelivery(db, row.id),
    db.prepare('SELECT product_id AS productId,rating FROM product_reviews WHERE order_id=?').bind(row.id).all<{ productId: number; rating: number }>().then(r => r.results),
    db.prepare('SELECT rating FROM courier_ratings WHERE order_id=?').bind(row.id).first<{ rating: number }>(),
  ]);
  const showCourier = delivery && ['accepted', 'picked_up', 'on_the_way', 'arrived', 'handed_over'].includes(delivery.status);
  const confirmed = row.status === 'delivered';
  return {
    id: row.id, orderNumber: row.order_number, customerName: row.customer_name, phone: row.phone, address: row.address, note: row.note,
    status: row.status, total: row.total, createdAt: row.created_at, items: lineItems,
    stage: stageOf(row.status, delivery?.status),
    location: row.delivery_lat != null && row.delivery_lng != null ? { lat: row.delivery_lat, lng: row.delivery_lng, details: row.delivery_details } : null,
    delivery: delivery ? {
      status: delivery.status, assignedAt: delivery.assigned_at, acceptedAt: delivery.accepted_at, pickedUpAt: delivery.picked_up_at, arrivedAt: delivery.arrived_at, handedOverAt: delivery.handed_over_at, confirmedAt: delivery.confirmed_at,
      courier: showCourier ? { name: firstName(delivery.courier_name), phone: delivery.courier_phone || null } : null,
    } : null,
    canConfirm: delivery?.status === 'handed_over' && row.status === 'shipped',
    canReview: confirmed,
    reviewed: { products: reviews.map(r => r.productId), courier: !!rating, courierRatable: confirmed && !!delivery },
  };
}

/** Resolves an order the caller may see: by its private access token or by the logged-in customer. */
export async function authorizedOrder(c: any, id: number): Promise<OrderRow> {
  const header = c.req.header('Authorization') || '';
  const token = header.match(/^Order ([a-f0-9]{64})$/)?.[1];
  const customer = c.get('customer') as { id: number } | undefined;
  let row: OrderRow | null = null;
  if (token) row = await c.env.DB.prepare('SELECT * FROM orders WHERE id=? AND access_hash=?').bind(id, await sha256(token)).first();
  else if (customer) row = await c.env.DB.prepare('SELECT * FROM orders WHERE id=? AND customer_id=?').bind(id, customer.id).first();
  else fail(401, 'UNAUTHORIZED', 'Buyurtma tokeni kerak');
  if (!row) fail(404, 'NOT_FOUND', 'Buyurtma topilmadi');
  return row!;
}

async function moveOrderToShipped(db: D1Database, order: OrderRow) {
  for (const step of stepsToShipped(order.status)) await db.prepare('UPDATE orders SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(step, order.id).run();
}

export function registerDelivery(app: App) {
  // ---------- Customer ----------
  app.get('/orders/:id/tracking', async c => {
    const order = await authorizedOrder(c, idFrom(c.req.param('id')));
    const delivery = await getDelivery(c.env.DB, order.id);
    const store = await storeLocation(c.env.DB);
    let courier: null | { lat: number; lng: number; accuracy: number | null; recordedAt: string; ageSeconds: number; live: boolean } = null;
    if (delivery && TRACKABLE.includes(delivery.status)) {
      const loc = await c.env.DB.prepare("SELECT lat,lng,accuracy,recorded_at,CAST(strftime('%s','now')-strftime('%s',recorded_at) AS INTEGER) AS age FROM delivery_locations WHERE order_id=?").bind(order.id).first<{ lat: number; lng: number; accuracy: number | null; recorded_at: string; age: number }>();
      if (loc) courier = { lat: loc.lat, lng: loc.lng, accuracy: loc.accuracy, recordedAt: loc.recorded_at, ageSeconds: loc.age, live: loc.age <= LIVE_SECONDS };
    }
    return c.json({ stage: stageOf(order.status, delivery?.status), destination: order.delivery_lat != null ? { lat: order.delivery_lat, lng: order.delivery_lng, details: order.delivery_details, address: order.address } : null, store: store.lat != null ? store : null, courier });
  });

  app.post('/orders/:id/confirm-delivery', async c => {
    const order = await authorizedOrder(c, idFrom(c.req.param('id')));
    const delivery = await getDelivery(c.env.DB, order.id);
    if (!delivery || delivery.status !== 'handed_over' || order.status !== 'shipped') fail(409, 'NOT_HANDED_OVER', 'Kuryer hali topshirishni qayd etmagan');
    const updated = await c.env.DB.prepare("UPDATE deliveries SET status='confirmed',confirmed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP,version=version+1 WHERE order_id=? AND status='handed_over'").bind(order.id).run();
    if (!updated.meta.changes) fail(409, 'ALREADY_CONFIRMED', 'Buyurtma allaqachon tasdiqlangan');
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE orders SET status='delivered',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='shipped'").bind(order.id),
      c.env.DB.prepare('DELETE FROM delivery_locations WHERE order_id=?').bind(order.id),
    ]);
    await orderEvent(c.env.DB, order.id, 'customer', order.customer_id, 'delivery_confirmed');
    await notify(c.env, ctxOf(c), { audience: 'staff', orderId: order.id, kind: 'delivery_confirmed', title: `${order.order_number} qabul qilindi`, body: 'Mijoz buyurtmani olganini tasdiqladi' });
    return c.json({ ok: true, stage: 'delivered' });
  });

  app.post('/orders/:id/dispute', async c => {
    const order = await authorizedOrder(c, idFrom(c.req.param('id')));
    const { reason } = await parse(c, z.object({ reason: z.string().trim().min(3).max(500) }));
    const updated = await c.env.DB.prepare("UPDATE deliveries SET status='disputed',updated_at=CURRENT_TIMESTAMP,version=version+1 WHERE order_id=? AND status='handed_over'").bind(order.id).run();
    if (!updated.meta.changes) fail(409, 'NOT_HANDED_OVER', 'Bu bosqichda eʼtiroz bildirib boʻlmaydi');
    await orderEvent(c.env.DB, order.id, 'customer', order.customer_id, 'delivery_disputed', reason);
    await notify(c.env, ctxOf(c), { audience: 'staff', orderId: order.id, kind: 'delivery_disputed', title: `${order.order_number}: mijoz eʼtirozi`, body: 'Mijoz buyurtmani olmaganini bildirdi — tekshiring' });
    return c.json({ ok: true, stage: 'disputed' });
  });

  app.post('/orders/:id/reviews', async c => {
    const order = await authorizedOrder(c, idFrom(c.req.param('id')));
    await limitOr429(c.env.DB, `review:${order.id}`, 10, 3600);
    if (order.status !== 'delivered') fail(409, 'NOT_DELIVERED', 'Sharh faqat buyurtma qabul qilingach yoziladi');
    const input = await parse(c, z.object({
      products: z.array(z.object({ productId: z.number().int().positive(), rating: z.number().int().min(1).max(5), body: z.string().trim().max(1000).default('') })).max(50).default([]),
      courier: z.object({ rating: z.number().int().min(1).max(5), body: z.string().trim().max(500).default('') }).optional(),
    }));
    const bought = new Set((await items(c.env.DB, order.id)).map(i => i.productId));
    if (input.products.some(p => !bought.has(p.productId))) fail(403, 'NOT_PURCHASED', 'Faqat shu buyurtmadagi mahsulotga sharh yoziladi');
    const author = firstName(order.customer_name);
    const statements = input.products.map(p => c.env.DB.prepare('INSERT INTO product_reviews(order_id,product_id,customer_id,author_name,rating,body) VALUES(?,?,?,?,?,?) ON CONFLICT(order_id,product_id) DO NOTHING').bind(order.id, p.productId, order.customer_id, author, p.rating, p.body));
    if (input.courier) {
      const delivery = await getDelivery(c.env.DB, order.id);
      if (!delivery) fail(409, 'NO_COURIER', 'Bu buyurtma kuryer orqali yetkazilmagan');
      statements.push(c.env.DB.prepare('INSERT INTO courier_ratings(order_id,courier_id,rating,body) VALUES(?,?,?,?) ON CONFLICT(order_id) DO NOTHING').bind(order.id, delivery!.courier_id, input.courier.rating, input.courier.body));
    }
    if (!statements.length) fail(400, 'EMPTY_REVIEW', 'Kamida bitta baho kiriting');
    const results = await c.env.DB.batch(statements);
    const saved = results.reduce((n, r) => n + (r.meta.changes || 0), 0);
    if (!saved) fail(409, 'ALREADY_REVIEWED', 'Bu buyurtma uchun sharh allaqachon yozilgan');
    await orderEvent(c.env.DB, order.id, 'customer', order.customer_id, 'reviewed', { products: input.products.length, courier: !!input.courier });
    return c.json({ ok: true, saved }, 201);
  });

  app.get('/products/:slug/reviews', async c => {
    const product = await c.env.DB.prepare('SELECT id FROM products WHERE slug=? AND active=1').bind(c.req.param('slug')).first<{ id: number }>();
    if (!product) fail(404, 'NOT_FOUND', 'Mahsulot topilmadi');
    const [summary, rows] = await Promise.all([
      c.env.DB.prepare("SELECT COUNT(*) AS count,ROUND(AVG(rating),1) AS average FROM product_reviews WHERE product_id=? AND status='published'").bind(product!.id).first<{ count: number; average: number | null }>(),
      c.env.DB.prepare("SELECT rating,body,author_name AS authorName,created_at AS createdAt FROM product_reviews WHERE product_id=? AND status='published' ORDER BY id DESC LIMIT 20").bind(product!.id).all(),
    ]);
    return c.json({ count: summary?.count || 0, average: summary?.average ?? null, reviews: rows.results });
  });

  // ---------- Administrator ----------
  app.get('/admin/couriers', async c => {
    const rows = await c.env.DB.prepare(`SELECT a.id,a.name,a.phone,a.active,
      (SELECT COUNT(*) FROM deliveries d WHERE d.courier_id=a.id AND d.status IN ('assigned','accepted','picked_up','on_the_way','arrived')) AS activeDeliveries,
      (SELECT ROUND(AVG(rating),1) FROM courier_ratings r WHERE r.courier_id=a.id) AS rating
      FROM admins a WHERE a.role='courier' ORDER BY a.active DESC,a.name`).all();
    return c.json({ couriers: rows.results });
  });

  app.post('/admin/orders/:id/assign', async c => {
    const id = idFrom(c.req.param('id')), admin = c.get('admin');
    const { courierId, version } = await parse(c, z.object({ courierId: z.number().int().positive(), version: z.number().int().optional() }));
    const order = await c.env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(id).first<OrderRow>();
    if (!order) fail(404, 'NOT_FOUND', 'Buyurtma topilmadi');
    const current = await getDelivery(c.env.DB, id);
    if (!REASSIGNABLE.includes(current?.status ?? null)) fail(409, 'ALREADY_PICKED_UP', 'Mahsulot kuryerga topshirilgan — qayta tayinlab boʻlmaydi');
    if (!['confirmed', 'preparing'].includes(order!.status)) fail(409, 'NOT_ASSIGNABLE', 'Kuryer faqat tasdiqlangan buyurtmaga tayinlanadi');
    const courier = await c.env.DB.prepare("SELECT id,name FROM admins WHERE id=? AND role='courier' AND active=1").bind(courierId).first<{ id: number; name: string }>();
    if (!courier) fail(400, 'INVALID_COURIER', 'Kuryer topilmadi yoki faol emas');
    if (current && version !== undefined && current.version !== version) fail(409, 'STALE', 'Buyurtma boshqa oynada oʻzgardi. Yangilab, qayta urinib koʻring');
    if (current?.courier_id === courierId && ['assigned', 'accepted'].includes(current.status)) fail(409, 'ALREADY_ASSIGNED', 'Bu kuryer allaqachon tayinlangan');
    if (current) {
      const res = await c.env.DB.prepare("UPDATE deliveries SET courier_id=?,status='assigned',assigned_by=?,assigned_at=CURRENT_TIMESTAMP,accepted_at=NULL,decline_reason='',updated_at=CURRENT_TIMESTAMP,version=version+1 WHERE order_id=? AND version=?").bind(courierId, admin.id, id, current.version).run();
      if (!res.meta.changes) fail(409, 'STALE', 'Buyurtma boshqa oynada oʻzgardi. Yangilab, qayta urinib koʻring');
      if (current.courier_id !== courierId && ['assigned', 'accepted'].includes(current.status)) await notify(c.env, ctxOf(c), { audience: 'courier', recipientId: current.courier_id, orderId: id, kind: 'unassigned', title: `${order!.order_number} boshqa kuryerga oʻtkazildi`, body: 'Bu yetkazish endi sizda emas' });
    } else {
      await c.env.DB.prepare("INSERT INTO deliveries(order_id,courier_id,status,assigned_by) VALUES(?,?,'assigned',?)").bind(id, courierId, admin.id).run();
    }
    await orderEvent(c.env.DB, id, 'admin', admin.id, current ? 'courier_reassigned' : 'courier_assigned', { courierId, previous: current?.courier_id ?? null });
    await audit(c.env.DB, admin.id, current ? 'courier.reassign' : 'courier.assign', `order:${id}`, { courierId });
    await notify(c.env, ctxOf(c), { audience: 'courier', recipientId: courierId, orderId: id, kind: 'assigned', title: `Yangi yetkazish: ${order!.order_number}`, body: `${money(order!.total)} — qabul qiling yoki rad eting` });
    return c.json({ ok: true });
  });

  /** Controlled resolution when the customer did not or could not confirm receipt. */
  app.post('/admin/orders/:id/resolve', async c => {
    const id = idFrom(c.req.param('id')), admin = c.get('admin');
    const { reason } = await parse(c, z.object({ outcome: z.literal('delivered'), reason: z.string().trim().min(5).max(500) }));
    const order = await c.env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(id).first<OrderRow>();
    if (!order) fail(404, 'NOT_FOUND', 'Buyurtma topilmadi');
    const res = await c.env.DB.prepare("UPDATE deliveries SET status='resolved',updated_at=CURRENT_TIMESTAMP,version=version+1 WHERE order_id=? AND status IN ('handed_over','disputed')").bind(id).run();
    if (!res.meta.changes) fail(409, 'NOT_RESOLVABLE', 'Faqat topshirilgan yoki eʼtiroz bildirilgan yetkazish hal qilinadi');
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE orders SET status='delivered',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='shipped'").bind(id),
      c.env.DB.prepare('DELETE FROM delivery_locations WHERE order_id=?').bind(id),
    ]);
    await orderEvent(c.env.DB, id, 'admin', admin.id, 'delivery_resolved', reason);
    await audit(c.env.DB, admin.id, 'delivery.resolve', `order:${id}`, { reason });
    return c.json({ ok: true });
  });

  // ---------- Courier ----------
  app.get('/courier/deliveries', async c => {
    const me = c.get('admin');
    const rows = await c.env.DB.prepare(`SELECT d.order_id AS id,d.status,d.version,d.assigned_at AS assignedAt,d.updated_at AS updatedAt,o.order_number AS orderNumber,o.total,o.status AS orderStatus,
      CASE WHEN d.status IN ('assigned','accepted','picked_up','on_the_way','arrived') THEN o.address ELSE '' END AS address,
      (SELECT COUNT(*) FROM order_items i WHERE i.order_id=o.id) AS itemCount
      FROM deliveries d JOIN orders o ON o.id=d.order_id WHERE d.courier_id=? ORDER BY CASE WHEN d.status IN ('assigned','accepted','picked_up','on_the_way','arrived') THEN 0 ELSE 1 END, d.updated_at DESC LIMIT 100`).bind(me.id).all();
    return c.json({ deliveries: rows.results });
  });

  app.get('/courier/deliveries/:id', async c => {
    const me = c.get('admin'), id = idFrom(c.req.param('id'));
    const delivery = await getDelivery(c.env.DB, id);
    if (!delivery || delivery.courier_id !== me.id) fail(404, 'NOT_FOUND', 'Yetkazish topilmadi');
    const order = (await c.env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(id).first<OrderRow>())!;
    const active = ACTIVE.includes(delivery!.status) || delivery!.status === 'handed_over';
    return c.json({
      delivery: { id, status: delivery!.status, version: delivery!.version, assignedAt: delivery!.assigned_at, acceptedAt: delivery!.accepted_at, pickedUpAt: delivery!.picked_up_at, arrivedAt: delivery!.arrived_at, handedOverAt: delivery!.handed_over_at, confirmedAt: delivery!.confirmed_at },
      order: {
        orderNumber: order.order_number, total: order.total, status: order.status, createdAt: order.created_at, items: await items(c.env.DB, id),
        // Contact and exact destination are only visible while this courier is working on the delivery.
        customerName: active ? order.customer_name : firstName(order.customer_name), phone: active ? order.phone : null,
        address: active ? order.address : null, details: active ? order.delivery_details : null, note: active ? order.note : null,
        location: active && order.delivery_lat != null ? { lat: order.delivery_lat, lng: order.delivery_lng } : null,
      },
      pickup: await storeLocation(c.env.DB),
      stage: stageOf(order.status, delivery!.status),
    });
  });

  app.post('/courier/deliveries/:id/location', async c => {
    const me = c.get('admin'), id = idFrom(c.req.param('id'));
    const point = await parse(c, coordinates);
    await limitOr429(c.env.DB, `loc:${me.id}`, 30, 60, 'Joylashuv juda tez-tez yuborilmoqda');
    const delivery = await getDelivery(c.env.DB, id);
    if (!delivery || delivery.courier_id !== me.id) fail(404, 'NOT_FOUND', 'Yetkazish topilmadi');
    if (!['accepted', 'picked_up', 'on_the_way', 'arrived'].includes(delivery!.status)) fail(409, 'NOT_ACTIVE', 'Joylashuv faqat faol yetkazish vaqtida yuboriladi');
    await c.env.DB.prepare('INSERT INTO delivery_locations(order_id,courier_id,lat,lng,accuracy,recorded_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(order_id) DO UPDATE SET lat=excluded.lat,lng=excluded.lng,accuracy=excluded.accuracy,recorded_at=excluded.recorded_at,courier_id=excluded.courier_id').bind(id, me.id, point.lat, point.lng, point.accuracy ?? null).run();
    return c.json({ ok: true });
  });

  app.get('/courier/deliveries/:id/route', async c => {
    const me = c.get('admin'), id = idFrom(c.req.param('id'));
    const delivery = await getDelivery(c.env.DB, id);
    if (!delivery || delivery.courier_id !== me.id || !ACTIVE.includes(delivery.status)) fail(404, 'NOT_FOUND', 'Faol yetkazish topilmadi');
    const order = (await c.env.DB.prepare('SELECT delivery_lat,delivery_lng FROM orders WHERE id=?').bind(id).first<{ delivery_lat: number | null; delivery_lng: number | null }>())!;
    if (order.delivery_lat == null) fail(409, 'NO_DESTINATION', 'Mijoz xaritada manzil belgilamagan');
    if (!c.env.GOOGLE_ROUTES_KEY) fail(503, 'ROUTES_NOT_CONFIGURED', 'Marshrut xizmati sozlanmagan — Google Maps navigatsiyasidan foydalaning');
    await limitOr429(c.env.DB, `route:${me.id}`, 20, 3600, 'Marshrut soʻrovlari limiti tugadi');
    const from = await c.env.DB.prepare('SELECT lat,lng FROM delivery_locations WHERE order_id=?').bind(id).first<{ lat: number; lng: number }>() || await storeLocation(c.env.DB);
    if (from.lat == null || from.lng == null) fail(409, 'NO_ORIGIN', 'Joriy joylashuv yoki doʻkon manzili nomaʼlum');
    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': c.env.GOOGLE_ROUTES_KEY!, 'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline' },
      body: JSON.stringify({ origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } }, destination: { location: { latLng: { latitude: order.delivery_lat, longitude: order.delivery_lng } } }, travelMode: 'DRIVE', routingPreference: 'TRAFFIC_AWARE', languageCode: 'uz' }),
    });
    const data = await res.json<any>().catch(() => ({}));
    const route = data?.routes?.[0];
    if (!res.ok || !route) fail(502, 'ROUTE_FAILED', 'Marshrut hisoblanmadi');
    return c.json({ distanceMeters: route.distanceMeters, durationSeconds: Number(String(route.duration).replace('s', '')), polyline: route.polyline?.encodedPolyline || null, origin: from, source: 'google_routes' });
  });

  app.post('/courier/deliveries/:id/:action', async c => {
    const me = c.get('admin'), id = idFrom(c.req.param('id')), action = c.req.param('action') as CourierAction;
    if (!courierTransitions[action]) fail(404, 'NOT_FOUND', 'Amal topilmadi');
    const input = await parse(c, z.object({ version: z.number().int(), reason: z.string().trim().max(300).optional() }));
    const delivery = await getDelivery(c.env.DB, id);
    if (!delivery || delivery.courier_id !== me.id) fail(404, 'NOT_FOUND', 'Yetkazish topilmadi');
    const next = nextDeliveryStatus(delivery!.status, action);
    if (!next) fail(409, 'INVALID_TRANSITION', 'Bu bosqichda bu amal mumkin emas');
    if (action === 'decline' && !input.reason) fail(400, 'REASON_REQUIRED', 'Rad etish sababini yozing');
    const order = (await c.env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(id).first<OrderRow>())!;
    if (order.status === 'cancelled') fail(409, 'CANCELLED_ORDER', 'Buyurtma bekor qilingan');
    const stamp = courierTransitions[action].stamp;
    const res = await c.env.DB.prepare(`UPDATE deliveries SET status=?,${stamp ? `${stamp}=CURRENT_TIMESTAMP,` : ''}decline_reason=?,updated_at=CURRENT_TIMESTAMP,version=version+1 WHERE order_id=? AND courier_id=? AND version=?`).bind(next, action === 'decline' ? input.reason : delivery!.decline_reason, id, me.id, input.version).run();
    if (!res.meta.changes) fail(409, 'STALE', 'Holat boshqa joyda oʻzgardi. Yangilab, qayta urinib koʻring');
    if (action === 'pickup') await moveOrderToShipped(c.env.DB, order);
    if (action === 'decline') await c.env.DB.prepare('DELETE FROM delivery_locations WHERE order_id=?').bind(id).run();
    await orderEvent(c.env.DB, id, 'courier', me.id, `courier_${action}`, input.reason || '');
    const ctx = ctxOf(c);
    const customerText: Partial<Record<CourierAction, [string, string]>> = {
      accept: ['Kuryer buyurtmangizni qabul qildi', 'Tez orada yoʻlga chiqadi'],
      pickup: ['Buyurtmangiz kuryerda', 'Kuryer doʻkondan buyurtmani oldi'],
      depart: ['Buyurtmangiz yoʻlda', 'Kuryer harakatini xaritada kuzating'],
      arrive: ['Kuryer manzilga yetib keldi', 'Iltimos, buyurtmani qabul qilib oling'],
      handover: ['Buyurtmani qabul qilganingizni tasdiqlang', 'Ilovani ochib, qabul qilganingizni tasdiqlang'],
    };
    if (customerText[action]) await pushCustomer(c.env, ctx, order.customer_id, { orderId: id, kind: `delivery_${action}`, title: customerText[action]![0], body: `${order.order_number} — ${customerText[action]![1]}` });
    if (action === 'decline') await notify(c.env, ctx, { audience: 'staff', orderId: id, kind: 'courier_declined', title: `${order.order_number}: kuryer rad etdi`, body: 'Boshqa kuryer tayinlang' });
    if (action === 'handover') await notify(c.env, ctx, { audience: 'staff', orderId: id, kind: 'handed_over', title: `${order.order_number} topshirildi`, body: 'Mijoz tasdigʻi kutilmoqda' });
    return c.json({ ok: true, status: next });
  });
}

/** Extra data for the admin order modal. */
export async function adminOrderExtras(db: D1Database, id: number) {
  const [delivery, events, location, rating, reviews] = await Promise.all([
    getDelivery(db, id),
    db.prepare('SELECT event,actor_type AS actorType,detail,created_at AS createdAt FROM order_events WHERE order_id=? ORDER BY id DESC LIMIT 50').bind(id).all().then(r => r.results),
    db.prepare("SELECT lat,lng,accuracy,recorded_at AS recordedAt,CAST(strftime('%s','now')-strftime('%s',recorded_at) AS INTEGER) AS ageSeconds FROM delivery_locations WHERE order_id=?").bind(id).first(),
    db.prepare('SELECT rating,body FROM courier_ratings WHERE order_id=?').bind(id).first(),
    db.prepare('SELECT r.id,r.rating,r.body,r.status,p.name AS productName FROM product_reviews r JOIN products p ON p.id=r.product_id WHERE r.order_id=?').bind(id).all().then(r => r.results),
  ]);
  return {
    delivery: delivery ? { courierId: delivery.courier_id, courierName: delivery.courier_name, courierPhone: delivery.courier_phone, status: delivery.status, version: delivery.version, declineReason: delivery.decline_reason, assignedAt: delivery.assigned_at, acceptedAt: delivery.accepted_at, pickedUpAt: delivery.picked_up_at, arrivedAt: delivery.arrived_at, handedOverAt: delivery.handed_over_at, confirmedAt: delivery.confirmed_at } : null,
    events, courierLocation: location, courierRating: rating, reviews,
  };
}
export { FINISHED };
export type { Staff, Bindings };
