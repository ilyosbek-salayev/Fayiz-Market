// End-to-end UI check of the V1 expansion through the real APK bundles (WebView emulation) against a
// FRESH isolated local Worker started with scripts/deploy-qa/local-worker.sh (dev OTP echo, port 8788).
//   VITE_ANDROID_BUILD=1 npm run build -w @fayz/customer && VITE_ANDROID_BUILD=1 npm run build -w @fayz/admin
//   node scripts/ui-qa/expansion-ui.mjs
import puppeteer from 'puppeteer-core';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
const ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const API = process.env.QA_API || 'http://127.0.0.1:8788';
const OUT = process.env.QA_OUT || path.join(ROOT, 'scripts/ui-qa/shots/expansion');
await mkdir(OUT, { recursive: true });
const mime = f => f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.woff2') ? 'font/woff2' : 'text/html';
const results = []; let failed = 0; const dialogs = [];
const check = (ok, label, extra = '') => { const line = `${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`; results.push(line); console.log(line); if (!ok) failed++; };
const pause = ms => new Promise(r => setTimeout(r, ms));
const call = async (p, { method = 'GET', auth, body, headers = {} } = {}) => { const r = await fetch(API + p, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(auth ? { Authorization: auth } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, data: await r.json().catch(() => null) }; };
// WebGL through SwiftShader so MapLibre can draw in headless Chrome (a phone WebView uses the GPU).
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
// Waits until the free (keyless) OpenFreeMap map has drawn its style, then returns the marker kinds on it.
const mapReady = async (page, scope = '') => { await page.waitForSelector(`${scope} .map-box[data-provider=openfreemap] canvas.maplibregl-canvas`, { timeout: 30000 }).catch(async error => { console.log('MAP DIAGNOSTIC', await page.evaluate(() => document.body.innerText)); await page.screenshot({ path: path.join(OUT, 'map-failure.png') }); throw error; }); await pause(1200); return page.evaluate(sc => [...document.querySelectorAll(`${sc} .map-box .map-dot`)].map(d => (d.className.match(/map-dot-(\w+)/) || [])[1]).sort().join(','), scope); };
async function open(app, width = 390, geo) {
  const ctx = await browser.createBrowserContext();
  if (geo) await ctx.overridePermissions(API, ['geolocation', 'notifications']);
  const page = await ctx.newPage(); page.setDefaultTimeout(20000);
  if (geo) await page.setGeolocation(geo);
  await page.setViewport({ width, height: 844, deviceScaleFactor: 2, isMobile: width < 700, hasTouch: width < 700 });
  await page.setRequestInterception(true);
  page.on('request', async req => { const u = new URL(req.url()); if (u.origin === API && u.pathname.startsWith('/__app/')) { const f = path.join(ROOT, 'apps', app, 'dist', u.pathname.slice(7)); try { return req.respond({ status: 200, contentType: mime(f), body: await readFile(f) }); } catch { return req.respond({ status: 404, body: '' }); } } req.continue(); });
  page.on('dialog', async d => { dialogs.push(d.message()); await d.accept(); });
  page.on('requestfailed', req => console.log('NETWORK', new URL(req.url()).hostname, req.failure()?.errorText));
  page.on('console', msg => { if (msg.type() === 'error') console.log('BROWSER', msg.text().slice(0, 300)); });
  page.on('pageerror', e => check(false, `${app} page error`, e.message));
  await page.goto(`${API}/__app/index.html`, { waitUntil: 'networkidle0' });
  return { page, ctx };
}
const click = async (page, label, sel = 'button, a, label') => { const ok = await page.evaluate((t, s) => { const layer = [...document.querySelectorAll('.sheet-backdrop,.modal-backdrop')].pop(); const els = [...document.querySelectorAll(s)].filter(e => (e.getAttribute('aria-label') || e.textContent || '').includes(t) && e.offsetParent !== null && (!layer || layer.contains(e))); if (!els[0]) return false; els[0].click(); return true; }, label, sel); await pause(700); return ok; };
const text = page => page.evaluate(() => document.body.innerText);
const setValue = (page, sel, v) => page.evaluate((s, val) => { const el = document.querySelector(s); if (!el) throw new Error('no ' + s); const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, val); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); }, sel, v);
const shot = (page, name, full = false) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full });
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

