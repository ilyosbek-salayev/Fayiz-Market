// UIAutomator QA on the EMULATOR: what Android itself sees of the two apps (the accessibility tree that TalkBack,
// Maestro and Samsung's own tools use), independent of the WebView DevTools route the other suites take.
// DEBUG apps against an ISOLATED local Worker (fresh D1, small seed); production is never contacted.
//   scripts/android-qa/qa.sh uiautomator      (or: node scripts/android-qa/uiautomator-qa.mjs)
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { adb, launch, pause, requireEmulator, screenshot, setApiUrl, sh } from './lib.mjs';
const T = requireEmulator('uiautomator-qa.mjs');

const ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const PORT = Number(process.env.QA_PORT || 8798), API = `http://127.0.0.1:${PORT}`;
const OUT = path.join(ROOT, process.env.SHOTS || 'docs/v1/screenshots/emulator-android16/uiautomator');
const RESULTS = path.join(ROOT, process.env.RESULTS || 'docs/v1/evidence/emulator-android16/uiautomator-qa.txt');
mkdirSync(OUT, { recursive: true });
const C = 'uz.fayzmarket.customer', A = 'uz.fayzmarket.admin';
const results = []; const check = (status, name, detail = '') => { results.push(`${status} ${name}${detail ? ' — ' + String(detail).replace(/\s+/g, ' ').slice(0, 300) : ''}`); console.log(results.at(-1)); };
const ok = (cond, name, detail = '') => check(cond ? 'PASS' : 'FAIL', name, cond ? '' : detail);
const shot = name => writeFileSync(path.join(OUT, `${name}.png`), screenshot());
const density = Number(sh('wm density').match(/(\d+)\s*$/)?.[1] || 160), dp = px => Math.round(px * 160 / density);
const [W, H] = (sh('wm size').match(/(\d+)x(\d+)/) || [0, 1080, 2340]).slice(1).map(Number);

// Maestro's on-device driver holds the single UiAutomation connection; release it so `uiautomator dump` can run.
for (const p of ['dev.mobile.maestro', 'dev.mobile.maestro.test']) sh(`am force-stop ${p} 2>/dev/null || true`);
function nodes() {
  let xml = '';
  for (let i = 0; i < 4 && !xml.includes('<node'); i++) { sh('uiautomator dump /sdcard/fayz-ui.xml >/dev/null 2>&1 || true'); xml = sh('cat /sdcard/fayz-ui.xml 2>/dev/null || true'); }
  return [...xml.matchAll(/<node [^>]*>/g)].map(m => {
    const n = m[0], a = k => n.match(new RegExp(` ${k}="([^"]*)"`))?.[1] ?? '';
    const b = n.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)?.slice(1).map(Number) || [0, 0, 0, 0];
    return { text: a('text'), desc: a('content-desc'), cls: a('class'), pkg: a('package'), clickable: a('clickable') === 'true', password: a('password') === 'true', focused: a('focused') === 'true', b, w: b[2] - b[0], h: b[3] - b[1] };
  });
}
const visible = n => n.w > 0 && n.h > 0 && n.b[1] >= 0 && n.b[3] <= H;
const label = n => n.text || n.desc;
const waitFor = async (fn, ms = 30000) => { const end = Date.now() + ms; let ns = []; while (Date.now() < end) { ns = nodes(); if (fn(ns)) return ns; await pause(800); } return ns; };
const tapNodeOf = async n => { sh(`input tap ${(n.b[0] + n.b[2]) >> 1} ${(n.b[1] + n.b[3]) >> 1}`); await pause(1000); };
const keyboardShown = () => /mInputShown=true/.test(sh('dumpsys input_method | grep mInputShown || true'));
const foreground = () => sh('dumpsys activity activities | grep -E "topResumedActivity" || true').split('\n')[0];
const crashDialog = ns => ns.find(n => /keeps stopping|isn.t responding|has stopped/i.test(label(n)));

// ---------- isolated Worker + seed ----------
const dir = mkdtempSync(path.join(tmpdir(), 'fayz-uia-'));
const worker = spawn('bash', [path.join(ROOT, 'scripts/deploy-qa/local-worker.sh'), path.join(dir, 'db')], { env: { ...process.env, QA_PORT: String(PORT) }, stdio: 'ignore', detached: true });
for (let i = 0; i < 240; i++) { try { if ((await fetch(API + '/health')).ok) break; } catch { /* starting */ } await pause(500); }
const call = async (p, body, auth) => (await fetch(API + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}), ...(p === '/admin/bootstrap' ? { 'X-Bootstrap-Secret': 'qa-bootstrap' } : {}) }, body: JSON.stringify(body) })).json();
const OWNER = { email: 'uia-owner@example.invalid', password: 'UiaOwner-2026-check' };
await call('/admin/bootstrap', OWNER); const auth = 'Bearer ' + (await call('/admin/login', OWNER)).token;
const cat = (await call('/admin/categories', { name: 'Soatlar', slug: 'soatlar' }, auth)).id;
await call('/admin/products', { name: 'Klassik soat', slug: 'klassik-soat', description: 'Charm tasma.', categoryId: cat, price: 245000, stock: 5, active: true, featured: true, images: [] }, auth);

