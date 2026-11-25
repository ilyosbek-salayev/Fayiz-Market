// Fayz Market V1 storefront on the real 1.2.0 APKs inside an Android 14 EMULATOR (NOT a physical phone).
// Needs a booted emulator with both APKs installed. Starts its own isolated local Worker (fresh D1) and an
// OpenRouteService mock; the apps are pointed at it through `adb reverse` + their debug preference and are pointed
// back to production at the end. Nothing is uninstalled or wiped.
//   node scripts/android-qa/v1-storefront-emulator.mjs
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { adb, findNode, launch, pause, screenshot, setApiUrl, sh, tapNode, versionOf, webview } from './lib.mjs';

const ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const PORT = 8791, MOCK_PORT = 8802, API = `http://127.0.0.1:${PORT}`;
const OUT = path.join(ROOT, process.env.SHOTS || 'docs/v1/screenshots/emulator');
mkdirSync(OUT, { recursive: true });
const C = 'uz.fayzmarket.customer', A = 'uz.fayzmarket.admin';
const results = []; const check = (ok, name, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && detail ? ' — ' + detail : ''}`); console.log(results.at(-1)); };
const shot = name => writeFileSync(path.join(OUT, `${name}.png`), screenshot());
const resumed = () => sh('dumpsys activity activities | grep -m1 -E "mResumedActivity|topResumedActivity" || true');

// ---------- ORS mock + isolated Worker ----------
const ORS_KEY = 'ors-emu-' + randomBytes(8).toString('hex');
const mock = createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  if (req.headers.authorization !== ORS_KEY) { res.writeHead(403); return res.end('{}'); }
  const [[a, b], [c, d]] = JSON.parse(Buffer.concat(chunks)).coordinates;
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ features: [{ properties: { summary: { distance: 6420, duration: 960 } }, geometry: { coordinates: [[a, b], [a, (b + d) / 2], [c, (b + d) / 2], [c, d]] } }] }));
});
await new Promise(r => mock.listen(MOCK_PORT, '127.0.0.1', r));
const dir = mkdtempSync(path.join(tmpdir(), 'fayz-v1-emu-'));
writeFileSync(path.join(dir, 'env'), `DEV_MOCK_PROVIDERS=http://127.0.0.1:${MOCK_PORT}\n`);
const worker = spawn('bash', [path.join(ROOT, 'scripts/deploy-qa/local-worker.sh'), path.join(dir, 'db')], { env: { ...process.env, QA_PORT: String(PORT), QA_ENV_FILE: path.join(dir, 'env') }, stdio: 'ignore', detached: true });
const stop = () => { try { process.kill(-worker.pid, 'SIGTERM'); } catch { /* gone */ } mock.close(); rmSync(dir, { recursive: true, force: true }); };
for (let i = 0; i < 180; i++) { try { if ((await fetch(API + '/health')).ok) break; } catch { /* starting */ } await pause(500); }
const call = async (p, method = 'GET', body, token) => { const r = await fetch(API + p, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(p === '/admin/bootstrap' ? { 'X-Bootstrap-Secret': 'qa-bootstrap' } : {}) }, body: body ? JSON.stringify(body) : undefined }); return r.json(); };

