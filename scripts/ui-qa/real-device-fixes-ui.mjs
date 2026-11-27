// Fayz Market V1 1.2.2 — Chrome UI checks for the fixes after the owner's real-device test (Samsung Galaxy A17).
// Built bundles (apps/*/dist) against an ISOLATED local Worker with a fresh D1 — never production.
//
//  U01  typing in admin forms/dialogs keeps focus (real key presses, character by character)
//  A01  admin login (capitals/space in email, honest errors), lock with fingerprint vs. full sign-out, re-login
//  A06/C07  variants: admin builds colour × memory variants in the editor; customer picks colour/memory,
//       sees that variant's price, photo and stock, adds it to the cart; the order keeps the variant
//  C05/C06  long description opens/closes, characteristics, related products open the real product page
//  C11/C12  one address picker on home, profile and checkout; low-accuracy GPS must be corrected; denied GPS → manual
//  C14/C15  pickup vs courier, goods / discount / courier fee / total lines; unknown tariff never guessed
//  C13  store map: in-app route when routing is configured, honest note otherwise
// Widths: 360, 390, 412 (Android) and 1280 (desktop admin).
//
//   npm run build -w @fayz/customer && npm run build -w @fayz/admin
//   node scripts/ui-qa/real-device-fixes-ui.mjs
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
const PORT = Number(process.env.QA_WORKER_PORT || 8809), MOCK_PORT = Number(process.env.QA_MOCK_PORT || 8810);
const API = `http://127.0.0.1:${PORT}`, MOCK = `http://127.0.0.1:${MOCK_PORT}`;
const SHOTS = path.resolve(ROOT, process.env.SHOTS || 'docs/v1/screenshots/real-device-fixes');
const EVIDENCE = path.resolve(ROOT, process.env.EVIDENCE || 'docs/v1/evidence/real-device-fixes');
mkdirSync(SHOTS, { recursive: true }); mkdirSync(EVIDENCE, { recursive: true });
for (const app of ['customer', 'admin']) {
  const assets = path.join(ROOT, 'apps', app, 'dist', 'assets');
  for (const f of readdirSync(assets).filter(f => f.endsWith('.js'))) if (/https:\/\/[a-z0-9.-]+\.workers\.dev/.test(readFileSync(path.join(assets, f), 'utf8'))) { console.error(`apps/${app}/dist points at production (${f}). Rebuild without VITE_API_URL.`); process.exit(2); }
}
const results = []; let failed = 0;
const check = (ok, label, extra = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${label}${!ok && extra ? ' — ' + String(extra).slice(0, 400) : ''}`); if (!ok) failed++; console.log(results.at(-1)); };
const section = name => { results.push(`\n## ${name}`); console.log(`\n## ${name}`); };
const pause = ms => new Promise(r => setTimeout(r, ms));
const mime = f => f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.woff2') ? 'font/woff2' : f.endsWith('.webp') ? 'image/webp' : f.endsWith('.png') ? 'image/png' : 'text/html';
const plain = s => String(s).replace(/ /g, ' ');

// ---------- ORS mock + isolated Worker ----------
const ORS_KEY = 'ors-122-' + randomBytes(8).toString('hex');
const mock = createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  if (req.url === '/ors/v2/directions/driving-car/geojson' && req.headers.authorization === ORS_KEY) {
    const [[a, b], [c, d]] = JSON.parse(Buffer.concat(chunks)).coordinates;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ features: [{ properties: { summary: { distance: 6420, duration: 960 } }, geometry: { coordinates: [[a, b], [a, (b + d) / 2], [c, (b + d) / 2], [c, d]] } }] }));
  }
  res.writeHead(404); res.end('{}');
});
await new Promise(r => mock.listen(MOCK_PORT, '127.0.0.1', r));
const dir = mkdtempSync(path.join(tmpdir(), 'fayz-122-ui-'));
writeFileSync(path.join(dir, 'env'), `DEV_MOCK_PROVIDERS=${MOCK}\n`);
const worker = spawn('bash', [path.join(ROOT, 'scripts/deploy-qa/local-worker.sh'), path.join(dir, 'db')], { env: { ...process.env, QA_PORT: String(PORT), QA_ENV_FILE: path.join(dir, 'env') }, stdio: 'ignore', detached: true });
const stop = () => { try { process.kill(-worker.pid, 'SIGTERM'); } catch { /* gone */ } mock.close(); rmSync(dir, { recursive: true, force: true }); };
for (let i = 0; i < 240; i++) { try { if ((await fetch(API + '/health')).ok) break; } catch { /* starting */ } await pause(500); }

