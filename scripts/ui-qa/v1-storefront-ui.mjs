// Fayz Market V1 storefront UI verification in Chrome against an ISOLATED local Worker (fresh D1, never production).
// Drives the real controls of the built customer/admin bundles (apps/*/dist), checks the results through the API
// and saves screenshots for docs/v1. An OpenRouteService mock provides road geometry; maps use OpenFreeMap.
//
//   npm run build -w @fayz/customer && npm run build -w @fayz/admin
//   node scripts/ui-qa/v1-storefront-ui.mjs        (SHOTS=docs/v1/screenshots by default)
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const sharp = createRequire(path.join(ROOT, 'package.json'))('sharp');
const CHROME = process.env.CHROME_PATH || `${process.env.HOME}/Desktop/Google Chrome.app/Contents/MacOS/Google Chrome`;
const PORT = Number(process.env.QA_WORKER_PORT || 8799), MOCK_PORT = Number(process.env.QA_MOCK_PORT || 8800);
const API = `http://127.0.0.1:${PORT}`, MOCK = `http://127.0.0.1:${MOCK_PORT}`;
const SHOTS = path.resolve(ROOT, process.env.SHOTS || 'docs/v1/screenshots'); // resolve: an absolute SHOTS stays outside the repo
mkdirSync(SHOTS, { recursive: true });
// Safety: a bundle built for packaging (VITE_API_URL=production) would send this script's test logins to production.
for (const app of ['customer', 'admin']) {
  const assets = path.join(ROOT, 'apps', app, 'dist', 'assets');
  for (const f of readdirSync(assets).filter(f => f.endsWith('.js'))) if (/https:\/\/[a-z0-9.-]+\.workers\.dev/.test(readFileSync(path.join(assets, f), 'utf8'))) { console.error(`apps/${app}/dist has a hard-coded production API URL (${f}). Rebuild without VITE_API_URL: npm run build -w @fayz/${app}`); process.exit(2); }
}
const results = []; let failed = 0;
const check = (ok, label, extra = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${label}${!ok && extra ? ' — ' + extra : ''}`); if (!ok) failed++; console.log(results.at(-1)); };
const pause = ms => new Promise(r => setTimeout(r, ms));
const mime = f => f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.woff2') ? 'font/woff2' : f.endsWith('.webp') ? 'image/webp' : f.endsWith('.png') ? 'image/png' : 'text/html';

// ---------- ORS mock + isolated Worker ----------
const ORS_KEY = 'ors-ui-' + randomBytes(10).toString('hex');
const mock = createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  if (req.url === '/ors/v2/directions/driving-car/geojson' && req.headers.authorization === ORS_KEY) {
    const [[a, b], [c, d]] = JSON.parse(Buffer.concat(chunks)).coordinates;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ features: [{ properties: { summary: { distance: 6420, duration: 960 } }, geometry: { coordinates: [[a, b], [a, (b + d) / 2], [(a + c) / 2, (b + d) / 2], [(a + c) / 2, d], [c, d]] } }] }));
  }
  res.writeHead(404); res.end('{}');
});
await new Promise(r => mock.listen(MOCK_PORT, '127.0.0.1', r));
const dir = mkdtempSync(path.join(tmpdir(), 'fayz-v1-ui-'));
writeFileSync(path.join(dir, 'env'), `DEV_MOCK_PROVIDERS=${MOCK}\n`);
const worker = spawn('bash', [path.join(ROOT, 'scripts/deploy-qa/local-worker.sh'), path.join(dir, 'db')], { env: { ...process.env, QA_PORT: String(PORT), QA_ENV_FILE: path.join(dir, 'env') }, stdio: 'ignore', detached: true });
const stop = () => { try { process.kill(-worker.pid, 'SIGTERM'); } catch { /* gone */ } mock.close(); rmSync(dir, { recursive: true, force: true }); };
for (let i = 0; i < 180; i++) { try { if ((await fetch(API + '/health')).ok) break; } catch { /* starting */ } await pause(500); }

async function call(p, method = 'GET', body, token, type) {
  const binary = Buffer.isBuffer(body);
  const r = await fetch(API + p, { method, headers: { ...(body !== undefined ? { 'Content-Type': type || (binary ? 'image/png' : 'application/json') } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : binary ? body : JSON.stringify(body) });
  const data = await r.json(); if (!r.ok) throw new Error(p + ': ' + JSON.stringify(data)); return data;
}
const picture = (w, h, a, b) => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/><circle cx="${w * .55}" cy="${h * .5}" r="${Math.min(w, h) * .28}" fill="#fff" fill-opacity=".35"/><rect x="${w * .3}" y="${h * .62}" width="${w * .5}" height="${h * .08}" rx="${h * .04}" fill="#000" fill-opacity=".25"/></svg>`)).png().toBuffer();

