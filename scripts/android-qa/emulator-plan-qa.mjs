// Real-device QA plan (REAL_DEVICE_QA_FIX_REPORT.md §8) — the items an Android EMULATOR can exercise, on the DEBUG
// apps against an ISOLATED local Worker (fresh D1 + local R2). Production is never contacted. Results are labelled
// EMULATOR; they do NOT replace the owner's Samsung check (Samsung keyboard, real sensor, real GPS, One UI gestures).
//   §8.1 U01 staff form + reset-password dialog typed on the Android keyboard
//   §8.2 A01 wrong password, sign-out/sign-in ×3, fingerprint lock vs sign-out (virtual fingerprint)
//   §8.3 A06 «Qoldiq» on a variant product asks which variant
//   §8.6/7 C14/C15 + tariff «Operator aniqlaydi»: order → admin types the fee → customer sees the new total, discount line
//   §8.8 C11/C12 location refused → written address; GPS fix → one address on home, profile and checkout
//   §8.9 C13 no route key: explained, straight-line distance, «Yoʻlga chiqish» hands over to another app
//   §8.10 K01–K04 separate courier account: no admin sections, every stage, customer confirmation
//   §8.11 Android Back closes dialogs and screens
//   ANDROID_SERIAL=emulator-5554 node scripts/android-qa/emulator-plan-qa.mjs
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { adb, findNode, launch, pause, screenshot, setApiUrl, sh, tapNode, versionOf, webview, requireEmulator } from './lib.mjs';


const ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const PORT = Number(process.env.QA_PORT || 8792), API = `http://127.0.0.1:${PORT}`;
requireEmulator('emulator-plan-qa.mjs'); // sets fingerprints, GPS and permissions through the emulator
const KIND = `EMULATOR (${sh('getprop ro.boot.qemu.avd_name') || 'AVD'}, Android ${sh('getprop ro.build.version.release')}) — NOT a physical phone`;
const OUT = path.join(ROOT, process.env.SHOTS || 'docs/v1/screenshots/emulator-android16/plan');
const RESULTS = path.join(ROOT, process.env.RESULTS || 'docs/v1/evidence/emulator-android16/plan-qa.txt');
mkdirSync(OUT, { recursive: true });
const C = 'uz.fayzmarket.customer', A = 'uz.fayzmarket.admin';
const results = []; const check = (status, name, detail = '') => { results.push(`${status} ${name}${detail ? ' — ' + String(detail).replace(/\s+/g, ' ').slice(0, 260) : ''}`); console.log(results.at(-1)); };
const ok = (cond, name, detail = '') => check(cond ? 'PASS' : 'FAIL', name, cond ? '' : detail);
const shot = name => writeFileSync(path.join(OUT, `${name}.png`), screenshot());
const keyboardShown = () => /mInputShown=true/.test(sh('dumpsys input_method 2>/dev/null | grep mInputShown || true'));
const resumed = () => sh('dumpsys activity activities | grep -E "topResumedActivity|mResumedActivity" || true').split('\n')[0];
let expected = 'uz.fayzmarket.';
const guard = () => { const top = resumed(); if (!top.includes(expected)) throw new Error(`FOREGROUND_LOST: ${top.trim()}`); };
const backKey = async () => { guard(); sh('input keyevent KEYCODE_BACK'); await pause(1300); };
const typeNative = async s => { guard(); sh(`input text ${JSON.stringify(s.replace(/ /g, '%s'))}`); await pause(700); };
const finger = async (id = 1) => { adb('emu', 'finger', 'touch', String(id)); await pause(700); try { adb('emu', 'finger', 'remove', String(id)); } catch { /* older emulator */ } await pause(800); };
const allowPermission = (ms = 6000) => tapNode(/permission_allow_foreground_only_button|permission_allow_button|permission_allow_one_time_button/, ms);
const denyPermission = (ms = 6000) => tapNode(/permission_deny_button|permission_deny_and_dont_ask_again_button/, ms);
const plain = s => String(s || '').replace(/\s/g, ' '); // Intl uses no-break / narrow spaces in «245 000»
const origins = {};
/** Top-left of the app's WebView on screen (device px), read from the view tree once per app. */
function webviewOrigin(pkg) {
  if (origins[pkg]) return origins[pkg];
  sh('uiautomator dump /sdcard/fayz-ui.xml >/dev/null 2>&1 || true');
  const node = [...sh('cat /sdcard/fayz-ui.xml').matchAll(/<node [^>]*>/g)].map(m => m[0]).find(n => / class="android.webkit.WebView"/.test(n) && n.includes(`package="${pkg}"`));
  const b = node?.match(/bounds="\[(\d+),(\d+)\]/);
  return (origins[pkg] = b ? { x: Number(b[1]), y: Number(b[2]) } : { x: 0, y: 0 });
}
/** A real finger tap on the centre of a DOM element (CSS px → device px). */
async function tapEl(w, pkg, selector, textIncludes = '') {
  const find = (s, t) => { const el = [...document.querySelectorAll(s)].find(e => (!t || (e.innerText || e.textContent || '').includes(t)) && e.getClientRects().length); if (!el) return null; el.scrollIntoView({ block: 'center' }); const b = el.getBoundingClientRect(); return { x: (b.left + b.width / 2) * devicePixelRatio, y: (b.top + b.height / 2) * devicePixelRatio }; };
  if (!await w.evaluate(find, selector, textIncludes)) throw new Error(`no element ${selector} ${textIncludes}`);
  await pause(400);
  const r = await w.evaluate(find, selector, textIncludes); const o = webviewOrigin(pkg);
  guard(); sh(`input tap ${Math.round(r.x + o.x)} ${Math.round(r.y + o.y)}`); await pause(900);
}
const typeInto = async (w, pkg, selector, value) => { await tapEl(w, pkg, selector); await typeNative(value); };

// ---------- isolated Worker + seed (local only) ----------
const dir = mkdtempSync(path.join(tmpdir(), 'fayz-emu-plan-'));
const worker = spawn('bash', [path.join(ROOT, 'scripts/deploy-qa/local-worker.sh'), path.join(dir, 'db')], { env: { ...process.env, QA_PORT: String(PORT) }, stdio: 'ignore', detached: true });
let workerUp = true; const stopWorker = () => { if (!workerUp) return; workerUp = false; try { process.kill(-worker.pid, 'SIGTERM'); } catch { /* gone */ } };
for (let i = 0; i < 240; i++) { try { if ((await fetch(API + '/health')).ok) break; } catch { /* starting */ } await pause(500); }
const call = async (p, method = 'GET', body, auth) => { const r = await fetch(API + p, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(auth ? { Authorization: auth } : {}), ...(p === '/admin/bootstrap' ? { 'X-Bootstrap-Secret': 'qa-bootstrap' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, data: await r.json().catch(() => null) }; };
const OWNER = { email: 'emu-owner@example.invalid', password: 'EmuOwner-2026-plan' };
const COURIER = { email: 'emu-kuryer@example.invalid', first: 'Kuryer-Boshlangich-1', reset: 'Tiklangan-Parol-2026' };
await call('/admin/bootstrap', 'POST', OWNER);
const owner = 'Bearer ' + (await call('/admin/login', 'POST', OWNER)).data.token;
const cat = (await call('/admin/categories', 'POST', { name: 'Soatlar', slug: 'soatlar' }, owner)).data.id;
const tel = (await call('/admin/categories', 'POST', { name: 'Telefonlar', slug: 'telefonlar' }, owner)).data.id;
await call('/admin/products', 'POST', { name: 'Klassik soat', slug: 'klassik-soat', description: 'Charm tasma.', categoryId: cat, price: 245000, comparePrice: 300000, stock: 5, active: true, featured: true, images: [] }, owner);
await call('/admin/products', 'POST', { name: 'Fayz Phone X', slug: 'fayz-phone-x', description: 'Smartfon.', categoryId: tel, price: 3200000, stock: 0, active: true, featured: false, images: [], options: [{ name: 'Rang', values: ['Qora', 'Oq'] }], variants: [{ options: { Rang: 'Qora' }, price: 3200000, stock: 4 }, { options: { Rang: 'Oq' }, price: 3250000, stock: 3 }] }, owner);
const storeSaved = await call('/admin/store', 'PUT', { placeName: 'Fayz Market — Sinov', address: 'Toshkent, Chorsu', lat: 41.3264, lng: 69.2286 }, owner);
if (storeSaved.status !== 200) throw new Error(`seed: store location not saved (${storeSaved.status})`);
await call('/admin/payment-settings', 'PUT', { cash: true, cardTerminal: true, bankTransfer: false, bankTransferDetails: '', pickup: true, deliveryFeeMode: 'quote', deliveryFee: 0, deliveryFreeFrom: 0 }, owner);

/** Order + its delivery (GET /admin/orders/:id returns the delivery next to the order, not inside it). */
const orderState = async id => { const d = (await call(`/admin/orders/${id}`, 'GET', undefined, owner)).data; return { ...d.order, delivery: d.delivery || null }; };
const nav = async (w, name) => { await w.evaluate(n => { [...document.querySelectorAll('.side-nav button')].find(b => b.textContent.includes(n)).click(); return true; }, name); await pause(1500); };
const signedIn = w => w.waitFor(() => !!sessionStorage.getItem('fayz_admin_token') && !document.querySelector('.login-page, input[type=email]'), 20000);
async function adminLogin(w, email, password, label) {
  await w.waitFor(() => !!document.querySelector('input[type=email]'), 20000);
  await w.setValue('input[type=email]', ''); await w.setValue('.password-field input', '');
  await typeInto(w, A, 'input[type=email]', email); await typeInto(w, A, '.password-field input', password);
  await backKey(); await w.click('Kirish');
  return signedIn(w).then(r => { if (label) ok(r, label); return r; });
}
async function adminSignOut(w) {
  await tapEl(w, A, '.menu-btn'); await pause(700);
  await tapEl(w, A, '.side-foot button', 'Hisobdan chiqish');
  return w.waitFor(() => !!document.querySelector('input[type=email]'), 15000);
}

const original = { [C]: versionOf(C), [A]: versionOf(A) };
let orderNo = '', orderId = 0, customerToken = '';
try {
  check('INFO', 'device', `${KIND}; installed ${original[C].name}/${original[C].code} (customer), ${original[A].name}/${original[A].code} (admin)`);
  for (const p of [C, A]) if (!/DEBUGGABLE/.test(sh(`dumpsys package ${p} | grep -m1 'flags=' || true`))) throw new Error('install the DEBUG builds first');
  adb('reverse', `tcp:${PORT}`, `tcp:${PORT}`);
  // Fresh permission state: revoke AND clear «don't ask again» left by earlier runs (Android stops asking after 2 refusals).
  for (const p of [C, A]) for (const perm of ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION']) { sh(`pm revoke ${p} android.permission.${perm}`); sh(`pm clear-permission-flags ${p} android.permission.${perm} user-set user-fixed 2>/dev/null || true`); }
  sh(`pm grant ${A} android.permission.POST_NOTIFICATIONS`); sh(`pm grant ${C} android.permission.POST_NOTIFICATIONS`);

  // ================================================================ ADMIN — A01, U01, A06
  expected = A; setApiUrl(A, API); launch(A); await pause(2000);
  let w = await webview(A, 9422);
  await w.waitFor(() => document.readyState === 'complete', 30000);
  await w.evaluate(() => { localStorage.clear(); sessionStorage.clear(); location.reload(); return true; }); await pause(2500);
  await w.waitFor(() => !!document.querySelector('input[type=email]'), 30000);
  // A01: wrong password → clear message with the attempts left
  await typeInto(w, A, 'input[type=email]', OWNER.email); await typeInto(w, A, '.password-field input', 'Notogri-Parol-123');
  await backKey(); await w.click('Kirish'); await pause(2000);
  let t = await w.text();
  ok(/Yana \d ta urinish qoldi/.test(t) && !await w.evaluate(() => sessionStorage.getItem('fayz_admin_token')), 'A01: wrong password → «Yana N ta urinish qoldi», not signed in', t.slice(0, 200));
  shot('a01-wrong-password');
  // A01: email with capitals + trailing space, then sign out → sign in again, three times
  await adminLogin(w, 'Emu-Owner@Example.invalid ', OWNER.password, 'A01: email typed with capitals and a trailing space → signed in');
  let cycles = 0;
  for (let i = 1; i <= 3; i++) { if (!await adminSignOut(w)) break; if (!await adminLogin(w, OWNER.email, OWNER.password)) break; cycles = i; }
  ok(cycles === 3, 'A01: «Hisobdan chiqish» → sign in with the correct password, 3 times in a row', `completed ${cycles}/3`);
  // A01: fingerprint on → lock → fingerprint reopens the same session → sign-out removes the fingerprint sign-in
  await nav(w, 'Sozlamalar'); await pause(800);
  await w.evaluate(() => [...document.querySelectorAll('label.toggle')].find(l => l.textContent.includes('Barmoq izi bilan kirish'))?.scrollIntoView({ block: 'center' }));
  await tapEl(w, A, 'label.toggle', 'Barmoq izi bilan kirish');
  const prompt = await (async () => { for (let i = 0; i < 16; i++) { const n = findNode(/com\.android\.systemui:id\/(biometric|title)/); if (n) return n; await pause(500); } return null; })();
  shot('a01-biometric-prompt');
  await finger(1); await pause(1500);
  ok(!!prompt && await w.waitFor(() => document.body.innerText.includes('Barmoq izi bilan kirish yoqildi') || localStorage.getItem('fayz_admin_bio') === '1', 10000), 'A01: fingerprint sign-in enabled through the system BiometricPrompt (virtual sensor)', prompt?.label);
  const tokenBefore = await w.evaluate(() => sessionStorage.getItem('fayz_admin_token'));
  await tapEl(w, A, '.menu-btn'); await pause(700); await tapEl(w, A, '.side-foot button', 'Ilovani qulflash');
  ok(await w.waitFor(() => document.body.innerText.includes('Ilova qulflangan') && !sessionStorage.getItem('fayz_admin_token'), 10000), 'A01: «Ilovani qulflash» → lock screen, session leaves memory');
  shot('a01-locked');
  await tapEl(w, A, 'button', 'Barmoq izi bilan ochish'); await pause(1200); await finger(1);
  ok(await w.waitFor(tk => sessionStorage.getItem('fayz_admin_token') === tk && !!document.querySelector('.sidebar'), 15000, tokenBefore), 'A01: fingerprint reopens the same session');
  ok(await adminSignOut(w) && await w.evaluate(() => !document.body.innerText.includes('Barmoq izi bilan ochish')), 'A01: «Hisobdan chiqish» → password form, no fingerprint option');
  sh(`am force-stop ${A}`); launch(A); await pause(2000); w.close(); w = await webview(A, 9422);
  await w.waitFor(() => !!document.querySelector('input[type=email]') || document.body.innerText.includes('Barmoq izi'), 20000);
  ok(await w.evaluate(() => !!document.querySelector('input[type=email]') && !document.body.innerText.includes('Barmoq izi bilan ochish')), 'A01: after sign-out a relaunch still asks for the password (fingerprint sign-in removed)');
  await adminLogin(w, OWNER.email, OWNER.password, 'A01: sign in again with the password right after sign-out');

  // U01: staff form + reset dialog typed on the Android keyboard
  await nav(w, 'Sozlamalar'); await pause(800);
  await w.evaluate(() => document.querySelector('form.add-admin')?.scrollIntoView({ block: 'center' }));
  const fields = await w.evaluate(() => [...document.querySelectorAll('form.add-admin input')].map(i => i.type));
  await typeInto(w, A, 'form.add-admin input:not([type=tel]):not([type=email]):not([type=password])', 'Bekzod Kuryer');
  await tapEl(w, A, 'form.add-admin input[type=tel]'); await typeNative('901112233');
  await typeInto(w, A, 'form.add-admin input[type=email]', COURIER.email);
  await typeInto(w, A, 'form.add-admin input[type=password]', COURIER.first);
  const typed = await w.evaluate(() => Object.fromEntries([...document.querySelectorAll('form.add-admin input')].map(i => [i.type, i.value])));
  ok(typed.tel === '+998901112233' && typed.email === COURIER.email && typed.password === COURIER.first && typed.text === 'Bekzod Kuryer' && keyboardShown(), 'U01: staff form — every character lands in name, phone, email and password (keyboard stays open)', JSON.stringify({ fields, typed: { ...typed, password: typed.password?.length } }));
  await backKey(); await w.evaluate(() => [...document.querySelectorAll('form.add-admin button')].find(b => b.textContent.includes('Qoʻshish')).click()); await pause(2000);
  const staff = (await call('/admin/users', 'GET', undefined, owner)).data;
  const courier = (staff.users || staff).find?.(u => u.email === COURIER.email);
  ok(courier?.role === 'courier', 'U01: courier saved from the form');
  await w.evaluate(e => { const li = [...document.querySelectorAll('ul.rows li')].find(l => l.textContent.includes(e) || l.textContent.includes('Bekzod Kuryer')); li?.querySelector('button[title="Parolni tiklash"]')?.click(); return !!li; }, COURIER.email);
  await w.waitFor(() => !!document.querySelector('.modal input[type=password]'), 8000);
  await tapEl(w, A, '.modal input[type=password]'); await typeNative(COURIER.reset);
  const reset = await w.evaluate(() => { const i = document.querySelector('.modal input[type=password]'); return { value: i.value, focused: document.activeElement === i }; });
  ok(reset.value === COURIER.reset && reset.focused && keyboardShown(), 'U01: reset-password dialog — whole password typed in one go, field keeps focus', JSON.stringify({ len: reset.value.length, focused: reset.focused }));
  shot('u01-reset-dialog');
  await backKey(); // keyboard
  await w.evaluate(() => { document.querySelector('.modal').closest('form')?.requestSubmit?.() ?? document.querySelector('.modal-foot .btn-primary')?.click(); return true; }); await pause(2000);
  ok((await call('/admin/login', 'POST', { email: COURIER.email, password: COURIER.reset })).status === 200, 'U01: courier signs in with the password typed in that dialog');

  // A06: «Qoldiq» on a variant product asks which variant; Android Back closes the dialog
  await nav(w, 'Mahsulotlar'); await w.waitFor(() => document.body.innerText.includes('Fayz Phone X'), 15000);
  await w.evaluate(() => { const card = [...document.querySelectorAll('.m-card, li, tr')].filter(r => r.textContent.includes('Fayz Phone X') && [...r.querySelectorAll('button')].some(b => b.textContent.includes('Qoldiq'))).pop(); [...card.querySelectorAll('button')].find(b => b.textContent.includes('Qoldiq')).click(); return true; });
  await w.waitFor(() => !!document.querySelector('.modal'), 8000); await pause(600);
  const asks = await w.evaluate(() => ({ select: !!document.querySelector('.modal select'), options: [...document.querySelectorAll('.modal select option')].map(o => o.textContent) }));
  ok(asks.select && asks.options.some(o => o.includes('Qora')) && asks.options.some(o => o.includes('Oq')), 'A06: «Qoldiq» on a variant product asks which variant', JSON.stringify(asks));
  shot('a06-stock-variant');
  await backKey();
  ok(await w.evaluate(() => !document.querySelector('.modal')) && resumed().includes(A), '§8.11: Android Back closes the stock dialog (app stays open)');
  // Admin «Doʻkon joylashuvi»: typing the address on the phone keyboard must not write the map centre as the store
  // point (the same picker bug as C11); a real finger drag sets it; «Saqlash» stores exactly what the form shows.
  await nav(w, 'Sozlamalar'); await pause(800);
  const STORE = '.panel:has(input[placeholder="41.311081"])';
  await w.waitFor(s => !!document.querySelector(s + ' .map-box[data-provider] canvas'), 30000, STORE); await pause(2500);
  await w.setValue(`${STORE} input[placeholder="41.311081"]`, ''); await w.setValue(`${STORE} input[placeholder="69.240562"]`, '');
  await w.evaluate(s => { document.querySelector(s + ' input[placeholder^="Shahar"]').scrollIntoView({ block: 'center' }); return true; }, STORE);
  await tapEl(w, A, `${STORE} input[placeholder^="Shahar"]`); await pause(400);
  sh('input keyevent KEYCODE_MOVE_END'); await typeNative(' 2-uy'); await pause(2500);
  const kbStore = keyboardShown();
  const coordsAfterTyping = await w.evaluate(s => [document.querySelector(s + ' input[placeholder="41.311081"]').value, document.querySelector(s + ' input[placeholder="69.240562"]').value], STORE);
  ok(kbStore && coordsAfterTyping.join('') === '', 'admin store location: typing the address on the phone keyboard does not write the map centre as the store point', JSON.stringify({ keyboard: kbStore, coordsAfterTyping }));
  shot('store-typed-no-point');
  await backKey();
  const sm = await w.evaluate(s => { const el = document.querySelector(s + ' .map-box'); el.scrollIntoView({ block: 'center' }); const b = el.getBoundingClientRect(); return { x: (b.left + b.width / 2) * devicePixelRatio, y: (b.top + b.height / 2) * devicePixelRatio }; }, STORE);
  await pause(600); const so = webviewOrigin(A); guard();
  sh(`input swipe ${Math.round(sm.x + so.x)} ${Math.round(sm.y + so.y)} ${Math.round(sm.x + so.x + 180)} ${Math.round(sm.y + so.y + 140)} 600`); await pause(2500);
  const picked = await w.evaluate(s => [document.querySelector(s + ' input[placeholder="41.311081"]').value, document.querySelector(s + ' input[placeholder="69.240562"]').value], STORE);
  ok(/^4\d\.\d{6}$/.test(picked[0]) && /^6\d\.\d{6}$/.test(picked[1]), 'admin store location: a real finger drag on the map sets the store point', JSON.stringify(picked));
  await w.evaluate(s => { [...document.querySelectorAll(s + ' .form-actions .btn-primary')].pop().click(); return true; }, STORE); await pause(2000);
  const sfStore = (await (await fetch(API + '/storefront')).json()).store;
  ok(sfStore.configured && sfStore.lat.toFixed(6) === picked[0] && sfStore.lng.toFixed(6) === picked[1] && sfStore.address.endsWith('2-uy'), 'admin store location: «Saqlash» stores the dragged point and the typed address (storefront)', JSON.stringify({ picked, saved: [sfStore.lat, sfStore.lng], address: sfStore.address }));
  shot('store-dragged-saved');
  w.close();

  // ================================================================ CUSTOMER — C11/C12, C13, tariff «Operator aniqlaydi»
  expected = C; setApiUrl(C, API); launch(C); await pause(2000);
  w = await webview(C, 9421);
  await w.waitFor(() => document.readyState === 'complete', 30000);
  await w.evaluate(() => { localStorage.clear(); sessionStorage.clear(); location.reload(); return true; }); await pause(3000);
  await w.waitFor(() => document.body.innerText.includes('Klassik soat'), 30000);
  // C11: location refused → explained; the written address still works
  adb('emu', 'geo', 'fix', '69.2849', '41.3655');
  await tapEl(w, C, '.loc-row', 'Sizning joylashuvingiz');
  const denied = await denyPermission();
  await pause(1500);
  t = await w.evaluate(() => document.querySelector('.address-sheet')?.closest('.sheet')?.innerText || document.body.innerText);
  ok(!!denied && /ruxsat|aniqlanmadi|Joylashuv/i.test(t) && /yozing/.test(t), 'C11: location permission refused → explained; map and written address still offered', t.slice(0, 220));
  shot('c11-gps-refused');
  await typeInto(w, C, '.address-sheet textarea', 'Sergeli 5-kvartal 7-uy'); await backKey();
  await w.click('Shu joyni tasdiqlash'); await pause(1000);
  const typedOnly = await w.evaluate(() => { const s = JSON.parse(localStorage.getItem('fayz_addresses_v1') || '{}'); return (s.list || []).find(a => a.text === 'Sergeli 5-kvartal 7-uy') || null; });
  ok(!!typedOnly, 'C11: written address saved on this phone without GPS');
  ok(!!typedOnly && typedOnly.lat == null && typedOnly.lng == null, 'C11: the untouched map centre is NOT attached as a delivery point (keyboard resize is not a pick)', JSON.stringify(typedOnly));
  ok((await w.evaluate(() => document.querySelector('.loc-strip')?.innerText || '')).includes('Sergeli 5-kvartal 7-uy'), 'C11: home «Sizning joylashuvingiz» shows the confirmed written address');
  // C12: GPS allowed → the confirmed address is the same on home, profile and checkout
  await tapEl(w, C, '.loc-row', 'Sizning joylashuvingiz'); await w.waitFor(() => !!document.querySelector('.address-sheet'), 8000);
  await tapEl(w, C, '.address-sheet button', 'Joylashuvimni aniqlash');
  const allowed = await allowPermission(9000);
  const fix = await w.waitFor(() => /Joriy joylashuv \(GPS\)/.test(document.querySelector('.address-sheet .loc-summary')?.innerText || ''), 25000);
  const gpsText = await w.evaluate(() => (document.querySelector('.address-sheet .loc-summary') || document.querySelector('.address-sheet [role=alert]'))?.innerText || '(nothing)');
  ok(!!allowed && fix, 'C12: second request after a refusal shows the Android dialog again; allowed → GPS fix in the picker', `dialog=${allowed?.label || 'none'} · ${gpsText}`);
  if (fix && !/41\.365\d+, 69\.284\d+/.test(gpsText)) check('INFO', 'emulator returned a cached/old fix first (not the geo fix just set) — see real-device list', gpsText);
  await w.setValue('.address-sheet textarea', ''); await typeInto(w, C, '.address-sheet textarea', 'Yunusobod 4-mavze 12-uy'); await backKey();
  shot('c12-gps-fix');
  await w.click('Shu joyni tasdiqlash'); await pause(1200);
  const home = await w.evaluate(() => document.querySelector('.loc-strip')?.innerText || '');
  ok(home.includes('Yunusobod 4-mavze 12-uy'), 'C12: home «Sizning joylashuvingiz» shows the confirmed address', home);
  await w.evaluate(() => { [...document.querySelectorAll('.tabbar button')].find(b => b.textContent.includes('Profil')).click(); return true; }); await pause(1000);
  t = await w.text();
  ok(t.includes('Yunusobod 4-mavze 12-uy') && t.includes('Oʻzgartirish'), 'C12: profile shows the same address with «Oʻzgartirish»', t.slice(0, 200));
  shot('c12-profile-address');
  await backKey(); // profile → home (1.2.3 Back)
  // A real finger drag on the map still picks a point (the fix ignores only resizes / programmatic moves)
  await tapEl(w, C, '.loc-row', 'Sizning joylashuvingiz'); await w.waitFor(() => !!document.querySelector('.address-sheet .map-box[data-provider] canvas'), 30000); await pause(1500);
  const before = await w.evaluate(() => document.querySelector('.address-sheet .loc-summary')?.innerText || '');
  const m = await w.evaluate(() => { const el = document.querySelector('.address-sheet .map-box'); el.scrollIntoView({ block: 'center' }); const b = el.getBoundingClientRect(); return { x: (b.left + b.width / 2) * devicePixelRatio, y: (b.top + b.height / 2) * devicePixelRatio, h: b.height * devicePixelRatio }; });
  await pause(500); const o = webviewOrigin(C); guard();
  sh(`input swipe ${Math.round(m.x + o.x)} ${Math.round(m.y + o.y)} ${Math.round(m.x + o.x - 220)} ${Math.round(m.y + o.y - Math.min(200, m.h / 3))} 600`); await pause(2500);
  const after = await w.evaluate(() => document.querySelector('.address-sheet .loc-summary')?.innerText || '');
  ok(/Xaritada belgilangan nuqta/.test(after) && after !== before, 'map picker: a real finger drag moves the pin → «Xaritada belgilangan nuqta» with new coordinates', JSON.stringify({ before, after }));
  shot('c12-map-drag-pick');
  await w.click('Bekor qilish', '.sheet button'); await pause(800);
  ok((await w.evaluate(() => document.querySelector('.loc-strip')?.innerText || '')).includes('Yunusobod 4-mavze 12-uy'), 'map picker: «Bekor qilish» keeps the confirmed GPS address');
  // C13: store route without a route key
  await tapEl(w, C, '.loc-row', 'Doʻkon manzili'); await pause(2500);
  const store = await w.waitFor(() => !!document.querySelector('.store-map canvas.maplibregl-canvas') && /Ilova ichida yoʻl chizigʻi|Marshrut/.test(document.body.innerText), 30000);
  t = plain(await w.evaluate(() => document.querySelector('.store-card')?.innerText || '(no store card)'));
  ok(store && /Ilova ichida yoʻl chizigʻi/.test(t) && /toʻgʻri chiziq boʻyicha/.test(t), 'C13: store map drawn; no route key → explained, straight-line distance shown', t.slice(0, 260));
  shot('c13-store-no-route-key');
  await tapEl(w, C, '.store-actions .btn-primary', 'Yoʻlga chiqish'); await pause(3500);
  const other = resumed();
  ok(!other.includes(C), 'C13: «Yoʻlga chiqish» hands the route to another app (emulator: browser / maps)', other.trim());
  shot('c13-external-directions');
  launch(C); await pause(1500); // back to the app (the task is still alive)
  ok(resumed().includes(C) && await w.evaluate(() => !!document.querySelector('.store-map')), 'C13: returning to Fayz Market keeps the store screen');
  await backKey();
  ok(await w.evaluate(() => !document.querySelector('.store-map') && !!document.querySelector('.loc-strip')), '§8.11: Android Back closes the store map → home');

  // Tariff «Operator aniqlaydi» + discount line
  const phone = '+99890' + String(Date.now()).slice(-7);
  let r = await call('/auth/otp', 'POST', { phone, purpose: 'register' });
  r = await call('/auth/register', 'POST', { phone, code: r.data?.devCode, password: 'EmuCustomer-123', name: 'Emu Mijoz' });
  customerToken = r.data?.token || '';
  await w.evaluate(tk => { localStorage.setItem('fayz_customer_token', tk); location.reload(); return true; }, customerToken); await pause(3000);
  await w.waitFor(() => document.body.innerText.includes('Klassik soat'), 20000);
  await tapEl(w, C, '.pcard-hit', 'Klassik soat'); await w.waitFor(() => !!document.querySelector('.detail'), 10000);
  await tapEl(w, C, '.action-bar .btn-primary'); await pause(700);
  await backKey(); // product → list
  await w.evaluate(() => { [...document.querySelectorAll('.tabbar button')].find(b => b.textContent.includes('Savat')).click(); return true; }); await pause(1000);
  t = plain(await w.text());
  ok(t.includes('Operator aniqlaydi') && t.includes('+ yetkazish'), 'tariff: cart shows «Operator aniqlaydi» and «+ yetkazish» (no invented fee)', t.slice(0, 260));
  shot('tariff-cart-quote');
  await tapEl(w, C, '.action-bar .btn-primary'); await w.waitFor(() => !!document.querySelector('.fulfil-choices'), 10000);
  await w.evaluate(() => [...document.querySelectorAll('.fulfil-choices .choice')].find(b => b.textContent.includes('Kuryer orqali'))?.click()); await pause(700);
  t = plain(await w.evaluate(() => document.querySelector('.sheet')?.innerText || ''));
  ok(t.includes('Yunusobod 4-mavze 12-uy'), 'C12: checkout uses the same confirmed address automatically', t.slice(t.indexOf('Yetkazish manzili'), t.indexOf('Yetkazish manzili') + 140));
  ok(/Chegirma/.test(t) && t.includes('55 000'), 'C15: discount line (300 000 → 245 000) shown in checkout', t.slice(0, 300));
  shot('tariff-checkout');
  if (!await w.evaluate(() => document.querySelector('.sheet input[autocomplete=name]')?.value)) await typeInto(w, C, '.sheet input[autocomplete=name]', 'Emu Mijoz');
  await w.setValue('.sheet input[autocomplete=tel]', phone);
  await w.click('Buyurtmani yuborish'); await pause(3000);
  t = await w.text(); orderNo = t.match(/FM-[A-Z0-9-]+/)?.[0] || '';
  const placed = (await call('/admin/orders', 'GET', undefined, owner)).data.orders.find(o => o.orderNumber === orderNo);
  orderId = placed?.id || 0;
  const o1 = orderId ? await orderState(orderId) : null;
  ok(!!o1 && o1.deliveryFeePending === true && o1.total === 245000 && /Yunusobod/.test(o1.address) && Math.abs((o1.location?.lat ?? 0) - 41.3655) < 0.0005, 'tariff: order placed, fee pending, total = goods only, GPS point + address kept', JSON.stringify(o1 && { total: o1.total, pending: o1.deliveryFeePending, address: o1.address, loc: o1.location }));
  w.close();

  // Admin types the fee and assigns the courier
  expected = A; launch(A); await pause(1500); w = await webview(A, 9422);
  if (!await w.evaluate(() => !!sessionStorage.getItem('fayz_admin_token'))) await adminLogin(w, OWNER.email, OWNER.password);
  await nav(w, 'Buyurtmalar'); await w.waitFor(n => document.body.innerText.includes(n), 20000, orderNo);
  await w.evaluate(n => { [...document.querySelectorAll('.m-card, .table tbody tr')].find(r => r.textContent.includes(n))?.click(); return true; }, orderNo);
  await w.waitFor(() => !!document.querySelector('.modal .fee-pending'), 10000); await pause(600);
  await tapEl(w, A, '.modal .fee-pending input'); await typeNative('20000');
  const feeTyped = await w.evaluate(() => document.querySelector('.modal .fee-pending input').value);
  await backKey(); shot('tariff-admin-fee');
  await w.evaluate(() => document.querySelector('.modal .fee-pending button').click()); await pause(2000);
  let o2 = await orderState(orderId);
  ok(o2.deliveryFee === 20000 && !o2.deliveryFeePending && o2.total === 265000, 'tariff: admin typed the courier fee on the phone → order total 265 000', JSON.stringify({ typed: feeTyped, fee: o2.deliveryFee, pending: o2.deliveryFeePending, total: o2.total }));
  await w.evaluate(() => [...document.querySelectorAll('.modal .status-actions button')].find(b => b.textContent.includes('Tasdiqlangan'))?.click()); await pause(1800);
  await w.waitFor(() => !!document.querySelector('.modal select[aria-label=Kuryer]'), 10000);
  await w.evaluate(id => { const s = document.querySelector('.modal select[aria-label=Kuryer]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, String(id)); s.dispatchEvent(new Event('change', { bubbles: true })); return true; }, courier?.id);
  await w.waitFor(() => [...document.querySelectorAll('.modal button')].some(b => b.textContent.trim().endsWith('Tayinlash') && !b.disabled), 8000);
  try { await tapEl(w, A, '.modal button', 'Tayinlash'); } catch (e) { check('INFO', 'assign button', e.message); }
  await pause(2000);
  o2 = await orderState(orderId);
  ok(o2.status === 'confirmed' && /assigned/.test(JSON.stringify(o2.delivery?.status || '')), 'admin: order confirmed and the courier assigned from the order dialog', JSON.stringify({ status: o2.status, delivery: o2.delivery?.status, courierBlock: await w.evaluate(() => [...document.querySelectorAll('.modal .od-block')].find(b => b.querySelector('h4')?.textContent === 'Kuryer')?.innerText || '') }));
  shot('admin-courier-assigned');
  await backKey();
  // Customer sees the new total
  expected = C; launch(C); await pause(1500); w.close(); w = await webview(C, 9421);
  await w.evaluate(() => { [...document.querySelectorAll('.tabbar button')].find(b => b.textContent.includes('Buyurtmalar')).click(); return true; }); await pause(1000);
  await tapEl(w, C, '.page-head .icon-btn'); await pause(2500); // «Yangilash» (the list also refreshes itself every 30 s)
  t = plain(await w.text());
  ok(t.includes(orderNo) && t.includes('265 000'), 'tariff: customer app shows the new total (265 000 soʻm) with the courier fee', t.slice(0, 260));
  shot('tariff-customer-total');
  w.close();

  // ================================================================ COURIER — K01–K04
  expected = A; launch(A); await pause(1500); w = await webview(A, 9422);
  if (await w.evaluate(() => !!sessionStorage.getItem('fayz_admin_token'))) await adminSignOut(w);
  await adminLogin(w, COURIER.email, COURIER.reset);
  const courierUi = await w.waitFor(() => document.body.innerText.includes('Kuryer paneli'), 20000);
  t = await w.text();
  const noAdmin = await w.evaluate(() => !document.querySelector('.side-nav') && !/Mahsulotlar|Integratsiyalar|Xodimlar/.test(document.body.innerText));
  ok(courierUi && noAdmin, 'K01: courier account opens «Kuryer paneli» only — no products, settings or integrations', t.slice(0, 200));
  shot('k01-courier-panel');
  const forbidden = await Promise.all(['/admin/products', '/admin/orders', '/admin/users', '/admin/integrations'].map(async p => (await call(p, 'GET', undefined, 'Bearer ' + (await call('/admin/login', 'POST', { email: COURIER.email, password: COURIER.reset })).data.token)).status));
  ok(forbidden.every(s => s === 403), 'K01: courier token → 403 on admin endpoints', forbidden.join(','));
  adb('emu', 'geo', 'fix', '69.2286', '41.3264'); // at the store
  await w.waitFor(n => document.body.innerText.includes(n), 15000, orderNo);
  await w.evaluate(n => { [...document.querySelectorAll('.delivery-card')].find(x => x.textContent.includes(n))?.click(); return true; }, orderNo); await pause(1500);
  const stages = [['Qabul qilish', 'accepted'], ['Doʻkondan oldim', 'picked_up'], ['Yoʻlga chiqdim', 'on_the_way'], ['Manzilga yetib keldim', 'arrived'], ['Mijozga topshirdim', 'handed_over']];
  for (const [label, want] of stages) {
    let tapped = true; try { await tapEl(w, A, '.courier-actions button', label); } catch { tapped = false; }
    await allowPermission(2500); await pause(1500);
    if (label === 'Yoʻlga chiqdim') adb('emu', 'geo', 'fix', '69.2849', '41.3655');
    const now = await orderState(orderId);
    const st = now.delivery?.status;
    ok(tapped && st === want, `K04: courier taps «${label}» → ${want}`, `tapped=${tapped} status=${st}`);
  }
  shot('k04-handed-over');
  w.close();
  // Customer confirms → delivered
  expected = C; launch(C); await pause(1500); w = await webview(C, 9421);
  const t0 = Date.now(); const card = await w.waitFor(() => document.body.innerText.includes('Ha, qabul qildim'), 10000);
  ok(card, `K04: back in the customer app the «Ha, qabul qildim» card appears at once (${Math.round((Date.now() - t0) / 100) / 10} s, no 30 s wait)`);
  shot('k04-customer-confirm');
  await tapEl(w, C, '.confirm-card .btn-primary', 'Ha, qabul qildim'); await pause(2500);
  const fin = await orderState(orderId);
  ok(fin.status === 'delivered', 'K04: customer taps «Ha, qabul qildim» → order «Yetkazildi»', JSON.stringify({ status: fin.status, delivery: fin.delivery?.status }));
  w.close();
} catch (error) {
  const msg = String(error?.message || error), lost = /device offline|no devices|FOREGROUND_LOST|no answer in/.test(msg);
  check(lost ? 'BLOCKED' : 'FAIL', lost ? 'emulator / WebView lost or another app in front — remaining steps not run' : 'plan script completed', String(error?.stack || error).split('\n').slice(0, 3).join(' '));
  try { shot('zz-error'); } catch { /* emulator gone */ }
} finally {
  for (const pkg of [C, A]) { try { setApiUrl(pkg, null); } catch { /* gone */ } }
  try { adb('reverse', '--remove', `tcp:${PORT}`); } catch { /* none */ }
  stopWorker(); rmSync(dir, { recursive: true, force: true });
  const n = s => results.filter(r => r.startsWith(s)).length;
  writeFileSync(RESULTS, `${KIND} — debug apps against an ISOLATED local Worker (fresh D1, local R2); production not contacted\n${new Date().toISOString()}\n${results.join('\n')}\n\nPASS ${n('PASS')} · FAIL ${n('FAIL')} · BLOCKED ${n('BLOCKED')}\n`);
  console.log(`\nPASS ${n('PASS')} · FAIL ${n('FAIL')} · BLOCKED ${n('BLOCKED')}`);
  process.exitCode = n('FAIL') || n('BLOCKED') ? 1 : 0;
}
