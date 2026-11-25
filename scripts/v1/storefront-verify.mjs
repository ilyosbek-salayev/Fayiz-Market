// Fayz Market V1 storefront API verification — branding, store location, banners, routing, encrypted integration
// credentials, checkout payment/fulfilment, payment statuses, and the Payme / Click merchant endpoints.
//
// Runs against an ISOLATED local Worker with a brand-new D1 (never production). A local mock stands in for
// OpenRouteService; Payme and Click callbacks are signed here exactly as the providers sign them.
//
//   node scripts/v1/storefront-verify.mjs            (QA_WORKER_PORT / QA_MOCK_PORT override the ports)
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '../..');
const sharp = createRequire(join(root, 'package.json'))('sharp');
const WORKER_PORT = Number(process.env.QA_WORKER_PORT || 8797), MOCK_PORT = Number(process.env.QA_MOCK_PORT || 8798);
const API = `http://127.0.0.1:${WORKER_PORT}`, MOCK = `http://127.0.0.1:${MOCK_PORT}`;
const results = []; let failed = 0;
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && detail ? ' — ' + detail : ''}`); if (!ok) failed++; console.log(results.at(-1)); };

// ---------- OpenRouteService mock ----------
const ORS_KEY = 'ors-mock-key-' + randomBytes(8).toString('hex');
const orsLog = [];
const mock = createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const json = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (req.url === '/ors/v2/directions/driving-car/geojson') {
    if (req.headers.authorization !== ORS_KEY) return json(403, { error: 'Access to this API has been disallowed' });
    const body = JSON.parse(Buffer.concat(chunks)); orsLog.push(body);
    const [[a, b], [c, d]] = body.coordinates;
    return json(200, { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { summary: { distance: 2412.6, duration: 431.2 } }, geometry: { type: 'LineString', coordinates: [[a, b], [(a + c) / 2, b], [(a + c) / 2, d], [c, d]] } }] });
  }
  json(404, { error: 'unknown mock route ' + req.url });
});
await new Promise(r => mock.listen(MOCK_PORT, '127.0.0.1', r));

const dir = mkdtempSync(join(tmpdir(), 'fayz-v1-verify-'));
const envFile = join(dir, 'providers.env');
writeFileSync(envFile, `DEV_MOCK_PROVIDERS=${MOCK}\n`, { mode: 0o600 });
const MASTER = randomBytes(32).toString('base64');
const dbDir = join(dir, 'db');
const worker = spawn('bash', [join(root, 'scripts/deploy-qa/local-worker.sh'), dbDir], { env: { ...process.env, QA_PORT: String(WORKER_PORT), QA_ENV_FILE: envFile, QA_MASTER_KEY: MASTER }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
let workerLog = ''; worker.stdout.on('data', d => { workerLog += d; }); worker.stderr.on('data', d => { workerLog += d; });
const shutdown = () => { try { process.kill(-worker.pid, 'SIGTERM'); } catch { /* gone */ } mock.close(); rmSync(dir, { recursive: true, force: true }); };

async function call(path, { method = 'GET', auth, body, headers = {}, raw, type } = {}) {
  const res = await fetch(API + path, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(type ? { 'Content-Type': type } : {}), ...(auth ? { Authorization: auth } : {}), ...headers }, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
  const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, text };
}
const wait = ms => new Promise(r => setTimeout(r, ms));
const png = (w, h, color = '#FFCC29') => sharp({ create: { width: w, height: h, channels: 4, background: color } }).png().toBuffer();
const d1 = sql => JSON.parse(execFileSync('npx', ['wrangler', 'd1', 'execute', 'fayz-market', '--local', '--persist-to', dbDir, '--json', '--command', sql], { cwd: join(root, 'apps/api'), encoding: 'utf8', env: { ...process.env, CI: '1' } }))[0].results;
const md5 = s => createHash('md5').update(s).digest('hex');

try {
  let up = false;
  for (let i = 0; i < 180 && !up; i++) { try { up = (await fetch(API + '/health')).ok; } catch { await wait(500); } }
  if (!up) throw new Error('Worker did not start:\n' + workerLog.slice(-2000));
  const stamp = Date.now().toString(36);

  // ---------- Staff ----------
  let r = await call('/admin/bootstrap', { method: 'POST', headers: { 'X-Bootstrap-Secret': 'qa-bootstrap' }, body: { email: `owner-${stamp}@example.com`, password: 'OwnerPassword-123' } });
  check('bootstrap owner on a fresh database', r.status === 201, r.text);
  const owner = 'Bearer ' + (await call('/admin/login', { method: 'POST', body: { email: `owner-${stamp}@example.com`, password: 'OwnerPassword-123' } })).data.token;
  for (const role of ['manager', 'courier']) await call('/admin/users', { method: 'POST', auth: owner, body: { email: `${role}-${stamp}@example.com`, password: 'StaffPassword-123', role, name: role === 'courier' ? 'Kuryer Bir' : 'Menejer', phone: role === 'courier' ? '+998901112233' : '' } });
  const login = async email => 'Bearer ' + (await call('/admin/login', { method: 'POST', body: { email, password: 'StaffPassword-123' } })).data.token;
  const manager = await login(`manager-${stamp}@example.com`), courier = await login(`courier-${stamp}@example.com`);
  const courierId = (await call('/admin/me', { auth: courier })).data.admin.id;

  // ---------- Storefront defaults ----------
  r = await call('/storefront');
  check('storefront: built-in brand, no banners, cash + delivery only, no routing', r.status === 200 && r.data.brand.name === 'Fayz Market' && r.data.brand.logoLight === '' && !r.data.banners.length && JSON.stringify(r.data.checkout.payments.map(p => p.method)) === '["cash"]' && JSON.stringify(r.data.checkout.fulfillment) === '["delivery"]' && r.data.routing.available === false, r.text);

  // ---------- Branding ----------
  const logo = await png(256, 256);
  r = await call('/admin/branding/logo', { method: 'POST', auth: owner, type: 'image/png', raw: logo });
  const logoUrl = r.data.url;
  check('logo upload: owner, 256×256 PNG → R2 URL', r.status === 201 && /\/images\/[a-f0-9]{32}\.png$/.test(logoUrl) && r.data.width === 256, r.text);
  r = await call('/admin/branding/logo', { method: 'POST', auth: manager, type: 'image/png', raw: logo }); check('logo upload: manager → 403', r.status === 403);
  r = await call('/admin/branding/logo', { method: 'POST', auth: courier, type: 'image/png', raw: logo }); check('logo upload: courier → 403', r.status === 403);
  r = await call('/admin/branding/logo', { method: 'POST', type: 'image/png', raw: logo }); check('logo upload: anonymous → 401', r.status === 401);
  r = await call('/admin/branding/logo', { method: 'POST', auth: owner, type: 'image/svg+xml', raw: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>' }); check('logo upload: SVG refused (415)', r.status === 415);
  r = await call('/admin/branding/logo', { method: 'POST', auth: owner, type: 'image/webp', raw: logo }); check('logo upload: content not matching declared type refused', r.status === 415);
  r = await call('/admin/branding/logo', { method: 'POST', auth: owner, type: 'image/png', raw: await png(64, 64) }); check('logo upload: too small (64 px) → 422', r.status === 422);
  r = await call('/admin/branding/logo', { method: 'POST', auth: owner, type: 'image/png', raw: await png(600, 200) }); check('logo upload: wide banner-shaped image → 422', r.status === 422);
  r = await call('/admin/branding/logo', { method: 'POST', auth: owner, type: 'image/png', raw: Buffer.concat([logo, randomBytes(1_200_000)]) }); check('logo upload: over 1 MB → 413', r.status === 413);
  r = await fetch(logoUrl); check('uploaded logo is served by the Worker as image/png', r.ok && r.headers.get('content-type') === 'image/png');
  r = await call('/admin/branding', { method: 'PUT', auth: owner, body: { name: 'Fayz Market', tagline: 'Siz uchun eng yaxshisi', logoLight: logoUrl, logoDark: 'https://evil.example/logo.png' } }); check('branding: foreign logo URL refused', r.status === 400);
  r = await call('/admin/branding', { method: 'PUT', auth: manager, body: { name: 'X Market', tagline: '', logoLight: '', logoDark: '' } }); check('branding: manager cannot change brand', r.status === 403);
  r = await call('/admin/branding', { method: 'PUT', auth: owner, body: { name: 'Fayz Market', tagline: 'Siz uchun eng yaxshisi', logoLight: logoUrl, logoDark: '' } });
  check('branding: owner saves name, tagline, light logo', r.status === 200);
  r = await call('/storefront'); check('storefront: new brand without a new APK', r.data.brand.logoLight === logoUrl && r.data.brand.logoDark === '' && r.data.brand.tagline === 'Siz uchun eng yaxshisi');
  r = await call('/settings'); check('settings carry the brand keys for older clients', r.data.settings.brand_logo_light === logoUrl);
  r = await call('/admin/branding', { auth: owner }); check('branding history keeps the replaced (built-in) logo for revert', r.data.history.some(h => h.variant === 'light' && h.url === ''));
  r = await call('/admin/branding', { method: 'PUT', auth: owner, body: { name: 'Fayz Market', tagline: 'Siz uchun eng yaxshisi', logoLight: '', logoDark: '' } });
  r = await call('/storefront'); check('branding: revert to the built-in logo', r.data.brand.logoLight === '');
  r = await call('/admin/branding', { auth: owner }); check('branding history keeps the uploaded logo after revert', r.data.history.some(h => h.url === logoUrl));
  r = await call('/admin/branding', { method: 'PUT', auth: owner, body: { name: 'Fayz Market', tagline: 'Siz uchun eng yaxshisi', logoLight: logoUrl, logoDark: logoUrl } });

  // ---------- Routing before a store exists ----------
  r = await call('/store/route', { method: 'POST', body: { lat: 41.30, lng: 69.24 } }); check('store route: no store location → 409', r.status === 409 && r.data.error.code === 'STORE_LOCATION_MISSING');

  // ---------- Store location ----------
  r = await call('/admin/store', { method: 'PUT', auth: manager, body: { placeName: 'Fayz Market', address: 'Toshkent, Chilonzor 1', lat: 41.2856, lng: 69.2034 } }); check('store location: manager → 403', r.status === 403);
  r = await call('/admin/store', { method: 'PUT', auth: owner, body: { placeName: 'Fayz Market', address: 'Toshkent, Chilonzor 1', lat: 100, lng: 69.2 } }); check('store location: invalid latitude → 400', r.status === 400);
  r = await call('/admin/store', { method: 'PUT', auth: owner, body: { placeName: 'Fayz Market — Chilonzor', address: 'Toshkent sh., Chilonzor tumani, 1-mavze', lat: 41.2856, lng: 69.2034 } });
  check('store location: owner saves name, address, coordinates', r.status === 200 && r.data.store.lat === 41.2856);
  r = await call('/storefront'); check('storefront: store location visible to customers', r.data.store.configured && r.data.store.address.includes('Chilonzor') && r.data.store.name === 'Fayz Market — Chilonzor');

  // ---------- Routing ----------
  r = await call('/store/route', { method: 'POST', body: { lat: 41.3111, lng: 69.2797 } }); check('store route: no routing service → 503 (no fake line)', r.status === 503 && r.data.error.code === 'ROUTES_NOT_CONFIGURED');
  r = await call('/admin/integrations', { auth: owner });
  check('integrations: master key reported, ORS not configured', r.data.masterKey.configured === true && r.data.integrations.find(i => i.key === 'routing').status === 'not_configured');
  r = await call('/admin/integrations', { auth: manager }); check('integrations: manager → 403', r.status === 403);
  r = await call('/admin/integrations/routing/secrets', { method: 'PUT', auth: owner, body: { ORS_API_KEY: 'short' } }); check('integrations: malformed key refused', r.status === 400);
  r = await call('/admin/integrations/routing/secrets', { method: 'PUT', auth: owner, body: { PAYME_KEY: 'x'.repeat(20) } }); check('integrations: a secret of another integration refused', r.status === 400);
  r = await call('/admin/integrations/routing/secrets', { method: 'PUT', auth: manager, body: { ORS_API_KEY: ORS_KEY } }); check('integrations: manager cannot set credentials', r.status === 403);
  r = await call('/admin/integrations/routing/secrets', { method: 'PUT', auth: owner, body: { ORS_API_KEY: ORS_KEY } }); check('integrations: owner sets ORS key from the panel', r.status === 200);
  const stored = d1("SELECT name,ciphertext,iv,key_id FROM integration_secrets WHERE name='ORS_API_KEY'");
  check('integrations: D1 holds only AES-GCM ciphertext (no plaintext key)', stored.length === 1 && !stored[0].ciphertext.includes(ORS_KEY) && !Buffer.from(stored[0].ciphertext, 'base64').toString('latin1').includes(ORS_KEY) && stored[0].iv.length === 16);
  r = await call('/admin/integrations', { auth: owner });
  const routing = r.data.integrations.find(i => i.key === 'routing');
  check('integrations: panel shows only presence/source, never the value', routing.secrets[0].present && routing.secrets[0].source === 'panel' && !r.text.includes(ORS_KEY) && routing.status === 'configured');
  r = await call('/admin/integrations/routing/test', { method: 'POST', auth: owner }); check('integrations: «Ulanishni tekshirish» makes a real (mock) ORS call', r.data.ok === true && r.data.kind === 'live' && orsLog.length === 1, r.text);
  r = await call('/storefront'); check('storefront: routing available after the panel change', r.data.routing.available === true && !r.text.includes(ORS_KEY));
  r = await call('/store/route', { method: 'POST', body: { lat: 41.3111, lng: 69.2797 } });
  check('store route: real road geometry, distance and time from the provider', r.status === 200 && r.data.route.coordinates.length === 4 && r.data.route.distanceMeters === 2413 && r.data.route.provider === 'openrouteservice' && r.data.route.attribution.includes('openrouteservice'), r.text);
  check('store route: request sent customer → store as [lng,lat]', JSON.stringify(orsLog.at(-1).coordinates) === JSON.stringify([[69.2797, 41.3111], [69.2034, 41.2856]]));
  r = await call('/store/route', { method: 'POST', body: { lat: 39.65, lng: 66.96 + 10 } }); check('store route: absurdly far start → 422 (quota protected)', r.status === 422);
  r = await call('/store/route', { method: 'POST', body: { lat: 'x' } }); check('store route: invalid coordinates → 400', r.status === 400);
  r = await call('/settings'); check('public /settings never exposes credentials', !r.text.includes(ORS_KEY) && !r.text.includes('ORS_API_KEY'));

  // ---------- Banners ----------
  const bannerImage = (await call('/admin/images', { method: 'POST', auth: manager, type: 'image/png', raw: await png(1200, 500, '#1E1E1E') })).data.url;
  r = await call('/admin/banners', { method: 'POST', auth: owner, body: { title: 'Yangi aksessuarlar', subtitle: 'Haftalik chegirma 20%', ctaLabel: 'Katalog', ctaTarget: 'catalog', imageUrl: bannerImage, position: 2 } });
  const b1 = r.data.banner; check('banners: owner creates a banner with R2 image', r.status === 201 && b1.imageUrl === bannerImage);
  r = await call('/admin/banners', { method: 'POST', auth: manager, body: { title: 'Doʻkonimizga keling', subtitle: '', ctaLabel: 'Yoʻlni koʻrish', ctaTarget: 'store', position: 1 } });
  const b2 = r.data.banner; check('banners: manager creates a banner', r.status === 201);
  r = await call('/admin/banners', { method: 'POST', auth: courier, body: { title: 'X', ctaTarget: 'none' } }); check('banners: courier → 403', r.status === 403);
  r = await call('/admin/banners', { method: 'POST', body: { title: 'Anon' } }); check('banners: anonymous → 401', r.status === 401);
  r = await call('/admin/banners', { method: 'POST', auth: owner, body: { title: 'Xavfli', ctaLabel: 'Bos', ctaTarget: 'javascript:alert(1)' } }); check('banners: script link refused', r.status === 400);
  r = await call('/admin/banners', { method: 'POST', auth: owner, body: { title: 'Begona rasm', imageUrl: 'https://evil.example/x.png' } }); check('banners: foreign image URL refused', r.status === 400);
  r = await call('/admin/banners', { method: 'POST', auth: owner, body: { title: 'Tugmasiz havola', ctaTarget: 'catalog' } }); check('banners: link without button text refused', r.status === 400);
  r = await call('/storefront'); check('storefront: active banners in display order', r.data.banners.map(b => b.id).join() === `${b2.id},${b1.id}`);
  r = await call(`/admin/banners/${b2.id}`, { method: 'PUT', auth: owner, body: { title: 'Doʻkonimizga keling', subtitle: 'Chilonzor', ctaLabel: 'Yoʻlni koʻrish', ctaTarget: 'store', position: 1, active: false } });
  check('banners: update + disable', r.status === 200 && r.data.banner.active === false);
  r = await call('/storefront'); check('storefront: disabled banner hidden without a new APK', r.data.banners.length === 1 && r.data.banners[0].id === b1.id);
  r = await call(`/admin/banners/${b2.id}`, { method: 'DELETE', auth: manager }); check('banners: delete', r.status === 200);
  r = await call(`/admin/banners/${b2.id}`, { method: 'DELETE', auth: owner }); check('banners: deleting twice → 404', r.status === 404);
  r = await call('/admin/banners-default', { method: 'PUT', auth: manager, body: { title: 'Fayz Market', subtitle: 'Sifatli aksessuarlar' } });
  r = await call('/storefront'); check('banners: default hero text editable', r.data.defaultBanner.subtitle === 'Sifatli aksessuarlar');

  // ---------- Catalogue for orders ----------
  const cat = (await call('/admin/categories', { method: 'POST', auth: owner, body: { name: 'Soatlar', slug: `soat-${stamp}` } })).data.id;
  const prod = (await call('/admin/products', { method: 'POST', auth: owner, body: { name: 'Soat', slug: `soat-${stamp}`, description: '', categoryId: cat, price: 150000, stock: 100, active: true, featured: false, images: [] } })).data.id;
  const order = async (extra = {}) => { const res = await call('/orders', { method: 'POST', body: { customerName: 'Test Mijoz', phone: '+998901234567', address: 'Toshkent, Yunusobod 5', note: '', items: [{ productId: prod, quantity: 2 }], ...extra } }); return res; };
  const tokenOf = o => ({ Authorization: `Order ${o.accessToken}` });

  // ---------- Checkout options ----------
  r = await call('/admin/payment-settings', { method: 'PUT', auth: manager, body: { cash: true, cardTerminal: true, bankTransfer: false, bankTransferDetails: '', pickup: false } }); check('payment settings: manager → 403', r.status === 403);
  r = await call('/admin/payment-settings', { method: 'PUT', auth: owner, body: { cash: true, cardTerminal: true, bankTransfer: true, bankTransferDetails: '', pickup: true } }); check('payment settings: bank transfer needs details', r.status === 400);
  r = await call('/admin/payment-settings', { method: 'PUT', auth: owner, body: { cash: false, cardTerminal: false, bankTransfer: false, bankTransferDetails: '', pickup: false } }); check('payment settings: cannot switch every method off', r.status === 400);
  r = await call('/admin/payment-settings', { method: 'PUT', auth: owner, body: { cash: true, cardTerminal: true, bankTransfer: true, bankTransferDetails: 'Oluvchi: Fayz Market MChJ, Bank: Kapitalbank, H/r 20208000000000000001, MFO 01088', pickup: true } });
  check('payment settings: owner enables terminal, bank transfer, pickup', r.status === 200);
  r = await call('/storefront'); check('storefront: checkout offers the enabled methods only', JSON.stringify(r.data.checkout.payments.map(p => p.method)) === '["cash","card_terminal","bank_transfer"]' && r.data.checkout.fulfillment.includes('pickup') && r.data.checkout.bankTransferDetails.includes('Kapitalbank'));

  // ---------- Orders: cash / compatibility / tampering ----------
  r = await order(); const legacy = r.data.order;
  check('order (1.1.x client, no new fields): delivery + cash + pending', r.status === 201 && legacy.fulfillment === 'delivery' && legacy.paymentMethod === 'cash' && legacy.paymentStatus === 'pending');
  r = await order({ total: 1, price: 1, amount: 1, paymentStatus: 'paid' }); check('order: client-sent total/status ignored; server total used', r.status === 201 && r.data.order.total === 300000 && r.data.order.paymentStatus === 'pending');
  r = await order({ paymentMethod: 'payme' }); check('order: method not offered (Payme off) → 409', r.status === 409 && r.data.error.code === 'PAYMENT_METHOD_UNAVAILABLE');
  r = await order({ address: '' }); check('order: delivery without address → 400', r.status === 400);
  r = await call(`/orders/${legacy.id}`, { headers: tokenOf(legacy) }); check('customer order view: payment block (cash, pending)', r.data.order.payment.method === 'cash' && r.data.order.payment.status === 'pending' && r.data.order.fulfillment === 'delivery');
  r = await call(`/orders/${legacy.id}/payment/claim`, { method: 'POST', headers: tokenOf(legacy) }); check('cash order cannot be "claimed" as a transfer', r.status === 409);

  // ---------- Pickup ----------
  r = await order({ fulfillment: 'pickup', address: '', paymentMethod: 'card_terminal', location: { lat: 41, lng: 69 } }); const pickup = r.data.order;
  check('pickup order: no address needed; store address used; no location kept', r.status === 201 && pickup.fulfillment === 'pickup');
  r = await call(`/admin/orders/${pickup.id}`, { auth: owner }); check('pickup order in admin: store address, terminal, no map point', r.data.order.address.startsWith('Doʻkondan olib ketish: Toshkent') && r.data.order.location === null && r.data.order.paymentMethod === 'card_terminal');
  await call(`/admin/orders/${pickup.id}/status`, { method: 'PATCH', auth: owner, body: { status: 'confirmed' } });
  r = await call(`/admin/orders/${pickup.id}/assign`, { method: 'POST', auth: owner, body: { courierId } }); check('pickup order: courier cannot be assigned', r.status === 409 && r.data.error.code === 'PICKUP_ORDER');

  // ---------- Bank transfer lifecycle ----------
  r = await order({ paymentMethod: 'bank_transfer' }); const bank = r.data.order;
  r = await call(`/orders/${bank.id}`, { headers: tokenOf(bank) }); check('bank transfer: customer sees bank details and can report the transfer', r.data.order.payment.bankTransferDetails.includes('Kapitalbank') && r.data.order.payment.canClaimTransfer);
  r = await call(`/orders/${bank.id}/payment/claim`, { method: 'POST' }); check('bank transfer: claim without order token → 401', r.status === 401);
  r = await call(`/orders/${bank.id}/payment/claim`, { method: 'POST', headers: tokenOf(bank) }); check('bank transfer: claim → verifying ("Toʻlov tekshirilmoqda")', r.status === 200 && r.data.status === 'verifying');
  r = await call(`/orders/${bank.id}/payment/claim`, { method: 'POST', headers: tokenOf(bank) }); check('bank transfer: second claim → 409', r.status === 409);
  r = await call(`/admin/orders/${bank.id}/payment`, { method: 'PATCH', auth: courier, body: { from: 'verifying', status: 'failed', note: 'Pul tushmadi' } }); check('payment status: courier → 403', r.status === 403);
  r = await call(`/admin/orders/${bank.id}/payment`, { method: 'PATCH', auth: manager, body: { from: 'pending', status: 'failed', note: 'Pul tushmadi' } }); check('payment status: stale "from" → 409 (no double change)', r.status === 409);
  r = await call(`/admin/orders/${bank.id}/payment`, { method: 'PATCH', auth: manager, body: { from: 'verifying', status: 'failed', note: '' } }); check('payment status: "failed" needs a reason', r.status === 400);
  r = await call(`/admin/orders/${bank.id}/payment`, { method: 'PATCH', auth: manager, body: { from: 'verifying', status: 'failed', note: 'Pul hali tushmadi' } }); check('payment status: manager marks failed with reason', r.status === 200);
  r = await call(`/orders/${bank.id}`, { headers: tokenOf(bank) }); check('customer sees "failed" with the reason', r.data.order.payment.status === 'failed' && r.data.order.payment.note === 'Pul hali tushmadi');
  await call(`/orders/${bank.id}/payment/claim`, { method: 'POST', headers: tokenOf(bank) });
  r = await call(`/admin/orders/${bank.id}/payments`, { method: 'POST', auth: manager, body: { amount: 100000, method: 'bank_transfer', reference: 'PP-778' } });
  r = await call(`/admin/orders/${bank.id}`, { auth: owner }); check('partial payment keeps the order unpaid', r.data.order.paymentStatus === 'verifying' && r.data.payments.length === 1);
  r = await call(`/admin/orders/${bank.id}/payments`, { method: 'POST', auth: manager, body: { amount: 200000, method: 'bank_transfer', reference: 'PP-778' } }); check('duplicate transaction reference refused', r.status === 409 && r.data.error.code === 'DUPLICATE_PAYMENT');
  r = await call(`/admin/orders/${bank.id}/payments`, { method: 'POST', auth: manager, body: { amount: 250000, method: 'bank_transfer', reference: 'PP-779' } }); check('overpayment refused', r.status === 409 && r.data.error.code === 'OVERPAYMENT');
  r = await call(`/admin/orders/${bank.id}/payments`, { method: 'POST', auth: manager, body: { amount: 200000, method: 'bank_transfer', reference: 'PP-779' } }); check('remaining amount recorded', r.status === 201);
  r = await call(`/admin/orders/${bank.id}`, { auth: owner }); check('ledger covers total → "paid" with date', r.data.order.paymentStatus === 'paid' && !!r.data.order.paidAt);
  r = await call(`/admin/orders/${bank.id}/payments`, { method: 'POST', auth: manager, body: { amount: 1, method: 'cash' } }); check('paid order takes no more payments', r.status === 409);
  r = await call(`/admin/orders/${bank.id}/status`, { method: 'PATCH', auth: owner, body: { status: 'cancelled' } }); check('paid order cannot be cancelled', r.status === 409);
  r = await call(`/admin/orders/${bank.id}/refund`, { method: 'POST', auth: manager, body: { reason: 'Mijoz qaytardi' } }); check('refund: manager → 403', r.status === 403);
  r = await call(`/admin/orders/${bank.id}/refund`, { method: 'POST', auth: owner, body: { reason: 'Mahsulot qaytarildi, pul naqd berildi' } }); check('refund: owner records a refund', r.status === 200);
  r = await call(`/admin/orders/${bank.id}/refund`, { method: 'POST', auth: owner, body: { reason: 'Yana bir marta' } }); check('refund: second refund refused', r.status === 409);
  r = await call(`/admin/orders/${legacy.id}/status`, { method: 'PATCH', auth: owner, body: { status: 'cancelled' } });
  r = await call(`/admin/orders/${legacy.id}`, { auth: owner }); check('cancelling an unpaid order cancels its payment', r.data.order.paymentStatus === 'cancelled');
  r = await call(`/admin/orders/${legacy.id}/payment`, { method: 'PATCH', auth: owner, body: { from: 'cancelled', status: 'pending', note: '' } }); check('cancelled payment cannot be reopened', r.status === 400 || r.status === 409);
  r = await call('/admin/orders?payment=verifying', { auth: owner }); check('admin orders filter by payment status', r.status === 200 && Array.isArray(r.data.orders));

  // ---------- Payme ----------
  const PAYME_TEST = 'payme-test-key-' + randomBytes(6).toString('hex'), MERCHANT = randomBytes(12).toString('hex');
  r = await call('/admin/integrations/payme', { method: 'PUT', auth: owner, body: { enabled: true } }); check('Payme cannot be switched on before it is configured', r.status === 409);
  r = await call('/admin/integrations/payme', { method: 'PUT', auth: owner, body: { payme_merchant_id: 'bad' } }); check('Payme merchant ID validated', r.status === 400);
  await call('/admin/integrations/payme', { method: 'PUT', auth: owner, body: { payme_merchant_id: MERCHANT, payme_mode: 'test' } });
  await call('/admin/integrations/payme/secrets', { method: 'PUT', auth: owner, body: { PAYME_TEST_KEY: PAYME_TEST } });
  r = await call('/storefront'); check('Payme configured but not switched on → not offered', !r.data.checkout.payments.some(p => p.method === 'payme'));
  r = await call('/admin/integrations/payme', { method: 'PUT', auth: owner, body: { enabled: true } }); check('Payme switched on', r.status === 200);
  r = await call('/storefront'); check('storefront: Payme offered (online)', r.data.checkout.payments.some(p => p.method === 'payme' && p.online));
  r = await call('/admin/integrations/payme/test', { method: 'POST', auth: owner }); check('Payme self-test: endpoint + stored key, labelled internal', r.data.ok === true && r.data.kind === 'internal', r.text);
  r = await order({ paymentMethod: 'payme' }); const pm = r.data.order;
  r = await call(`/orders/${pm.id}/payment/link`, { headers: tokenOf(pm) });
  const decoded = Buffer.from(r.data.url.split('/').pop(), 'base64').toString();
  check('Payme checkout link: sandbox host, merchant, order id, amount in tiyin from the server', r.data.url.startsWith('https://test.paycom.uz/') && decoded === `m=${MERCHANT};ac.order_id=${pm.id};a=30000000;l=uz`, decoded);
  const payme = (method, params, key = PAYME_TEST) => call('/payments/payme', { method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(`Paycom:${key}`).toString('base64') }, body: { jsonrpc: '2.0', id: 7, method, params } });
  r = await payme('CheckPerformTransaction', { amount: 30000000, account: { order_id: String(pm.id) } }, 'wrong'); check('Payme: wrong key → -32504', r.data.error?.code === -32504);
  r = await payme('CheckPerformTransaction', { amount: 100, account: { order_id: String(pm.id) } }); check('Payme: wrong amount → -31001', r.data.error?.code === -31001);
  r = await payme('CheckPerformTransaction', { amount: 30000000, account: { order_id: '999999' } }); check('Payme: unknown order → -31050', r.data.error?.code === -31050);
  r = await payme('CheckPerformTransaction', { amount: 30000000, account: { order_id: String(legacy.id) } }); check('Payme: a cash order cannot be paid via Payme', r.data.error?.code === -31050);
  r = await payme('CheckPerformTransaction', { amount: 30000000, account: { order_id: String(pm.id) } }); check('Payme: CheckPerformTransaction allow', r.data.result?.allow === true);
  const t1 = 'pm-' + randomBytes(8).toString('hex');
  r = await payme('CreateTransaction', { id: t1, time: Date.now(), amount: 30000000, account: { order_id: String(pm.id) } }); const created = r.data.result;
  check('Payme: CreateTransaction → state 1', created?.state === 1, r.text);
  r = await payme('CreateTransaction', { id: t1, time: Date.now(), amount: 30000000, account: { order_id: String(pm.id) } }); check('Payme: CreateTransaction is idempotent', r.data.result?.transaction === created.transaction && r.data.result?.create_time === created.create_time);
  r = await payme('CreateTransaction', { id: 'pm-other', time: Date.now(), amount: 30000000, account: { order_id: String(pm.id) } }); check('Payme: second transaction for the same order → -31051', r.data.error?.code === -31051);
  r = await call(`/admin/orders/${pm.id}`, { auth: owner }); check('Payme: order shows "verifying" while the bank works', r.data.order.paymentStatus === 'verifying' && r.data.transactions[0].state === 'created');
  r = await payme('PerformTransaction', { id: t1 }); const performed = r.data.result; check('Payme: PerformTransaction → state 2', performed?.state === 2);
  r = await payme('PerformTransaction', { id: t1 }); check('Payme: PerformTransaction is idempotent (no double payment)', r.data.result?.perform_time === performed.perform_time);
  r = await call(`/admin/orders/${pm.id}`, { auth: owner }); check('Payme: order paid only after provider perform', r.data.order.paymentStatus === 'paid' && r.data.transactions[0].providerTxnId === t1);
  r = await call(`/admin/orders/${pm.id}/refund`, { method: 'POST', auth: owner, body: { reason: 'Qoʻlda qaytarish urinish' } }); check('Payme-paid order: manual refund refused (provider cabinet)', r.status === 409 && r.data.error.code === 'ONLINE_REFUND');
  r = await payme('CheckTransaction', { id: t1 }); check('Payme: CheckTransaction → state 2', r.data.result?.state === 2 && r.data.result.cancel_time === 0);
  r = await payme('GetStatement', { from: 0, to: Date.now() + 1000 }); check('Payme: GetStatement lists the transaction in tiyin', r.data.result?.transactions?.some(t => t.id === t1 && t.amount === 30000000 && t.account.order_id === String(pm.id)));
  r = await payme('CancelTransaction', { id: t1, reason: 5 }); check('Payme: cancel after perform → state -2 (refund)', r.data.result?.state === -2);
  r = await call(`/admin/orders/${pm.id}`, { auth: owner }); check('Payme refund reflected on the order', r.data.order.paymentStatus === 'refunded');
  r = await order({ paymentMethod: 'payme' }); const pm2 = r.data.order;
  const t2 = 'pm-' + randomBytes(8).toString('hex');
  await payme('CreateTransaction', { id: t2, time: Date.now(), amount: 30000000, account: { order_id: String(pm2.id) } });
  r = await payme('CancelTransaction', { id: t2, reason: 3 }); check('Payme: cancel before perform → state -1', r.data.result?.state === -1);
  r = await payme('PerformTransaction', { id: t2 }); check('Payme: perform after cancel → -31008', r.data.error?.code === -31008);
  r = await call(`/orders/${pm2.id}`, { headers: tokenOf(pm2) }); check('customer sees failed Payme payment and can retry', r.data.order.payment.status === 'failed' && r.data.order.payment.canPayOnline);
  r = await payme('PerformTransaction', { id: 'does-not-exist' }); check('Payme: unknown transaction → -31003', r.data.error?.code === -31003);
  r = await payme('NoSuchMethod', {}); check('Payme: unknown method → -32601', r.data.error?.code === -32601);

  // ---------- Click ----------
  const CLICK_KEY = 'click-secret-' + randomBytes(6).toString('hex');
  await call('/admin/integrations/click', { method: 'PUT', auth: owner, body: { click_service_id: '4321', click_merchant_id: '8765' } });
  await call('/admin/integrations/click/secrets', { method: 'PUT', auth: owner, body: { CLICK_SECRET_KEY: CLICK_KEY } });
  r = await call('/admin/integrations/click', { method: 'PUT', auth: owner, body: { enabled: true } }); check('Click switched on after configuration', r.status === 200);
  r = await call('/admin/integrations/click/test', { method: 'POST', auth: owner }); check('Click self-test: signature check works (internal)', r.data.ok === true && r.data.kind === 'internal', r.text);
  r = await order({ paymentMethod: 'click' }); const ck = r.data.order;
  r = await call(`/orders/${ck.id}/payment/link`, { headers: tokenOf(ck) }); check('Click checkout link carries server amount and order id', r.data.url.startsWith('https://my.click.uz/services/pay?') && r.data.url.includes('amount=300000') && r.data.url.includes(`transaction_param=${ck.id}`));
  const clickCall = async (path, fields, key = CLICK_KEY) => {
    const f = { click_paydoc_id: '55', error: '0', error_note: 'Success', sign_time: '2026-11-25 10:00:00', ...fields };
    f.sign_string = md5(`${f.click_trans_id}${f.service_id}${key}${f.merchant_trans_id}${f.action === '1' ? f.merchant_prepare_id : ''}${f.amount}${f.action}${f.sign_time}`);
    return call(path, { method: 'POST', type: 'application/x-www-form-urlencoded', raw: new URLSearchParams(f).toString() });
  };
  const prep = { click_trans_id: '9001', service_id: '4321', merchant_trans_id: String(ck.id), amount: '300000.00', action: '0' };
  r = await clickCall('/payments/click/prepare', prep, 'forged'); check('Click: forged signature → -1', r.data.error === -1);
  r = await clickCall('/payments/click/prepare', { ...prep, amount: '1000.00' }); check('Click: wrong amount → -2', r.data.error === -2);
  r = await clickCall('/payments/click/prepare', { ...prep, merchant_trans_id: '999999' }); check('Click: unknown order → -5', r.data.error === -5);
  r = await clickCall('/payments/click/prepare', prep); const prepareId = r.data.merchant_prepare_id; check('Click: prepare → merchant_prepare_id', r.data.error === 0 && prepareId > 0, r.text);
  r = await call(`/orders/${ck.id}`, { headers: tokenOf(ck) }); check('Click: customer sees "verifying" after prepare', r.data.order.payment.status === 'verifying');
  r = await clickCall('/payments/click/complete', { ...prep, action: '1', merchant_prepare_id: String(prepareId) }); check('Click: complete → confirm id', r.data.error === 0 && r.data.merchant_confirm_id === prepareId, r.text);
  r = await clickCall('/payments/click/complete', { ...prep, action: '1', merchant_prepare_id: String(prepareId) }); check('Click: second complete → -4 (no double payment)', r.data.error === -4);
  r = await call(`/admin/orders/${ck.id}`, { auth: owner }); check('Click: order paid after signed complete', r.data.order.paymentStatus === 'paid');
  r = await order({ paymentMethod: 'click' }); const ck2 = r.data.order;
  const prep2 = { click_trans_id: '9002', service_id: '4321', merchant_trans_id: String(ck2.id), amount: '300000', action: '0' };
  r = await clickCall('/payments/click/prepare', prep2); const prep2Id = r.data.merchant_prepare_id;
  r = await clickCall('/payments/click/complete', { ...prep2, action: '1', merchant_prepare_id: String(prep2Id), error: '-5017', error_note: 'Insufficient funds' }); check('Click: provider failure → -9, order not paid', r.data.error === -9);
  r = await call(`/admin/orders/${ck2.id}`, { auth: owner }); check('Click failure recorded as "failed" with reason', r.data.order.paymentStatus === 'failed' && r.data.order.paymentNote.includes('Click'));

  // ---------- Reports ----------
  r = await call('/admin/reports/summary', { auth: owner });
  check('summary: received = ledger (minus refunded) + provider-performed', r.data.payments.received_total === 300000 + 0, JSON.stringify(r.data.payments));

  // ---------- Secret removal ----------
  r = await call('/admin/integrations/routing/secrets/ORS_API_KEY', { method: 'DELETE', auth: owner }); check('integrations: owner removes a panel credential', r.status === 200);
  r = await call('/storefront'); check('removed credential stops the service at once', r.data.routing.available === false);
  r = await call('/admin/audit', { auth: owner });
  check('audit log: credential changes recorded by name only', r.data.entries.some(e => e.action === 'integration.secret_set') && !r.text.includes(ORS_KEY) && !r.text.includes(PAYME_TEST) && !r.text.includes(CLICK_KEY));
} catch (error) {
  check('verification script completed', false, String(error?.stack || error));
} finally {
  shutdown();
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exitCode = failed ? 1 : 0;
}
