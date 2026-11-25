// Staff management, password changes, notification feed, review moderation, audit log and integrations.
import { z } from 'zod';
import type { App, Bindings } from './lib';
import { audit, fail, idFrom, limitOr429, parse, providerBase, putSettings, settingsMap, sha256, strongPassword } from './lib';
import { clickSelfTest, paymeKey, paymeSelfTest } from './payments';
import { computeRoute } from './routing';
import { invalidateSecrets, isManagedSecret, keyId, loadSecrets, masterKey, seal, type ManagedSecret } from './secrets';
import { emailStatus, testEmail } from './email';
import { passwordHash, verifyPassword } from './password';
import { smsStatus, testSms } from './otp';
import { googleAccessToken } from './push';

const ownerOnly = (c: any) => { if (c.get('admin').role !== 'owner') fail(403, 'FORBIDDEN', 'Faqat doʻkon egasi (super admin) ruxsat etilgan'); };
const phoneish = z.string().trim().max(40).default('');

type FieldDef = { key: string; label: string; placeholder?: string; hint?: string; options?: [string, string][] };
type SecretDef = { name: ManagedSecret; label: string; hint?: string; multiline?: boolean; validate?: (v: string) => string | null };
type IntegrationDef = {
  key: string; name: string; purpose: string; billing: string; group: 'maps' | 'auth' | 'notify' | 'payments';
  publicFields: FieldDef[]; secrets: SecretDef[]; setup: string[]; enabledKey?: string;
  configured: (env: Bindings, s: Record<string, string>) => boolean;
  test?: (env: Bindings, s: Record<string, string>, origin: string) => Promise<string>;
  /** What the test proves: a real provider call, the provider sandbox, or only our own endpoint + stored key. */
  testKind?: 'live' | 'sandbox' | 'internal';
};
const pattern = (re: RegExp, message: string) => (v: string) => re.test(v) ? null : message;