async function call(p, method = 'GET', body, token, type) {
  const binary = Buffer.isBuffer(body);
  const r = await fetch(API + p, { method, headers: { ...(body !== undefined ? { 'Content-Type': type || (binary ? 'image/png' : 'application/json') } : {}), ...(token ? { Authorization: token.includes(' ') ? token : `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : binary ? body : JSON.stringify(body) });
  const data = await r.json(); if (!r.ok) throw Object.assign(new Error(p + ': ' + JSON.stringify(data)), { status: r.status, data }); return data;
}
const picture = (a, b) => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="600" height="600" fill="url(#g)"/><circle cx="300" cy="300" r="150" fill="rgba(255,255,255,.25)"/></svg>`)).png().toBuffer();

// ---------- Seed (local only) ----------
const OWNER = { email: 'owner122@example.invalid', password: 'Owner122-LocalPass' };
await fetch(API + '/admin/bootstrap', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Bootstrap-Secret': 'qa-bootstrap' }, body: JSON.stringify(OWNER) });
const { token } = await call('/admin/login', 'POST', OWNER);
const cat = (await call('/admin/categories', 'POST', { name: 'Telefonlar', slug: 'telefonlar' }, token)).id;
const cat2 = (await call('/admin/categories', 'POST', { name: 'Soatlar', slug: 'soatlar' }, token)).id;
const up = async (a, b) => (await call('/admin/images', 'POST', await picture(a, b), token)).url;
const BLACK = await up('#1d1d1f', '#4a4a4f'), WHITE = await up('#f5f5f7', '#cfcfd4'), LITE = await up('#2f6feb', '#0f2b66'), WATCH = await up('#8a6d3b', '#3b2f1e');
const LONG = 'Fayz Phone — kundalik ish va suratga olish uchun qulay smartfon. ' + 'Katta batareya bir kunga bemalol yetadi, ekran quyoshda ham yaxshi koʻrinadi. '.repeat(6) + '\nToʻplamda: telefon, zaryadlovchi, gʻilof.';
const axes = [{ name: 'Rang', values: ['Qora', 'Oq'] }, { name: 'Xotira', values: ['128 GB', '256 GB'] }];
const PHONE = (await call('/admin/products', 'POST', { name: 'Fayz Phone X', slug: 'fayz-phone-x', description: LONG, categoryId: cat, price: 3200000, stock: 0, active: true, featured: true, images: [BLACK, WHITE],
  attributes: [{ name: 'Ekran', value: '6,7″ AMOLED' }, { name: 'Batareya', value: '5000 mAh' }, { name: 'Kafolat', value: '12 oy' }], options: axes,
  variants: [
    { options: { Rang: 'Qora', Xotira: '128 GB' }, price: 3200000, comparePrice: 3600000, stock: 4, image: BLACK },
    { options: { Rang: 'Qora', Xotira: '256 GB' }, price: 3700000, stock: 2, image: BLACK },
    { options: { Rang: 'Oq', Xotira: '128 GB' }, price: 3250000, stock: 3, image: WHITE },
    { options: { Rang: 'Oq', Xotira: '256 GB' }, price: 3750000, stock: 0, image: WHITE },
  ] }, token)).id;
const LITE_ID = (await call('/admin/products', 'POST', { name: 'Fayz Phone Lite', slug: 'fayz-phone-lite', description: 'Arzon va yengil.', categoryId: cat, price: 1450000, stock: 6, active: true, featured: false, images: [LITE], attributes: [{ name: 'Kafolat', value: '12 oy' }] }, token)).id;
await call('/admin/products', 'POST', { name: 'Klassik qoʻl soati', slug: 'klassik-soat', description: 'Charm tasmali.', categoryId: cat2, price: 245000, comparePrice: 300000, stock: 5, active: true, featured: true, images: [WATCH] }, token);
await call('/admin/store', 'PUT', { placeName: 'Fayz Market — Chilonzor', address: 'Toshkent sh., Chilonzor tumani, Bunyodkor shoh koʻchasi, 12', lat: 41.2856, lng: 69.2034 }, token);
const settings = { cash: true, cardTerminal: true, bankTransfer: false, bankTransferDetails: '', pickup: true };
await call('/admin/payment-settings', 'PUT', { ...settings, deliveryFeeMode: 'fixed', deliveryFee: 15000, deliveryFreeFrom: 0 }, token);
await call('/admin/integrations/routing/secrets', 'PUT', { ORS_API_KEY: ORS_KEY }, token);
await call('/admin/users', 'POST', { email: 'kuryer122@example.invalid', password: 'Kuryer122-LocalPass', role: 'courier', name: 'Aziz Kuryer', phone: '+998901234567' }, token);

// ---------- Browser ----------
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const HOME_FIX = { latitude: 41.3111, longitude: 69.2797, accuracy: 18 };
/** Fingerprint bridge of the Android shell, imitated: the "Keystore" survives reloads, unlock returns what enable stored. */
const fakeBiometrics = () => {
  const KEY = '__qa_keystore';
  window.FayzNative = {
    isDebug: () => false, share() {}, setSystemBars() {},
    biometricStatus: () => 'available', biometricStored: () => !!localStorage.getItem(KEY),
    biometricEnable(secret, id) { localStorage.setItem(KEY, secret); setTimeout(() => window.__fayzNative(id, true, 'ok'), 30); },
    biometricUnlock(id) { const v = localStorage.getItem(KEY); setTimeout(() => window.__fayzNative(id, !!v, v || 'empty'), 30); },
    biometricDisable() { localStorage.removeItem(KEY); },
  };
};
async function open(app, { width = 390, height = 844, geo = true, fix = HOME_FIX, storage = {}, bio = false } = {}) {
  const ctx = await browser.createBrowserContext();
  if (geo) await ctx.overridePermissions(API, ['geolocation']);
  const page = await ctx.newPage(); page.setDefaultTimeout(20000);
  await page.setViewport({ width, height, isMobile: width < 700, hasTouch: width < 700, deviceScaleFactor: 2 });
  if (geo) await page.setGeolocation(fix);
  await page.setRequestInterception(true);
  page.on('request', async req => { const u = new URL(req.url()); if (u.origin === API && u.pathname.startsWith('/__app/')) { const f = path.join(ROOT, 'apps', app, 'dist', u.pathname.slice(7)); try { return req.respond({ status: 200, contentType: mime(f), body: await readFile(f) }); } catch { return req.respond({ status: 404, body: '' }); } } req.continue(); });
  page.on('pageerror', e => check(false, `${app} page error`, e.message));
  if (bio) await page.evaluateOnNewDocument(fakeBiometrics);
  await page.evaluateOnNewDocument(s => { for (const [k, v] of Object.entries(s)) if (localStorage.getItem(k) == null) localStorage.setItem(k, v); }, storage);
  await page.goto(`${API}/__app/index.html`, { waitUntil: 'networkidle0' });
  return { page, ctx };
}
const shot = (page, name, full = false) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: full });
const text = async page => plain(await page.evaluate(() => document.body.innerText));
/** Clicks the last element (visible or inside a closed menu) whose label/text contains `label`. */
const click = async (page, label, sel = 'button, a', visibleOnly = true) => { const ok = await page.evaluate((t, s, v) => { const els = [...document.querySelectorAll(s)].filter(e => [e.getAttribute('aria-label'), e.getAttribute('title'), e.textContent].some(x => (x || '').includes(t)) && (!v || e.offsetParent !== null)); els.at(-1)?.click(); return !!els.length; }, label, sel, visibleOnly); await pause(450); return ok; };
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
/** Real key presses into the field labelled `label` (inside `scope`); returns value + whether that field still has focus. */
async function typeInto(page, scope, label, value, { clear = false } = {}) {
  const handle = await page.evaluateHandle((s, l) => [...document.querySelectorAll(`${s} label.field`)].find(f => f.querySelector('.field-label')?.textContent.trim() === l)?.querySelector('input, textarea'), scope, label);
  const el = handle.asElement(); if (!el) return { value: null, focused: false };
  await el.click(); await page.keyboard.press('End'); if (clear) { await page.keyboard.down('Meta'); await page.keyboard.press('KeyA'); await page.keyboard.up('Meta'); await page.keyboard.press('Backspace'); }
  await page.keyboard.type(value, { delay: 25 });
  return el.evaluate(node => ({ value: node.value, focused: document.activeElement === node }));
}
const adminLogin = async (page, email, password) => {
  await page.waitForSelector('input[type=email]');
  await page.click('input[type=email]', { clickCount: 3 }); await page.keyboard.type(email, { delay: 10 });
  await page.click('.password-field input', { clickCount: 3 }); await page.keyboard.type(password, { delay: 10 });
  await click(page, 'Kirish', 'button[type=submit], .login-card button');
};
const nav = async (page, label) => { await page.evaluate(l => [...document.querySelectorAll('.side-nav button')].find(b => b.textContent.includes(l))?.click(), label); await pause(900); };

try {
  // =============================================================== U01: focus
  section('U01 — typing keeps focus in admin forms and dialogs (390 px, real key presses)');
  {
    const { page, ctx } = await open('admin', { width: 390 });
    await adminLogin(page, OWNER.email, OWNER.password); await page.waitForSelector('.side-nav');
    await nav(page, 'Sozlamalar'); await page.waitForSelector('.add-admin');
    for (const [label, value] of [['Ism', 'Bekzod Kuryer'], ['Telefon', '901234568'], ['Email (login)', 'bekzod.kuryer@example.invalid'], ['Parol', 'Kuryer-Yangi-2026']]) {
      const r = await typeInto(page, '.add-admin', label, value);
      const expected = label === 'Telefon' ? '+998901234568' : value;
      check(r.value === expected && r.focused, `staff form «${label}»: every character lands, field keeps focus`, JSON.stringify(r));
    }
    await click(page, 'Qoʻshish', '.add-admin button'); await pause(1500);
    const staff = (await call('/admin/users', 'GET', undefined, token)).users;
    check(staff.some(u => u.email === 'bekzod.kuryer@example.invalid' && u.role === 'courier'), 'new courier saved from the form');
    // The bug the owner hit: the reset-password dialog lost focus after the first character.
    await page.evaluate(() => [...document.querySelectorAll('.rows li')].find(li => li.textContent.includes('Bekzod'))?.querySelector('button[title="Parolni tiklash"]')?.click()); await page.waitForSelector('.modal'); await pause(300);
    let r = await typeInto(page, '.modal', 'Yangi parol', 'Tiklangan-Parol-2026');
    check(r.value === 'Tiklangan-Parol-2026' && r.focused, 'reset-password dialog: full password typed without re-tapping (was 1 character before the fix)', JSON.stringify(r));
    await shot(page, 'admin-reset-password-typing-390');
    await click(page, 'Saqlash', '.modal button'); await pause(1200);
    const login = await fetch(API + '/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'bekzod.kuryer@example.invalid', password: 'Tiklangan-Parol-2026' }) });
    check(login.status === 200, 'courier can sign in with the password typed in that dialog');
    await nav(page, 'Mahsulotlar'); await click(page, 'Mahsulot qoʻshish', 'button', false); await page.waitForSelector('.modal');
    r = await typeInto(page, '.modal', 'Nomi', 'Fokus sinovi mahsuloti');
    check(r.value === 'Fokus sinovi mahsuloti' && r.focused, 'product dialog «Nomi»: typing keeps focus', JSON.stringify(r));
    r = await typeInto(page, '.modal', 'Mahsulot haqida', 'Uzun tavsif matni');
    check(r.value === 'Uzun tavsif matni' && r.focused, 'product dialog description: typing keeps focus', JSON.stringify(r));
    await click(page, 'Bekor qilish', '.modal-foot button');
    await nav(page, 'Integratsiyalar'); await page.waitForSelector('.int-row');
    await page.evaluate(() => [...document.querySelectorAll('.int-row')].find(x => x.textContent.includes('Payme'))?.click()); await page.waitForSelector('.modal'); await pause(400);
    const sec = await page.$('.modal input[type=password]');
    if (sec) { await sec.click(); await page.keyboard.type('maxfiy-kalit-12345', { delay: 20 }); const v = await sec.evaluate(n => ({ value: n.value, focused: document.activeElement === n })); check(v.value === 'maxfiy-kalit-12345' && v.focused, 'integration dialog secret field: typing keeps focus', JSON.stringify(v)); }
    else check(false, 'integration dialog has a secret field');
    await ctx.close();
  }

  // =============================================================== A01: login / lock / sign-out
  section('A01 — admin login, fingerprint lock vs. sign-out (fingerprint bridge imitated in Chrome)');
  {
    const { page, ctx } = await open('admin', { width: 1280, height: 860, bio: true });
    await adminLogin(page, 'wrong@example.invalid', 'Notogri-Parol-1');
    await pause(800); let t = await text(page);
    check(/Email yoki parol notoʻgʻri\. Yana \d ta urinish qoldi/.test(t), 'wrong password: clear message with attempts left', t.slice(0, 200));
    await adminLogin(page, '  OWNER122@example.invalid ', OWNER.password); await page.waitForSelector('.side-nav');
    check(true, 'email typed with capitals and a trailing space → signed in');
    await nav(page, 'Sozlamalar'); await page.waitForSelector('.toggle');
    await page.evaluate(() => [...document.querySelectorAll('.toggle')].find(x => x.textContent.includes('Barmoq izi'))?.querySelector('input')?.click()); await pause(900);
    t = await text(page);
    check(t.includes('Ilovani qulflash') && t.includes('Hisobdan chiqish'), 'fingerprint on → «Ilovani qulflash» and «Hisobdan chiqish» are two separate actions');
    await shot(page, 'admin-lock-and-signout-1280');
    const tokenBefore = await page.evaluate(() => sessionStorage.getItem('fayz_admin_token'));
    await click(page, 'Ilovani qulflash'); await page.waitForSelector('.login-card'); t = await text(page);
    check(t.includes('Ilova qulflangan') && t.includes('Barmoq izi bilan ochish') && !await page.evaluate(() => sessionStorage.getItem('fayz_admin_token')), 'lock: session leaves memory, lock screen asks for the fingerprint');
    await shot(page, 'admin-locked-1280');
    const meLocked = await fetch(API + '/admin/me', { headers: { Authorization: `Bearer ${tokenBefore}` } });
    check(meLocked.status === 200, 'lock does not end the server session (quick reopen)');
    await click(page, 'Barmoq izi bilan ochish'); await page.waitForSelector('.side-nav'); await pause(600);
    check(await page.evaluate(() => sessionStorage.getItem('fayz_admin_token')) === tokenBefore, 'fingerprint unlock reopens the same session');
    await page.reload({ waitUntil: 'networkidle0' }); await pause(500);
    check((await text(page)).includes('Boshqaruv paneli') || !!await page.$('.side-nav'), 'app reload while unlocked stays signed in');
    await click(page, 'Hisobdan chiqish'); await page.waitForSelector('input[type=email]'); await pause(500);
    const after = await fetch(API + '/admin/me', { headers: { Authorization: `Bearer ${tokenBefore}` } });
    check(after.status === 401 && !await page.evaluate(() => localStorage.getItem('__qa_keystore')), 'sign-out: server session revoked AND fingerprint sign-in removed from this phone');
    t = await text(page);
    check(!t.includes('Barmoq izi bilan ochish'), 'after sign-out the fingerprint cannot reopen the account (password required)');
    await adminLogin(page, OWNER.email, OWNER.password); await page.waitForSelector('.side-nav');
    check(true, 'sign in again with the correct password right after sign-out → works');
    await ctx.close();
  }

  // =============================================================== A06/A03: variants in the admin editor
  section('A06/A03 — admin builds colour × memory variants and characteristics');
  {
    const { page, ctx } = await open('admin', { width: 1280, height: 900 });
    await adminLogin(page, OWNER.email, OWNER.password); await page.waitForSelector('.side-nav');
    await nav(page, 'Mahsulotlar'); await click(page, 'Mahsulot qoʻshish', 'button', false); await page.waitForSelector('.modal');
    await typeInto(page, '.modal', 'Nomi', 'Simsiz quloqchin');
    await typeInto(page, '.modal', 'Slug', 'simsiz-quloqchin');
    await page.select('.modal select', String(cat));
    await typeInto(page, '.modal', 'Narx', '450000');
    await click(page, 'Rang', '.axis-presets button');
    await page.click('.axis-card .value-adder input'); await page.keyboard.type('Qora, Oq', { delay: 15 }); await page.keyboard.press('Enter'); await pause(200);
    await click(page, 'Model', '.axis-presets button');
    const adders = await page.$$('.axis-card .value-adder input'); await adders[1].click(); await page.keyboard.type('Pro', { delay: 15 }); await page.keyboard.press('Enter');
    await adders[1].click(); await page.keyboard.type('Lite', { delay: 15 }); await page.keyboard.press('Enter'); await pause(300);
    let rows = await page.$$eval('.variant-rows li .variant-name strong', els => els.map(e => e.textContent));
    check(JSON.stringify(rows) === JSON.stringify(['Qora · Pro', 'Qora · Lite', 'Oq · Pro', 'Oq · Lite']), 'editor generates every colour × model combination, no duplicates', JSON.stringify(rows));
    const price = await page.$$('.variant-rows li .variant-field input');
    await price[0].click({ clickCount: 3 }); await page.keyboard.type('520000');
    const stockInputs = await page.$$eval('.variant-rows li', lis => lis.map(li => [...li.querySelectorAll('.variant-field')].find(f => f.textContent.includes('Qoldiq'))?.querySelector('input')?.id || ''));
    for (let i = 0; i < 4; i++) { const field = (await page.$$('.variant-rows li'))[i]; const inp = await field.evaluateHandle(li => [...li.querySelectorAll('.variant-field')].find(f => f.textContent.includes('Qoldiq')).querySelector('input')); await inp.asElement().click({ clickCount: 3 }); await page.keyboard.type(String(i + 1)); }
    await page.evaluate(() => { const li = [...document.querySelectorAll('.variant-rows li')].at(-1); li.querySelector('.variant-active input').click(); });
    await click(page, 'Xususiyat qoʻshish', '.attr-editor button');
    const attr = await page.$$('.attr-row input'); await attr[0].click(); await page.keyboard.type('Batareya'); await attr[1].click(); await page.keyboard.type('30 soat');
    await shot(page, 'admin-variant-editor-1280', true);
    await click(page, 'Saqlash', '.modal-foot button'); await pause(1500);
    const list = (await call('/admin/products', 'GET', undefined, token)).products; const made = list.find(p => p.slug === 'simsiz-quloqchin');
    const saved = made ? (await call(`/admin/products/${made.id}`, 'GET', undefined, token)).product : null;
    check(saved?.variants.length === 4 && saved.variants.find(v => v.label === 'Qora · Pro')?.price === 520000 && saved.variants.filter(v => !v.active).length === 1, 'saved: 4 variants, own price, one switched off', JSON.stringify(saved?.variants?.map(v => [v.label, v.price, v.stock, v.active])));
    check(saved?.variants.map(v => v.stock).join(',') === '1,2,3,4' && JSON.stringify(saved?.attributes) === '[{"name":"Batareya","value":"30 soat"}]', 'saved: per-variant stock and the characteristic', JSON.stringify(saved?.attributes));
    await page.waitForSelector('.table'); await pause(300);
    check((await text(page)).includes('3 variant'), 'products list shows the variant count');
    await page.evaluate(id => [...document.querySelectorAll('.table tbody tr')].find(r => r.textContent.includes('Simsiz quloqchin'))?.querySelector('button[title="Qoldiq"]')?.click(), made?.id); await page.waitForSelector('.modal');
    check(!!await page.$('.modal select'), 'stock change of a variant product asks which variant');
    await shot(page, 'admin-variant-stock-1280');
    await ctx.close();
  }

  // =============================================================== Customer: product page, cart, checkout
  for (const width of [360, 390, 412]) {
    section(`Customer product page, cart and checkout — ${width} px`);
    const { page, ctx } = await open('customer', { width, height: 820 });
    await page.waitForSelector('.pcard');
    const card = await page.evaluate(() => [...document.querySelectorAll('.pcard')].find(c => c.textContent.includes('Fayz Phone X'))?.innerText || '');
    check(plain(card).includes('3 200 000 soʻm dan') && card.includes('4 ta variant'), 'product card: «… dan» price and variant count', card);
    // «+» on a variant product opens its page (the variant must be chosen)
    await page.evaluate(() => [...document.querySelectorAll('.pcard')].find(c => c.textContent.includes('Fayz Phone X'))?.querySelector('.pcard-add')?.click());
    await page.waitForSelector('.variant-picker'); await pause(700);
    let t = await text(page);
    check(t.includes('Rang') && t.includes('Xotira') && t.includes('Qora') && t.includes('Oq') && t.includes('256 GB'), '«+» on a variant product opens the page with colour and memory choices');
    check(plain(t).includes('3 200 000 soʻm') && plain(t).includes('3 600 000 soʻm') && t.includes('−11%') && t.includes('4 dona mavjud'), 'first in-stock variant pre-selected: its price, old price, discount and stock', t.slice(0, 300));
    if (width === 390) await shot(page, 'customer-product-top-390');
    const small = await page.$$eval('.variant-opt', els => els.filter(e => e.getBoundingClientRect().height < 44).length);
    check(small === 0, 'variant chips are at least 44 px tall (touch target)');
    const img1 = await page.$eval('.gallery .slide img', el => el.getAttribute('src')).catch(() => '');
    await click(page, 'Oq', '.variant-opt'); await pause(600);
    t = await text(page);
    const img2 = await page.$eval('.gallery .slide img', el => el.getAttribute('src')).catch(() => '');
    check(plain(t).includes('3 250 000 soʻm') && t.includes('3 dona mavjud') && img2 === WHITE && img1 !== img2, 'choose «Oq»: price, stock and photo switch to that variant', JSON.stringify({ img2, img1 }));
    const out = await page.evaluate(() => [...document.querySelectorAll('.variant-opt')].find(b => b.textContent === '256 GB')?.className || '');
    check(/\bout\b/.test(out), '«Oq · 256 GB» (0 in stock) is shown crossed out');
    check(t.includes('Xususiyatlar') && t.includes('6,7″ AMOLED') && t.includes('5000 mAh'), 'characteristics shown, incl. the chosen options');
    const clamped = await page.$eval('.desc-text', el => el.classList.contains('clamped'));
    await click(page, 'Batafsil koʻrish', '.desc-toggle'); const opened = await page.$eval('.desc-text', el => !el.classList.contains('clamped'));
    await click(page, 'Yopish', '.desc-toggle'); const closed = await page.$eval('.desc-text', el => el.classList.contains('clamped'));
    check(clamped && opened && closed, 'long description: short first → «Batafsil koʻrish» opens → «Yopish» closes');
    await page.evaluate(() => document.querySelector('.related')?.scrollIntoView()); await pause(400);
    const related = await page.$$eval('.related .pcard-name', els => els.map(e => e.textContent));
    check(related[0] === 'Fayz Phone Lite' && !related.includes('Fayz Phone X'), 'related products: same category first, not itself', JSON.stringify(related));
    if (width === 390) await shot(page, 'customer-product-variants-390', true);
    check(await overflow(page) <= 0, 'product page: no horizontal overflow', String(await overflow(page)));
    await click(page, 'Savatga qoʻshish', '.action-bar button'); await pause(400);
    await click(page, 'Qora', '.variant-opt'); await pause(300);
    await page.evaluate(() => [...document.querySelectorAll('.variant-opt')].find(b => b.textContent === '256 GB')?.click()); await pause(300);
    await click(page, 'Savatga qoʻshish', '.action-bar button'); await pause(400);
    // related product opens the real product page
    await page.evaluate(() => [...document.querySelectorAll('.related .pcard-hit')].find(b => b.textContent.includes('Lite'))?.click()); await pause(900);
    check((await page.$eval('.detail h1', el => el.textContent)) === 'Fayz Phone Lite', 'tapping a related product opens that product');
    await click(page, 'Savatga qoʻshish', '.action-bar button'); await pause(300);
    await click(page, 'Savat', '.tabbar button'); await pause(500);
    t = await text(page);
    const rows = await page.$$eval('.cart-row', els => els.map(e => e.innerText.replace(/ /g, ' ')));
    check(rows.length === 3 && rows.some(r => r.includes('Oq · 128 GB')) && rows.some(r => r.includes('Qora · 256 GB')), 'cart: one row per chosen variant, label shown', JSON.stringify(rows));
    check(t.includes('Mahsulotlar (3 dona)') && t.includes('Yetkazib berish (kuryer)') && t.includes('15 000 soʻm'), 'cart summary: goods and courier fee lines');
    const step = await page.evaluate(() => { const row = [...document.querySelectorAll('.cart-row')].find(r => r.textContent.includes('Qora · 256 GB')); const plus = row.querySelector('.stepper button:last-child'); plus.click(); plus.click(); plus.click(); return true; }); await pause(400);
    const stepNow = await page.evaluate(() => [...document.querySelectorAll('.cart-row')].find(r => r.textContent.includes('Qora · 256 GB')).querySelector('.stepper b').textContent);
    check(step && stepNow === '2', 'stepper stops at that variant’s stock (2), not the product total', stepNow);
    if (width === 390) await shot(page, 'customer-cart-variants-390', true);
    await click(page, 'Buyurtma berish', '.action-bar button'); await page.waitForSelector('.fulfil-choices'); await pause(500);
    t = await text(page);
    check(t.includes('Doʻkondan olib ketish') && t.includes('Kuryer orqali yetkazish') && t.includes('yetkazish haqi qoʻshilmaydi') && t.includes('Kuryer narxi: 15 000 soʻm'), 'checkout: both choices clearly shown with what each means');
    const lines = await page.$$eval('.co-lines > div', els => els.map(e => e.innerText.replace(/ /g, ' ').replace(/\n/g, ' ')));
    const total = await page.$eval('.co-summary .summary-total', el => el.innerText.replace(/ /g, ' '));
    const goods = 3250000 + 2 * 3700000 + 1450000;
    check(lines[0].includes('Mahsulotlar summasi') && lines[1].includes('Kuryer') && lines[1].includes('15 000') && total.includes((goods + 15000).toLocaleString('ru-RU').replace(/ /g, ' ')), 'checkout lines: goods, courier fee, final total', JSON.stringify({ lines, total }));
    await click(page, 'Doʻkondan olib ketish', '.fulfil-choices .choice'); await pause(300);
    const pickupLines = await page.$$eval('.co-lines > div', els => els.map(e => e.innerText.replace(/ /g, ' ').replace(/\n/g, ' ')));
    check(pickupLines.some(l => l.includes('Qoʻshilmaydi')) && (await text(page)).includes('Olib ketish manzili'), 'pickup: store address, no courier fee');
    if (width === 390) await shot(page, 'customer-checkout-pickup-390', true);
    await click(page, 'Kuryer orqali yetkazish', '.fulfil-choices .choice'); await pause(300);
    check(await overflow(page) <= 0, 'checkout: no horizontal overflow', String(await overflow(page)));
    // Name / phone typed key by key inside the sheet: focus stays.
    let r = await typeInto(page, '.sheet', 'Ism', 'Dilnoza');
    check(r.value === 'Dilnoza' && r.focused, 'checkout sheet: typing the name keeps focus');
    // The order is placed in the LAST width only: it takes stock, and the earlier widths need the same stock.
    if (width === 412) {
      await typeInto(page, '.sheet', 'Telefon', '901112233');
      await page.evaluate(() => [...document.querySelectorAll('.loc-choice button')].find(b => b.textContent.includes('GPS'))?.click());
      await page.waitForSelector('.address-sheet'); await pause(2500);
      await page.type('.address-sheet textarea', 'Chilonzor 9-kvartal, 12-uy');
      await page.type('.address-sheet input', '3-podyezd, 5-qavat');
      await click(page, 'Shu joyni tasdiqlash', '.sheet button'); await pause(700);
      t = await text(page);
      check(t.includes('Chilonzor 9-kvartal') && /GPS · 41\.31/.test(t), 'checkout: address confirmed in the sheet (GPS point + text)', t.slice(t.indexOf('Yetkazish manzili'), t.indexOf('Yetkazish manzili') + 200));
      const before = (await call('/admin/orders', 'GET', undefined, token)).orders.length;
      await click(page, 'Buyurtmani yuborish', '.sheet button'); await pause(2500);
      const orders = (await call('/admin/orders', 'GET', undefined, token)).orders;
      const o = orders.length > before ? (await call(`/admin/orders/${orders[0].id}`, 'GET', undefined, token)).order : null;
      check(!!o && o.total === goods + 15000 && o.deliveryFee === 15000 && o.items.some(i => i.variant === 'Qora · 256 GB' && i.quantity === 2) && o.location?.details === '3-podyezd, 5-qavat', 'order saved with variants, server total, courier fee, confirmed point and details', JSON.stringify(o && { total: o.total, items: o.items, location: o.location }));
      await shot(page, 'customer-order-placed-412', true);
    }
    await ctx.close();
  }

  // =============================================================== Addresses (C11/C12)
  section('C11/C12 — one address picker on home, profile and checkout');
  {
    const { page, ctx } = await open('customer', { width: 390, fix: { latitude: 41.30, longitude: 69.24, accuracy: 900 } });
    await page.waitForSelector('.loc-row');
    await page.$$eval('.loc-row', els => els[1].click()); await page.waitForSelector('.address-sheet'); await pause(2500);
    let t = await text(page);
    const disabled = await page.evaluate(() => [...document.querySelectorAll('.sheet button')].find(b => b.textContent.includes('Shu joyni tasdiqlash'))?.disabled);
    await page.type('.address-sheet textarea', 'Yunusobod 4-mavze, 7-uy');
    const stillDisabled = await page.evaluate(() => [...document.querySelectorAll('.sheet button')].find(b => b.textContent.includes('Shu joyni tasdiqlash'))?.disabled);
    check(disabled && stillDisabled && plain(await text(page)).includes('GPS aniqligi past (±900 m)'), 'GPS ±900 m is never accepted as is: confirm blocked with a clear reason', t.slice(0, 200));
    await shot(page, 'customer-address-low-accuracy-390');
    await page.setGeolocation({ latitude: 41.3612, longitude: 69.2850, accuracy: 15 });
    await click(page, 'Joylashuvimni aniqlash (GPS)', '.address-sheet button'); await pause(2500);
    const ok = await page.evaluate(() => [...document.querySelectorAll('.sheet button')].find(b => b.textContent.includes('Shu joyni tasdiqlash'))?.disabled === false);
    check(ok, 'a precise fix (±15 m) can be confirmed');
    await click(page, 'Shu joyni tasdiqlash', '.sheet button'); await pause(700);
    t = await text(page);
    check(t.includes('Yunusobod 4-mavze'), 'home «Sizning joylashuvingiz» shows the confirmed address');
    await click(page, 'Profil', '.tabbar button'); await pause(500);
    t = await text(page);
    check(t.includes('Yunusobod 4-mavze') && t.includes('Oʻzgartirish'), 'profile shows the same address with «Oʻzgartirish»');
    await shot(page, 'customer-profile-address-390', true);
    await page.evaluate(() => [...document.querySelectorAll('.pcard-add')].find(b => !b.closest('.pcard')?.textContent.includes('Fayz Phone X'))?.click());
    await click(page, 'Bosh sahifa', '.tabbar button'); await pause(300);
    await page.evaluate(() => [...document.querySelectorAll('.pcard')].find(c => c.textContent.includes('Klassik'))?.querySelector('.pcard-add')?.click()); await pause(300);
    await click(page, 'Savat', '.tabbar button'); await click(page, 'Buyurtma berish', '.action-bar button'); await page.waitForSelector('.fulfil-choices'); await pause(400);
    t = await text(page);
    check(t.includes('Yunusobod 4-mavze') && /GPS · 41\.36/.test(t), 'checkout uses the same confirmed address automatically');
    const lines = await page.$$eval('.co-lines > div', els => els.map(e => e.innerText.replace(/ /g, ' ').replace(/\n/g, ' ')));
    check(lines.some(l => l.startsWith('Chegirma') && l.includes('55 000')), 'discount line shown when a product has an old price (300 000 → 245 000)', JSON.stringify(lines));
    await ctx.close();
  }
  {
    const { page, ctx } = await open('customer', { width: 390, geo: false });
    await page.waitForSelector('.loc-row');
    await page.$$eval('.loc-row', els => els[1].click()); await page.waitForSelector('.address-sheet'); await pause(2500);
    const t = await text(page);
    check(/ruxsat|aniqlanmadi/i.test(t) && t.includes('manzilni yozing'), 'GPS refused: explained, map and written address still offered');
    await page.type('.address-sheet textarea', 'Sergeli, 5-kvartal, 21-uy'); await click(page, 'Shu joyni tasdiqlash', '.sheet button'); await pause(500);
    check((await text(page)).includes('Sergeli, 5-kvartal'), 'written address saved without GPS');
    await shot(page, 'customer-address-no-gps-390');
    await ctx.close();
  }

  // =============================================================== Unknown tariff (C14/C15)
  section('C14/C15 — no courier tariff: never guessed, staff confirm it');
  await call('/admin/payment-settings', 'PUT', { ...settings, deliveryFeeMode: 'quote' }, token);
  {
    const { page, ctx } = await open('customer', { width: 390, storage: { fayz_addresses_v1: JSON.stringify({ list: [{ id: 'a1', text: 'Mirobod, 3-uy', details: '', lat: 41.29, lng: 69.27, source: 'map', at: Date.now() }], currentId: 'a1' }), fayz_profile: JSON.stringify({ customerName: 'Sardor', phone: '+998907776655', address: 'Mirobod, 3-uy' }) } });
    await page.waitForSelector('.pcard');
    await page.evaluate(() => [...document.querySelectorAll('.pcard')].find(c => c.textContent.includes('Lite'))?.querySelector('.pcard-add')?.click()); await pause(300);
    await click(page, 'Savat', '.tabbar button'); await pause(300);
    let t = await text(page);
    check(t.includes('Operator aniqlaydi') && t.includes('+ yetkazish') && !/Yetkazib berish \(kuryer\)\s*Bepul/.test(t), 'cart: fee reads «Operator aniqlaydi», total marked «+ yetkazish» (no invented amount)');
    await click(page, 'Buyurtma berish', '.action-bar button'); await page.waitForSelector('.fulfil-choices'); await pause(300);
    t = await text(page);
    check(t.includes('Taxminiy narx koʻrsatilmaydi') && t.includes('doʻkon tasdiqlaydi'), 'checkout explains who sets the fee');
    await shot(page, 'customer-checkout-fee-pending-390', true);
    await click(page, 'Buyurtmani yuborish', '.sheet button'); await pause(2500);
    t = await text(page);
    check(t.includes('Doʻkon aniqlaydi'), 'order card: courier fee «Doʻkon aniqlaydi»');
    await ctx.close();
    const { page: admin, ctx: actx } = await open('admin', { width: 1280, height: 900 });
    await adminLogin(admin, OWNER.email, OWNER.password); await admin.waitForSelector('.side-nav');
    await nav(admin, 'Buyurtmalar'); await admin.waitForSelector('.table'); await pause(500);
    await admin.evaluate(() => document.querySelector('.table tbody tr')?.click()); await admin.waitForSelector('.fee-pending'); await pause(300);
    await admin.click('.fee-pending input'); await admin.keyboard.type('20000'); await click(admin, 'Saqlash', '.fee-pending button'); await pause(1500);
    const latest = (await call('/admin/orders', 'GET', undefined, token)).orders[0];
    check(latest.deliveryFee === 20000 && !latest.deliveryFeePending && latest.total === 1450000 + 20000, 'admin sets the fee in the order → total updated on the server', JSON.stringify(latest));
    await shot(admin, 'admin-order-fee-set-1280');
    await nav(admin, 'Sozlamalar'); await pause(500);
    check((await text(admin)).includes('Operator aniqlaydi') && (await text(admin)).includes('Belgilangan narx'), 'settings: tariff mode switch (fixed / free / operator)');
    await actx.close();
  }

  // =============================================================== C13: store map
  section('C13 — store map: route inside the app');
  {
    const { page, ctx } = await open('customer', { width: 390 });
    await page.waitForSelector('.header-go'); await page.click('.header-go');
    await page.waitForSelector('.store-screen .map-box[data-provider], .store-screen .map-fallback', { timeout: 30000 }).catch(() => null); await pause(3500);
    const t = await text(page);
    check(t.includes('Yoʻl boʻyicha masofa') && t.includes('6,4 km'), 'location already allowed → in-app road route without an extra tap');
    await shot(page, 'customer-store-route-390');
    await ctx.close();
  }
  await fetch(API + '/admin/integrations/routing/secrets/ORS_API_KEY', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  {
    const { page, ctx } = await open('customer', { width: 390 });
    await page.waitForSelector('.header-go'); await page.click('.header-go'); await pause(4000);
    const t = await text(page);
    check(t.includes('Admin → Integratsiyalar → Marshrut') && t.includes('Google Maps') && t.includes('Yoʻlga chiqish'), 'without a routing key: says the in-app route needs configuration, Google Maps stays as fallback');
    await shot(page, 'customer-store-no-routing-390');
    await ctx.close();
  }

  // =============================================================== Courier sees only the courier app
  section('K01 — courier account in the admin app');
  {
    const { page, ctx } = await open('admin', { width: 390 });
    await adminLogin(page, 'kuryer122@example.invalid', 'Kuryer122-LocalPass');
    await page.waitForFunction(() => !document.querySelector('input[type=email]') && /yetkazish/i.test(document.body.innerText), { timeout: 30000 }).catch(() => null); await pause(800);
    const t = await text(page);
    check(!t.includes('Mahsulotlar') && !t.includes('Integratsiyalar') && !t.includes('Sozlamalar') && /yetkazish/i.test(t), 'courier sees only deliveries — no products, settings or integrations');
    await shot(page, 'courier-home-390');
    await ctx.close();
  }
} catch (error) {
  check(false, 'UI script completed', String(error?.stack || error));
} finally {
  await browser.close().catch(() => undefined); stop();
  const passed = results.filter(x => x.startsWith('PASS')).length, total = results.filter(x => /^(PASS|FAIL)/.test(x)).length;
  writeFileSync(path.join(EVIDENCE, 'ui-verify.txt'), `Fayz Market V1 1.2.2 — real-device fixes, Chrome UI (built bundles, isolated local Worker)\n${new Date().toISOString()}\n${results.join('\n')}\n\n${passed}/${total} passed\n`);
  console.log(`\n${passed}/${total} passed`);
  process.exitCode = failed ? 1 : 0;
}