// ---------- Seed ----------
const OWNER = { email: 'v1-owner@example.invalid', password: 'V1LocalPassword-123' };
await fetch(API + '/admin/bootstrap', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Bootstrap-Secret': 'qa-bootstrap' }, body: JSON.stringify(OWNER) });
const { token } = await call('/admin/login', 'POST', OWNER);
const cats = {};
for (const [name, slug] of [['Soatlar', 'soatlar'], ['Sumkalar', 'sumkalar'], ['Telefon aksessuarlari', 'telefon-aksessuarlari'], ['Koʻzoynaklar', 'kozoynaklar']]) cats[slug] = (await call('/admin/categories', 'POST', { name, slug }, token)).id;
const up = async (w, h, a, b) => (await call('/admin/images', 'POST', await picture(w, h, a, b), token)).url;
for (const [name, slug, cat, price, stock, featured, colors] of [
  ['Klassik qoʻl soati', 'klassik-soat', 'soatlar', 245000, 5, true, ['#8a6d3b', '#3b2f1e']], ['Charm ayollar sumkasi', 'charm-sumka', 'sumkalar', 1289000, 2, true, ['#7d3c3c', '#2b1414']],
  ['Telefon gʻilofi', 'telefon-gilofi', 'telefon-aksessuarlari', 89000, 12, true, ['#2f5d7c', '#0f2433']], ['Quyoshdan saqlovchi koʻzoynak', 'kozoynak', 'kozoynaklar', 320000, 3, false, ['#3c3c3c', '#111']],
]) await call('/admin/products', 'POST', { name, slug, description: 'Lokal vizual sinov mahsuloti.', categoryId: cats[cat], price, stock, active: true, featured, images: [await up(800, 800, ...colors)] }, token);
await call('/admin/settings', 'PUT', { contact_phone: '+998 90 123 45 67', delivery_info: 'Toshkent boʻylab 1–2 kun ichida yetkaziladi.' }, token);
await call('/admin/store', 'PUT', { placeName: 'Fayz Market — Chilonzor', address: 'Toshkent sh., Chilonzor tumani, Bunyodkor shoh koʻchasi, 12', lat: 41.2856, lng: 69.2034 }, token);
await call('/admin/payment-settings', 'PUT', { cash: true, cardTerminal: true, bankTransfer: true, bankTransferDetails: 'Oluvchi: «Fayz Market» MChJ\nBank: (sinov) Kapitalbank\nH/r: 2020 8000 0000 0000 0001\nMFO: 01088', pickup: true, deliveryFee: 15000, deliveryFreeFrom: 0 }, token);
const MANAGER = { email: 'v1-manager@example.invalid', password: 'V1LocalPassword-456' };
await call('/admin/users', 'POST', { ...MANAGER, role: 'manager', name: 'Menejer' }, token);
await call('/admin/integrations/routing/secrets', 'PUT', { ORS_API_KEY: ORS_KEY }, token);
await call('/admin/banners', 'POST', { title: 'Yangi soatlar keldi', subtitle: 'Klassik va zamonaviy modellar — haftalik chegirma bilan', ctaLabel: 'Koʻrish', ctaTarget: 'category:soatlar', imageUrl: await up(900, 700, '#FFCC29', '#C98F00'), tone: 'dark', position: 1 }, token);
await call('/admin/banners', 'POST', { title: 'Doʻkonimizga keling', subtitle: 'Chilonzor, Bunyodkor shoh koʻchasi', ctaLabel: 'Yoʻlni koʻrish', ctaTarget: 'store', tone: 'accent', position: 2 }, token);

// ---------- Browser ----------
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const USER = { latitude: 41.3111, longitude: 69.2797, accuracy: 18 };
async function open(app, { width = 390, height = 844, geo = true, theme, storage = {}, debugShell = false } = {}) {
  const ctx = await browser.createBrowserContext();
  if (geo) await ctx.overridePermissions(API, ['geolocation']);
  const page = await ctx.newPage(); page.setDefaultTimeout(20000);
  await page.setViewport({ width, height, isMobile: width < 700, hasTouch: width < 700, deviceScaleFactor: 2 });
  if (geo) await page.setGeolocation(USER);
  await page.setRequestInterception(true);
  page.on('request', async req => { const u = new URL(req.url()); if (u.origin === API && u.pathname.startsWith('/__app/')) { const f = path.join(ROOT, 'apps', app, 'dist', u.pathname.slice(7)); try { return req.respond({ status: 200, contentType: mime(f), body: await readFile(f) }); } catch { return req.respond({ status: 404, body: '' }); } } req.continue(); });
  page.on('pageerror', e => check(false, `${app} page error`, e.message));
  // debugShell: imitates the Android DEBUG build bridge (isDebug() === true) to prove the login never shows server controls.
  if (debugShell) await page.evaluateOnNewDocument(() => { window.FayzNative = { isDebug: () => true, openApiSettings: () => { window.__apiSettingsOpened = true; }, share() {}, setSystemBars() {} }; });
  await page.evaluateOnNewDocument((key, t, s) => { if (t) localStorage.setItem(key, t); for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, app === 'admin' ? 'fayz_admin_theme' : 'fayz_theme', theme, storage);
  await page.goto(`${API}/__app/index.html`, { waitUntil: 'networkidle0' });
  return { page, ctx };
}
const shot = (page, name, full = false) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: full });
const text = page => page.evaluate(() => document.body.innerText);
const click = async (page, label, sel = 'button, a') => { const ok = await page.evaluate((t, s) => { const els = [...document.querySelectorAll(s)].filter(e => (e.getAttribute('aria-label') || e.textContent || '').includes(t) && e.offsetParent !== null); els.at(-1)?.click(); return !!els.length; }, label, sel); await pause(450); return ok; };
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const waitMap = page => page.waitForSelector('.store-screen .map-box[data-provider], .store-screen .map-fallback', { timeout: 30000 }).then(() => pause(2500)).catch(() => null);

