// EMULATOR check: enrolling a NEW fingerprint must permanently invalidate the Keystore key that protects the
// stored session. The app must then switch the fingerprint lock off and send the user to the password login —
// not loop on a lock screen that can never open. Run after native-qa.mjs (which leaves fingerprint login on).
// Enrols virtual finger 2 through Settings (device PIN 1111).
//   node scripts/android-qa/biometric-invalidation.mjs
import { adb, findNode, launch, pause, setApiUrl, sh, tapNode, webview, requireEmulator } from './lib.mjs';
requireEmulator(import.meta.url.split('/').pop());
const results = []; const check = (ok, name, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };
const C = 'uz.fayzmarket.customer';
const touch = async id => { adb('emu', 'finger', 'touch', String(id)); await pause(800); try { adb('emu', 'finger', 'remove', String(id)); } catch { /* older emulator */ } await pause(500); };
// Same origin native-qa used, so the stored flag is visible (WebView storage is per origin). No server is needed:
// the shell serves the bundled UI itself.
setApiUrl(C, 'http://127.0.0.1:8791');
try {
  launch(C); let c = await webview(C, 9431);
  await c.waitFor(() => document.readyState === 'complete', 20000);
  const before = await c.evaluate(() => ({ stored: FayzNative.biometricStored(), flag: localStorage.getItem('fayz_bio_login') }));
  check(before.stored && before.flag === '1', 'precondition: fingerprint login is on (from native-qa.mjs)', JSON.stringify(before));
  c.close(); sh(`am force-stop ${C}`);

  // Enrol a second fingerprint (Settings → PIN → intro → touches).
  sh('input keyevent KEYCODE_WAKEUP'); sh('am force-stop com.android.settings'); /* else a stale Settings task is brought to front */ sh('am start -a android.settings.FINGERPRINT_ENROLL'); await pause(2500);
  if (findNode(/PIN/i)) { sh('input text 1111'); sh('input keyevent KEYCODE_ENTER'); await pause(2500); }
  for (let i = 0; i < 4; i++) { const n = await tapNode(/^(MORE|More|I AGREE|I agree|AGREE|Agree)\|/, 3000); if (!n) break; await pause(1000); }
  let added = false; for (let i = 0; i < 25 && !added; i++) { await touch(2); added = !!findNode(/Fingerprint added/i); }
  check(added, 'a new fingerprint was enrolled on the device');
  await tapNode(/^DONE\|/, 4000); sh('input keyevent KEYCODE_HOME');

  launch(C); c = await webview(C, 9431);
  check(await c.waitFor(() => document.body.innerText.includes('Barmoq izi bilan ochish'), 20000), 'app still starts on the lock screen');
  await c.click('Barmoq izi bilan ochish'); await pause(2500);
  const prompt = findNode(/com\.android\.systemui:id\/(title|biometric)/);
  check(!prompt, 'no biometric prompt: the invalidated key cannot be used');
  const after = await c.evaluate(() => ({ text: document.body.innerText, stored: FayzNative.biometricStored(), flag: localStorage.getItem('fayz_bio_login') }));
  check(after.text.includes('barmoq izlari oʻzgargani') && !after.stored && after.flag === null, 'app explains it, removes the encrypted session and turns the lock off', JSON.stringify({ stored: after.stored, flag: after.flag }));
  check(after.text.includes('Parol bilan kirish') && !after.text.includes('Barmoq izi bilan ochish'), 'password sign-in offered as the only way back (dead fingerprint button hidden)');
  sh(`am force-stop ${C}`); launch(C); c.close(); c = await webview(C, 9431); await pause(2500);
  check(!(await c.evaluate(() => document.body.innerText.includes('Barmoq izi bilan ochish'))), 'next launch does not show the dead lock screen again');
  c.close();
} catch (error) { check(false, 'script completed', String(error?.stack || error)); }
finally { try { setApiUrl(C, ''); } catch { /* emulator gone */ } }
console.log(`\n${results.filter(Boolean).length}/${results.length} passed (Android 14 emulator — not a physical device)`);
process.exit(results.every(Boolean) ? 0 : 1);