const MIN = 48; // Android guideline: touch targets at least 48 × 48 dp
try {
  check('INFO', 'device', `${T.serial} EMULATOR ${T.avd} · Android ${T.android} · ${W}x${H} @ ${density} dpi`);
  adb('reverse', `tcp:${PORT}`, `tcp:${PORT}`);
  // ================= Customer
  setApiUrl(C, API); launch(C);
  let ns = await waitFor(x => x.some(n => n.pkg === C && n.text === 'Mahsulot qidirish'));
  ok(foreground().includes(C) && !crashDialog(ns), 'customer: in the foreground, no crash / ANR dialog', foreground());
  const web = ns.find(n => n.pkg === C && n.cls === 'android.webkit.WebView');
  ok(!!web && web.w === W && web.h >= H * 0.85, 'customer: the WebView fills the screen width and ≥85 % of its height', JSON.stringify(web?.b));
  shot('c-home');
  const tabs = ['Bosh sahifa', 'Katalog', 'Savat', 'Buyurtmalar', 'Profil'].map(t => ns.filter(n => n.pkg === C && (n.text === t || n.text.startsWith(t + ',')) && n.clickable && visible(n)).sort((a, b) => b.b[1] - a.b[1])[0]);
  const bar = ns.filter(n => n.pkg === C && visible(n) && n.b[1] > H * 0.85).map(n => `${n.cls.split('.').pop()}«${label(n)}»${n.clickable ? '*' : ''}`).join(' ');
  ok(tabs.every(Boolean) && tabs.every(n => /Button/.test(n.cls)), 'customer: the 5 tabs are exposed to Android as labelled buttons', JSON.stringify(tabs.map(n => n && `${n.text}:${n.cls.split('.').pop()}`)) + ' · bar: ' + bar);
  ok(tabs.every(n => n && dp(n.w) >= MIN && dp(n.h) >= MIN), `customer: every tab is at least ${MIN} × ${MIN} dp`, JSON.stringify(tabs.map(n => n && `${n.text} ${dp(n.w)}×${dp(n.h)}dp`)));
  const clickables = ns.filter(n => n.pkg === C && n.clickable && visible(n) && n.cls !== 'android.webkit.WebView');
  const unlabelled = clickables.filter(n => !label(n));
  ok(unlabelled.length === 0, 'customer home: every visible control has a name for TalkBack', JSON.stringify(unlabelled.map(n => `${n.cls.split('.').pop()} ${n.b}`)));
  const small = clickables.filter(n => dp(n.h) < MIN || dp(n.w) < MIN);
  check(small.length ? 'WARN' : 'PASS', `customer home: touch targets ≥ ${MIN} dp`, small.map(n => `«${label(n) || '?'}» ${dp(n.w)}×${dp(n.h)}dp`).join(', '));
  // Search field: a real EditText that opens the keyboard; Back hides it and the app stays.
  const search = ns.find(n => n.pkg === C && n.text === 'Mahsulot qidirish');
  await tapNodeOf(search);
  ns = await waitFor(x => x.some(n => n.pkg === C && n.cls === 'android.widget.EditText'), 10000);
  const field = ns.find(n => n.pkg === C && n.cls === 'android.widget.EditText');
  ok(!!field && keyboardShown(), 'customer: search opens an EditText with the soft keyboard', JSON.stringify(field && { text: field.text, focused: field.focused }));
  shot('c-search-keyboard');
  sh('input text soat'); await pause(1500);
  ns = nodes();
  ok(ns.some(n => n.pkg === C && /Klassik soat/.test(label(n))), 'customer: text typed through Android input reaches the app (result «Klassik soat» in the tree)');
  sh('input keyevent KEYCODE_BACK'); await pause(1200);
  ok(!keyboardShown() && foreground().includes(C), 'customer: Back hides the keyboard, the app stays open');
  sh(`am force-stop ${C}`);
  // ================= Admin
  setApiUrl(A, API); launch(A);
  ns = await waitFor(x => x.some(n => n.pkg === A && n.text === 'Kirish'));
  ok(foreground().includes(A) && !crashDialog(ns), 'admin: in the foreground, no crash / ANR dialog', foreground());
  const edits = ns.filter(n => n.pkg === A && n.cls === 'android.widget.EditText' && visible(n));
  const pass = edits.find(n => n.password), email = edits.find(n => !n.password);
  ok(edits.length === 2 && !!pass && !!email, 'admin login: email and password are real EditTexts; the password field is flagged password=true for Android', JSON.stringify(edits.map(n => ({ text: n.text, password: n.password }))));
  const enter = ns.find(n => n.pkg === A && n.text === 'Kirish' && n.clickable);
  ok(!!enter && dp(enter.h) >= MIN, `admin login: «Kirish» is a button at least ${MIN} dp tall`, enter && `${dp(enter.w)}×${dp(enter.h)}dp`);
  // The keyboard moves the form: every field is looked up again right before it is tapped.
  await tapNodeOf(email); sh('input text uia-owner@example.invalid'); await pause(600);
  await tapNodeOf(nodes().find(n => n.pkg === A && n.password && visible(n))); sh('input text UiaOwner-2026-check'); await pause(800);
  ns = nodes();
  const e2 = ns.find(n => n.pkg === A && n.cls === 'android.widget.EditText' && !n.password), p2 = ns.find(n => n.pkg === A && n.password);
  ok(e2?.text === 'uia-owner@example.invalid' && !!p2 && p2.text.length > 0, 'admin login: email and password typed through Android input land in the right fields', JSON.stringify({ email: e2?.text, passwordLength: p2?.text.length }));
  // Observed on Android 16: the WebView hands the password's characters to UiAutomation / accessibility services
  // whatever «Show passwords» / «speak passwords» say. Only privileged, user-enabled services see it (they can read
  // the screen anyway); the field itself is flagged password=true and drawn masked. Recorded, not app-fixable.
  check('INFO', 'admin login: password characters visible to accessibility services (Chromium WebView behaviour)', p2 && p2.text.includes('UiaOwner') ? 'yes' : 'no');
  shot('a-login-typed');
  if (keyboardShown()) { sh('input keyevent KEYCODE_BACK'); await pause(800); }
  ns = await waitFor(x => x.some(n => n.pkg === A && n.text === 'Kirish' && n.clickable && visible(n)), 8000);
  const enter2 = ns.find(n => n.pkg === A && n.text === 'Kirish' && n.clickable && visible(n));
  if (!enter2) throw new Error('«Kirish» not on screen after typing: ' + ns.filter(n => n.pkg === A && visible(n) && label(n)).map(label).join(' | ').slice(0, 300));
  await tapNodeOf(enter2);
  ns = await waitFor(x => x.some(n => n.pkg === A && /Kunlik savdo|Boshqaruv/.test(label(n)) && visible(n)), 20000);
  ok(ns.some(n => n.pkg === A && /Kunlik savdo|Boshqaruv/.test(label(n))) && !crashDialog(ns), 'admin: signed in by Android touches and typing only → dashboard');
  const menu = ns.find(n => n.pkg === A && (n.desc === 'Menyu' || n.text === 'Menyu'));
  // < 44 dp fails (Apple / WCAG floor); 44–47 dp is a warning against Android's 48 dp guideline.
  const menuSize = menu ? Math.min(dp(menu.w), dp(menu.h)) : 0;
  check(!menu || menuSize < 44 ? 'FAIL' : menuSize < MIN ? 'WARN' : 'PASS', `admin: the «Menyu» icon button has a name and a ≥ ${MIN} dp touch target`, menu ? `${dp(menu.w)}×${dp(menu.h)}dp` : 'not found');
  shot('a-dashboard');
  const aClick = ns.filter(n => n.pkg === A && n.clickable && visible(n) && n.cls !== 'android.webkit.WebView');
  const aUnlabelled = aClick.filter(n => !label(n));
  ok(aUnlabelled.length === 0, 'admin dashboard: every visible control has a name for TalkBack', JSON.stringify(aUnlabelled.map(n => `${n.cls.split('.').pop()} ${n.b}`)));
  sh(`am force-stop ${A}`);
} catch (error) {
  check('FAIL', 'uiautomator suite completed', String(error?.stack || error).split('\n').slice(0, 3).join(' '));
} finally {
  for (const p of [C, A]) { try { setApiUrl(p, null); } catch { /* gone */ } }
  try { adb('reverse', '--remove', `tcp:${PORT}`); } catch { /* none */ }
  try { process.kill(-worker.pid, 'SIGTERM'); } catch { /* gone */ }
  rmSync(dir, { recursive: true, force: true });
  const n = s => results.filter(r => r.startsWith(s)).length;
  writeFileSync(RESULTS, `EMULATOR (${T.avd}, Android ${T.android}) — NOT a physical phone. UIAutomator (Android accessibility tree), debug apps, isolated local Worker.\n${new Date().toISOString()}\n${results.join('\n')}\n\nPASS ${n('PASS')} · WARN ${n('WARN')} · FAIL ${n('FAIL')}\n`);
  console.log(`\nPASS ${n('PASS')} · WARN ${n('WARN')} · FAIL ${n('FAIL')}`);
  process.exitCode = n('FAIL') ? 1 : 0;
}
