// REAL PHYSICAL PHONE test (variant A) of the v1.1.1 APKs against an ISOLATED local Worker — never production data.
// Run phase by phase; a person holds the phone for the fingerprint, camera and permission steps.
//   QA_PORT=8791 scripts/deploy-qa/local-worker.sh <tmp-db>      (separate terminal; local Worker only)
//   node scripts/android-qa/real-device-qa.mjs preflight          read-only: device, versions, signer, original state
//   node scripts/android-qa/real-device-qa.mjs install            adb install -r (no uninstall), data kept, prod opens
//   node scripts/android-qa/real-device-qa.mjs local-on           point both apps at the local Worker (adb reverse)
//   node scripts/android-qa/real-device-qa.mjs bio-enable|bio-unlock|order|notify|camera|courier
//   node scripts/android-qa/real-device-qa.mjs restore            back to production + original permissions/settings
//   node scripts/android-qa/real-device-qa.mjs report             prints every recorded result (JSON)
// Safety: refuses an emulator, never uninstalls or clears data, never sends anything to the production API except
// GET /health, and does not touch an existing fingerprint sign-in unless REAL_QA_ALLOW_BIO_OVERWRITE=1.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { ADB, adb, findNode, launch, pause, screenshot, sh, tapNode, versionOf, webview } from './lib.mjs';