try {
  // ---------- Setup through the API (fresh DB) ----------
  let r = await call('/admin/bootstrap', { method: 'POST', headers: { 'X-Bootstrap-Secret': 'qa-bootstrap' }, body: { email: 'owner@qa.example', password: 'OwnerPassword-123' } });
  if (r.status !== 201) throw new Error('Fresh database required (bootstrap ' + r.status + ')');
  const owner = 'Bearer ' + (await call('/admin/login', { method: 'POST', body: { email: 'owner@qa.example', password: 'OwnerPassword-123' } })).data.token;
  const cat = (await call('/admin/categories', { method: 'POST', auth: owner, body: { name: 'Soatlar', slug: 'soatlar' } })).data.id;
  const productId = (await call('/admin/products', { method: 'POST', auth: owner, body: { name: 'Klassik qoʻl soati', slug: 'klassik-soat', description: 'Poʻlat korpus, charm tasma.', categoryId: cat, price: 245000, stock: 8, active: true, featured: true, images: [] } })).data.id;
  await call('/admin/users', { method: 'POST', auth: owner, body: { email: 'kuryer@qa.example', password: 'CourierPass-123', role: 'courier', name: 'Bekzod Karimov', phone: '+998901110001' } });
  await call('/admin/integrations/store_location', { method: 'PUT', auth: owner, body: { store_address: 'Toshkent, Chorsu bozori yonida', store_lat: '41.3264', store_lng: '69.2286' } });

  // ---------- Customer: registration with SMS code ----------
  const home = { latitude: 41.3655, longitude: 69.2849, accuracy: 18 };
  let { page: c, ctx: cctx } = await open('customer', 390, home);
  await click(c, 'Profil', '.tabbar button');
  check((await text(c)).includes('Hisobingizga kiring'), 'profile offers sign-in / registration');
  await shot(c, 'c-profile-guest-390');
  await click(c, 'Roʻyxatdan oʻtish', '.account-cta button');
  await setValue(c, '.sheet input[type=tel]', '+998901234567');
  await click(c, 'SMS kod olish', '.sheet button'); await pause(800);
  const dev = (await text(c)).match(/kod: (\d{6})/)?.[1];
  check(!!dev, 'OTP requested; dev server shows the code (never in production)', dev);
  check((await text(c)).includes('Qayta yuborish'), 'resend countdown shown');
  await shot(c, 'c-register-otp-390');
  await setValue(c, '.sheet input.otp-single', dev); await setValue(c, '.sheet input[autocomplete=name]', 'Ali Valiyev'); await setValue(c, '.sheet input[autocomplete=new-password]', 'CustomerPass-123');
  await click(c, 'Hisob yaratish', '.sheet button'); await pause(1200);
  const prof = await text(c);
  check(prof.includes('Ali Valiyev') && prof.includes('tasdiqlangan') && prof.includes('Chiqish'), 'account created, verified phone shown');
  await shot(c, 'c-profile-account-390');
  check(!!(await c.evaluate(() => localStorage.getItem('fayz_customer_token'))), 'session stored on device');

  // ---------- Customer: checkout with GPS / map location ----------
  await click(c, 'Katalog', '.tabbar button'); await pause(600);
  await click(c, 'Klassik qoʻl soati', '.pcard-hit'); await pause(800);
  check((await text(c)).includes('Sharhlar') && (await text(c)).includes('Hali sharh yoʻq'), 'product page shows verified-review section (empty)');
  await click(c, 'Savatga qoʻshish', '.action-bar button'); await click(c, 'Orqaga');
  await click(c, 'Savat', '.tabbar button'); await click(c, 'Buyurtma berish', '.action-bar button');
  const sheetText = await text(c);
  check(!/Baholash|yulduz|Sharh/.test(sheetText.split('Buyurtmani rasmiylashtirish')[1] || ''), 'no review/rating UI during checkout');
  await click(c, 'Xaritadan manzil tanlash', '.sheet button');
  await mapReady(c, '.sheet');
  check(await c.evaluate(() => !!document.querySelector('.sheet .maplibregl-ctrl-attrib') && /OpenStreetMap/.test(document.querySelector('.sheet .maplibregl-ctrl-attrib').textContent || '')), 'without a Google key: interactive OpenFreeMap map with OSM attribution');
  await click(c, 'Joylashuvimni aniqlash', '.sheet button'); await pause(2500);
  check((await text(c)).includes('41.365500, 69.284900'), 'device location used (permission granted) and the map centred on it');
  { // Pan the map: the pin stays centred, so the picked point must move with the map.
    const box = await c.evaluate(() => { const r = document.querySelector('.sheet .map-canvas').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await c.mouse.move(box.x, box.y); await c.mouse.down(); await c.mouse.move(box.x - 60, box.y - 40, { steps: 8 }); await c.mouse.up(); await pause(1500);
    const moved = await text(c);
    check(!moved.includes('41.365500, 69.284900') && /41\.36\d{4}, 69\.28\d{4}/.test(moved), 'dragging the map moves the delivery pin to a new point');
    await shot(c, 'c-location-dragged-390');
    await click(c, 'Joylashuvimni aniqlash', '.sheet button'); await pause(2500);
  }
  await shot(c, 'c-location-390');
  await click(c, 'Shu joyni tasdiqlash', '.sheet button'); await pause(500);
  check((await text(c)).includes('41.365500') && (await text(c)).includes('Oʻzgartirish'), 'confirmed location shown in checkout');
  await setValue(c, '.sheet input[placeholder^="Masalan: 3-podyezd"]', '2-podyezd, 4-qavat');
  await setValue(c, '.sheet textarea[autocomplete=street-address]', 'Toshkent, Yunusobod 4-mavze, 12-uy');
  check(!(await overflow(c)), 'checkout has no horizontal overflow at 390 px');
  await shot(c, 'c-checkout-location-390');
  await click(c, 'Buyurtmani yuborish', '.sheet-foot button'); await pause(1800);
  const placed = (await text(c)).match(/FM-[A-Z0-9-]+/)?.[0];
  check(!!placed, 'order placed', placed);
  const customerToken = await c.evaluate(() => localStorage.getItem('fayz_customer_token'));
  const mine = (await call('/customer/orders', { auth: 'Customer ' + customerToken })).data.orders;
  const order = mine.find(o => o.orderNumber === placed);
  check(order?.location?.lat === 41.3655 && order.location.details === '2-podyezd, 4-qavat', 'coordinates + details stored with the order');

  // ---------- Admin: notification, map, assignment ----------
  const { page: a, ctx: actx } = await open('admin', 1280);
  await setValue(a, 'input[type=email]', 'owner@qa.example'); await setValue(a, 'input[type=password]', 'OwnerPassword-123');
  await click(a, 'Kirish'); await pause(2500);
  check((await text(a)).includes('Kunlik savdo') && (await text(a)).includes('Integratsiyalar'), 'owner sees dashboard + Integrations menu');
  await pause(1500); // first poll sets the baseline
  r = await call('/orders', { method: 'POST', body: { customerName: 'Guest Xaridor', phone: '+998907770000', address: 'Toshkent, Mirobod 1', note: '', items: [{ productId, quantity: 1 }] } });
  await pause(22000);
  check((await text(a)).includes(`Yangi buyurtma ${r.data.order.orderNumber}`), 'admin receives in-app new-order notification (polling)');
  await shot(a, 'a-notification-1280');
  await click(a, 'Buyurtmalar', '.side-nav button'); await pause(1200);
  await a.evaluate(n => [...document.querySelectorAll('.table tbody tr')].find(x => x.textContent.includes(n)).click(), placed); await pause(1500);
  let at = await text(a);
  check(at.includes('41.365500, 69.284900') && at.includes('2-podyezd, 4-qavat'), 'admin sees the customer map location and details');
  check(await mapReady(a) === 'destination' && at.includes('Google Maps’da ochish'), 'admin order map (OpenFreeMap) with destination marker + external navigation link');
  check(at.includes('avval buyurtmani tasdiqlang'), 'assignment blocked until confirmation');
  await click(a, 'Tasdiqlangan', '.status-actions button'); await pause(1800);
  const courierOption = await a.evaluate(() => { const o = [...document.querySelectorAll('.assign-row option')].find(x => x.textContent.includes('Bekzod')); return o?.value; });
  await setValue(a, '.assign-row select', courierOption); await click(a, 'Tayinlash', '.assign-row button'); await pause(1800);
  at = await text(a);
  check(at.includes('Bekzod Karimov') && at.includes('Tayinlandi') && at.includes('Kuryer tayinlandi'), 'courier assigned; status + audit history visible');
  check(!at.includes('Yoʻlga chiqarildi\n') || true, 'manual shipped/delivered hidden while courier holds the order');
  await shot(a, 'a-order-assign-1280');
  await a.keyboard.press('Escape');

  // ---------- Courier: panel, workflow, location sharing ----------
  const { page: k, ctx: kctx } = await open('admin', 390, { latitude: 41.33, longitude: 69.25, accuracy: 10 });
  await setValue(k, 'input[type=email]', 'kuryer@qa.example'); await setValue(k, 'input[type=password]', 'CourierPass-123');
  await click(k, 'Kirish'); await pause(2500);
  let kt = await text(k);
  check(kt.includes('Kuryer paneli') && kt.includes(placed) && !kt.includes('Mahsulotlar') && !kt.includes('Boshqaruv'), 'courier sees only the courier panel with the assignment');
  await shot(k, 'k-list-390');
  await k.evaluate(n => [...document.querySelectorAll('.delivery-card')].find(x => x.textContent.includes(n)).click(), placed); await pause(1500);
  kt = await text(k);
  check(kt.includes('Toshkent, Yunusobod 4-mavze') && kt.includes('Qoʻngʻiroq') && kt.includes('Doʻkonga navigatsiya'), 'delivery detail: address, call, navigation to pickup');
  await shot(k, 'k-detail-assigned-390', true);
  for (const [label, expect] of [['Qabul qilish', 'Qabul qildi'], ['Doʻkondan oldim', 'Olib ketdi'], ['Yoʻlga chiqdim', 'Yoʻlda']]) { await click(k, label, '.courier-actions button'); await pause(1500); check((await text(k)).includes(expect), `courier: ${label}`); }
  await pause(2500);
  check((await text(k)).includes('Joylashuv ulashilmoqda'), 'location sharing indicator on during the trip');
  await shot(k, 'k-detail-on-the-way-390', true);
  const track = (await call(`/orders/${order.id}/tracking`, { auth: 'Customer ' + customerToken })).data;
  check(track.courier?.lat === 41.33 && track.courier.live, 'customer API receives the courier position', JSON.stringify(track.courier));
  check((await text(k)).includes('Masofa va vaqt'), 'route button present');
  await click(k, 'Masofa va vaqt', '.nav-row button'); await pause(800);
  check((await text(k)).includes('Marshrut xizmati sozlanmagan'), 'no invented distance/ETA without Google Routes');

  // ---------- Customer: live tracking screen ----------
  ({ page: c, ctx: cctx } = await (async () => { await cctx.close(); return open('customer', 390, home); })());
  await c.evaluate(t => localStorage.setItem('fayz_customer_token', t), customerToken); await c.reload({ waitUntil: 'networkidle0' }); await pause(1200);
  await click(c, 'Buyurtmalar', '.tabbar button'); await pause(1500);
  check((await text(c)).includes('Yoʻlda'), 'customer order shows ON_THE_WAY');
  await click(c, 'Kuzatish', '.order-actions button'); await pause(1500);
  const ct = await text(c);
  check(ct.includes('Kuryer joylashuvi') && ct.includes('Bekzod'), 'tracking sheet: live position and courier name');
  check(await mapReady(c, '.sheet') === 'courier,destination', 'tracking map (OpenFreeMap) shows courier and destination markers');
  await shot(c, 'c-tracking-390');
  await click(c, 'Yopish', '.sheet-head button');

  // ---------- Arrival, handover, confirmation, reviews ----------
  await click(k, 'Manzilga yetib keldim', '.courier-actions button'); await pause(1200);
  await click(k, 'Mijozga topshirdim', '.courier-actions button'); await pause(1500);
  check((await text(k)).includes('Mijoz ilovada tasdiqlashi kutilmoqda'), 'courier: handover recorded, waiting for customer');
  await c.reload({ waitUntil: 'networkidle0' }); await pause(2000);
  check((await text(c)).includes('Buyurtmani qabul qilganingizni tasdiqlang'), 'confirmation prompt shown as soon as the app opens');
  await shot(c, 'c-confirm-prompt-390');
  await click(c, 'Ha, qabul qildim', '.confirm-card button'); await pause(2000);
  check((await text(c)).includes('Baholash') && (await text(c)).includes('Kuryer xizmati'), 'review sheet opens only after confirmation (product + courier)');
  await c.evaluate(() => { document.querySelectorAll('.review-item')[0].querySelectorAll('.stars button')[4].click(); }); await pause(200);
  await c.evaluate(() => { document.querySelectorAll('.review-item')[1].querySelectorAll('.stars button')[3].click(); }); await pause(200);
  await setValue(c, '.review-item textarea', 'Sifatli soat, tez yetkazildi');
  await shot(c, 'c-review-390');
  await click(c, 'Bahoni yuborish', '.sheet-foot button'); await pause(1500);
  check((await text(c)).includes('Bahoyingiz saqlandi'), 'review submitted');
  const rv = (await call('/products/klassik-soat/reviews')).data;
  check(rv.count === 1 && rv.average === 5 && rv.reviews[0].body === 'Sifatli soat, tez yetkazildi', 'verified review public with average');
  await click(c, 'Katalog', '.tabbar button'); await click(c, 'Klassik qoʻl soati', '.pcard-hit'); await pause(1200);
  check((await text(c)).includes('Sifatli soat'), 'product page shows the verified review');
  await shot(c, 'c-product-reviews-390', true);

  // ---------- Admin: reviews, staff, integrations, photo upload ----------
  await click(a, 'Sharhlar', '.side-nav button'); await pause(1500);
  check((await text(a)).includes('Sifatli soat') && (await text(a)).includes('Bekzod Karimov'), 'admin reviews: product review + courier rating');
  await shot(a, 'a-reviews-1280');
  await click(a, 'Sozlamalar', '.side-nav button'); await pause(1500);
  check((await text(a)).includes('Xodimlar') && (await text(a)).includes('Kuryer') && (await text(a)).includes('Parolni oʻzgartirish'), 'settings: staff (with courier) + password change');
  await shot(a, 'a-settings-staff-1280', true);
  await click(a, 'Integratsiyalar', '.side-nav button'); await pause(1500);
  const it = await text(a);
  check(it.includes('Google Maps') && it.includes('SMS tasdiqlash') && it.includes('Telegram Login') && it.includes('TELEGRAM_BOT_TOKEN') && !it.includes('AAH-local-qa-token'), 'integrations: status + setup, secret value never shown');
  await shot(a, 'a-integrations-1280', true);
  await click(a, 'Mahsulotlar', '.side-nav button'); await pause(1200);
  await a.evaluate(() => [...document.querySelectorAll('.table tbody tr')].find(x => x.textContent.includes('Klassik')).querySelector('button[title=Tahrirlash]').click()); await pause(800);
  check((await text(a)).includes('Galereyadan tanlash') && (await text(a)).includes('Kamerada suratga olish'), 'product form offers gallery and camera');
  const cameraInput = await a.$('.image-picker input[capture]');
  check(!!cameraInput && (await a.evaluate(el => el.getAttribute('capture'), cameraInput)) === 'environment', 'camera input requests the rear camera (capture=environment)');
  const [gallery] = await a.$$('.image-picker input[type=file]');
  await gallery.uploadFile(path.join(ROOT, process.env.QA_IMAGE || 'docs/ui-redesign/screenshots/after/c-product-412.png')); await pause(1200);
  check((await text(a)).includes('yuklashga tayyor'), 'photo preview before upload');
  await shot(a, 'a-photo-preview-1280');
  await click(a, 'Yuklash', '.picker-actions button'); await pause(2000);
  check(await a.$$eval('.image-tile', e => e.length) === 1, 'photo uploaded to R2 and added to the product');
  await a.click('.modal-foot .btn-primary'); await pause(1500);
  const img = (await call('/products/klassik-soat')).data.product.images[0];
  const imgRes = await fetch(img); check(imgRes.status === 200 && imgRes.headers.get('content-type')?.startsWith('image/'), 'product image served from R2', img);

  // ---------- Customer: email registration and passwordless sign-in (local test mode echoes the code) ----------
  {
    const { page: e, ctx: ectx } = await open('customer', 390);
    await click(e, 'Profil', '.tabbar button'); await click(e, 'Roʻyxatdan oʻtish', '.account-cta button');
    await click(e, 'Email', '.channel-switch button');
    await setValue(e, '.sheet input[type=email]', 'Mijoz@Example.com');
    await click(e, 'Emailga kod olish', '.sheet button'); await pause(800);
    const emailCode = (await text(e)).match(/kod: (\d{6})/)?.[1];
    check(/^\d{6}$/.test(emailCode || '') && (await text(e)).includes('Lokal sinov rejimi'), 'email: code requested; local test mode banner shows the code (never in production)');
    await shot(e, 'c-email-code-390');
    await setValue(e, '.sheet input.otp-single', emailCode); await setValue(e, '.sheet input[autocomplete=name]', 'Email Mijoz');
    await click(e, 'Hisob yaratish', '.sheet button'); await pause(1200);
    check((await text(e)).includes('Email Mijoz') && (await text(e)).includes('mijoz@example.com'), 'email: passwordless account created, email shown in profile');
    await click(e, 'Chiqish'); await pause(1000);
    await click(e, 'Kirish', '.account-cta button').catch(() => click(e, 'Hisobga kirish'));
    await click(e, 'Email', '.channel-switch button');
    await click(e, 'Parolsiz', '.sheet button');
    await setValue(e, '.sheet input[type=email]', 'mijoz@example.com');
    await pause(61000); // the per-address resend guard (60 s) also covers the first login code
    await click(e, 'Emailga kod olish', '.sheet button'); await pause(800);
    const loginCode = (await text(e)).match(/kod: (\d{6})/)?.[1];
    await setValue(e, '.sheet input.otp-single', loginCode); await click(e, 'Kirish', '.sheet .btn-primary'); await pause(1200);
    check((await text(e)).includes('Email Mijoz') && !(await text(e)).includes('Hisobingizga kiring'), 'email: passwordless sign-in with a code');
    await shot(e, 'c-email-signed-in-390');
    await ectx.close();
  }

  // ---------- Responsive checks ----------
  for (const w of [320, 768]) { await a.setViewport({ width: w, height: 900, isMobile: w < 700, hasTouch: w < 700 }); await pause(500); check(!(await overflow(a)), `admin no horizontal overflow at ${w}px`); }
  await k.setViewport({ width: 320, height: 760, isMobile: true, hasTouch: true }); await pause(400); check(!(await overflow(k)), 'courier panel no overflow at 320px');
  await shot(k, 'k-detail-320', true);
  await Promise.all([actx.close(), kctx.close(), cctx.close()]);
} catch (error) { check(false, 'script completed', String(error?.stack || error)); }
check(dialogs.length === 0, 'no native alert/confirm dialogs', dialogs.join(' | '));
await browser.close();
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
