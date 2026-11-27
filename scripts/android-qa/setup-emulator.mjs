// Prepares a FRESH Android emulator for native-qa.mjs: device PIN 1111 and one enrolled virtual fingerprint (id 1).
// Run once after creating/booting the AVD (see docs/v1-expansion/PROGRESS.md). Safe to re-run: it skips what exists.
//   node scripts/android-qa/setup-emulator.mjs
import { adb, findNode, pause, sh, tapNode, requireEmulator } from './lib.mjs';
requireEmulator(import.meta.url.split('/').pop());
const touch = async id => { adb('emu', 'finger', 'touch', String(id)); await pause(800); try { adb('emu', 'finger', 'remove', String(id)); } catch { /* older emulator */ } await pause(500); };

for (let i = 0; i < 120 && sh('getprop sys.boot_completed') !== '1'; i++) await pause(1000);
sh('input keyevent KEYCODE_WAKEUP'); sh('wm dismiss-keyguard');
// Animations off: UI Automator taps and WebView timing stay deterministic.
for (const k of ['window_animation_scale', 'transition_animation_scale', 'animator_duration_scale']) sh(`settings put global ${k} 0`);

// Fresh device: set-pin works directly. Already protected: it needs the old PIN, which is 1111 on a QA AVD.
let pin = sh('locksettings set-pin 1111 2>&1 || true');
if (!/set to/i.test(pin)) pin = sh('locksettings set-pin --old 1111 1111 2>&1 || true');
console.log('PIN:', pin.split('\n').pop());

if (/has enrolled|enrolled: true|Enrollments: 1|"count":1/i.test(sh('dumpsys fingerprint 2>/dev/null || true'))) { console.log('fingerprint already enrolled'); process.exit(0); }
sh('am force-stop com.android.settings'); /* else a stale Settings task is brought to front */ sh('am start -a android.settings.FINGERPRINT_ENROLL'); await pause(2500);
if (findNode(/PIN/i)) { sh('input text 1111'); sh('input keyevent KEYCODE_ENTER'); await pause(2500); }
for (let i = 0; i < 4; i++) { const n = await tapNode(/^(MORE|More|I AGREE|I agree|AGREE|Agree)\|/, 3000); if (!n) break; await pause(1000); }
let added = false; for (let i = 0; i < 25 && !added; i++) { await touch(1); added = !!findNode(/Fingerprint added/i); }
await tapNode(/^DONE\|/, 4000); sh('input keyevent KEYCODE_HOME');
console.log(added ? 'virtual fingerprint 1 enrolled' : 'FAILED to enrol fingerprint 1');
process.exit(added ? 0 : 1);