const PHASE = process.argv[2] || 'preflight';
const PORT = Number(process.env.QA_PORT || 8791), API = `http://127.0.0.1:${PORT}`;
const PROD = 'https://fayz-market-api.ilyosbeksalayev240.workers.dev';
const DIST = process.env.REAL_QA_APK_DIR || 'dist/apk/v1.1.1';
const C = 'uz.fayzmarket.customer', A = 'uz.fayzmarket.admin', PKGS = [C, A];
const PERMS = ['android.permission.CAMERA', 'android.permission.ACCESS_FINE_LOCATION', 'android.permission.ACCESS_COARSE_LOCATION', 'android.permission.POST_NOTIFICATIONS'];
// Kept outside the repo: screenshots of a personal phone may show private notifications.
const DIR = process.env.REAL_QA_DIR || `${os.tmpdir()}/fayz-real-device-qa`, SHOTS = `${DIR}/shots`, STATE = `${DIR}/state.json`;
mkdirSync(SHOTS, { recursive: true });
const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : { results: [] };
const RUN = state.results.length; // this invocation's results start here
const save = () => writeFileSync(STATE, JSON.stringify(state, null, 2));
const check = (ok, name, detail = '') => { state.results.push({ phase: PHASE, ok: !!ok, name, detail: String(detail).slice(0, 400), at: new Date().toISOString() }); save(); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); return !!ok; };
const note = (name, detail = '') => { state.results.push({ phase: PHASE, ok: null, name, detail: String(detail).slice(0, 400), at: new Date().toISOString() }); save(); console.log(`NOTE ${name}${detail ? ' — ' + detail : ''}`); };
const shot = name => writeFileSync(`${SHOTS}/${name}.png`, screenshot());
const say = text => console.log(`\n>>> ${text}\n`);
const call = async (p, { method = 'GET', auth, body, headers = {} } = {}) => { const r = await fetch(API + p, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(auth ? { Authorization: auth } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, data: await r.json().catch(() => null) }; };
const runAs = (pkg, cmd) => { try { return adb('shell', `run-as ${pkg} sh -c '${cmd}'`); } catch (e) { return `ERR ${String(e.stderr || e.message).trim()}`; } };
const PREFS = 'shared_prefs/uz.fayzmarket.app.MainActivity.xml';
// Permission dialogs by resource id, so the phone's UI language does not matter.
const allowPermission = (ms = 6000) => tapNode(/permission_allow_foreground_only_button|permission_allow_button|permission_allow_one_time_button/, ms);
const waitNode = async (pattern, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { const n = findNode(pattern); if (n) return n; await pause(500); } return null; };
const notifications = pkg => sh('dumpsys notification --noredact').split('NotificationRecord(').filter(r => r.includes(`pkg=${pkg}`));
const grants = pkg => { const out = sh(`dumpsys package ${pkg}`); return Object.fromEntries(PERMS.map(p => [p, (out.match(new RegExp(`${p.replace(/\./g, '\\.')}: granted=(true|false)`)) || [])[1] ?? 'n/a'])); };
const appData = pkg => { const files = runAs(pkg, 'find . -type f 2>/dev/null'); // Persistent data only: Android clears code_cache/cache on every update by design.
  const list = files.split('\n').filter(Boolean); const persistent = list.filter(f => /^\.\/(shared_prefs|databases|files)\//.test(f)).sort();
  return files.startsWith('ERR') ? { error: files } : { count: list.length, persistent, webviewStorage: /app_webview\/.*(Local Storage|leveldb)/.test(files), // Biometrics.stored() == the "ct" key exists; only its presence is read, never the value.
    biometricSlot: /shared_prefs\/fayz_biometric\.xml/.test(files) && Number(runAs(pkg, 'grep -c "name=\\"ct\\"" shared_prefs/fayz_biometric.xml || true')) > 0 }; };
const storageKeys = async (pkg, port) => { const w = await webview(pkg, port); await w.waitFor(() => document.readyState === 'complete', 20000); const r = await w.evaluate(() => ({ origin: location.origin, keys: Object.keys(localStorage).sort(), session: Object.keys(sessionStorage).sort() })); w.close(); return r; };
const setApiPrefs = (pkg, xml) => { sh(`am force-stop ${pkg}`); execFileSync(ADB, ['shell', `run-as ${pkg} sh -c 'mkdir -p shared_prefs && rm -f shared_prefs/MainActivity.xml && cat > ${PREFS}'`], { input: xml }); };
// Staff sessions live in sessionStorage, so every fresh process starts on the login form.
// Signed in = a staff session token and no login page, whichever page the app opened on (on a phone-width
// screen the side menu with "Chiqish" is not rendered).
const ownerLogin = async a => {
  const state = () => document.querySelector('input[type=email]') ? 'form' : sessionStorage.getItem('fayz_admin_token') && !document.querySelector('.login-page') ? 'in' : '';
  await a.waitFor(state, 30000);
  if ((await a.evaluate(state)) === 'form') { await a.setValue('input[type=email]', 'owner@device.example'); await a.setValue('input[type=password]', 'OwnerPassword-123'); await a.click('Kirish'); }
  return a.waitFor(() => !!sessionStorage.getItem('fayz_admin_token') && !document.querySelector('.login-page, input[type=email]'), 20000);
};
// Clears WebView storage under the LOCAL test origin only, waits for Chromium to flush it, then proves it on a relaunch.
const clearLocalOrigin = async pkg => {
  const port = pkg === C ? 9461 : 9462; sh(`am force-stop ${pkg}`); launch(pkg); let w = await webview(pkg, port);
  if (!await w.waitFor(api => location.origin === api && document.readyState === 'complete', 30000, API)) { w.close(); return false; }
  // The running app persists its state on every change: block its writes for this process, then clear.
  await w.evaluate(() => { Storage.prototype.setItem = function () {}; localStorage.clear(); sessionStorage.clear(); }); w.close(); await pause(4000);
  sh(`am force-stop ${pkg}`); launch(pkg); w = await webview(pkg, port);
  await w.waitFor(api => location.origin === api && document.readyState === 'complete', 30000, API);
  // The customer app re-creates empty defaults on start ({}, [], blank profile); only real leftovers count.
  const left = await w.evaluate(() => Object.keys(localStorage).filter(k => { const v = localStorage.getItem(k) || ''; if (k === 'fayz_theme' || ['', '{}', '[]', 'null'].includes(v)) return false; try { const o = JSON.parse(v); return !(o && typeof o === 'object' && Object.values(o).every(x => x === '' || x === '+998')); } catch { return true; } })); w.close(); sh(`am force-stop ${pkg}`);
  return left;
};
const EMPTY_PREFS = `<?xml version='1.0' encoding='utf-8' standalone='yes' ?><map></map>`;
const signer = apk => { const bt = `${ADB.replace(/platform-tools\/adb$/, '')}build-tools`; const v = readdirSync(bt).sort().pop(); return (execFileSync(`${bt}/${v}/apksigner`, ['verify', '--print-certs', apk], { encoding: 'utf8', env: { ...process.env, JAVA_HOME: process.env.JAVA_HOME || `${os.homedir()}/.fayz-toolchain/jdk/Contents/Home` } }).match(/certificate SHA-256 digest: ([0-9a-f]+)/) || [])[1] || ''; };
const ensureUnlocked = () => { if (/isKeyguardShowing=true|mShowingLockscreen=true/.test(sh('dumpsys window'))) { console.log('FAIL the phone is locked — unlock it and run the phase again'); process.exit(1); } };

if (PHASE === 'report') { console.log(JSON.stringify(state, null, 2)); process.exit(0); }

// ---------- Device guard (every phase) ----------
const devices = adb('devices').split('\n').slice(1).filter(l => /\tdevice$/.test(l));
if (devices.length !== 1) { console.log(`FAIL expected exactly one authorised device, found ${devices.length}:\n${adb('devices', '-l')}`); process.exit(1); }
const prop = k => sh(`getprop ${k}`);
const device = { serial: devices[0].split('\t')[0], manufacturer: prop('ro.product.manufacturer'), model: prop('ro.product.model'), marketName: prop('ro.product.vendor.marketname') || prop('ro.config.marketing_name'), android: prop('ro.build.version.release'), sdk: Number(prop('ro.build.version.sdk')), oneUi: prop('ro.build.version.oneui'), emulator: prop('ro.kernel.qemu') === '1' || /generic|emulator|sdk_gphone/i.test(prop('ro.product.model') + prop('ro.hardware')) };
// REAL_QA_ALLOW_EMULATOR=1 only rehearses the script on an emulator; such results are labelled EMULATOR.
if (device.emulator && process.env.REAL_QA_ALLOW_EMULATOR !== '1') { console.log('FAIL this is an emulator — this script is for a physical phone'); process.exit(1); }
console.log('device:', JSON.stringify(device));

try {
  if (PHASE === 'preflight') {
    state.device = device; state.original = { stayOn: sh('settings get global stay_on_while_plugged_in') };
    check(!device.emulator || process.env.REAL_QA_ALLOW_EMULATOR === '1', device.emulator ? 'EMULATOR rehearsal (not a physical device)' : 'physical device detected over USB', `${device.manufacturer} ${device.model} ${device.marketName} / Android ${device.android} (SDK ${device.sdk})${device.oneUi ? ' / One UI ' + device.oneUi : ''}`);
    const distSigner = signer(`${DIST}/fayz-market-customer-debug.apk`);
    check(distSigner && distSigner === signer(`${DIST}/fayz-market-admin-debug.apk`), 'both v1.1.1 APKs share one signer', distSigner);
    for (const pkg of PKGS) {
      const v = versionOf(pkg); const installed = v.code > 0;
      const o = state.original[pkg] = { version: v, grants: installed ? grants(pkg) : null };
      note(`${pkg}: installed version`, installed ? `${v.name} (${v.code}), first install ${v.first}, last update ${v.last}` : 'not installed');
      if (!installed) continue;
      const path = sh(`pm path ${pkg}`).split('\n')[0].replace(/^package:/, '');
      const local = `${DIR}/${pkg}-installed.apk`; adb('pull', path, local);
      const cert = signer(local);
      check(cert === distSigner, `${pkg}: installed app signed with the same certificate (in-place update possible)`, cert);
      o.prefs = runAs(pkg, `cat ${PREFS} 2>/dev/null || true`); o.prefsLegacy = runAs(pkg, 'cat shared_prefs/MainActivity.xml 2>/dev/null || true');
      const url = (o.prefs.match(/name="api_url">([^<]*)</) || [])[1] || '';
      note(`${pkg}: API address override`, url || 'none (built-in production default)');
      o.data = appData(pkg);
      check(!o.data.error, `${pkg}: app data readable through run-as (debuggable build)`, o.data.error || `${o.data.count} files, WebView storage ${o.data.webviewStorage}, fingerprint sign-in stored ${o.data.biometricSlot}`);
      note(`${pkg}: runtime permissions before the test`, JSON.stringify(o.grants));
    }
    save();
  }

  else if (PHASE === 'install') {
    ensureUnlocked();
    const ports = { [C]: 9461, [A]: 9462 };
    for (const pkg of PKGS) {
      const o = state.original?.[pkg]; if (!o) throw new Error('run preflight first');
      if (o.version.code > 0) { sh(`am force-stop ${pkg}`); launch(pkg); await pause(2500); await allowPermission(4000); o.keysBefore = await storageKeys(pkg, ports[pkg]).catch(e => ({ error: String(e.message) })); note(`${pkg}: WebView storage keys before update (names only)`, JSON.stringify(o.keysBefore)); }
      const file = pkg === C ? 'fayz-market-customer-debug.apk' : 'fayz-market-admin-debug.apk';
      const out = adb('install', '-r', `${DIST}/${file}`);
      check(/Success/.test(out), `${pkg}: adb install -r (no uninstall)`, out.split('\n').pop());
      const v = versionOf(pkg);
      check(v.code === 5 && v.name === '1.1.1', `${pkg}: now 1.1.1 (5)`, `${v.name} (${v.code})`);
      if (o.version.code > 0) {
        check(v.first === o.version.first, `${pkg}: first install time kept (updated in place, not reinstalled)`, v.first);
        const d = appData(pkg); const lost = (o.data.persistent || []).filter(f => !d.persistent?.includes(f));
        check(!d.error && !lost.length && d.webviewStorage === o.data.webviewStorage, `${pkg}: app data kept (settings, databases, WebView storage)`, lost.length ? `missing: ${lost.join(', ')}` : `${o.data.persistent.length} persistent files all present; WebView storage ${d.webviewStorage}`);
      }
      sh(`am force-stop ${pkg}`); launch(pkg); await pause(2000); await allowPermission(5000);
      const w = await webview(pkg, ports[pkg]);
      const loaded = await w.waitFor(re => new RegExp(re).test(document.body.innerText), 40000, pkg === C ? 'Katalog|Bosh sahifa|Barmoq izi' : 'Kirish|Kunlik savdo|Kuryer paneli|Barmoq izi');
      const origin = await w.evaluate(() => location.origin);
      const health = await w.evaluate(async u => (await (await fetch(u + '/health')).json()).ok, PROD).catch(() => false);
      const after = await w.evaluate(() => ({ keys: Object.keys(localStorage).sort(), session: Object.keys(sessionStorage).sort() }));
      check(loaded, `${pkg}: opens and renders its UI`); check(origin === PROD, `${pkg}: served under the production API origin`, origin);
      check(health === true, `${pkg}: production API reachable from the phone (GET /health)`);
      if (o.keysBefore?.keys) check(o.keysBefore.keys.every(k => after.keys.includes(k)), `${pkg}: saved WebView data (sign-in, cart, settings) survived the update`, JSON.stringify(after.keys));
      shot(`${pkg}-after-install`); w.close();
    }
  }

  else if (PHASE === 'local-on') {
    const h = await call('/health').catch(() => ({ status: 0 }));
    if (h.status !== 200) throw new Error(`local Worker not running on ${API}`);
    adb('reverse', `tcp:${PORT}`, `tcp:${PORT}`);
    state.original.stayOn ??= sh('settings get global stay_on_while_plugged_in');
    sh('svc power stayon usb'); // screen stays on while the person handles the phone; restored afterwards
    const stamp = Date.now().toString(36);
    await call('/admin/bootstrap', { method: 'POST', headers: { 'X-Bootstrap-Secret': process.env.QA_BOOTSTRAP || 'qa-bootstrap' }, body: { email: 'owner@device.example', password: 'OwnerPassword-123' } });
    let r = await call('/admin/login', { method: 'POST', body: { email: 'owner@device.example', password: 'OwnerPassword-123' } }); const owner = 'Bearer ' + r.data.token;
    r = await call('/admin/categories', { method: 'POST', auth: owner, body: { name: 'Soatlar', slug: `soat-${stamp}` } });
    r = await call('/admin/products', { method: 'POST', auth: owner, body: { name: 'Telefon sinov soati', slug: `soat-${stamp}`, description: '', categoryId: r.data.id, price: 150000, stock: 20, active: true, featured: true, images: [] } }); const productId = r.data.id;
    await call('/admin/users', { method: 'POST', auth: owner, body: { email: 'kuryer@device.example', password: 'CourierPass-123', role: 'courier', name: 'Sinov Kuryer', phone: '+998901234500' } });
    await call('/admin/integrations/store_location', { method: 'PUT', auth: owner, body: { store_address: 'Toshkent, Chorsu', store_lat: '41.3264', store_lng: '69.2286' } });
    const phone = '+99890' + String(Date.now()).slice(-7);
    r = await call('/auth/otp', { method: 'POST', body: { phone, purpose: 'register' } });
    r = await call('/auth/register', { method: 'POST', body: { phone, code: r.data.devCode, password: 'CustomerPass-123', name: 'Telefon Mijoz' } });
    state.local = { owner, productId, phone, customerToken: r.data.token };
    for (const pkg of PKGS) setApiPrefs(pkg, `<?xml version='1.0' encoding='utf-8' standalone='yes' ?><map><string name="api_url">${API}</string></map>`);
    // Fresh local database each run: clear what an earlier run left under the LOCAL origin only (e.g. the
    // "last seen notification" id would otherwise hide new ones). Production-origin storage is not touched.
    for (const pkg of PKGS) { const left = await clearLocalOrigin(pkg); check(Array.isArray(left) && !left.length, `${pkg}: local-origin storage starts empty (fresh local database)`, Array.isArray(left) ? JSON.stringify(left) : 'local origin did not load'); }
    check(!!(owner && productId && state.local.customerToken), 'isolated local Worker seeded; both apps pointed at it', API);
    save();
  }

  else if (PHASE === 'bio-enable') {
    ensureUnlocked();
    if (state.original[C]?.data?.biometricSlot && process.env.REAL_QA_ALLOW_BIO_OVERWRITE !== '1') { note('customer: fingerprint test skipped', 'a fingerprint sign-in already exists on this phone — enabling it for the test would replace it (set REAL_QA_ALLOW_BIO_OVERWRITE=1 with the owner\'s consent)'); process.exit(0); }
    state.bioTested = true; save();
    launch(C); let c = await webview(C, 9461);
    const status = await c.evaluate(() => FayzNative.biometricStatus());
    check(status === 'available', 'customer: BiometricManager reports an enrolled fingerprint on the phone', status);
    await c.evaluate(t => { localStorage.setItem('fayz_customer_token', t); localStorage.removeItem('fayz_bio_login'); }, state.local.customerToken); await c.evaluate(() => location.reload()); await pause(2500);
    c.close(); c = await webview(C, 9461);
    await c.waitFor(() => !!document.querySelector('.tabbar'), 30000);
    await c.click('Profil', '.tabbar button'); await c.waitFor(() => document.body.innerText.includes('Telefon Mijoz'), 15000);
    check(await c.waitFor(() => !!document.querySelector('.toggle-row input[type=checkbox]'), 8000), 'customer: "Barmoq izi bilan kirish" offered in profile');
    await c.evaluate(() => document.querySelector('.toggle-row input[type=checkbox]').click());
    const prompt = await waitNode(/com\.android\.systemui|biometric|fingerprint|barmoq|отпечат/i, 10000);
    check(!!prompt, 'customer: system BiometricPrompt shown', prompt?.label); shot('c-biometric-prompt');
    say('TELEFON: roʻyxatdan oʻtgan barmogʻingizni sensorga qoʻying (60 s).');
    const stored = await c.waitFor(() => FayzNative.biometricStored() && localStorage.getItem('fayz_bio_login') === '1' && !localStorage.getItem('fayz_customer_token'), 60000);
    check(stored, 'customer: real fingerprint accepted; session encrypted with the Keystore key, plain token removed');
    c.close();
  }

  else if (PHASE === 'bio-unlock') {
    ensureUnlocked();
    sh(`am force-stop ${C}`); launch(C); let c = await webview(C, 9461);
    check(await c.waitFor(() => document.body.innerText.includes('Barmoq izi bilan ochish'), 20000), 'customer: app reopens on the fingerprint lock screen');
    await c.click('Barmoq izi bilan ochish'); await pause(1500); shot('c-lock-prompt');
    say('TELEFON: avval ROʻYXATDAN OʻTMAGAN barmoqni (masalan, boshqa qoʻl) 1–2 marta qoʻying, keyin toʻgʻri barmoqni qoʻying (90 s).');
    const seen = new Set(); let unlocked = false, wrongBeforeUnlock = false; const end = Date.now() + 90000;
    while (Date.now() < end && !unlocked) {
      const n = findNode(/com\.android\.systemui:id\/(indicator|error|help|description)|biometric_error/i); if (n && n.label.split('|')[0]) seen.add(n.label.split('|')[0]);
      unlocked = await c.evaluate(() => !document.body.innerText.includes('Barmoq izi bilan ochish') && !!document.querySelector('.tabbar')).catch(() => false);
      // The first text is the prompt's own instruction; a second, different one is the rejection message.
      if (!unlocked && seen.size >= 2) wrongBeforeUnlock = true;
      await pause(400);
    }
    note('customer: system messages seen before unlock', [...seen].join(' / ') || 'none captured (Samsung may draw them outside the UI tree)');
    check(wrongBeforeUnlock, 'customer: an unenrolled finger was rejected (system message shown, app stayed locked)', wrongBeforeUnlock ? '' : 'not captured automatically — confirm by eye');
    await c.click('Profil', '.tabbar button').catch(() => undefined); await pause(1200);
    check(unlocked && await c.evaluate(() => document.body.innerText.includes('Telefon Mijoz')), 'customer: enrolled real fingerprint decrypts the session and unlocks');
    shot('c-unlocked'); c.close();
  }

  else if (PHASE === 'order') {
    ensureUnlocked();
    launch(C); let c = await webview(C, 9461);
    if (await c.evaluate(() => !localStorage.getItem('fayz_customer_token') && localStorage.getItem('fayz_bio_login') !== '1')) { await c.evaluate(t => localStorage.setItem('fayz_customer_token', t), state.local.customerToken); await c.evaluate(() => location.reload()); await pause(2500); c.close(); c = await webview(C, 9461); }
    if (await c.evaluate(() => document.body.innerText.includes('Barmoq izi bilan ochish'))) { say('TELEFON: barmoq izi bilan oching (45 s).'); await c.click('Barmoq izi bilan ochish'); await c.waitFor(() => !!document.querySelector('.tabbar'), 45000); }
    await c.click('Katalog', '.tabbar button'); await pause(1200);
    await c.evaluate(() => [...document.querySelectorAll('.pcard-hit')].find(x => x.textContent.includes('Telefon sinov soati')).click()); await pause(1200);
    await c.click('Savatga qoʻshish', '.action-bar button'); await pause(600);
    await c.click('Savat', '.tabbar button'); await pause(800); await c.click('Buyurtma berish', '.action-bar button'); await pause(1200);
    await c.click('Xaritada tanlash', '.sheet button');
    const drawn = await c.waitFor(() => { const cv = document.querySelector('.map-box[data-provider=openfreemap] canvas.maplibregl-canvas'); return !!cv && cv.getBoundingClientRect().height > 200; }, 40000);
    await pause(4000); check(drawn, 'customer: MapLibre + OpenFreeMap map draws on the phone (WebGL, phone internet)'); shot('c-map');
    const fineBefore = grants(C)['android.permission.ACCESS_FINE_LOCATION'];
    const coordsBefore = await c.evaluate(() => (document.body.innerText.match(/\d{2}\.\d{4,}, \d{2}\.\d{4,}/) || [''])[0]);
    note('customer: map coordinates before GPS', coordsBefore ? 'default pin shown' : 'none');
    await c.click('Joylashuvimni aniqlash', '.sheet button');
    const dialog = await allowPermission(8000);
    note('customer: location permission', dialog ? 'Android dialog shown and allowed' : `no dialog (granted before: ${fineBefore})`);
    say('TELEFON: joylashuv (GPS) yoqilgan boʻlsin; aniqlash 60 s gacha kutiladi.');
    const located = await c.waitFor(b => { const m = document.body.innerText.match(/\d{2}\.\d{4,}, \d{2}\.\d{4,}/); return !!m && m[0] !== b; }, 60000, coordsBefore);
    check(located, 'customer: real GPS fix reaches the WebView and moves the map pin'); shot('c-gps');
    await c.click('Shu joyni tasdiqlash', '.sheet button'); await pause(600);
    await c.setValue('.sheet input[autocomplete=name]', 'Telefon Mijoz'); await c.setValue('.sheet input[autocomplete=tel]', state.local.phone);
    await c.setValue('.sheet textarea[autocomplete=street-address]', 'Sinov manzili, 1-uy');
    await c.click('Buyurtmani yuborish', '.sheet-foot button'); await pause(3000); shot('c-after-submit');
    const placed = (await c.text()).match(/FM-[A-Z0-9-]+/)?.[0];
    const r = await call('/customer/orders', { auth: 'Customer ' + state.local.customerToken }); const order = r.data?.orders?.find(o => o.orderNumber === placed);
    // Coordinates are the tester's real position: only their presence and ~1 km precision go into the report.
    check(!!order && Number.isFinite(order.location?.lat) && Number.isFinite(order.location?.lng), 'customer: order placed from the phone and stored with GPS coordinates', order ? `${placed} ≈ ${order.location.lat.toFixed(2)}, ${order.location.lng.toFixed(2)}` : 'no order');
    state.local.order = order ? { id: order.id, number: placed } : null; save(); c.close();
  }

  else if (PHASE === 'notify') {
    ensureUnlocked();
    launch(A); await pause(1500); await allowPermission(4000); let a = await webview(A, 9462);
    check(await ownerLogin(a), 'admin: owner signed in on the phone (local Worker)');
    const notif = grants(A)['android.permission.POST_NOTIFICATIONS'];
    note('admin: notification permission', String(notif));
    await pause(3000);
    const r = await call('/orders', { method: 'POST', body: { customerName: 'Bildirishnoma Sinov', phone: '+998907770000', address: 'Toshkent, Mirobod 1', note: '', items: [{ productId: state.local.productId, quantity: 1 }] } });
    const n = r.data.order; sh('input keyevent KEYCODE_HOME');
    let posted = false; for (let i = 0; i < 60 && !posted; i++) { posted = notifications(A).some(x => x.includes(n.orderNumber) || x.includes('Yangi buyurtma')); if (!posted) await pause(1000); }
    check(posted, 'admin: Android notification posted while the app is in the background', n.orderNumber);
    sh('cmd statusbar expand-notifications'); await pause(1500); shot('a-shade');
    const tapped = await tapNode(/Yangi buyurtma/, 8000); check(!!tapped, 'admin: notification visible in the shade and tapped');
    a.close(); a = await webview(A, 9462);
    check(await a.waitFor(num => document.body.innerText.includes(num) && !!document.querySelector('.modal'), 15000, n.orderNumber), 'admin: tapping the notification opens that order', n.orderNumber);
    shot('a-order-opened'); a.close();
  }

  else if (PHASE === 'camera') {
    ensureUnlocked();
    const since = Math.floor(Date.now() / 1000);
    sh(`am force-stop ${A}`); launch(A); let a = await webview(A, 9462);
    if (!await ownerLogin(a)) throw new Error('owner sign-in failed');
    await a.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    await a.click('Mahsulotlar', '.side-nav button, .tabbar button, nav button').catch(() => undefined); await pause(1500);
    await a.click('Mahsulot qoʻshish'); await a.waitFor(() => document.body.innerText.includes('Kamerada suratga olish'), 10000);
    await a.click('Kamerada suratga olish', 'button.image-upload'); await pause(1500); await allowPermission(5000);
    let cam = ''; for (let i = 0; i < 20 && !cam; i++) { cam = (sh('dumpsys activity activities | grep -E "topResumedActivity|mResumedActivity" || true').match(/[\w.]*camera[\w.]*/i) || [''])[0]; if (!cam) await pause(700); }
    check(!!cam, 'admin: camera button opens the phone camera app', cam);
    say('TELEFON: suratga oling va tasdiqlang (✓ / OK / Saqlash) — 120 s.');
    a.close(); let preview = false; const end = Date.now() + 120000;
    while (!preview && Date.now() < end) { try { a = await webview(A, 9462); preview = await a.waitFor(() => { const img = document.querySelector('.picker-preview img'); return !!img && img.src.startsWith('blob:') && img.naturalWidth > 0; }, 5000); if (!preview) a.close(); } catch { await pause(1000); } }
    check(preview, 'admin: photo returned from the camera to the WebView as a resized preview');
    if (preview) await a.click('Yuklash', '.picker-actions button');
    const uploaded = preview && await a.waitFor(() => [...document.querySelectorAll('.modal img')].some(img => /\/images\//.test(img.src) && img.naturalWidth > 0), 30000);
    check(uploaded, 'admin: photo uploaded to storage (local Worker R2) and shown'); shot('a-camera-uploaded');
    // A failed query must not read as "no photo": require MediaStore's own "No result found."
    const q = sh(`content query --uri content://media/external/images/media --projection _display_name --where "date_added>=${since} AND _display_name LIKE 'photo-%'" 2>&1 || true`);
    check(/No result found/.test(q) && !/Exception|Error/i.test(q), 'admin: the app\'s photo is not saved to the phone gallery (app cache only)', q.split('\n')[0].slice(0, 120));
    await a.evaluate(() => [...document.querySelectorAll('.modal button')].find(b => b.textContent.includes('Bekor qilish'))?.click()).catch(() => undefined);
    a?.close();
  }

  else if (PHASE === 'courier') {
    ensureUnlocked();
    const { owner, order, customerToken } = state.local; if (!order) throw new Error('run the order phase first');
    await call(`/admin/orders/${order.id}/status`, { method: 'PATCH', auth: owner, body: { status: 'confirmed' } });
    const courierId = (await call('/admin/couriers', { auth: owner })).data.couriers[0].id;
    check((await call(`/admin/orders/${order.id}/assign`, { method: 'POST', auth: owner, body: { courierId } })).status === 200, 'setup: courier assigned to the phone order');
    launch(A); let a = await webview(A, 9462);
    await a.evaluate(() => { sessionStorage.clear(); localStorage.removeItem('fayz_admin_bio'); location.reload(); }); await pause(2500); a.close(); a = await webview(A, 9462);
    await a.waitFor(() => !!document.querySelector('input[type=email]'), 30000);
    await a.setValue('input[type=email]', 'kuryer@device.example'); await a.setValue('input[type=password]', 'CourierPass-123'); await a.click('Kirish');
    check(await a.waitFor(() => document.body.innerText.includes('Kuryer paneli'), 20000), 'courier: signed in to the courier panel on the phone');
    await a.evaluate(n => [...document.querySelectorAll('.delivery-card')].find(x => x.textContent.includes(n)).click(), order.number); await pause(1500);
    await a.click('Qabul qilish', '.courier-actions button'); await pause(1200); await allowPermission(6000);
    for (const label of ['Doʻkondan oldim', 'Yoʻlga chiqdim']) { await a.click(label, '.courier-actions button'); await pause(1500); }
    await allowPermission(3000);
    let t = null; for (let i = 0; i < 60; i++) { t = (await call(`/orders/${order.id}/tracking`, { auth: 'Customer ' + customerToken })).data; if (t?.courier?.live) break; await pause(1000); }
    check(!!t?.courier?.live && Number.isFinite(t.courier.lat), 'courier: phone GPS shared live through watchPosition (customer tracking sees it)', t?.courier ? `≈ ${t.courier.lat.toFixed(2)}, ${t.courier.lng.toFixed(2)}` : 'no fix');
    check(await a.evaluate(() => document.body.innerText.includes('Joylashuv ulashilmoqda')), 'courier: on-screen sharing indicator'); shot('k-sharing');
    for (const label of ['Manzilga yetib keldim', 'Mijozga topshirdim']) { await a.click(label, '.courier-actions button'); await pause(1500); }
    a.close();
    sh(`am force-stop ${C}`); launch(C); let c = await webview(C, 9461);
    if (await c.evaluate(() => document.body.innerText.includes('Barmoq izi bilan ochish'))) { say('TELEFON: mijoz ilovasini barmoq izi bilan oching (45 s).'); await c.click('Barmoq izi bilan ochish'); await c.waitFor(() => !!document.querySelector('.tabbar'), 45000); }
    await c.click('Buyurtmalar', '.tabbar button'); await pause(1500);
    await c.evaluate(n => { const el = [...document.querySelectorAll('button, .order-card, [role=button]')].find(x => x.textContent.includes(n)); el?.click(); }, order.number); await pause(1200);
    const confirmed = await c.waitFor(() => !!document.querySelector('.confirm-card'), 15000) && (await c.click('Ha, qabul qildim', '.confirm-card button'), await pause(2000), true);
    const final = (await call('/customer/orders', { auth: 'Customer ' + customerToken })).data?.orders?.find(o => o.id === order.id);
    check(confirmed && final?.status === 'delivered', 'order flow: customer confirmed receipt on the phone → order delivered', final?.status);
    shot('c-delivered'); c.close();
  }

  else if (PHASE === 'restore') {
    for (const pkg of PKGS) {
      const o = state.original?.[pkg]; if (!o) continue;
      // Leave no local-test sign-in behind: clear the local origin's storage and the fingerprint slot (if it was empty before).
      try {
        sh(`am force-stop ${pkg}`); launch(pkg); const w = await webview(pkg, pkg === C ? 9461 : 9462);
        if (await w.waitFor(api => location.origin === api && document.readyState === 'complete', 30000, API)) await w.evaluate((keep) => { if (!keep) FayzNative.biometricDisable(); }, !!o.data?.biometricSlot && !state.bioTested);
        else note(`${pkg}: app was not on the local origin — fingerprint cleanup skipped`);
        w.close(); await pause(2000); /* SharedPreferences.apply() writes asynchronously */
        const left = await clearLocalOrigin(pkg); check(Array.isArray(left) && !left.length, `${pkg}: local test data removed from the app`, JSON.stringify(left));
      } catch (e) { note(`${pkg}: local storage cleanup skipped`, e.message); }
      if (!o.data?.biometricSlot || state.bioTested) check(Number(runAs(pkg, 'grep -c "name=\\"ct\\"" shared_prefs/fayz_biometric.xml 2>/dev/null || true')) === 0, `${pkg}: no test fingerprint sign-in left behind`);
      const url = (o.prefs?.match(/name="api_url">([^<]*)</) || [])[1] || '';
      setApiPrefs(pkg, !url || url.replace(/\/+$/, '') === PROD ? (o.prefs && !o.prefs.startsWith('ERR') && o.prefs.includes('<map') ? o.prefs : EMPTY_PREFS) : EMPTY_PREFS);
      if (url && url.replace(/\/+$/, '') !== PROD) note(`${pkg}: earlier API override ${url} replaced by the production default`);
      const now = grants(pkg);
      for (const [p, was] of Object.entries(o.grants || {})) if (was !== 'n/a' && now[p] !== was) { try { sh(`pm ${was === 'true' ? 'grant' : 'revoke'} ${pkg} ${p}`); } catch (e) { note(`${pkg}: could not restore ${p}`, e.message); } }
      check(JSON.stringify(grants(pkg)) === JSON.stringify(o.grants), `${pkg}: runtime permissions restored to their original state`, JSON.stringify(grants(pkg)));
    }
    try { adb('reverse', '--remove', `tcp:${PORT}`); } catch { /* not set */ }
    if (state.original?.stayOn != null) sh(`settings put global stay_on_while_plugged_in ${state.original.stayOn}`);
    for (const pkg of PKGS) {
      sh(`am force-stop ${pkg}`); launch(pkg); await pause(1500);
      const w = await webview(pkg, pkg === C ? 9461 : 9462);
      await w.waitFor(() => document.readyState === 'complete', 20000);
      const origin = await w.evaluate(() => location.origin);
      const health = await w.evaluate(async u => (await (await fetch(u + '/health')).json()).ok, PROD).catch(() => false);
      check(origin === PROD && health === true, `${pkg}: back on the production API (origin + GET /health)`, origin);
      if (state.original[pkg]?.keysBefore?.keys) { const keys = await w.evaluate(() => Object.keys(localStorage).sort()); check(state.original[pkg].keysBefore.keys.every(k => keys.includes(k)), `${pkg}: original production WebView data still present`, JSON.stringify(keys)); }
      w.close(); sh(`am force-stop ${pkg}`);
    }
    sh('input keyevent KEYCODE_HOME');
  }

  else throw new Error(`unknown phase ${PHASE}`);
} catch (error) {
  check(false, `${PHASE}: phase completed`, String(error?.stack || error));
}
const mine = state.results.slice(RUN).filter(r => r.ok !== null);
console.log(`\n${PHASE}: ${mine.filter(r => r.ok).length}/${mine.length} passed — ${device.emulator ? 'EMULATOR rehearsal' : 'PHYSICAL DEVICE'} ${device.manufacturer} ${device.model}`);
process.exit(mine.every(r => r.ok) ? 0 : 1);
