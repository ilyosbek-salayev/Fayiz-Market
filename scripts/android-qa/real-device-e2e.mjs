// REAL PHONE (not an emulator) — DEBUG 1.2.x apps against an ISOLATED local Worker (fresh D1 + local R2).
// Production is never contacted. The phone reaches the Mac's Worker through `adb reverse`; the debug shells point at
// it through their own preferences and are pointed back to production at the end.
//
// Customer → product (variant) → cart → checkout → order → Admin → confirm → status updates → Customer sees them,
// plus: phone + code sign-in, search, categories, keyboard, Android Back on every layer, dark/light, admin variants,
// image upload (WebView pipeline), tariff & payment settings, integrations, offline error. Real GPS is NOT used:
// addresses are picked on the map and typed (no personal location in screenshots).
//
//   ANDROID_SERIAL=<phone> node scripts/android-qa/real-device-e2e.mjs
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { adb, launch, pause, screenshot, setApiUrl, sh, versionOf, webview, requireDevice } from './lib.mjs';


const ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const sharp = createRequire(path.join(ROOT, 'package.json'))('sharp');
const PORT = 8791, API = `http://127.0.0.1:${PORT}`;
// An emulator run is labelled EMULATOR everywhere (results header, default folders) — never as a real phone.
const TARGET = requireDevice('real-device-e2e.mjs'), EMULATOR = TARGET.emulator;
const KIND = EMULATOR ? `EMULATOR (${sh('getprop ro.boot.qemu.avd_name') || 'AVD'}) — NOT a physical phone` : 'REAL PHONE';
// Phone screenshots stay private (git-ignored .local-qa/): they can show the owner's own notifications and data.
const OUT = path.join(ROOT, process.env.SHOTS || (EMULATOR ? 'docs/v1/screenshots/emulator-android16' : '.local-qa/private-screenshots/real-device/e2e'));
const RESULTS = path.join(ROOT, process.env.RESULTS || (EMULATOR ? 'docs/v1/evidence/emulator-android16/e2e-isolated.txt' : 'docs/v1/evidence/real-device-1.2.2/e2e-isolated.txt'));
mkdirSync(OUT, { recursive: true });
const C = 'uz.fayzmarket.customer', A = 'uz.fayzmarket.admin';
const results = []; const check = (status, name, detail = '') => { results.push(`${status} ${name}${detail ? ' — ' + String(detail).slice(0, 260) : ''}`); console.log(results.at(-1)); };
const ok = (cond, name, detail) => check(cond ? 'PASS' : 'FAIL', name, cond ? '' : detail);
const shot = name => writeFileSync(path.join(OUT, `${name}.png`), screenshot());
const keyboardShown = () => /mInputShown=true/.test(sh('dumpsys input_method | grep -m1 mInputShown || true'));
const resumed = () => sh('dumpsys activity activities | grep -E "topResumedActivity|mResumedActivity" | head -1 || true');
// Native input goes ONLY to a Fayz app: if anything else is in front (Settings, another app), stop — never type or tap there.
let expected = 'uz.fayzmarket.';
const guard = () => { const top = resumed(); if (!top.includes(expected)) throw new Error(`FOREGROUND_LOST: ${top.trim()}`); };
const backKey = async () => { guard(); sh('input keyevent KEYCODE_BACK'); await pause(1300); };
const typeNative = async s => { guard(); sh(`input text ${JSON.stringify(s.replace(/ /g, '%s'))}`); await pause(600); };
let origin = null;
/** Top-left of the WebView on screen (device px), read once from the phone's own view tree. */
function webviewOrigin() {
  if (origin) return origin;
  sh('uiautomator dump /sdcard/fayz-ui.xml >/dev/null 2>&1 || true');
  const node = [...sh('cat /sdcard/fayz-ui.xml').matchAll(/<node [^>]*>/g)].map(m => m[0]).find(n => / class="android.webkit.WebView"/.test(n));
  const b = node?.match(/bounds="\[(\d+),(\d+)\]/);
  origin = b ? { x: Number(b[1]), y: Number(b[2]) } : { x: 0, y: 0 };
  return origin;
}
/** Taps the centre of a DOM element on the real screen (CSS px → device px via devicePixelRatio). */
async function tapEl(w, selector, textIncludes = '') {
  const r = await w.evaluate((s, t) => { const el = [...document.querySelectorAll(s)].find(e => !t || (e.innerText || e.textContent || '').includes(t)); if (!el) return null; el.scrollIntoView({ block: 'center' }); const b = el.getBoundingClientRect(); return { x: (b.left + b.width / 2) * devicePixelRatio, y: (b.top + b.height / 2) * devicePixelRatio, top: screen.height - innerHeight }; }, selector, textIncludes);
  if (!r) throw new Error(`no element ${selector} ${textIncludes}`);
  await pause(350);
  const again = await w.evaluate((s, t) => { const el = [...document.querySelectorAll(s)].find(e => !t || (e.innerText || e.textContent || '').includes(t)); const b = el.getBoundingClientRect(); return { x: (b.left + b.width / 2) * devicePixelRatio, y: (b.top + b.height / 2) * devicePixelRatio }; }, selector, textIncludes);
  guard(); sh(`input tap ${Math.round(again.x + webviewOrigin().x)} ${Math.round(again.y + webviewOrigin().y)}`); await pause(800);
}

// ---------- isolated Worker + seed ----------
const dir = mkdtempSync(path.join(tmpdir(), 'fayz-phone-e2e-'));
const worker = spawn('bash', [path.join(ROOT, 'scripts/deploy-qa/local-worker.sh'), path.join(dir, 'db')], { env: { ...process.env, QA_PORT: String(PORT) }, stdio: 'ignore', detached: true });
let workerUp = true;
const stopWorker = () => { if (!workerUp) return; workerUp = false; try { process.kill(-worker.pid, 'SIGTERM'); } catch { /* gone */ } };
for (let i = 0; i < 240; i++) { try { if ((await fetch(API + '/health')).ok) break; } catch { /* starting */ } await pause(500); }
const call = async (p, method = 'GET', body, token, raw) => { const r = await fetch(API + p, { method, headers: { ...(body !== undefined ? { 'Content-Type': raw ? 'image/png' : 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(p === '/admin/bootstrap' ? { 'X-Bootstrap-Secret': 'qa-bootstrap' } : {}) }, body: body === undefined ? undefined : raw ? body : JSON.stringify(body) }); return r.json(); };
const OWNER = { email: 'telefon-owner@example.invalid', password: 'TelefonQA-2026-owner' };
await call('/admin/bootstrap', 'POST', OWNER);
const { token } = await call('/admin/login', 'POST', OWNER);
const pic = (a, b) => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="600" height="600" fill="url(#g)"/><circle cx="300" cy="300" r="150" fill="rgba(255,255,255,.25)"/></svg>`)).png().toBuffer();
const up = async (a, b) => (await call('/admin/images', 'POST', await pic(a, b), token, true)).url;
const tel = (await call('/admin/categories', 'POST', { name: 'Telefonlar', slug: 'telefonlar' }, token)).id;
const soat = (await call('/admin/categories', 'POST', { name: 'Soatlar', slug: 'soatlar' }, token)).id;
const BLACK = await up('#1d1d1f', '#4a4a4f'), WHITE = await up('#f5f5f7', '#cfcfd4');
await call('/admin/products', 'POST', { name: 'Fayz Phone X', slug: 'fayz-phone-x', description: 'Kundalik ish va suratga olish uchun qulay smartfon. '.repeat(8), categoryId: tel, price: 3200000, stock: 0, active: true, featured: true, images: [BLACK, WHITE], attributes: [{ name: 'Ekran', value: '6,7″' }, { name: 'Kafolat', value: '12 oy' }], options: [{ name: 'Rang', values: ['Qora', 'Oq'] }, { name: 'Xotira', values: ['128 GB', '256 GB'] }],
  variants: [{ options: { Rang: 'Qora', Xotira: '128 GB' }, price: 3200000, comparePrice: 3600000, stock: 4, image: BLACK }, { options: { Rang: 'Qora', Xotira: '256 GB' }, price: 3700000, stock: 2, image: BLACK }, { options: { Rang: 'Oq', Xotira: '128 GB' }, price: 3250000, stock: 3, image: WHITE }, { options: { Rang: 'Oq', Xotira: '256 GB' }, price: 3750000, stock: 0, image: WHITE }] }, token);
await call('/admin/products', 'POST', { name: 'Fayz Phone Lite', slug: 'fayz-phone-lite', description: 'Yengil.', categoryId: tel, price: 1450000, stock: 6, active: true, featured: false, images: [await up('#2f6feb', '#0f2b66')] }, token);
await call('/admin/products', 'POST', { name: 'Klassik soat', slug: 'klassik-soat', description: 'Charm tasma.', categoryId: soat, price: 245000, comparePrice: 300000, stock: 5, active: true, featured: true, images: [await up('#8a6d3b', '#3b2f1e')] }, token);
await call('/admin/store', 'PUT', { placeName: 'Fayz Market — Sinov', address: 'Toshkent sh., Chilonzor, 12-uy', lat: 41.2856, lng: 69.2034 }, token);
await call('/admin/payment-settings', 'PUT', { cash: true, cardTerminal: true, bankTransfer: false, bankTransferDetails: '', pickup: true, deliveryFeeMode: 'fixed', deliveryFee: 15000, deliveryFreeFrom: 0 }, token);

const original = { [C]: versionOf(C), [A]: versionOf(A) };
try {
  check('INFO', 'device', `${sh('getprop ro.product.model')} Android ${sh('getprop ro.build.version.release')}; installed ${original[C].name}/${original[C].code} (customer), ${original[A].name}/${original[A].code} (admin)`);
  const debuggable = pkg => /DEBUGGABLE/.test(sh(`dumpsys package ${pkg} | grep -m1 'flags=' || true`));
  if (!debuggable(C) || !debuggable(A)) throw new Error('install the DEBUG builds first (adb install -r apps/android/*/build/outputs/apk/debug/*.apk)');
  adb('reverse', `tcp:${PORT}`, `tcp:${PORT}`);

  // ================================================================ CUSTOMER
  expected = C; setApiUrl(C, API); launch(C); await pause(2500);
  let w = await webview(C, 9411);
  await w.waitFor(() => document.readyState === 'complete', 30000);
  await w.evaluate(() => { localStorage.clear(); location.reload(); return true; }); await pause(3000);
  ok(await w.waitFor(() => !!document.querySelector('.promo') && document.body.innerText.includes('Fayz Phone X'), 40000), 'customer: home from the isolated Worker (catalogue, banner)');
  const layout = await w.evaluate(() => ({ overflow: document.documentElement.scrollWidth - innerWidth, width: innerWidth, dpr: devicePixelRatio }));
  ok(layout.overflow <= 0, `customer home: no horizontal overflow at ${layout.width} CSS px (phone)`, JSON.stringify(layout));
  shot('40-e2e-c-home');
  // Auth: phone + code (local dev echo), typed with the phone keyboard
  await w.evaluate(() => { [...document.querySelectorAll('.tabbar button')].find(b => b.textContent.includes('Profil')).click(); return true; }); await pause(800);
  await w.click('Telefon raqam bilan kirish'); await w.waitFor(() => !!document.querySelector('.quick-login input[type=tel]'), 10000);
  await tapEl(w, '.quick-login input[type=tel]'); const kb1 = keyboardShown();
  await typeNative('901234567');
  ok(kb1 && (await w.evaluate(() => document.querySelector('.quick-login input[type=tel]').value)) === '90 123-45-67', 'sign-in: phone typed on the phone keyboard, formatted «90 123-45-67»', String(kb1));
  shot('41-e2e-c-phone-login');
  await w.click('Kodni olish'); await w.waitFor(() => !!document.querySelector('.quick-login .banner-warning .num'), 15000);
  const code = await w.evaluate(() => document.querySelector('.quick-login .banner-warning .num')?.textContent || '');
  await tapEl(w, '.quick-login .otp-single'); await typeNative(code); await pause(2500);
  if (await w.evaluate(() => !!document.querySelector('.quick-login input[autocomplete=name]'))) { await tapEl(w, '.quick-login input[autocomplete=name]'); await typeNative('Telefon Sinov'); await w.click('Saqlash'); await pause(2000); }
  ok(await w.waitFor(() => document.body.innerText.includes('Telefon Sinov') || document.body.innerText.includes('+998901234567'), 10000), 'sign-in with phone + SMS code (dev echo, local) → account shown in profile');
  await backKey(); // profile tab → Back → home (1.2.3 shell)
  ok(resumed().includes(C) && await w.evaluate(() => !!document.querySelector('.promo')), 'Back from a tab returns to the home tab (app stays open)', resumed());
  // Category + search with the keyboard
  await tapEl(w, '.cat-tile', 'Soatlar'); await pause(1200);
  ok(await w.evaluate(() => document.body.innerText.includes('Klassik soat') && !document.body.innerText.includes('Fayz Phone Lite')), 'category tile filters the catalogue');
  await tapEl(w, '.chips .chip', 'Barchasi'); await pause(800); // search the whole catalogue, not only «Soatlar»
  await tapEl(w, '.search-field input'); const kb2 = keyboardShown(); await typeNative('phone'); await pause(1500);
  ok(kb2 && await w.evaluate(() => document.body.innerText.includes('Fayz Phone X')), 'search with the phone keyboard finds «Fayz Phone X»', String(kb2));
  shot('42-e2e-c-search');
  await backKey(); // hides the keyboard
  // Product with variants
  await tapEl(w, '.pcard-hit', 'Fayz Phone X'); await w.waitFor(() => !!document.querySelector('.variant-picker'), 15000); await pause(800);
  shot('43-e2e-c-product');
  await tapEl(w, '.variant-opt', 'Oq'); await pause(700);
  let p = await w.evaluate(() => ({ price: document.querySelector('.detail-price')?.textContent.replace(/ /g, ' '), img: document.querySelector('.gallery .slide img')?.getAttribute('src') || '', stock: document.querySelector('.detail-info .badge')?.textContent }));
  ok(p.price?.includes('3 250 000') && p.img === WHITE && /3 dona/.test(p.stock || ''), 'tap «Oq» on the phone: price, photo and stock switch to that variant', JSON.stringify(p));
  await tapEl(w, '.action-bar .btn-primary'); await pause(600);
  await tapEl(w, '.variant-opt', 'Qora'); await tapEl(w, '.variant-opt', '256 GB'); await tapEl(w, '.action-bar .btn-primary'); await pause(600);
  shot('44-e2e-c-product-oq');
  const descBefore = await w.evaluate(() => document.querySelector('.desc-text')?.classList.contains('clamped'));
  await tapEl(w, '.desc-toggle'); const descOpen = await w.evaluate(() => !document.querySelector('.desc-text')?.classList.contains('clamped'));
  ok(descBefore && descOpen, '«Batafsil koʻrish» opens the long description on the phone');
  await backKey();
  ok(resumed().includes(C) && await w.evaluate(() => !document.querySelector('.detail')), 'Android Back on the product page returns to the list (app stays open)', resumed());
  // Cart + checkout
  await w.evaluate(() => { [...document.querySelectorAll('.tabbar button')].find(b => b.textContent.includes('Savat')).click(); return true; }); await pause(900);
  let t = (await w.text()).replace(/ /g, ' ');
  ok(t.includes('Oq · 128 GB') && t.includes('Qora · 256 GB') && t.includes('Yetkazib berish (kuryer)') && t.includes('15 000 soʻm'), 'cart: one row per variant, courier fee line', t.slice(0, 300));
  shot('45-e2e-c-cart');
  await tapEl(w, '.action-bar .btn-primary'); await w.waitFor(() => !!document.querySelector('.fulfil-choices'), 10000); await pause(800);
  shot('46-e2e-c-checkout');
  await tapEl(w, '.fulfil-choices .choice', 'Doʻkondan olib ketish'); await pause(400);
  t = (await w.text()).replace(/ /g, ' ');
  ok(t.includes('Qoʻshilmaydi') && t.includes('Olib ketish manzili'), 'pickup: no courier fee, store address');
  await tapEl(w, '.fulfil-choices .choice', 'Kuryer orqali'); await pause(400);
  await backKey();
  ok(resumed().includes(C) && await w.evaluate(() => !document.querySelector('.sheet')), 'Android Back closes the checkout sheet (app stays open)', resumed());
  await tapEl(w, '.action-bar .btn-primary'); await w.waitFor(() => !!document.querySelector('.fulfil-choices'), 10000);
  // Address: map pick + typed text (no real GPS)
  await tapEl(w, '.loc-choice button', 'Xaritada tanlash'); await w.waitFor(() => !!document.querySelector('.address-sheet'), 10000); await pause(3500);
  await tapEl(w, '.address-sheet textarea'); const kb3 = keyboardShown(); await typeNative('Chilonzor 9-kvartal 12-uy');
  const visible = await w.evaluate(() => { const r = document.querySelector('.address-sheet textarea').getBoundingClientRect(); return r.bottom <= innerHeight && r.top >= 0; });
  ok(kb3 && visible, 'keyboard open: the address field stays visible above it', `keyboard=${kb3} visible=${visible}`);
  shot('47-e2e-c-address-keyboard');
  await backKey(); // keyboard
  await w.click('Shu joyni tasdiqlash'); await pause(900);
  await tapEl(w, '.sheet input[autocomplete=name]'); await typeNative('Telefon');
  await w.evaluate(() => { const el = document.querySelector('.sheet input[type=tel]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '+998901234567'); el.dispatchEvent(new Event('input', { bubbles: true })); return true; });
  await backKey(); // keyboard
  await w.click('Buyurtmani yuborish'); await pause(3000);
  t = await w.text(); const orderNo = t.match(/FM-[A-Z0-9-]+/)?.[0];
  ok(!!orderNo && t.includes('Buyurtma qabul qilindi'), 'order placed from the phone', t.slice(0, 200));
  shot('48-e2e-c-order-placed');
  const orders = (await call('/admin/orders', 'GET', undefined, token)).orders;
  const placed = orders.find(o => o.orderNumber === orderNo);
  const detail = placed ? (await call(`/admin/orders/${placed.id}`, 'GET', undefined, token)).order : null;
  ok(!!detail && detail.total === 3250000 + 3700000 + 15000 && detail.items.some(i => i.variant === 'Oq · 128 GB') && detail.items.some(i => i.variant === 'Qora · 256 GB') && detail.address.includes('Chilonzor 9-kvartal'), 'D1: order lines keep the variants, server total incl. courier fee, typed address', JSON.stringify(detail && { total: detail.total, items: detail.items, address: detail.address }));
  w.close();

  // ================================================================ ADMIN
  expected = A; setApiUrl(A, API); launch(A); await pause(2500);
  w = await webview(A, 9412);
  await w.waitFor(() => !!document.querySelector('input[type=email]'), 30000);
  await tapEl(w, 'input[type=email]'); await typeNative('Telefon-Owner@example.invalid ');
  await tapEl(w, '.password-field input'); await typeNative(OWNER.password);
  shot('50-e2e-a-login-typed');
  await backKey(); await w.click('Kirish');
  ok(await w.waitFor(() => !!document.querySelector('.sidebar'), 20000), 'admin login on the phone keyboard (email with a capital letter and a trailing space) → signed in');
  shot('51-e2e-a-dashboard');
  const before = resumed();
  await tapEl(w, '.menu-btn'); await pause(900);
  const drawerOpen = await w.evaluate(() => !!document.querySelector('.sidebar.open'));
  await backKey();
  const after = { open: await w.evaluate(() => !!document.querySelector('.sidebar.open')), resumed: resumed() };
  ok(drawerOpen && !after.open && after.resumed.includes(A), 'Android Back closes the admin drawer (app stays open)', JSON.stringify({ before, drawerOpen, after }));
  const nav = async name => { await w.evaluate(n => { [...document.querySelectorAll('.side-nav button')].find(b => b.textContent.includes(n)).click(); return true; }, name); await pause(1500); };
  await nav('Buyurtmalar');
  ok(await w.waitFor(no => document.body.innerText.includes(no), 20000, orderNo), 'admin orders list shows the order placed on the phone');
  await w.evaluate(no => { [...document.querySelectorAll('.m-card, .table tbody tr')].find(r => r.textContent.includes(no))?.click(); return true; }, orderNo); await w.waitFor(() => !!document.querySelector('.modal'), 10000); await pause(800);
  shot('52-e2e-a-order');
  for (const [label, status] of [['Tasdiqlangan', 'confirmed'], ['Tayyorlanmoqda', 'preparing'], ['Yoʻlda', 'shipped'], ['Yetkazildi', 'delivered']]) {
    // The real button on the phone screen (status-actions inside the order dialog)
    let clicked = true; try { await tapEl(w, '.status-actions button', label); } catch { clicked = false; }
    await pause(1800);
    const now = (await call(`/admin/orders/${placed.id}`, 'GET', undefined, token)).order.status;
    ok(clicked && now === status, `admin status → ${status} from the phone`, `clicked=${clicked} now=${now}`);
  }
  shot('53-e2e-a-order-delivered');
  await backKey();
  ok(await w.evaluate(() => !document.querySelector('.modal')) && resumed().includes(A), 'Android Back closes the order dialog');
  // Admin: variants product + image upload through the WebView pipeline (no gallery)
  await nav('Mahsulotlar'); await w.evaluate(() => { [...document.querySelectorAll('button')].find(b => b.textContent.includes('Mahsulot qoʻshish'))?.click(); return true; }); await w.waitFor(() => !!document.querySelector('.modal'), 10000);
  await tapEl(w, '.modal label.field input'); await typeNative('Telefon sinov quloqchin');
  ok((await w.evaluate(() => document.querySelector('.modal label.field input').value)) === 'Telefon sinov quloqchin' && keyboardShown(), 'U01 on the phone: product name typed in one go, keyboard stays open');
  await backKey(); // keyboard only
  await w.setValue('.modal input[pattern]', 'telefon-quloqchin');
  await w.evaluate(id => { const s = document.querySelector('.modal select'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, String(id)); s.dispatchEvent(new Event('change', { bubbles: true })); return true; }, tel);
  const uploaded = await w.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 400; c.height = 400; const g = c.getContext('2d'); g.fillStyle = '#FFCC29'; g.fillRect(0, 0, 400, 400); g.fillStyle = '#111'; g.fillRect(100, 100, 200, 200);
    const blob = await new Promise(r => c.toBlob(r, 'image/png')); const dt = new DataTransfer(); dt.items.add(new File([blob], 'telefon-sinov.png', { type: 'image/png' }));
    const input = document.querySelector('.modal input[type=file]:not([capture])'); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true }));
    for (let i = 0; i < 40 && !document.querySelector('.modal .picker-preview'); i++) await new Promise(r => setTimeout(r, 300));
    return !!document.querySelector('.modal .picker-preview');
  }) ? await (async () => {
    await tapEl(w, '.modal .picker-actions .btn-primary', 'Yuklash'); // the owner's own tap on «Yuklash»
    await w.waitFor(() => !!document.querySelector('.modal .image-tile img'), 20000);
    return w.evaluate(() => document.querySelector('.modal .image-tile img')?.getAttribute('src') || '');
  })() : '';
  shot('53b-e2e-a-image-uploaded');
  ok(/\/images\/[a-f0-9]{32}\.(jpg|png|webp)$/.test(uploaded), 'image upload from the phone WebView (prepare → Worker → local R2)', uploaded);
  await w.evaluate(() => { [...document.querySelectorAll('.axis-presets button')].find(b => b.textContent.includes('Rang')).click(); return true; }); await pause(300);
  await tapEl(w, '.axis-card .value-adder input'); await typeNative('Qora,Oq'); sh('input keyevent KEYCODE_ENTER'); await pause(600);
  const rows = await w.evaluate(() => [...document.querySelectorAll('.variant-rows li .variant-name strong')].map(e => e.textContent));
  ok(JSON.stringify(rows) === '["Qora","Oq"]', 'admin variant editor on the phone: colour values typed → two variant rows', JSON.stringify(rows));
  await backKey(); shot('54-e2e-a-variant-editor');
  await w.evaluate(() => { document.querySelector('.modal-foot .btn-primary').click(); return true; }); await pause(2500);
  const created = (await call('/admin/products', 'GET', undefined, token)).products.find(x => x.slug === 'telefon-quloqchin');
  const full = created ? (await call(`/admin/products/${created.id}`, 'GET', undefined, token)).product : null;
  ok(!!full && full.variants.length === 2 && full.images.length === 1, 'D1/R2: product with 2 variants and the uploaded photo saved', JSON.stringify(full && { v: full.variants.length, img: full.images }));
  // Admin: tariff + payment settings (isolated DB), integrations, dark mode
  await nav('Sozlamalar'); await pause(800);
  await w.evaluate(() => { [...document.querySelectorAll('.segmented button')].find(b => b.textContent.includes('Operator aniqlaydi'))?.click(); return true; }); await pause(300);
  await w.evaluate(() => { [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Saqlash' && b.closest('.panel')?.textContent.includes('Kuryer orqali yetkazish narxi'))?.click(); return true; }); await pause(1500);
  const sf = await (await fetch(API + '/storefront')).json();
  ok(sf.checkout.deliveryFeeMode === 'quote', 'courier tariff changed on the phone → storefront «quote»', JSON.stringify(sf.checkout));
  shot('55-e2e-a-settings');
  await w.evaluate(() => { [...document.querySelectorAll('button, [role=radio]')].find(b => b.textContent.trim() === 'Qorongʻi')?.click(); return true; }); await pause(1000);
  shot('56-e2e-a-dark');
  ok(await w.evaluate(() => getComputedStyle(document.documentElement).colorScheme.includes('dark') || document.documentElement.dataset.theme === 'dark'), 'admin dark mode on the phone');
  await w.evaluate(() => { [...document.querySelectorAll('button, [role=radio]')].find(b => b.textContent.trim() === 'Yorugʻ')?.click(); return true; }); await pause(600);
  await nav('Integratsiyalar'); await pause(800); shot('57-e2e-a-integrations');
  ok(await w.evaluate(() => /Sozlanmagan/.test(document.body.innerText)), 'integrations list (no credentials → «Sozlanmagan»)');
  await backKey();
  ok(await w.evaluate(() => document.body.innerText.includes('Kunlik savdo')) && resumed().includes(A), 'Android Back from a section returns to «Boshqaruv»');
  w.close();

  // ================================================================ CUSTOMER sees the status + theme + offline
  expected = C; launch(C); await pause(2500); w = await webview(C, 9411);
  await w.evaluate(() => { [...document.querySelectorAll('.tabbar button')].find(b => b.textContent.includes('Buyurtmalar')).click(); return true; }); await pause(2500);
  ok(await w.waitFor(() => /Yetkazildi|Topshirildi/.test(document.body.innerText), 20000), 'customer sees the status the admin set («Yetkazildi»)');
  shot('58-e2e-c-order-delivered');
  await w.evaluate(() => { [...document.querySelectorAll('.tabbar button')].find(b => b.textContent.includes('Profil')).click(); return true; }); await pause(800);
  await w.evaluate(() => { [...document.querySelectorAll('.theme-opt')].find(b => b.textContent.includes('Qora'))?.click(); return true; }); await pause(1000);
  shot('59-e2e-c-dark');
  ok(await w.evaluate(() => document.documentElement.dataset.theme === 'black'), 'customer dark theme on the phone');
  await w.evaluate(() => { [...document.querySelectorAll('.theme-opt')].find(b => b.textContent.includes('Sariq'))?.click(); return true; }); await pause(500);
  stopWorker(); await pause(1500);
  await w.evaluate(() => { [...document.querySelectorAll('.tabbar button')].find(b => b.textContent.includes('Katalog')).click(); return true; }); await pause(500);
  await w.evaluate(() => { const i = document.querySelector('.search-field input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'yoq'); i.dispatchEvent(new Event('input', { bubbles: true })); return true; }); await pause(3000);
  t = await w.text();
  ok(/Aloqa yoʻq|yuklanmadi|Qayta urinish/.test(t), 'server unreachable: clear error with «Qayta urinish» (no crash)', t.slice(0, 200));
  shot('60-e2e-c-offline');
  w.close();
} catch (error) {
  const msg = String(error?.message || error), lost = /device offline|not found|no devices|closed|ECONNRESET|FOREGROUND_LOST|no answer in/.test(msg);
  check(lost ? 'BLOCKED' : 'FAIL', lost ? (/FOREGROUND_LOST/.test(msg) ? 'another app came to the front (no input sent to it) — remaining steps not run' : 'phone connection / WebView lost — remaining steps not run') : 'E2E script completed', String(error?.stack || error).split('\n').slice(0, 3).join(' '));
} finally {
  for (const pkg of [C, A]) { try { setApiUrl(pkg, null); } catch { /* phone gone */ } }
  try { adb('reverse', '--remove', `tcp:${PORT}`); } catch { /* none */ }
  stopWorker(); rmSync(dir, { recursive: true, force: true });
  const n = s => results.filter(r => r.startsWith(s)).length;
  writeFileSync(RESULTS, `${KIND} — debug apps against an ISOLATED local Worker (fresh D1, local R2); production not contacted\n${new Date().toISOString()}\n${results.join('\n')}\n\nPASS ${n('PASS')} · FAIL ${n('FAIL')} · BLOCKED ${n('BLOCKED')}\n`);
  console.log(`\nPASS ${n('PASS')} · FAIL ${n('FAIL')} · BLOCKED ${n('BLOCKED')}`);
  process.exitCode = n('FAIL') || n('BLOCKED') ? 1 : 0;
}
