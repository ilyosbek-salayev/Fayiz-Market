// Staff management, password changes, notification feed, review moderation, audit log and integrations.
import { z } from 'zod';
import type { App, Bindings } from './lib';
import { audit, fail, idFrom, limitOr429, parse, providerBase, sha256, strongPassword } from './lib';
import { emailStatus, testEmail } from './email';
import { passwordHash, verifyPassword } from './password';
import { smsStatus, testSms } from './otp';
import { googleAccessToken } from './push';

const ownerOnly = (c: any) => { if (c.get('admin').role !== 'owner') fail(403, 'FORBIDDEN', 'Faqat doʻkon egasi (super admin) ruxsat etilgan'); };
const phoneish = z.string().trim().max(40).default('');

type FieldDef = { key: string; label: string; placeholder?: string; hint?: string };
type IntegrationDef = { key: string; name: string; purpose: string; billing: string; publicFields: FieldDef[]; secrets: string[]; setup: string[]; configured: (env: Bindings, s: Record<string, string>) => boolean; test?: (env: Bindings, s: Record<string, string>, origin: string) => Promise<string> };

/** Public values live in `settings` (served to apps); secrets only in Cloudflare secrets, never in D1 or responses. */
export const integrations: IntegrationDef[] = [
  {
    key: 'store_location', name: 'Doʻkon joylashuvi', purpose: 'Kuryer buyurtmani olib ketadigan nuqta va marshrut boshlanishi', billing: 'Bepul',
    publicFields: [{ key: 'store_address', label: 'Manzil', placeholder: 'Toshkent, ...' }, { key: 'store_lat', label: 'Kenglik (lat)', placeholder: '41.311081' }, { key: 'store_lng', label: 'Uzunlik (lng)', placeholder: '69.240562' }],
    secrets: [], setup: ['Google Maps’da doʻkonni toping, nuqtani bosib koordinatalarni nusxalang.'],
    configured: (_e, s) => !!s.store_lat && !!s.store_lng,
  },
  {
    key: 'openfreemap', name: 'Xarita (OpenFreeMap)', purpose: 'Asosiy interaktiv xarita: checkoutda pin, kuzatuv, admin va kuryer xaritasi. Kalit va hisob talab qilinmaydi.', billing: 'Bepul (OpenFreeMap, © OpenStreetMap hissadorlari). Manzil nomini avtomatik aniqlash yoʻq.',
    publicFields: [], secrets: [], setup: ['Sozlash shart emas — Google Maps kaliti kiritilmagan boʻlsa ilovalar shu xaritani ishlatadi.', '«Tekshirish» xarita uslubi serverdan yuklanishini tekshiradi.'],
    configured: () => true,
    test: async () => {
      const res = await fetch('https://tiles.openfreemap.org/styles/liberty');
      const style = await res.json<any>().catch(() => null);
      if (!res.ok || !style?.sources) throw new Error(`OpenFreeMap javobi: HTTP ${res.status}`);
      return 'Xarita uslubi va plitkalar manbai mavjud';
    },
  },
  {
    key: 'google_maps', name: 'Google Maps (ixtiyoriy)', purpose: 'Kalit kiritilsa ilovalardagi xarita Google’ga almashadi va pin qoʻyilganda manzil nomi avtomatik yoziladi. Kalit ishlamasa, OpenFreeMap’ga qaytadi.', billing: 'Google Cloud billing hisobi talab qilinadi (oylik bepul limit bor). Faollashtirishdan oldin tasdiqlang.',
    publicFields: [{ key: 'google_maps_key', label: 'Browser API kaliti', placeholder: 'AIza…', hint: 'Faqat Maps JavaScript API va Geocoding API, HTTP referrer cheklovi bilan' }],
    secrets: [], setup: ['Google Cloud Console → yangi loyiha → Billing ulang (faqat tasdiqlangach).', 'Maps JavaScript API va Geocoding API ni yoqing.', 'Credentials → API key → Application restrictions: Websites → `<worker manzili>/*` qoʻshing.', 'API restrictions: faqat Maps JavaScript API va Geocoding API.', 'Kalitni shu yerga kiriting va «Tekshirish»ni bosing.'],
    configured: (_e, s) => !!s.google_maps_key,
    test: async (_e, s, origin) => {
      const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=41.3111,69.2797&language=uz&key=${encodeURIComponent(s.google_maps_key)}`, { headers: { Referer: origin + '/' } });
      const data = await res.json<any>().catch(() => ({}));
      if (data.status === 'OK') return 'Geocoding ishlayapti';
      throw new Error(`Google javobi: ${data.status || res.status}${data.error_message ? ' — ' + data.error_message : ''}`);
    },
  },
  {
    key: 'google_routes', name: 'Google Routes', purpose: 'Kuryer uchun haqiqiy masofa va yetib borish vaqti', billing: 'Har bir marshrut soʻrovi pullik (bepul oylik limitdan keyin). Kuryer boshiga soatiga 20 soʻrov cheklovi bor.',
    publicFields: [], secrets: ['GOOGLE_ROUTES_KEY'],
    setup: ['Google Cloud → Routes API ni yoqing.', 'Server uchun alohida API key yarating (API restrictions: faqat Routes API).', 'Terminalda (apps/api): `npx wrangler secret put GOOGLE_ROUTES_KEY --env production`'],
    configured: e => !!e.GOOGLE_ROUTES_KEY,
    test: async e => {
      const res = await fetch(`${providerBase(e, 'routes', 'https://routes.googleapis.com')}/directions/v2:computeRoutes`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': e.GOOGLE_ROUTES_KEY!, 'X-Goog-FieldMask': 'routes.distanceMeters' }, body: JSON.stringify({ origin: { location: { latLng: { latitude: 41.3111, longitude: 69.2797 } } }, destination: { location: { latLng: { latitude: 41.3275, longitude: 69.2817 } } }, travelMode: 'DRIVE' }) });
      if (!res.ok) throw new Error(`Routes API: HTTP ${res.status}`);
      return 'Marshrut hisoblandi';
    },
  },
  {
    key: 'telegram', name: 'Telegram Login', purpose: 'Mijozlar Telegram orqali roʻyxatdan oʻtadi va kiradi', billing: 'Bepul',
    publicFields: [{ key: 'telegram_bot_username', label: 'Bot username', placeholder: 'FayzMarketBot', hint: '@ belgisisiz' }], secrets: ['TELEGRAM_BOT_TOKEN'],
    setup: ['@BotFather → /newbot → bot yarating.', '@BotFather → /setdomain → worker domenini kiriting (masalan fayz-market-api.….workers.dev).', 'Terminalda (apps/api): `npx wrangler secret put TELEGRAM_BOT_TOKEN --env production`', 'Bot username’ni shu yerga kiriting va «Tekshirish»ni bosing.'],
    configured: (e, s) => !!e.TELEGRAM_BOT_TOKEN && !!s.telegram_bot_username,
    test: async (e, s) => {
      const res = await fetch(`${providerBase(e, 'telegram', 'https://api.telegram.org')}/bot${e.TELEGRAM_BOT_TOKEN}/getMe`);
      const data = await res.json<any>().catch(() => ({}));
      if (!data.ok) throw new Error('Bot tokeni qabul qilinmadi');
      if (s.telegram_bot_username && data.result.username.toLowerCase() !== s.telegram_bot_username.replace(/^@/, '').toLowerCase()) throw new Error(`Token @${data.result.username} botiga tegishli, sozlamada @${s.telegram_bot_username}`);
      return `@${data.result.username} boti ulangan`;
    },
  },
  {
    key: 'sms', name: 'SMS tasdiqlash (Eskiz.uz)', purpose: 'Telefon raqamini SMS kod bilan tasdiqlash, parolni tiklash', billing: 'Har bir SMS pullik (Eskiz tarifi). Shablon Eskiz tomonidan tasdiqlanishi kerak.',
    publicFields: [], secrets: ['SMS_PROVIDER', 'ESKIZ_EMAIL', 'ESKIZ_PASSWORD', 'ESKIZ_FROM'],
    setup: ['notify.eskiz.uz da hisob oching va SMS shablonini tasdiqlating: «Fayz Market tasdiqlash kodi: %w. Kodni hech kimga bermang.»', 'Terminalda (apps/api) har birini kiriting: `npx wrangler secret put SMS_PROVIDER --env production` (qiymati: eskiz), `ESKIZ_EMAIL`, `ESKIZ_PASSWORD`, `ESKIZ_FROM` (masalan 4546).'],
    configured: e => smsStatus(e).configured,
    test: async e => testSms(e),
  },
  {
    key: 'email', name: 'Email tasdiqlash (Resend)', purpose: 'Email orqali roʻyxatdan oʻtish, parolsiz kirish kodi va parolni tiklash', billing: 'Resend bepul tarifida oyiga 3 000 ta xat; oʻz domeningiz (DNS yozuvlari) talab qilinadi.',
    publicFields: [], secrets: ['EMAIL_PROVIDER', 'RESEND_API_KEY', 'EMAIL_FROM'],
    setup: ['resend.com da hisob oching va oʻz domeningizni qoʻshing (SPF/DKIM DNS yozuvlari) — workers.dev domenidan xat yuborib boʻlmaydi.', 'API Keys → «Sending access» kalit yarating.', 'Terminalda (apps/api): `npx wrangler secret put EMAIL_PROVIDER --env production` (qiymati: resend), `RESEND_API_KEY`, `EMAIL_FROM` (masalan: Fayz Market <kod@sizning-domen.uz>).'],
    configured: e => emailStatus(e).configured,
    test: async e => testEmail(e),
  },
  {
    key: 'fcm', name: 'Push bildirishnomalar (FCM)', purpose: 'Ilova yopiq boʻlsa ham telefonga bildirishnoma yetkazish', billing: 'Bepul (Firebase Cloud Messaging)',
    publicFields: [], secrets: ['FCM_SERVICE_ACCOUNT'],
    setup: ['Firebase Console → loyiha → Android ilovalar qoʻshing: uz.fayzmarket.customer va uz.fayzmarket.admin.', 'google-services.json fayllarini dasturchiga bering (Android build uchun).', 'Project settings → Service accounts → yangi kalit (JSON).', 'Terminalda (apps/api): `npx wrangler secret put FCM_SERVICE_ACCOUNT --env production` va JSON matnini joylang.'],
    configured: e => !!e.FCM_SERVICE_ACCOUNT,
    test: async e => { const account = JSON.parse(e.FCM_SERVICE_ACCOUNT!); await googleAccessToken(account, e); return `Firebase loyihasi: ${account.project_id}`; },
  },
];

const settingsMap = async (db: D1Database) => Object.fromEntries((await db.prepare('SELECT key,value FROM settings').all<{ key: string; value: string }>()).results.map(r => [r.key, r.value]));
const mask = (value: string) => value ? `${value.slice(0, 4)}…${value.slice(-4)}` : '';

export function registerStaff(app: App) {
  // ---------- Own account ----------
  app.post('/admin/password', async c => {
    const me = c.get('admin');
    const input = await parse(c, z.object({ currentPassword: z.string().min(1).max(200), password: strongPassword }));
    await limitOr429(c.env.DB, `staff-pass:${me.id}`, 5, 900);
    const row = (await c.env.DB.prepare('SELECT password_hash FROM admins WHERE id=?').bind(me.id).first<{ password_hash: string }>())!;
    if (!(await verifyPassword(input.currentPassword, row.password_hash))) fail(401, 'INVALID_CREDENTIALS', 'Joriy parol notoʻgʻri');
    const current = c.req.header('Authorization')!.slice(7);
    await c.env.DB.batch([
      c.env.DB.prepare('UPDATE admins SET password_hash=? WHERE id=?').bind(await passwordHash(input.password), me.id),
      c.env.DB.prepare('DELETE FROM sessions WHERE admin_id=? AND token_hash!=?').bind(me.id, await sha256(current)),
    ]);
    await audit(c.env.DB, me.id, 'staff.password_change', `admin:${me.id}`);
    return c.json({ ok: true });
  });

  // ---------- Staff management (owner = super admin) ----------
  app.patch('/admin/users/:id', async c => {
    ownerOnly(c);
    const me = c.get('admin'), id = idFrom(c.req.param('id'));
    const input = await parse(c, z.object({ name: z.string().trim().max(120).optional(), phone: phoneish.optional(), active: z.boolean().optional(), role: z.enum(['owner', 'manager', 'courier']).optional() }));
    const target = await c.env.DB.prepare('SELECT id,role,active FROM admins WHERE id=?').bind(id).first<{ id: number; role: string; active: number }>();
    if (!target) fail(404, 'NOT_FOUND', 'Xodim topilmadi');
    if (id === me.id && (input.active === false || (input.role && input.role !== 'owner'))) fail(409, 'SELF_LOCKOUT', 'Oʻzingizni oʻchira yoki rolingizni pasaytira olmaysiz');
    if (target!.role === 'owner' && (input.active === false || (input.role && input.role !== 'owner'))) {
      const owners = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM admins WHERE role='owner' AND active=1").first<{ n: number }>();
      if ((owners?.n || 0) <= 1) fail(409, 'LAST_OWNER', 'Kamida bitta faol super admin qolishi kerak');
    }
    if (input.role === 'courier' || target!.role === 'courier') {
      const busy = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM deliveries WHERE courier_id=? AND status IN ('assigned','accepted','picked_up','on_the_way','arrived')").bind(id).first<{ n: number }>();
      if ((input.active === false || (input.role && input.role !== 'courier')) && busy?.n) fail(409, 'COURIER_BUSY', 'Kuryerda faol yetkazish bor — avval boshqa kuryerga oʻtkazing');
    }
    const sets: string[] = [], values: unknown[] = [];
    for (const [key, column] of [['name', 'name'], ['phone', 'phone'], ['role', 'role']] as const) if (input[key] !== undefined) { sets.push(`${column}=?`); values.push(input[key]); }
    if (input.active !== undefined) { sets.push('active=?'); values.push(Number(input.active)); }
    if (!sets.length) return c.json({ ok: true });
    const statements = [c.env.DB.prepare(`UPDATE admins SET ${sets.join(',')} WHERE id=?`).bind(...values, id)];
    if (input.active === false || input.role) statements.push(c.env.DB.prepare('DELETE FROM sessions WHERE admin_id=?').bind(id)); // re-login with new rights
    await c.env.DB.batch(statements);
    await audit(c.env.DB, me.id, 'staff.update', `admin:${id}`, input);
    return c.json({ ok: true });
  });

  app.post('/admin/users/:id/password', async c => {
    ownerOnly(c);
    const me = c.get('admin'), id = idFrom(c.req.param('id'));
    const { password } = await parse(c, z.object({ password: strongPassword }));
    const res = await c.env.DB.prepare('UPDATE admins SET password_hash=? WHERE id=?').bind(await passwordHash(password), id).run();
    if (!res.meta.changes) fail(404, 'NOT_FOUND', 'Xodim topilmadi');
    await c.env.DB.prepare('DELETE FROM sessions WHERE admin_id=?').bind(id).run();
    await audit(c.env.DB, me.id, 'staff.password_reset', `admin:${id}`);
    return c.json({ ok: true });
  });

  // ---------- Notification feed (polled by admin/courier apps) ----------
  app.get('/admin/notifications', async c => {
    const me = c.get('admin');
    const after = Number(c.req.query('after') || 0);
    const where = me.role === 'courier' ? "audience='courier' AND recipient_id=?" : "audience='staff'";
    const binds = me.role === 'courier' ? [me.id] : [];
    const latest = (await c.env.DB.prepare(`SELECT COALESCE(MAX(id),0) AS id FROM notifications WHERE ${where}`).bind(...binds).first<{ id: number }>())!.id;
    const rows = await c.env.DB.prepare(`SELECT id,kind,title,body,order_id AS orderId,created_at AS createdAt FROM notifications WHERE ${where} AND id>? ORDER BY id DESC LIMIT 30`).bind(...binds, Number.isSafeInteger(after) && after > 0 ? after : 0).all();
    return c.json({ latest, notifications: rows.results });
  });
  app.post('/admin/push-token', async c => {
    const me = c.get('admin');
    const { token, platform } = await parse(c, z.object({ token: z.string().min(20).max(4096), platform: z.enum(['android', 'desktop']) }));
    const audience = me.role === 'courier' ? 'courier' : 'staff';
    await c.env.DB.prepare('INSERT INTO push_tokens(token,platform,audience,principal_id) VALUES(?,?,?,?) ON CONFLICT(token) DO UPDATE SET audience=excluded.audience,principal_id=excluded.principal_id,last_seen_at=CURRENT_TIMESTAMP,failures=0').bind(token, platform, audience, me.id).run();
    return c.json({ ok: true });
  });

  // ---------- Reviews moderation ----------
  app.get('/admin/reviews', async c => {
    const rows = await c.env.DB.prepare(`SELECT r.id,r.rating,r.body,r.status,r.author_name AS authorName,r.created_at AS createdAt,p.name AS productName,o.order_number AS orderNumber
      FROM product_reviews r JOIN products p ON p.id=r.product_id JOIN orders o ON o.id=r.order_id ORDER BY r.id DESC LIMIT 100`).all();
    const couriers = await c.env.DB.prepare(`SELECT r.order_id AS orderId,r.rating,r.body,r.created_at AS createdAt,a.name AS courierName,o.order_number AS orderNumber FROM courier_ratings r JOIN admins a ON a.id=r.courier_id JOIN orders o ON o.id=r.order_id ORDER BY r.created_at DESC LIMIT 100`).all();
    return c.json({ reviews: rows.results, courierRatings: couriers.results });
  });
  app.patch('/admin/reviews/:id', async c => {
    const me = c.get('admin'), id = idFrom(c.req.param('id'));
    const { status } = await parse(c, z.object({ status: z.enum(['published', 'hidden']) }));
    const res = await c.env.DB.prepare('UPDATE product_reviews SET status=? WHERE id=?').bind(status, id).run();
    if (!res.meta.changes) fail(404, 'NOT_FOUND', 'Sharh topilmadi');
    await audit(c.env.DB, me.id, 'review.' + status, `review:${id}`);
    return c.json({ ok: true });
  });

  app.get('/admin/audit', async c => {
    ownerOnly(c);
    const rows = await c.env.DB.prepare('SELECT l.id,l.action,l.target,l.detail,l.created_at AS createdAt,a.email FROM audit_log l LEFT JOIN admins a ON a.id=l.admin_id ORDER BY l.id DESC LIMIT 100').all();
    return c.json({ entries: rows.results });
  });

  // ---------- Integrations (super admin only) ----------
  app.get('/admin/integrations', async c => {
    ownerOnly(c);
    const s = await settingsMap(c.env.DB);
    const tests = (await c.env.DB.prepare("SELECT target,detail,created_at FROM audit_log WHERE action IN ('integration.test_ok','integration.test_failed') AND id IN (SELECT MAX(id) FROM audit_log WHERE action IN ('integration.test_ok','integration.test_failed') GROUP BY target)").all<{ target: string; detail: string; created_at: string }>()).results;
    return c.json({
      integrations: integrations.map(def => {
        const last = tests.find(t => t.target === def.key);
        return {
          key: def.key, name: def.name, purpose: def.purpose, billing: def.billing, setup: def.setup, testable: !!def.test,
          configured: def.configured(c.env, s),
          fields: def.publicFields.map(f => ({ ...f, value: s[f.key] || '' })),
          // Only presence is reported for secrets — never the value or a fragment of it.
          secrets: def.secrets.map(name => ({ name, present: !!(c.env as Record<string, unknown>)[name] })),
          lastCheck: last ? { ...JSON.parse(last.detail), at: last.created_at } : null,
        };
      }),
    });
  });

  app.put('/admin/integrations/:key', async c => {
    ownerOnly(c);
    const me = c.get('admin'), def = integrations.find(d => d.key === c.req.param('key'));
    if (!def || !def.publicFields.length) fail(404, 'NOT_FOUND', 'Integratsiya topilmadi');
    const allowed = Object.fromEntries(def!.publicFields.map(f => [f.key, z.string().trim().max(200)]));
    const input = await parse(c, z.object(allowed).partial().strict());
    if (input.google_maps_key && !/^AIza[0-9A-Za-z_-]{35}$/.test(input.google_maps_key)) fail(400, 'INVALID_KEY', 'Google API kaliti formati notoʻgʻri');
    if (input.telegram_bot_username && !/^@?[A-Za-z][A-Za-z0-9_]{3,31}bot$/i.test(input.telegram_bot_username)) fail(400, 'INVALID_BOT', 'Bot username …bot bilan tugashi kerak');
    for (const k of ['store_lat', 'store_lng'] as const) if (input[k]) { const n = Number(input[k]); if (!Number.isFinite(n) || Math.abs(n) > (k === 'store_lat' ? 90 : 180)) fail(400, 'INVALID_COORDINATE', 'Koordinata notoʻgʻri'); }
    const entries = Object.entries(input).map(([k, v]) => [k, k === 'telegram_bot_username' ? String(v).replace(/^@/, '') : String(v)]);
    await c.env.DB.batch(entries.map(([k, v]) => c.env.DB.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(k, v)));
    await audit(c.env.DB, me.id, 'integration.update', def!.key, Object.fromEntries(entries.map(([k, v]) => [k, k === 'google_maps_key' ? mask(v) : v])));
    return c.json({ ok: true });
  });

  app.post('/admin/integrations/:key/test', async c => {
    ownerOnly(c);
    const me = c.get('admin'), def = integrations.find(d => d.key === c.req.param('key'));
    if (!def?.test) fail(404, 'NOT_FOUND', 'Bu integratsiyani tekshirib boʻlmaydi');
    await limitOr429(c.env.DB, `integration-test:${def!.key}`, 10, 3600);
    const s = await settingsMap(c.env.DB);
    if (!def!.configured(c.env, s)) fail(409, 'NOT_CONFIGURED', 'Avval sozlang');
    try {
      const message = await def!.test!(c.env, s, c.env.PUBLIC_BASE_URL);
      await audit(c.env.DB, me.id, 'integration.test_ok', def!.key, { ok: true, message });
      return c.json({ ok: true, message });
    } catch (error) {
      const message = String(error instanceof Error ? error.message : error).slice(0, 300);
      await audit(c.env.DB, me.id, 'integration.test_failed', def!.key, { ok: false, message });
      return c.json({ ok: false, message });
    }
  });
}
