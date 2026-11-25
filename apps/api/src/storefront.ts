// Storefront configuration the owner manages without a new APK: brand (name, tagline, light/dark logo), store
// location, home-screen banners, and the customer's route to the store. Logos and banner images live in R2.
import { z } from 'zod';
import type { App, Bindings } from './lib';
import { audit, clientIp, coordinates, fail, haversine, idFrom, imageInfo, limitOr429, ownImageUrl, ownerOnly, parse, putSettings, settingsMap, staffOnly, storeLocation } from './lib';
import { checkoutOptions } from './payments';
import { computeRoute, routingProvider } from './routing';

const LOGO_MAX_BYTES = 1_000_000;
const BANNER_LIMIT = 20;
export const ctaTarget = z.string().trim().regex(/^(none|catalog|store|category:[a-z0-9]+(?:-[a-z0-9]+)*|product:[a-z0-9]+(?:-[a-z0-9]+)*)$/, 'Banner havolasi notoʻgʻri').max(200);
type BannerRow = { id: number; title: string; subtitle: string; cta_label: string; cta_target: string; image_url: string; tone: string; active: number; position: number; updated_at: string };
const bannerView = (b: BannerRow) => ({ id: b.id, title: b.title, subtitle: b.subtitle, ctaLabel: b.cta_label, ctaTarget: b.cta_target, imageUrl: b.image_url, tone: b.tone, active: !!b.active, position: b.position, updatedAt: b.updated_at });

export function brandView(s: Record<string, string>) {
  return { name: s.store_name || 'Fayz Market', tagline: s.brand_tagline ?? 'Aksessuarlar doʻkoni', logoLight: s.brand_logo_light || '', logoDark: s.brand_logo_dark || '' };
}
async function liveBanners(db: D1Database) {
  try { return (await db.prepare('SELECT * FROM banners WHERE active=1 ORDER BY position, id LIMIT 8').all<BannerRow>()).results.map(bannerView); }
  catch { return []; } // table not migrated yet
}

