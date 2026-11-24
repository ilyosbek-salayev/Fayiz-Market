// READ-ONLY release check on an Android device/emulator: installs the given APKs IN PLACE (`adb install -r`,
// no uninstall, no data wipe), opens each app and confirms the bundled UI loads from the production API origin.
// It only reads (catalog, settings, login screen) — it never signs in or writes to production.
//   node scripts/android-qa/install-open-check.mjs dist/apk/v1.1.1
import { execFileSync } from 'node:child_process';
import { ADB, adb, launch, pause, sh, versionOf, webview } from './lib.mjs';
const dir = process.argv[2] || 'dist/apk/v1.1.1';
const PROD = 'https://fayz-market-api.ilyosbeksalayev240.workers.dev';
const results = []; const check = (ok, name, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };
const device = adb('shell', 'getprop ro.product.model') + ' / Android ' + adb('shell', 'getprop ro.build.version.release') + (adb('shell', 'getprop ro.kernel.qemu') === '1' ? ' (EMULATOR)' : ' (physical device)');
console.log('device:', device);
// After a reboot a PIN-protected device keeps app storage locked (Direct Boot) until the user unlocks it once.
if (/isKeyguardShowing=true/.test(sh('dumpsys window'))) { console.log('FAIL device is locked — unlock the screen (PIN) and run again'); process.exit(1); }
for (const [pkg, file, port, expect] of [
  ['uz.fayzmarket.customer', 'fayz-market-customer-debug.apk', 9451, /Katalog|Bosh sahifa|Mahsulot|Savat/],
  ['uz.fayzmarket.admin', 'fayz-market-admin-debug.apk', 9452, /Kirish|Boshqaruv paneli|Kunlik savdo/],
]) {
  const badging = execFileSync(ADB.replace('/platform-tools/adb', '/build-tools/35.0.0/aapt2'), ['dump', 'badging', `${dir}/${file}`], { encoding: 'utf8' });
  const metadata = badging.match(/package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'/);
  if (!metadata || metadata[1] !== pkg) throw new Error('Unexpected APK package metadata');
  const expected = { code: Number(metadata[2]), name: metadata[3] };
  const before = versionOf(pkg);
  const out = adb('install', '-r', `${dir}/${file}`);
  check(/Success/.test(out), `${pkg}: adb install -r`, `before ${before.name || 'not installed'} (${before.code})`);
  const after = versionOf(pkg);
  check(after.code === expected.code && after.name === expected.name && (!before.first || after.first === before.first), `${pkg}: now ${expected.name} (${expected.code}), first install time kept`, after.first);
  sh(`am force-stop ${pkg}`); launch(pkg); await pause(1500);
  const w = await webview(pkg, port);
  const loaded = await w.waitFor(re => new RegExp(re).test(document.body.innerText), 40000, expect.source);
  const origin = await w.evaluate(() => location.origin);
  check(loaded, `${pkg}: app opens and renders its UI`);
  check(origin === PROD, `${pkg}: UI served under the production API origin`, origin);
  const health = await w.evaluate(async u => (await (await fetch(u + '/health')).json()).ok, PROD);
  check(health === true, `${pkg}: Cloudflare production API reachable from the WebView (GET /health)`);
  w.close();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed — ${device}`);
process.exit(results.every(Boolean) ? 0 : 1);