try {
  // ---------- Installed build ----------
  const version = JSON.parse((await import('node:fs')).readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
  for (const pkg of [C, A]) { const v = versionOf(pkg); check(v.name === version && v.code >= 8, `${pkg}: installed DEBUG build ${version} (versionCode ${v.code})`, `${v.name} (${v.code})`); }
  // Release builds shorten resource paths (res/BW.xml…), so the icon is checked in the resource table instead.
  const aapt2 = `${process.env.HOME}/.fayz-toolchain/android-sdk/build-tools/${execFileSync('ls', [`${process.env.HOME}/.fayz-toolchain/android-sdk/build-tools`]).toString().trim().split('\n').pop()}/aapt2`;
  const table = execFileSync(aapt2, ['dump', 'resources', path.join(ROOT, `dist/apk/v${version}/fayz-market-customer.apk`)]).toString();
  const launcher = table.slice(table.indexOf('mipmap/ic_launcher\n'), table.indexOf('mipmap/ic_launcher_foreground'));
  check(/\(anydpi-v26\)/.test(launcher) && /\(xxxhdpi\)/.test(launcher), 'customer release APK: adaptive launcher icon (new brand) + legacy PNGs');

  // ---------- Seed the local Worker ----------
  const owner = { email: 'emu-owner@example.invalid', password: 'EmuLocalPassword-123' };
  await call('/admin/bootstrap', 'POST', owner);
  const { token } = await call('/admin/login', 'POST', owner);
  const cat = (await call('/admin/categories', 'POST', { name: 'Soatlar', slug: 'soatlar' }, token)).id;
  await call('/admin/products', 'POST', { name: 'Klassik soat', slug: 'klassik-soat', description: '', categoryId: cat, price: 245000, stock: 5, active: true, featured: true, images: [] }, token);
  await call('/admin/store', 'PUT', { placeName: 'Fayz Market — Chilonzor', address: 'Toshkent sh., Chilonzor tumani, Bunyodkor shoh koʻchasi, 12', lat: 41.2856, lng: 69.2034 }, token);
  await call('/admin/payment-settings', 'PUT', { cash: true, cardTerminal: true, bankTransfer: false, bankTransferDetails: '', pickup: true }, token);
  await call('/admin/integrations/routing/secrets', 'PUT', { ORS_API_KEY: ORS_KEY }, token);
  await call('/admin/banners', 'POST', { title: 'Doʻkonimizga keling', subtitle: 'Chilonzor, Bunyodkor shoh koʻchasi', ctaLabel: 'Yoʻlni koʻrish', ctaTarget: 'store', tone: 'accent', position: 1 }, token);

  // ---------- Customer ----------
  adb('reverse', `tcp:${PORT}`, `tcp:${PORT}`);
  sh(`pm revoke ${C} android.permission.ACCESS_FINE_LOCATION || true`); sh(`pm revoke ${C} android.permission.ACCESS_COARSE_LOCATION || true`);
  setApiUrl(C, API); launch(C); await pause(2000);
  let w = await webview(C, 9411);
  // Start like a first visit: no remembered customer location from an earlier run.
  await w.waitFor(() => document.readyState === 'complete', 30000);
  await w.evaluate(() => { localStorage.removeItem('fayz_user_location_v1'); location.reload(); return true; }); await pause(2500);
  await w.waitFor(() => !!document.querySelector('.promo') && !!document.querySelector('.app-header img.brand-mark')?.naturalWidth, 40000);
  const head = await w.evaluate(() => ({ src: document.querySelector('.app-header img.brand-mark')?.getAttribute('src'), go: document.querySelector('.header-go')?.getAttribute('aria-label'), text: document.body.innerText }));
  check(/mark-light/.test(head.src || '') && /Doʻkonga yoʻl/.test(head.go || ''), 'APK WebView: new brand symbol and route-to-store header button');
  check(head.text.includes('Bunyodkor') && head.text.includes('Aniqlash') && head.text.includes('Doʻkonimizga keling'), 'APK WebView: store location, user location and admin banner');
  shot('customer-home');
  adb('emu', 'geo', 'fix', '69.2797', '41.3111');
  await w.evaluate(() => { document.querySelectorAll('.loc-row')[1].click(); return true; });
  const dialog = await tapNode(/^(While using the app|Only this time|Allow|ALLOW)\|/i, 10000);
  check(!!dialog, 'Android location permission dialog shown on "Aniqlash" (only when asked)');
  const located = await w.waitFor(() => /41\.31\d*, 69\.27\d*/.test(document.body.innerText), 25000);
  check(located, 'one-shot GPS location shown on home', (await w.text()).slice(0, 200));
  await w.evaluate(() => { document.querySelector('.header-go').click(); return true; });
  const routed = await w.waitFor(() => /Yoʻl boʻyicha masofa/.test(document.body.innerText) && !!document.querySelector('.store-screen .map-box[data-provider="openfreemap"]'), 40000);
  check(routed, 'store map (MapLibre in the APK WebView) with road route, distance and time');
  await pause(3000); shot('customer-store-map');
  sh('input keyevent KEYCODE_BACK'); await pause(1500);
  const afterBack = await w.evaluate(() => ({ open: !!document.querySelector('.store-screen'), home: !!document.querySelector('.promo') }));
  check(!afterBack.open && afterBack.home && resumed().includes(C), 'Android system Back closes the map and stays in the app', `${JSON.stringify(afterBack)} ${resumed()}`);
  shot('customer-home-after-back');
  await w.evaluate(() => { document.querySelector('.pcard-add')?.click(); return true; }); await pause(500);
  await w.evaluate(() => { [...document.querySelectorAll('.tabbar button')].find(b => b.textContent.includes('Savat')).click(); return true; }); await pause(500);
  await w.click('Buyurtma berish'); await pause(800);
  const co = await w.text();
  check(co.includes('Doʻkondan olib ketish') && co.includes('Naqd pul') && co.includes('Karta (terminal orqali)'), 'checkout in the APK: fulfilment and payment choices');
  shot('customer-checkout');
  sh('input keyevent KEYCODE_BACK'); await pause(800);
  w.close();

  // ---------- Admin ----------
  setApiUrl(A, API); launch(A); await pause(2000);
  w = await webview(A, 9412);
  await w.waitFor(() => !!document.querySelector('input[type=email]'), 30000);
  check(/mark-light/.test(await w.evaluate(() => document.querySelector('.login-brand img.brand-mark')?.getAttribute('src') || '')), 'admin APK login: new brand symbol');
  const loginText = await w.evaluate(() => ({ debug: !!window.FayzNative?.isDebug?.(), text: document.body.innerText }));
  check(loginText.debug && !/server|API/i.test(loginText.text), 'admin DEBUG build: login still has no server/API control (it lives in Sozlamalar → Texnik sozlamalar)');
  await w.setValue('input[type=email]', owner.email); await w.setValue('input[type=password]', owner.password);
  await w.click('Kirish'); await w.waitFor(() => !!document.querySelector('.sidebar'), 30000);
  await w.evaluate(() => { [...document.querySelectorAll('.side-nav button')].find(b => b.textContent.includes('Sozlamalar')).click(); return true; });
  const settings = await w.waitFor(() => !!document.querySelector('.logo-slot') && document.body.innerText.includes('Doʻkon joylashuvi'), 30000);
  check(settings, 'admin APK: Brend va koʻrinish + Doʻkon joylashuvi panels');
  check(await w.evaluate(() => document.body.innerText.includes('Texnik sozlamalar')), 'admin DEBUG build: technical settings available to the super admin inside Settings');
  await pause(1500); shot('admin-settings');
  w.close();
} catch (error) {
  check(false, 'emulator script completed', String(error?.stack || error));
} finally {
  // Back to production for both apps, as they were.
  for (const pkg of [C, A]) { try { setApiUrl(pkg, null); } catch { /* app missing */ } }
  try { adb('reverse', '--remove', `tcp:${PORT}`); } catch { /* none */ }
  stop();
  writeFileSync(path.join(OUT, 'results.txt'), results.join('\n') + `\n\n${results.filter(r => r.startsWith('PASS')).length}/${results.length} passed (EMULATOR, not a physical phone)\n`);
  console.log(`\n${results.filter(r => r.startsWith('PASS')).length}/${results.length} passed (EMULATOR)`);
  process.exitCode = results.some(r => r.startsWith('FAIL')) ? 1 : 0;
}
