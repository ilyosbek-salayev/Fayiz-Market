// EMULATOR in-place upgrade check: an older Fayz APK must already be installed and have been opened once.
// Writes a marker into the app's WebView storage, installs the new APK with `adb install -r` (no uninstall, no data
// wipe) and verifies package id, signer, versionCode, first-install time and the stored data all survive.
//   node scripts/android-qa/upgrade.mjs dist/apk/v1.1.1
import { adb, launch, pause, sh, versionOf, webview } from './lib.mjs';
const dir = process.argv[2] || 'dist/apk/v1.1.1';
const results = []; const check = (ok, name, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };
for (const [pkg, file, port] of [['uz.fayzmarket.customer', 'fayz-market-customer-debug.apk', 9401], ['uz.fayzmarket.admin', 'fayz-market-admin-debug.apk', 9402]]) {
  const before = versionOf(pkg);
  check(before.code > 0, `${pkg}: old version installed`, `${before.name} (${before.code})`);
  sh(`am force-stop ${pkg}`); launch(pkg); let w = await webview(pkg, port);
  await w.waitFor(() => document.readyState === 'complete' && document.body.innerText.length > 20, 30000);
  const marker = 'upgrade-' + Date.now();
  const origin = await w.evaluate(m => { localStorage.setItem('fayz_upgrade_probe', m); return location.origin; }, marker);
  const keysBefore = await w.evaluate(() => Object.keys(localStorage).sort());
  console.log(`  ${pkg} stored keys before update: ${keysBefore.join(',') || '(none)'}`);
  // Chromium flushes DOM storage to disk asynchronously; give it time as a real user session would.
  await pause(6000); w.close(); sh(`am force-stop ${pkg}`);
  const out = adb('install', '-r', `${dir}/${file}`);
  check(/Success/.test(out), `${pkg}: adb install -r (in place, no uninstall)`, out.split('\n').pop());
  const after = versionOf(pkg);
  check(after.code > before.code && after.first === before.first && after.last !== before.last, `${pkg}: versionCode ${before.code} → ${after.code}, firstInstallTime kept`, `${after.name}; first ${after.first}`);
  launch(pkg); await pause(1500); w = await webview(pkg, port);
  await w.waitFor(() => document.readyState === 'complete' && document.body.innerText.length > 20, 30000);
  const kept = await w.evaluate(() => ({ probe: localStorage.getItem('fayz_upgrade_probe'), origin: location.origin, keys: Object.keys(localStorage).sort() }));
  check(kept.probe === marker && kept.origin === origin, `${pkg}: WebView storage survived the update`, `${kept.origin}; keys ${kept.keys.join(',')}`);
  check(keysBefore.every(k => kept.keys.includes(k)), `${pkg}: every stored key still present`);
  const bridge = await w.evaluate(() => typeof FayzNative === 'object' ? ['biometricStatus', 'notify', 'keepScreenOn', 'openExternal'].filter(k => typeof FayzNative[k] === 'function').join(',') : '');
  check(bridge === 'biometricStatus,notify,keepScreenOn,openExternal', `${pkg}: new native bridge methods present`, bridge);
  await w.evaluate(() => localStorage.removeItem('fayz_upgrade_probe'));
  w.close();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