/** Public values live in `settings` (served to apps); credentials in Cloudflare secrets or sealed in D1 (secrets.ts). */
export const integrations: IntegrationDef[] = [
  {
    key: 'openfreemap', group: 'maps', name: 'Xarita (OpenFreeMap)', purpose: 'Asosiy interaktiv xarita: doʻkon xaritasi, checkoutda pin, kuzatuv, admin va kuryer xaritasi. Kalit va hisob talab qilinmaydi.', billing: 'Bepul (OpenFreeMap, © OpenStreetMap hissadorlari). Manzil nomini avtomatik aniqlash yoʻq.',
    publicFields: [], secrets: [], setup: ['Sozlash shart emas — Google Maps kaliti kiritilmagan boʻlsa ilovalar shu xaritani ishlatadi.', '«Ulanishni tekshirish» xarita uslubi serverdan yuklanishini tekshiradi.'],
    configured: () => true, testKind: 'live',
    test: async () => {
      const res = await fetch('https://tiles.openfreemap.org/styles/liberty');
      const style = await res.json<any>().catch(() => null);
      if (!res.ok || !style?.sources) throw new Error(`OpenFreeMap javobi: HTTP ${res.status}`);
      return 'Xarita uslubi va plitkalar manbai mavjud';
    },
  },
  {
    key: 'routing', group: 'maps', name: 'Marshrut (OpenRouteService)', purpose: 'Xaridordan doʻkongacha va kuryer uchun haqiqiy yoʻl chizigʻi, masofa va vaqt. Ulanmagan boʻlsa ilovalar navigatsiya ilovasini ochishni taklif qiladi.', billing: 'Bepul tarif: kuniga 2 000 ta marshrut (openrouteservice.org, HeiGIT). Ilovada kuniga 1 500 ta bilan cheklangan.',
    publicFields: [], secrets: [{ name: 'ORS_API_KEY', label: 'API kaliti', validate: pattern(/^[A-Za-z0-9=_-]{20,200}$/, 'Kalit formati notoʻgʻri') }],
    setup: ['openrouteservice.org → Sign up (bepul) → Dashboard → API Keys → «Request a token» (Standard).', 'Kalitni shu yerga kiriting va «Saqlash», soʻng «Ulanishni tekshirish»ni bosing.', 'Xaritada «© openrouteservice.org by HeiGIT» atributsiyasi koʻrsatiladi (foydalanish sharti).'],
    configured: e => !!e.ORS_API_KEY, testKind: 'live',
    test: async e => { const r = await computeRoute(e, { lat: 41.3111, lng: 69.2797 }, { lat: 41.3275, lng: 69.2817 }); return `Marshrut hisoblandi: ${(r.distanceMeters / 1000).toFixed(1)} km, ${r.coordinates.length} nuqta`; },
  },
  {
    key: 'google_maps', group: 'maps', name: 'Google Maps (ixtiyoriy)', purpose: 'Kalit kiritilsa ilovalardagi xarita Google’ga almashadi va pin qoʻyilganda manzil nomi avtomatik yoziladi. Kalit ishlamasa, OpenFreeMap’ga qaytadi.', billing: 'Google Cloud billing hisobi talab qilinadi (oylik bepul limit bor). Faollashtirishdan oldin tasdiqlang.',
    publicFields: [{ key: 'google_maps_key', label: 'Browser API kaliti', placeholder: 'AIza…', hint: 'Ochiq kalit: ilovaga yuboriladi. Faqat Maps JavaScript API va Geocoding API, HTTP referrer cheklovi bilan' }],
    secrets: [], setup: ['Google Cloud Console → yangi loyiha → Billing ulang (faqat tasdiqlangach).', 'Maps JavaScript API va Geocoding API ni yoqing.', 'Credentials → API key → Application restrictions: Websites → `<worker manzili>/*` qoʻshing.', 'API restrictions: faqat Maps JavaScript API va Geocoding API.', 'Kalitni shu yerga kiriting va «Ulanishni tekshirish»ni bosing.'],
    configured: (_e, s) => !!s.google_maps_key, testKind: 'live',
    test: async (_e, s, origin) => {
      const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=41.3111,69.2797&language=uz&key=${encodeURIComponent(s.google_maps_key)}`, { headers: { Referer: origin + '/' } });
      const data = await res.json<any>().catch(() => ({}));
      if (data.status === 'OK') return 'Geocoding ishlayapti';
      throw new Error(`Google javobi: ${data.status || res.status}${data.error_message ? ' — ' + data.error_message : ''}`);
    },
  },
  {
    key: 'google_routes', group: 'maps', name: 'Google Routes (ixtiyoriy)', purpose: 'OpenRouteService oʻrniga Google marshruti (tirbandlikni hisobga oladi). Ikkalasi ham boʻlsa OpenRouteService ishlatiladi.', billing: 'Har bir marshrut soʻrovi pullik (bepul oylik limitdan keyin).',
    publicFields: [], secrets: [{ name: 'GOOGLE_ROUTES_KEY', label: 'Server API kaliti', validate: pattern(/^AIza[0-9A-Za-z_-]{35}$/, 'Google API kaliti formati notoʻgʻri') }],
    setup: ['Google Cloud → Routes API ni yoqing.', 'Server uchun alohida API key yarating (API restrictions: faqat Routes API).', 'Kalitni shu yerga kiriting.'],
    configured: e => !!e.GOOGLE_ROUTES_KEY, testKind: 'live',
    test: async e => {
      const res = await fetch(`${providerBase(e, 'routes', 'https://routes.googleapis.com')}/directions/v2:computeRoutes`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': e.GOOGLE_ROUTES_KEY!, 'X-Goog-FieldMask': 'routes.distanceMeters' }, body: JSON.stringify({ origin: { location: { latLng: { latitude: 41.3111, longitude: 69.2797 } } }, destination: { location: { latLng: { latitude: 41.3275, longitude: 69.2817 } } }, travelMode: 'DRIVE' }) });
      if (!res.ok) throw new Error(`Routes API: HTTP ${res.status}`);
      return 'Marshrut hisoblandi';
    },
  },
  {
    key: 'telegram', group: 'auth', name: 'Telegram Login', purpose: 'Mijozlar Telegram orqali roʻyxatdan oʻtadi va kiradi', billing: 'Bepul',
    publicFields: [{ key: 'telegram_bot_username', label: 'Bot username', placeholder: 'FayzMarketBot', hint: '@ belgisisiz' }],
    secrets: [{ name: 'TELEGRAM_BOT_TOKEN', label: 'Bot tokeni', validate: pattern(/^\d{5,15}:[A-Za-z0-9_-]{30,}$/, 'Token formati: 123456789:AA…') }],
    setup: ['@BotFather → /newbot → bot yarating.', '@BotFather → /setdomain → worker domenini kiriting (masalan fayz-market-api.….workers.dev).', 'Bot tokeni va username’ni shu yerga kiriting, soʻng «Ulanishni tekshirish».'],
    configured: (e, s) => !!e.TELEGRAM_BOT_TOKEN && !!s.telegram_bot_username, testKind: 'live',
    test: async (e, s) => {
      const res = await fetch(`${providerBase(e, 'telegram', 'https://api.telegram.org')}/bot${e.TELEGRAM_BOT_TOKEN}/getMe`);
      const data = await res.json<any>().catch(() => ({}));
      if (!data.ok) throw new Error('Bot tokeni qabul qilinmadi');
      if (s.telegram_bot_username && data.result.username.toLowerCase() !== s.telegram_bot_username.replace(/^@/, '').toLowerCase()) throw new Error(`Token @${data.result.username} botiga tegishli, sozlamada @${s.telegram_bot_username}`);
      return `@${data.result.username} boti ulangan`;
    },
  },
  {
    key: 'sms', group: 'auth', name: 'SMS tasdiqlash (Eskiz.uz)', purpose: 'Telefon raqamini SMS kod bilan tasdiqlash, parolni tiklash', billing: 'Har bir SMS pullik (Eskiz tarifi). Shablon Eskiz tomonidan tasdiqlanishi kerak.',
    publicFields: [], secrets: [
      { name: 'SMS_PROVIDER', label: 'Provayder', hint: 'Qiymati: eskiz', validate: pattern(/^eskiz$/, 'Hozircha faqat «eskiz»') },
      { name: 'ESKIZ_EMAIL', label: 'Eskiz login (email)', validate: pattern(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, 'Email notoʻgʻri') },
      { name: 'ESKIZ_PASSWORD', label: 'Eskiz paroli (API kaliti)' },
      { name: 'ESKIZ_FROM', label: 'Yuboruvchi (nickname)', hint: 'Masalan: 4546', validate: pattern(/^[A-Za-z0-9 ]{3,11}$/, '3–11 ta harf/raqam') },
    ],
    setup: ['notify.eskiz.uz da hisob oching va SMS shablonini tasdiqlating: «Fayz Market tasdiqlash kodi: %w. Kodni hech kimga bermang.»', 'Toʻrtala qiymatni shu yerga kiriting va «Ulanishni tekshirish»ni bosing (Eskiz hisobiga kirish tekshiriladi, SMS yuborilmaydi).'],
    configured: e => smsStatus(e).configured, testKind: 'live',
    test: async e => testSms(e),
  },
  {
    key: 'email', group: 'auth', name: 'Email tasdiqlash (Resend)', purpose: 'Email orqali roʻyxatdan oʻtish, parolsiz kirish kodi va parolni tiklash', billing: 'Resend bepul tarifida oyiga 3 000 ta xat; oʻz domeningiz (DNS yozuvlari) talab qilinadi.',
    publicFields: [], secrets: [
      { name: 'EMAIL_PROVIDER', label: 'Provayder', hint: 'Qiymati: resend', validate: pattern(/^resend$/, 'Hozircha faqat «resend»') },
      { name: 'RESEND_API_KEY', label: 'Resend API kaliti', validate: pattern(/^re_[A-Za-z0-9_]{10,}$/, 'Resend kaliti re_ bilan boshlanadi') },
      { name: 'EMAIL_FROM', label: 'Yuboruvchi', hint: 'Fayz Market <kod@sizning-domen.uz>' },
    ],
    setup: ['resend.com da hisob oching va oʻz domeningizni qoʻshing (SPF/DKIM DNS yozuvlari) — workers.dev domenidan xat yuborib boʻlmaydi.', 'API Keys → «Sending access» kalit yarating.', 'Uchala qiymatni shu yerga kiriting va «Ulanishni tekshirish»ni bosing.'],
    configured: e => emailStatus(e).configured, testKind: 'live',
    test: async e => testEmail(e),
  },
  {
    key: 'fcm', group: 'notify', name: 'Push bildirishnomalar (FCM)', purpose: 'Ilova yopiq boʻlsa ham telefonga bildirishnoma yetkazish', billing: 'Bepul (Firebase Cloud Messaging)',
    publicFields: [], secrets: [{ name: 'FCM_SERVICE_ACCOUNT', label: 'Service account JSON', multiline: true, validate: v => { try { const j = JSON.parse(v); return j.client_email && j.private_key && j.project_id ? null : 'JSON’da client_email, private_key va project_id boʻlishi kerak'; } catch { return 'JSON notoʻgʻri'; } } }],
    setup: ['Firebase Console → loyiha → Android ilovalar qoʻshing: uz.fayzmarket.customer va uz.fayzmarket.admin.', 'google-services.json fayllarini dasturchiga bering (Android build uchun — APK qayta yigʻiladi).', 'Project settings → Service accounts → yangi kalit (JSON) → matnini shu yerga joylang.'],
    configured: e => !!e.FCM_SERVICE_ACCOUNT, testKind: 'live',
    test: async e => { const account = JSON.parse(e.FCM_SERVICE_ACCOUNT!); await googleAccessToken(account, e); return `Firebase loyihasi: ${account.project_id}`; },
  },
  {
    key: 'payme', group: 'payments', name: 'Payme', purpose: 'Xaridor buyurtmani Payme sahifasida karta bilan toʻlaydi; Payme serveri toʻlovni /payments/payme orqali tasdiqlaydi.', billing: 'Payme komissiyasi shartnoma boʻyicha. Merchant shartnomasi va kabinet talab qilinadi.',
    enabledKey: 'payme_enabled',
    publicFields: [
      { key: 'payme_merchant_id', label: 'Merchant ID (kassa ID)', placeholder: '24 belgili ID', hint: 'Payme Business → Kassa → ID' },
      { key: 'payme_mode', label: 'Rejim', options: [['test', 'Test (sandbox: test.paycom.uz)'], ['production', 'Production (haqiqiy toʻlov)']] },
    ],
    secrets: [{ name: 'PAYME_TEST_KEY', label: 'Test kaliti (sandbox)', validate: pattern(/^\S{10,200}$/, 'Kalit notoʻgʻri') }, { name: 'PAYME_KEY', label: 'Production kaliti', validate: pattern(/^\S{10,200}$/, 'Kalit notoʻgʻri') }],
    setup: ['Payme Business’da merchant shartnomasini tuzing va kassa yarating.', 'Kassa sozlamalari → «Endpoint URL»: `<worker manzili>/payments/payme`, hisob maydoni (account): `order_id`.', 'Merchant ID, test kaliti va production kalitini shu yerga kiriting. Rejim avval «Test» boʻlsin.', 'test.paycom.uz sandbox’ida barcha testlarni oʻtkazing, soʻng rejimni «Production»ga oʻtkazing va «Faol»ni yoqing.'],
    configured: (e, s) => /^[0-9a-f]{24}$/i.test(s.payme_merchant_id || '') && !!paymeKey(e, s), testKind: 'internal',
    test: async (e, s) => paymeSelfTest(e, { ...s, payme_enabled: '1' }),
  },
  {
    key: 'click', group: 'payments', name: 'Click', purpose: 'Xaridor buyurtmani Click sahifasida toʻlaydi; Click serveri /payments/click/prepare va /complete orqali imzo bilan tasdiqlaydi.', billing: 'Click komissiyasi shartnoma boʻyicha. Merchant shartnomasi talab qilinadi.',
    enabledKey: 'click_enabled',
    publicFields: [
      { key: 'click_service_id', label: 'Service ID', placeholder: '12345' },
      { key: 'click_merchant_id', label: 'Merchant ID', placeholder: '12345' },
      { key: 'click_merchant_user_id', label: 'Merchant user ID', placeholder: 'ixtiyoriy' },
    ],
    secrets: [{ name: 'CLICK_SECRET_KEY', label: 'Secret key', validate: pattern(/^\S{5,200}$/, 'Kalit notoʻgʻri') }],
    setup: ['Click bilan merchant shartnomasini tuzing (merchant.click.uz).', 'Prepare URL: `<worker manzili>/payments/click/prepare`, Complete URL: `<worker manzili>/payments/click/complete`.', 'Service ID, Merchant ID va Secret key’ni shu yerga kiriting, «Ulanishni tekshirish», soʻng Click kabinetida test toʻlovi.', 'Hammasi oʻtgach «Faol»ni yoqing — shundan keyin checkoutda Click koʻrinadi.'],
    configured: (e, s) => /^\d{1,12}$/.test(s.click_service_id || '') && /^\d{1,12}$/.test(s.click_merchant_id || '') && !!e.CLICK_SECRET_KEY, testKind: 'internal',
    test: async (e, s) => clickSelfTest(e, { ...s, click_enabled: '1' }),
  },
];

const mask = (value: string) => value ? `${value.slice(0, 4)}…${value.slice(-4)}` : '';
const publicFieldRules: Record<string, (v: string) => string | null> = {
  google_maps_key: v => !v || /^AIza[0-9A-Za-z_-]{35}$/.test(v) ? null : 'Google API kaliti formati notoʻgʻri',
  telegram_bot_username: v => !v || /^@?[A-Za-z][A-Za-z0-9_]{3,31}bot$/i.test(v) ? null : 'Bot username …bot bilan tugashi kerak',
  payme_merchant_id: v => !v || /^[0-9a-f]{24}$/i.test(v) ? null : 'Payme merchant ID 24 ta belgidan iborat',
  payme_mode: v => ['test', 'production'].includes(v) ? null : 'Rejim notoʻgʻri',
  click_service_id: v => !v || /^\d{1,12}$/.test(v) ? null : 'Faqat raqam',
  click_merchant_id: v => !v || /^\d{1,12}$/.test(v) ? null : 'Faqat raqam',
  click_merchant_user_id: v => !v || /^\d{1,12}$/.test(v) ? null : 'Faqat raqam',
};

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
  app.delete('/admin/push-token', async c => {
    const me = c.get('admin');
    const { token } = await parse(c, z.object({ token: z.string().min(20).max(4096) }));
    await c.env.DB.prepare("DELETE FROM push_tokens WHERE token=? AND principal_id=? AND audience IN ('staff','courier')").bind(token, me.id).run();
    return c.json({ ok: true });
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
    const s = await settingsMap(c.env.DB), base = c.get('baseEnv') || c.env;
    const tests = (await c.env.DB.prepare("SELECT target,detail,created_at FROM audit_log WHERE action IN ('integration.test_ok','integration.test_failed') AND id IN (SELECT MAX(id) FROM audit_log WHERE action IN ('integration.test_ok','integration.test_failed') GROUP BY target)").all<{ target: string; detail: string; created_at: string }>()).results;
    const { states } = await loadSecrets(c.env);
    const key = masterKey(c.env);
    return c.json({
      masterKey: { configured: !!key, id: key ? await keyId(key) : null },
      integrations: integrations.map(def => {
        const last = tests.find(t => t.target === def.key);
        const lastCheck = last ? { ...JSON.parse(last.detail), at: last.created_at } : null;
        const secrets = def.secrets.map(sd => {
          const panel = states[sd.name];
          const cloudflare = !!(base as Record<string, unknown>)[sd.name];
          // Only presence and origin are reported — never the value or a fragment of it.
          return { name: sd.name, label: sd.label, hint: sd.hint, multiline: !!sd.multiline, present: !!(panel?.readable || cloudflare), source: panel?.readable ? 'panel' : cloudflare ? 'cloudflare' : null, stored: !!panel?.stored, unreadable: !!panel?.stored && !panel.readable, updatedAt: panel?.updatedAt ?? null };
        });
        const configured = def.configured(c.env, s);
        const enabled = def.enabledKey ? s[def.enabledKey] === '1' : configured;
        const status = secrets.some(x => x.unreadable) || (configured && lastCheck && !lastCheck.ok) ? 'error' : configured ? 'configured' : 'not_configured';
        return {
          key: def.key, group: def.group, name: def.name, purpose: def.purpose, billing: def.billing, setup: def.setup, testable: !!def.test, testKind: def.testKind ?? 'live',
          configured, status, enabled, toggleable: !!def.enabledKey,
          fields: def.publicFields.map(f => ({ ...f, value: s[f.key] ?? (f.options ? f.options[0][0] : '') })),
          secrets, lastCheck,
        };
      }),
    });
  });

  /** Public (non-secret) values and the on/off switch. */
  app.put('/admin/integrations/:key', async c => {
    ownerOnly(c);
    const me = c.get('admin'), def = integrations.find(d => d.key === c.req.param('key'));
    if (!def || (!def.publicFields.length && !def.enabledKey)) fail(404, 'NOT_FOUND', 'Integratsiya topilmadi');
    const allowed: Record<string, z.ZodTypeAny> = Object.fromEntries(def!.publicFields.map(f => [f.key, z.string().trim().max(200)]));
    if (def!.enabledKey) allowed.enabled = z.boolean();
    const input = await parse(c, z.object(allowed).partial().strict()) as Record<string, string | boolean | undefined>;
    const entries: [string, string][] = [];
    for (const f of def!.publicFields) {
      const v = input[f.key];
      if (typeof v !== 'string') continue;
      const problem = publicFieldRules[f.key]?.(v);
      if (problem) fail(400, 'INVALID_VALUE', `${f.label}: ${problem}`);
      entries.push([f.key, f.key === 'telegram_bot_username' ? v.replace(/^@/, '') : v]);
    }
    if (def!.enabledKey && typeof input.enabled === 'boolean') {
      if (input.enabled) {
        const next = { ...(await settingsMap(c.env.DB)), ...Object.fromEntries(entries) };
        if (!def!.configured(c.env, next)) fail(409, 'NOT_CONFIGURED', 'Avval barcha maydon va kalitlarni kiriting');
      }
      entries.push([def!.enabledKey, input.enabled ? '1' : '0']);
    }
    if (entries.length) await c.env.DB.batch(putSettings(c.env.DB, entries));
    await audit(c.env.DB, me.id, 'integration.update', def!.key, Object.fromEntries(entries.map(([k, v]) => [k, k === 'google_maps_key' ? mask(v) : v])));
    return c.json({ ok: true });
  });

  /** Credentials: write-only, sealed with INTEGRATIONS_MASTER_KEY, never echoed back. */
  app.put('/admin/integrations/:key/secrets', async c => {
    ownerOnly(c);
    const me = c.get('admin'), def = integrations.find(d => d.key === c.req.param('key'));
    if (!def?.secrets.length) fail(404, 'NOT_FOUND', 'Integratsiya topilmadi');
    const key = masterKey(c.env);
    if (!key) fail(409, 'MASTER_KEY_MISSING', 'Shifrlash kaliti (INTEGRATIONS_MASTER_KEY) oʻrnatilmagan — kalitlarni saqlab boʻlmaydi. Yoʻriqnomaga qarang.');
    const input = await parse(c, z.record(z.string(), z.string().max(8192)));
    const names = Object.keys(input);
    if (!names.length) fail(400, 'EMPTY', 'Hech narsa kiritilmagan');
    const statements: D1PreparedStatement[] = [];
    for (const name of names) {
      const sd = def!.secrets.find(x => x.name === name);
      if (!sd || !isManagedSecret(name)) fail(400, 'UNKNOWN_SECRET', `${name} bu integratsiyaga tegishli emas`);
      const value = input[name].trim();
      if (!value) fail(400, 'EMPTY', `${sd!.label}: qiymat boʻsh`);
      const problem = sd!.validate?.(value);
      if (problem) fail(400, 'INVALID_VALUE', `${sd!.label}: ${problem}`);
      const sealed = await seal(key!, name, value);
      statements.push(c.env.DB.prepare('INSERT INTO integration_secrets(name,ciphertext,iv,key_id,updated_by,updated_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(name) DO UPDATE SET ciphertext=excluded.ciphertext,iv=excluded.iv,key_id=excluded.key_id,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP').bind(name, sealed.ciphertext, sealed.iv, sealed.keyId, me.id));
    }
    await c.env.DB.batch(statements);
    invalidateSecrets();
    await audit(c.env.DB, me.id, 'integration.secret_set', def!.key, { names }); // names only, never values
    return c.json({ ok: true, saved: names });
  });
  app.delete('/admin/integrations/:key/secrets/:name', async c => {
    ownerOnly(c);
    const me = c.get('admin'), def = integrations.find(d => d.key === c.req.param('key')), name = c.req.param('name');
    if (!def?.secrets.some(x => x.name === name)) fail(404, 'NOT_FOUND', 'Kalit topilmadi');
    await c.env.DB.prepare('DELETE FROM integration_secrets WHERE name=?').bind(name).run();
    invalidateSecrets();
    await audit(c.env.DB, me.id, 'integration.secret_removed', def!.key, { name });
    return c.json({ ok: true });
  });

  app.post('/admin/integrations/:key/test', async c => {
    ownerOnly(c);
    const me = c.get('admin'), def = integrations.find(d => d.key === c.req.param('key'));
    if (!def?.test) fail(404, 'NOT_FOUND', 'Bu integratsiyani tekshirib boʻlmaydi');
    await limitOr429(c.env.DB, `integration-test:${def!.key}`, 10, 3600);
    const s = await settingsMap(c.env.DB);
    if (!def!.configured(c.env, s)) fail(409, 'NOT_CONFIGURED', 'Avval sozlang');
    const kind = def!.testKind ?? 'live';
    try {
      const message = await def!.test!(c.env, s, c.env.PUBLIC_BASE_URL);
      await audit(c.env.DB, me.id, 'integration.test_ok', def!.key, { ok: true, message, kind });
      return c.json({ ok: true, message, kind });
    } catch (error) {
      const message = String(error instanceof Error ? error.message : error).replace(/[A-Za-z0-9_-]{24,}/g, '…').slice(0, 300);
      await audit(c.env.DB, me.id, 'integration.test_failed', def!.key, { ok: false, message, kind });
      return c.json({ ok: false, message, kind });
    }
  });
}