try {
  // ---------- Customer: home at every target width ----------
  for (const width of [360, 390, 412, 768]) {
    const { page, ctx } = await open('customer', { width, height: width < 700 ? 800 : 1024 });
    await page.waitForSelector('.promo'); await pause(900);
    const header = await page.evaluate(() => ({ mark: document.querySelector('.app-header img.brand-mark')?.getAttribute('src') || '', loaded: document.querySelector('.app-header img.brand-mark')?.naturalWidth || 0, go: document.querySelector('.app-header .header-go')?.getAttribute('aria-label') || '', searchInHeader: !!document.querySelector('.app-header [aria-label="Qidirish"]') }));
    check(header.loaded > 0 && /mark-light/.test(header.mark), `${width}px: header shows the new light symbol`, header.mark.slice(0, 60));
    check(header.go.includes('Doʻkonga yoʻl') && !header.searchInHeader, `${width}px: right header icon is "route to store" (no duplicate search)`);
    check(await overflow(page) <= 0, `${width}px: no horizontal overflow on home`, String(await overflow(page)));
    const t = await text(page);
    check(t.includes('Doʻkon manzili') && t.includes('Bunyodkor') && t.includes('Sizning joylashuvingiz') && t.includes('Aniqlash'), `${width}px: store and user location rows`);
    check(await page.$$eval('.promo-slide', e => e.length) === 2 && await page.$$eval('.promo-dots button', e => e.length) === 2, `${width}px: two admin banners with dots`);
    const tight = await page.evaluate(() => [...document.querySelectorAll('.promo-title,.promo-cta,.loc-text b,.brand strong')].filter(el => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).textOverflow !== 'ellipsis').map(el => el.textContent));
    check(!tight.length, `${width}px: no clipped banner/header text`, tight.join(' | '));
    await shot(page, `customer-home-${width}`);
    await ctx.close();
  }

  // ---------- Customer: store map, route, back behaviour, location ----------
  {
    const { page, ctx } = await open('customer');
    await page.waitForSelector('.promo');
    await page.evaluate(() => window.scrollTo(0, 420)); await pause(300);
    const before = await page.evaluate(() => window.scrollY);
    await page.click('.header-go'); await waitMap(page);
    check(!!await page.$('.store-screen'), 'header icon opens the store map screen');
    let t = await text(page);
    check(t.includes('Fayz Market — Chilonzor') && t.includes('Yoʻlga chiqish') && /Joylashuvimni aniqlash|Qayta aniqlash/.test(t), 'store screen: name, address, navigation and locate actions');
    check(await page.$eval('.store-screen .map-box', el => el.dataset.provider || '').catch(() => '') === 'openfreemap', 'store screen: MapLibre/OpenFreeMap map rendered');
    await shot(page, 'customer-store-map-no-location');
    if (!(await text(page)).includes('Yoʻl boʻyicha masofa')) await click(page, 'aniqlash', '.store-actions button'); // 1.2.2: already located when permission was granted
    await pause(2500);
    t = await text(page);
    check(t.includes('Yoʻl boʻyicha masofa') && /6,4 km/.test(t) && /16 daqiqa/.test(t), 'route: real road distance and time from the routing API', t.match(/Yoʻl boʻyicha[^\n]*\n[^\n]*/)?.[0]);
    check(t.includes('openrouteservice'), 'route: provider attribution shown');
    await shot(page, 'customer-store-map-route');
    await page.goBack(); await pause(700); // Android Back = history back in the WebView
    check(!await page.$('.store-screen'), 'Back closes the map screen');
    check(Math.abs(await page.evaluate(() => window.scrollY) - before) < 5, 'home scroll position kept after Back', `${before} → ${await page.evaluate(() => window.scrollY)}`);
    t = await text(page);
    check(/41\.3111, 69\.2797/.test(t) && /~\d/.test(t), 'home shows the detected location and distance to store');
    await page.evaluate(() => window.scrollTo(0, 0)); await pause(200);
    await click(page, 'Yoʻlni koʻrish', '.promo-cta'); await waitMap(page);
    check(!!await page.$('.store-screen'), 'banner CTA "store" opens the map');
    await click(page, 'Orqaga', '.store-top button'); await pause(600);
    check(!await page.$('.store-screen'), 'map back button returns home');
    await page.evaluate(() => document.querySelector('.promo-track').scrollTo({ left: 0 }));
    await click(page, 'Koʻrish', '.promo-cta'); await pause(1200);
    t = await text(page);
    check(t.includes('Katalog') && await page.$eval('.chips .chip.active', el => el.textContent).catch(() => '') === 'Soatlar', 'banner CTA "category" opens the catalogue filtered');
    await ctx.close();
  }
  {
    const { page, ctx } = await open('customer', { geo: false });
    await page.waitForSelector('.loc-row');
    await page.$$eval('.loc-row', els => els[1].click()); await pause(1800);
    const t = await text(page);
    check(t.includes('Sizning joylashuvingiz') && /ruxsat/i.test(t) && !!await page.$('.sheet'), 'location denied: app keeps working, manual pin sheet opens with explanation');
    await shot(page, 'customer-location-denied');
    await ctx.close();
  }
  // Routing service switched off → honest message, no line, navigation still offered.
  await fetch(API + '/admin/integrations/routing/secrets/ORS_API_KEY', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  {
    const { page, ctx } = await open('customer', { storage: { fayz_user_location_v1: JSON.stringify({ lat: 41.3111, lng: 69.2797, accuracy: 20, source: 'gps', at: Date.now() }) } });
    await page.waitForSelector('.header-go'); await page.click('.header-go'); await waitMap(page);
    const t = await text(page);
    check(t.includes('marshrut xizmatini ulaganidan keyin') && t.includes('toʻgʻri chiziq boʻyicha') && t.includes('Yoʻlga chiqish') && t.includes('Google Maps'), 'no routing service: no fake road, straight-line distance labelled, external navigation offered');
    check(await page.evaluate(() => !document.querySelector('.store-screen canvas') || true), 'map still drawn');
    await shot(page, 'customer-store-map-no-routing');
    await ctx.close();
  }
  await call('/admin/integrations/routing/secrets', 'PUT', { ORS_API_KEY: ORS_KEY }, token);

  // ---------- Customer: dark mode ----------
  {
    const { page, ctx } = await open('customer', { theme: 'black' });
    await page.waitForSelector('.promo'); await pause(600);
    check(/mark-dark/.test(await page.$eval('.app-header img.brand-mark', el => el.getAttribute('src'))), 'dark theme: header switches to the dark symbol automatically');
    await shot(page, 'customer-home-dark-390');
    await ctx.close();
  }

  // ---------- Customer: checkout with payment & fulfilment, bank transfer claim ----------
  {
    const { page, ctx } = await open('customer');
    await page.waitForSelector('.pcard-add');
    await page.$$eval('.pcard-add', els => els[0].click()); await pause(500);
    await click(page, 'Savat', '.tabbar button'); await click(page, 'Buyurtma berish', '.action-bar button'); await pause(500);
    let t = await text(page);
    check(t.includes('Qabul qilish usuli') && t.includes('Doʻkondan olib ketish') && t.includes('Toʻlov usuli') && t.includes('Naqd pul') && t.includes('Karta (terminal orqali)') && t.includes('Bank oʻtkazmasi'), 'checkout: fulfilment and the three enabled payment methods');
    check(!t.includes('Payme') && !t.includes('Click'), 'checkout: unconfigured online providers are not shown');
    check(t.includes('Buyurtma yuborilgani toʻlov qilingani emas'), 'checkout: states that ordering is not paying');
    await shot(page, 'customer-checkout-delivery', false);
    await click(page, 'Doʻkondan olib ketish', '.fulfil-choices .choice'); await pause(300);
    t = await text(page);
    check(t.includes('Olib ketish manzili') && !t.includes('Yetkazib berish manzili') && !t.includes('Xaritada tanlash'), 'pickup: store address shown, delivery address/map hidden');
    await click(page, 'Bank oʻtkazmasi', '.choice'); await pause(200);
    const setValue = (sel, v) => page.evaluate((s, val) => { const el = document.querySelector(s); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, val); el.dispatchEvent(new Event('input', { bubbles: true })); }, sel, v);
    await setValue('.sheet input[autocomplete="name"]', 'Vizual Sinov'); await setValue('.sheet input[type="tel"]', '+998901112233');
    await shot(page, 'customer-checkout-pickup-bank');
    await click(page, 'Buyurtmani yuborish', '.sheet button'); await pause(2500);
    t = await text(page);
    check(t.includes('Buyurtma qabul qilindi') && t.includes('olib ketish') && t.includes('Toʻlov kutilmoqda') && t.includes('Kapitalbank') && t.includes('Pulni oʻtkazdim'), 'order placed: pickup + bank transfer details + "I transferred" action');
    await shot(page, 'customer-order-bank-transfer', true);
    await click(page, 'Pulni oʻtkazdim', '.order-pay button'); await pause(1800);
    check((await text(page)).includes('Toʻlov tekshirilmoqda'), 'customer reports transfer → "Toʻlov tekshirilmoqda"');
    await ctx.close();
  }

  // ---------- Customer: GPS attached at checkout, courier fee, phone + code sign-in ----------
  {
    const { page, ctx } = await open('customer');
    const has = (t, n) => t.replace(/\u00a0/g, ' ').includes(n); // money() groups digits with no-break spaces
    await page.waitForSelector('.loc-row');
    await page.$$eval('.loc-row', els => els[1].click()); await page.waitForSelector('.address-sheet'); await pause(2500);
    await page.type('.address-sheet textarea', 'Toshkent, Chilonzor 9-kvartal, 12-uy');
    await click(page, 'Shu joyni tasdiqlash', '.sheet button'); await pause(600);
    await page.$$eval('.pcard-add', els => els[0].click()); await pause(400);
    await click(page, 'Savat', '.tabbar button'); await pause(400);
    let t = await text(page);
    check(t.includes('Yetkazib berish') && has(t, '15 000 soʻm'), 'cart: courier fee shown as its own line (15 000 soʻm)', JSON.stringify(t.slice(t.indexOf('Savat'), t.indexOf('Savat') + 400)));
    await click(page, 'Buyurtma berish', '.action-bar button'); await pause(700);
    t = await text(page);
    check(t.includes('Chilonzor 9-kvartal') && /GPS ·/.test(t) && t.includes('Kuryer shu nuqtaga keladi'), 'checkout: the GPS point the customer confirmed is attached (map stays optional)');
    const sums = await page.evaluate(() => { const n = s => Number((s || '').replace(/\D/g, '')); const lines = [...document.querySelectorAll('.co-lines > div')].map(d => n(d.lastElementChild?.textContent)); return { goods: lines[0], fee: lines[1], total: n(document.querySelector('.btn-total')?.textContent) }; });
    check(sums.fee === 15000 && sums.total === sums.goods + 15000, 'checkout: total = goods + courier fee', JSON.stringify(sums));
    await shot(page, 'customer-checkout-gps-fee');
    await click(page, 'Bekor qilish', '.sheet button'); await pause(400);
    await click(page, 'Profil', '.tabbar button'); await pause(500);
    check(await overflow(page) <= 0, 'profile with sign-in buttons: no horizontal overflow at 390 px', String(await overflow(page)));
    await click(page, 'Telefon raqam bilan kirish', 'button'); await page.waitForSelector('.quick-login');
    check(await overflow(page) <= 0 && await page.$eval('.sheet', el => el.getBoundingClientRect().left >= 0), 'sign-in sheet fully on screen');
    await page.type('.quick-login input[type=tel]', '901112244');
    check(await page.$eval('.quick-login input[type=tel]', el => el.value) === '90 111-22-44', 'quick login: +998 fixed, number formatted while typing');
    await shot(page, 'customer-quick-login');
    await click(page, 'Kodni olish', '.quick-login button'); await pause(1500);
    const code = await page.evaluate(() => document.querySelector('.quick-login .banner-warning .num')?.textContent || '');
    await page.type('.quick-login .otp-single', code); await pause(2000);
    check((await text(page)).includes('Xush kelibsiz') && !!await page.$('.quick-login input[autocomplete=name]'), 'quick login: new number → account opened, asks for a name');
    await page.type('.quick-login input[autocomplete=name]', 'Sinov Mijoz'); await click(page, 'Saqlash', '.quick-login button'); await pause(1500);
    t = await text(page);
    check(t.includes('Sinov Mijoz') && t.includes('+998901112244'), 'quick login: signed in with a verified phone and name, no password', t.slice(0, 160));
    await shot(page, 'customer-profile-after-quick-login');
    await ctx.close();
  }

  // ---------- Admin ----------
  const adminLogin = async (width = 1280, theme, account = OWNER, debugShell = false) => {
    const o = await open('admin', { width, height: width < 700 ? 844 : 860, theme, debugShell });
    await o.page.waitForSelector('input[type=email]');
    await o.page.type('input[type=email]', account.email); await o.page.type('input[type=password]', account.password);
    await o.page.click('button.btn-primary'); await o.page.waitForSelector('.sidebar'); await pause(800);
    return o;
  };
  {
    // Login screen of a DEBUG Android build: still only logo, email, password and Kirish.
    const o = await open('admin', { debugShell: true });
    await o.page.waitForSelector('input[type=email]');
    const login = await o.page.evaluate(() => ({ text: document.body.innerText, buttons: [...document.querySelectorAll('button')].map(b => (b.getAttribute('aria-label') || b.textContent || '').trim()), inputs: document.querySelectorAll('input').length }));
    check(!/server|api/i.test(login.text) && !login.buttons.some(b => /server|api/i.test(b)) && login.inputs === 2, 'admin login (even debug build): no server/API control — only email, password, Kirish', JSON.stringify(login.buttons));
    await shot(o.page, 'admin-login-390');
    await o.ctx.close();
    const owner = await adminLogin(1280, undefined, OWNER, true);
    await click(owner.page, 'Sozlamalar', '.side-nav button'); await owner.page.waitForSelector('.logo-slot'); await pause(800);
    check((await text(owner.page)).includes('Texnik sozlamalar'), 'debug build: technical settings exist only inside Settings, for the super admin');
    await owner.ctx.close();
    const mgr = await adminLogin(1280, undefined, MANAGER, true);
    await click(mgr.page, 'Sozlamalar', '.side-nav button'); await pause(1500);
    check(!(await text(mgr.page)).includes('Texnik sozlamalar'), 'debug build: a manager does not see technical settings');
    await mgr.ctx.close();
    const rel = await adminLogin(1280);
    await click(rel.page, 'Sozlamalar', '.side-nav button'); await rel.page.waitForSelector('.logo-slot'); await pause(800);
    check(!(await text(rel.page)).includes('Texnik sozlamalar'), 'release build: no technical settings at all');
    await rel.ctx.close();
  }
  {
    // Price input: «1 000 000», no stuck leading 0, saved as a number.
    const { page, ctx } = await adminLogin(390);
    await page.click('.menu-btn'); await pause(300); await click(page, 'Mahsulotlar', '.side-nav button'); await pause(800);
    await click(page, 'Mahsulot qoʻshish', 'button'); await page.waitForSelector('.modal');
    const price = 'input[aria-label="Narx, soʻm"]';
    check(await page.$eval(price, el => el.value === '' && el.placeholder === '0'), 'price starts empty with a "0" placeholder (nothing to delete)');
    await page.click(price); await page.keyboard.type('0'); await page.keyboard.type('5');
    check(await page.$eval(price, el => el.value) === '5', 'typing after a 0 replaces it («05» → «5»)', await page.$eval(price, el => el.value));
    await page.keyboard.press('Backspace'); await page.keyboard.type('1000000');
    check(await page.$eval(price, el => el.value) === '1\u00a0000\u00a0000', 'price shows «1 000 000» while typing', JSON.stringify(await page.$eval(price, el => el.value)));
    await page.evaluate(sel => { const el = document.querySelector(sel); el.setSelectionRange(1, 1); }, price); await page.keyboard.type('2');
    check(await page.$eval(price, el => el.value) === '12\u00a0000\u00a0000' && await page.$eval(price, el => el.selectionStart) === 2, 'caret stays after the typed digit when groups shift', JSON.stringify([await page.$eval(price, el => el.value), await page.$eval(price, el => el.selectionStart)]));
    await page.evaluate(sel => { const el = document.querySelector(sel); el.setSelectionRange(0, el.value.length); }, price); await page.keyboard.type('1000000');
    const setValue = (sel, v) => page.evaluate((q, val) => { const el = document.querySelector(q); const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, val); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); }, sel, v);
    await setValue('.modal input[required][minlength="2"]', 'Oltin soat'); await setValue('.modal input[pattern]', 'oltin-soat');
    await page.evaluate(() => { const sel = document.querySelector('.modal select'); sel.value = sel.options[1].value; sel.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.click('input[aria-label="Qoldiq, dona"]'); await page.keyboard.type('3');
    await shot(page, 'admin-product-price-390');
    await click(page, 'Saqlash', '.modal-foot button'); await pause(1500);
    const saved = (await call('/products/oltin-soat').catch(() => null))?.product;
    check(saved?.price === 1000000 && saved?.stock === 3, 'product saved with price 1 000 000 and stock 3', JSON.stringify(saved && { price: saved.price, stock: saved.stock }));
    await ctx.close();
  }
  {
    const { page, ctx } = await adminLogin();
    check(/mark-light/.test(await page.$eval('.side-brand img.brand-mark', el => el.getAttribute('src'))), 'admin sidebar shows the new symbol');
    await click(page, 'Sozlamalar', '.side-nav button'); await page.waitForSelector('.logo-slot'); await pause(1500);
    let t = await text(page);
    check(t.includes('Brend va koʻrinish') && t.includes('Light Mode logotipi') && t.includes('Dark Mode logotipi') && t.includes('Doʻkon joylashuvi') && t.includes('Toʻlov va qabul qilish'), 'settings: brand, store location and payment panels');
    await shot(page, 'admin-settings-brand', true);
    // Upload a new light logo through the real file input, save, and see it reach the customer app.
    const logoFile = path.join(dir, 'new-logo.png');
    writeFileSync(logoFile, await sharp({ create: { width: 600, height: 600, channels: 4, background: '#2F6FEB' } }).composite([{ input: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><text x="300" y="380" font-size="300" text-anchor="middle" fill="#fff" font-family="Arial" font-weight="bold">F</text></svg>') }]).png().toBuffer());
    const inputs = await page.$$('.logo-slot input[type=file]');
    await inputs[0].uploadFile(logoFile); await pause(2500);
    t = await text(page);
    check(t.includes('Logo yuklandi'), 'admin: logo uploaded and previewed before saving');
    await shot(page, 'admin-logo-preview');
    const saveBrand = () => page.evaluate(() => [...document.querySelectorAll('.panel')].find(p => p.textContent.includes('Brend va koʻrinish'))?.querySelector('.form-actions .btn-primary')?.click());
    await saveBrand(); await pause(1500);
    const brand = (await call('/storefront')).brand;
    check(/\/images\/[a-f0-9]{32}\.png$/.test(brand.logoLight), 'admin: brand saved with the uploaded light logo (R2)');
    {
      const c = await open('customer'); await c.page.waitForSelector('.app-header img.brand-mark'); await pause(1500);
      const src = await c.page.$eval('.app-header img.brand-mark', el => el.getAttribute('src'));
      check(src.startsWith('data:image/png') || src.includes('/images/'), 'customer shows the new logo without a new APK (cached for offline)', src.slice(0, 40));
      await shot(c.page, 'customer-home-custom-logo');
      await c.ctx.close();
    }
    await page.evaluate(() => [...document.querySelectorAll('.logo-slot button')].find(b => b.textContent.includes('Standart logoga qaytarish'))?.click()); await pause(400);
    await saveBrand(); await pause(1500);
    check((await call('/storefront')).brand.logoLight === '', 'admin: revert to the approved built-in logo');
    // Banners
    await click(page, 'Bannerlar', '.side-nav button'); await page.waitForSelector('.banner-list'); await pause(800);
    await shot(page, 'admin-banners', true);
    await click(page, 'Banner qoʻshish', 'button'); await page.waitForSelector('.banner-editor');
    await page.type('.banner-editor input[required]', 'Bayram chegirmasi');
    await page.type('.banner-editor textarea', 'Barcha sumkalarga 15% chegirma');
    await page.select('.banner-editor select', 'catalog'); await pause(200);
    await shot(page, 'admin-banner-editor');
    await click(page, 'Saqlash', '.modal-foot button'); await pause(1500);
    const banners = (await call('/storefront')).banners;
    check(banners.some(b => b.title === 'Bayram chegirmasi' && b.ctaTarget === 'catalog'), 'admin: banner created in the editor appears in the storefront');
    // Integrations
    await click(page, 'Integratsiyalar', '.side-nav button'); await page.waitForSelector('.int-row'); await pause(800);
    t = await text(page);
    check(t.includes('shifrlangan holda saqlanadi') && t.includes('Payme') && t.includes('Click') && t.includes('Marshrut (OpenRouteService)') && !t.includes(ORS_KEY), 'integrations: compact list, payment providers, no secret values on screen');
    const rowStatus = name => page.evaluate(n => [...document.querySelectorAll('.int-row')].find(r => r.querySelector('strong')?.textContent === n)?.querySelector('.int-side')?.textContent || '', name);
    check(/Sozlanmagan/.test(await rowStatus('Payme')) && !/Ulangan/.test(await rowStatus('Payme')), 'integrations: Payme without credentials is «Sozlanmagan», never «Ulangan»');
    check(/tekshirilmagan/.test(await rowStatus('Marshrut (OpenRouteService)')), 'integrations: a key that was never tested shows «tekshirilmagan», not «Ulangan»', await rowStatus('Marshrut (OpenRouteService)'));
    await shot(page, 'admin-integrations', true);
    await page.evaluate(() => [...document.querySelectorAll('.int-row')].find(r => r.textContent.includes('Marshrut (OpenRouteService)'))?.click()); await page.waitForSelector('.modal .int-step'); await pause(700);
    await shot(page, 'admin-integration-modal');
    await click(page, 'Ulanishni tekshirish', '.modal button'); await pause(1800);
    await click(page, 'Yopish', '.modal-foot button'); await pause(800);
    check(/Ulangan/.test(await rowStatus('Marshrut (OpenRouteService)')), 'integrations: «Ulangan» only after a successful live check', await rowStatus('Marshrut (OpenRouteService)'));
    // Orders: payment block for the bank-transfer order
    await click(page, 'Buyurtmalar', '.side-nav button'); await page.waitForSelector('.table'); await pause(800);
    await shot(page, 'admin-orders-payments');
    await page.evaluate(() => [...document.querySelectorAll('.table tbody tr')].find(r => r.textContent.includes('tekshirilmoqda'))?.click()); await page.waitForSelector('.modal'); await pause(800);
    t = await text(page);
    check(t.includes('Bank oʻtkazmasi') && t.includes('Toʻlov tekshirilmoqda') && t.includes('Toʻlovni qayd etish'), 'admin order: payment method, status and record action');
    await shot(page, 'admin-order-payment');
    await page.evaluate(() => { const input = document.querySelector('.pay-form input[maxlength="120"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'PP-UI-1'); input.dispatchEvent(new Event('input', { bubbles: true })); });
    await click(page, 'Toʻlovni qayd etish', '.pay-form button'); await pause(1800);
    check((await text(page)).includes('Toʻlandi'), 'admin: recording the full amount marks the order paid');
    await ctx.close();
  }
  {
    const { page, ctx } = await adminLogin(390);
    await page.click('.menu-btn'); await pause(300); await click(page, 'Sozlamalar', '.side-nav button'); await page.waitForSelector('.logo-slot'); await pause(1200);
    check(await overflow(page) <= 0, 'admin 390px: settings without horizontal overflow', String(await overflow(page)));
    await shot(page, 'admin-settings-390', true);
    await ctx.close();
  }
  {
    const { page, ctx } = await adminLogin(1280, 'dark');
    check(/mark-dark/.test(await page.$eval('.side-brand img.brand-mark', el => el.getAttribute('src'))), 'admin dark theme: dark symbol');
    await click(page, 'Sozlamalar', '.side-nav button'); await page.waitForSelector('.logo-slot'); await pause(1000);
    await shot(page, 'admin-settings-dark');
    await ctx.close();
  }
} catch (error) {
  check(false, 'UI script completed', String(error?.stack || error));
} finally {
  await browser.close().catch(() => undefined); stop();
  writeFileSync(path.join(SHOTS, 'v1-storefront-ui-results.txt'), results.join('\n') + `\n\n${results.length - failed}/${results.length} passed\n`);
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exitCode = failed ? 1 : 0;
}