export function registerStorefront(app: App) {
  // ---------- Public ----------
  /** Everything the customer home screen needs in one request (cached by the app for offline start). */
  app.get('/storefront', async c => {
    const s = await settingsMap(c.env.DB);
    const store = await storeLocation(c.env.DB);
    return c.json({
      brand: brandView(s),
      store: { name: store.name, address: store.address, lat: store.lat, lng: store.lng, configured: store.lat != null && store.lng != null, phone: s.contact_phone || '' },
      banners: await liveBanners(c.env.DB),
      defaultBanner: { title: s.banner_title || 'Fayz Market', subtitle: s.banner_subtitle || '' },
      checkout: checkoutOptions(c.env, s, store),
      routing: { available: !!routingProvider(c.env) },
    });
  });

  /** Real road route from the customer to the store (or 503 when no routing service is connected). */
  app.post('/store/route', async c => {
    const from = await parse(c, coordinates);
    const store = await storeLocation(c.env.DB);
    if (store.lat == null || store.lng == null) fail(409, 'STORE_LOCATION_MISSING', 'Doʻkon manzili hali kiritilmagan');
    const to = { lat: store.lat!, lng: store.lng! };
    if (haversine(from, to) > 300_000) fail(422, 'TOO_FAR', 'Doʻkon juda uzoqda — navigatsiya ilovasidan foydalaning');
    if (!routingProvider(c.env)) fail(503, 'ROUTES_NOT_CONFIGURED', 'Marshrut xizmati hali ulanmagan — navigatsiya ilovasidan foydalaning');
    await limitOr429(c.env.DB, `store-route:${clientIp(c)}`, 30, 3600, 'Marshrut soʻrovlari koʻp. Birozdan keyin urinib koʻring.');
    await limitOr429(c.env.DB, 'store-route:all', 1500, 86400, 'Bugungi marshrut limiti tugadi — navigatsiya ilovasidan foydalaning');
    const route = await computeRoute(c.env, from, to);
    return c.json({ route, store: { ...store, lat: to.lat, lng: to.lng } });
  });

  // ---------- Brand (owner) ----------
  app.get('/admin/branding', async c => {
    staffOnly(c);
    const s = await settingsMap(c.env.DB);
    const history = (await c.env.DB.prepare('SELECT id,variant,url,created_at AS createdAt FROM brand_logo_history ORDER BY id DESC LIMIT 20').all()).results;
    return c.json({ brand: brandView(s), history });
  });
  app.put('/admin/branding', async c => {
    ownerOnly(c);
    const me = c.get('admin');
    const input = await parse(c, z.object({ name: z.string().trim().min(2).max(60), tagline: z.string().trim().max(80), logoLight: ownImageUrl(c.env), logoDark: ownImageUrl(c.env) }).strict());
    const s = await settingsMap(c.env.DB);
    const statements = putSettings(c.env.DB, [['store_name', input.name], ['brand_tagline', input.tagline], ['brand_logo_light', input.logoLight], ['brand_logo_dark', input.logoDark]]);
    // The replaced logo is kept so the owner can return to it ('' = the logo built into the apps).
    for (const [variant, key, next] of [['light', 'brand_logo_light', input.logoLight], ['dark', 'brand_logo_dark', input.logoDark]] as const) {
      if ((s[key] || '') !== next) statements.push(c.env.DB.prepare('INSERT INTO brand_logo_history(variant,url,replaced_by) VALUES(?,?,?)').bind(variant, s[key] || '', me.id));
    }
    await c.env.DB.batch(statements);
    await audit(c.env.DB, me.id, 'brand.update', 'brand', { name: input.name, tagline: input.tagline, logoLight: input.logoLight || 'built-in', logoDark: input.logoDark || 'built-in' });
    return c.json({ ok: true, brand: brandView({ ...s, store_name: input.name, brand_tagline: input.tagline, brand_logo_light: input.logoLight, brand_logo_dark: input.logoDark }) });
  });
  /** Logo upload: PNG, WebP or JPEG only (no SVG — it can carry scripts), ≤ 1 MB, 128–2048 px, roughly square. */
  app.post('/admin/branding/logo', async c => {
    ownerOnly(c);
    const type = c.req.header('Content-Type') || '';
    const ext = ({ 'image/png': 'png', 'image/webp': 'webp', 'image/jpeg': 'jpg' } as Record<string, string>)[type];
    if (!ext) fail(415, 'INVALID_IMAGE_TYPE', 'Logo PNG, WebP yoki JPEG boʻlishi kerak (SVG qabul qilinmaydi)');
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (bytes.byteLength < 64 || bytes.byteLength > LOGO_MAX_BYTES) fail(413, 'INVALID_IMAGE_SIZE', 'Logo hajmi 1 MB dan oshmasin');
    const info = imageInfo(bytes);
    if (!info || info.type !== ext) fail(415, 'INVALID_IMAGE', 'Fayl tarkibi tanlangan rasm turiga mos emas');
    if (info!.width < 128 || info!.height < 128 || info!.width > 2048 || info!.height > 2048) fail(422, 'INVALID_DIMENSIONS', 'Logo oʻlchami 128–2048 px oraligʻida boʻlishi kerak');
    const ratio = info!.width / info!.height;
    if (ratio < 0.8 || ratio > 1.25) fail(422, 'INVALID_ASPECT', 'Logo kvadratga yaqin boʻlishi kerak (ilova belgisi sifatida ishlatiladi)');
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const key = `${Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, '0')).join('').slice(0, 32)}.${ext}`;
    await c.env.IMAGES.put(key, bytes, { httpMetadata: { contentType: type } });
    await audit(c.env.DB, c.get('admin').id, 'brand.logo_upload', key, { width: info!.width, height: info!.height, bytes: bytes.byteLength });
    return c.json({ url: `${c.env.PUBLIC_BASE_URL}/images/${key}`, width: info!.width, height: info!.height }, 201);
  });

  // ---------- Store location (owner) ----------
  app.put('/admin/store', async c => {
    ownerOnly(c);
    const input = await parse(c, z.object({ placeName: z.string().trim().max(80), address: z.string().trim().min(5, 'Toʻliq manzilni kiriting').max(300), lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).strict());
    if (input.lat === 0 && input.lng === 0) fail(400, 'INVALID_COORDINATE', 'Koordinata notoʻgʻri');
    await c.env.DB.batch(putSettings(c.env.DB, [['store_place_name', input.placeName], ['store_address', input.address], ['store_lat', input.lat.toFixed(6)], ['store_lng', input.lng.toFixed(6)]]));
    await audit(c.env.DB, c.get('admin').id, 'store.location', 'store', { ...input });
    return c.json({ ok: true, store: await storeLocation(c.env.DB) });
  });

  // ---------- Banners (owner and admin) ----------
  const bannerInput = (env: Bindings) => z.object({
    title: z.string().trim().min(2, 'Sarlavha kamida 2 ta belgi').max(80), subtitle: z.string().trim().max(160).default(''),
    ctaLabel: z.string().trim().max(24).default(''), ctaTarget: ctaTarget.default('none'), imageUrl: ownImageUrl(env).default(''),
    tone: z.enum(['accent', 'dark', 'light']).default('accent'), active: z.boolean().default(true), position: z.number().int().min(0).max(999).default(0),
  }).strict().refine(b => b.ctaTarget === 'none' || b.ctaLabel.length >= 2, { message: 'Tugma matnini kiriting', path: ['ctaLabel'] });
  app.get('/admin/banners', async c => {
    staffOnly(c);
    const rows = (await c.env.DB.prepare('SELECT * FROM banners ORDER BY active DESC, position, id').all<BannerRow>()).results;
    return c.json({ banners: rows.map(bannerView) });
  });
  app.post('/admin/banners', async c => {
    staffOnly(c);
    const input = await parse(c, bannerInput(c.env));
    const count = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM banners').first<{ n: number }>();
    if ((count?.n || 0) >= BANNER_LIMIT) fail(409, 'TOO_MANY_BANNERS', `Eng koʻpi ${BANNER_LIMIT} ta banner. Keraksizini oʻchiring.`);
    const me = c.get('admin');
    const row = await c.env.DB.prepare('INSERT INTO banners(title,subtitle,cta_label,cta_target,image_url,tone,active,position,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?) RETURNING *')
      .bind(input.title, input.subtitle, input.ctaLabel, input.ctaTarget, input.imageUrl, input.tone, Number(input.active), input.position, me.id, me.id).first<BannerRow>();
    await audit(c.env.DB, me.id, 'banner.create', `banner:${row!.id}`, { title: input.title, active: input.active });
    return c.json({ banner: bannerView(row!) }, 201);
  });
  app.put('/admin/banners/:id', async c => {
    staffOnly(c);
    const id = idFrom(c.req.param('id')), input = await parse(c, bannerInput(c.env)), me = c.get('admin');
    const row = await c.env.DB.prepare('UPDATE banners SET title=?,subtitle=?,cta_label=?,cta_target=?,image_url=?,tone=?,active=?,position=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=? RETURNING *')
      .bind(input.title, input.subtitle, input.ctaLabel, input.ctaTarget, input.imageUrl, input.tone, Number(input.active), input.position, me.id, id).first<BannerRow>();
    if (!row) fail(404, 'NOT_FOUND', 'Banner topilmadi');
    await audit(c.env.DB, me.id, 'banner.update', `banner:${id}`, { title: input.title, active: input.active });
    return c.json({ banner: bannerView(row!) });
  });
  app.delete('/admin/banners/:id', async c => {
    staffOnly(c);
    const id = idFrom(c.req.param('id'));
    const res = await c.env.DB.prepare('DELETE FROM banners WHERE id=?').bind(id).run();
    if (!res.meta.changes) fail(404, 'NOT_FOUND', 'Banner topilmadi');
    await audit(c.env.DB, c.get('admin').id, 'banner.delete', `banner:${id}`);
    return c.json({ ok: true });
  });
  /** Text of the built-in hero shown when no banner is active. */
  app.put('/admin/banners-default', async c => {
    staffOnly(c);
    const input = await parse(c, z.object({ title: z.string().trim().max(120), subtitle: z.string().trim().max(200) }).strict());
    await c.env.DB.batch(putSettings(c.env.DB, [['banner_title', input.title], ['banner_subtitle', input.subtitle]]));
    await audit(c.env.DB, c.get('admin').id, 'banner.default', 'banner:default', input);
    return c.json({ ok: true });
  });
}
