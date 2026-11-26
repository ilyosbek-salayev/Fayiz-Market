// RELEASE APKs (what the shop installs) on an Android EMULATOR — not a physical phone.
// Simulates the owner's phone: the installed DEBUG build was pointed at a test server; the release build is
// installed over it (adb install -r: no uninstall, no data wipe) and must (1) keep the app data, (2) use the
// production API regardless of that old setting, and (3) show no server / API control on the login screen or in
// the Android menu. Production is only read (the apps open; nobody signs in).
//   node scripts/android-qa/release-apk-check.mjs [dist/apk/v<version>]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { adb, findNode, launch, pause, screenshot, setApiUrl, sh, versionOf } from './lib.mjs';

const VERSION = JSON.parse(readFileSync('package.json', 'utf8')).version;
const CODE = Number(readFileSync('apps/android/customer/build.gradle', 'utf8').match(/versionCode\s+(\d+)/)[1]);
const dir = process.argv[2] || `dist/apk/v${VERSION}`;
const OUT = process.env.SHOTS || 'docs/v1/screenshots/emulator';
mkdirSync(OUT, { recursive: true });
const results = []; const check = (ok, name, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && detail ? ' — ' + detail : ''}`); console.log(results.at(-1)); };
const screenText = () => { sh('uiautomator dump /sdcard/fayz-ui.xml >/dev/null 2>&1 || true'); return [...sh('cat /sdcard/fayz-ui.xml').matchAll(/ (?:text|content-desc)="([^"]*)"/g)].map(m => m[1]).filter(Boolean).join(' | '); };
const waitText = async (re, ms = 30000) => { const end = Date.now() + ms; let t = ''; while (Date.now() < end) { t = screenText(); if (re.test(t)) return t; await pause(1000); } return t; };
const STALE = 'http://192.168.2.37:8791'; // the LAN test server an earlier phone test used

try {
  for (const [pkg, file] of [['uz.fayzmarket.customer', 'fayz-market-customer.apk'], ['uz.fayzmarket.admin', 'fayz-market-admin.apk']]) {
    const before = versionOf(pkg);
    const debuggable = /DEBUGGABLE/.test(sh(`dumpsys package ${pkg} | grep -m1 'flags=' || true`));
    if (debuggable) setApiUrl(pkg, STALE); // what a phone used for the LAN test still carries
    check(before.code > 0, `${pkg}: older build installed${debuggable ? ' (debug, pointed at a test server)' : ''}`, `${before.name} (${before.code})`);
    const out = adb('install', '-r', `${dir}/${file}`);
    const after = versionOf(pkg);
    check(/Success/.test(out) && after.code === CODE && after.first === before.first, `${pkg}: release ${after.name} installed over it in place (data kept)`, `${out.split('\n').pop()} · ${after.name} (${after.code}) first ${after.first}`);
    check(!/DEBUGGABLE/.test(sh(`dumpsys package ${pkg} | grep -m1 'flags=' || true`)), `${pkg}: release build is not debuggable`);
  }

  // Customer: production catalogue appears although the old build pointed at a dead test server.
  sh('am force-stop uz.fayzmarket.customer'); launch('uz.fayzmarket.customer');
  let t = await waitText(/Sevimli aksessuarlaringiz|Kategoriyalar|Barcha mahsulotlar/);
  check(/Sevimli aksessuarlaringiz|Kategoriyalar|Barcha mahsulotlar/.test(t) && !/Aloqa yoʻq|Webpage not available/i.test(t), 'customer release: opens the production store (stale test-server address ignored)', t.slice(0, 200));
  check(!/Texnik sozlamalar|Server \(API\)|Server manzili/.test(t), 'customer release: no developer/server controls');
  writeFileSync(path.join(OUT, 'release-customer-home.png'), screenshot());

  // Admin: login screen is only logo, email, password, Kirish — and the Android menu has no API item.
  sh('am force-stop uz.fayzmarket.admin'); launch('uz.fayzmarket.admin');
  t = await waitText(/Kirish/);
  check(/Email/.test(t) && /Parol/.test(t) && /Kirish/.test(t), 'admin release: login screen with email, password, Kirish', t.slice(0, 200));
  check(!/Server|API|sinov/i.test(t), 'admin release: no server / API / test control on the login screen', t);
  writeFileSync(path.join(OUT, 'release-admin-login.png'), screenshot());
  sh('input keyevent KEYCODE_MENU'); await pause(1200);
  const menu = screenText();
  check(!/API manzili/.test(menu), 'admin release: Android menu has no «API manzili»', menu.slice(0, 200));
  sh('input keyevent KEYCODE_BACK'); await pause(500);
} catch (error) {
  check(false, 'release check completed', String(error?.stack || error));
} finally {
  writeFileSync(path.join(OUT, 'release-apk-results.txt'), results.join('\n') + `\n\n${results.filter(r => r.startsWith('PASS')).length}/${results.length} passed (EMULATOR, not a physical phone)\n`);
  console.log(`\n${results.filter(r => r.startsWith('PASS')).length}/${results.length} passed (EMULATOR)`);
  process.exitCode = results.some(r => r.startsWith('FAIL')) ? 1 : 0;
}
