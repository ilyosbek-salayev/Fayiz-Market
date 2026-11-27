// Helpers for driving the real APKs on an Android EMULATOR (not a physical phone): adb, UI Automator taps for
// system dialogs, and Chrome DevTools Protocol into the app's WebView (debug builds are inspectable).
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
// CDP socket: Node's built-in WHATWG WebSocket (Node >= 22), so the QA scripts need no extra npm package.

// ~/.fayz-toolchain survives a reboot; /private/tmp (the old location) is wiped by macOS.
const SDK = process.env.ANDROID_HOME || [`${os.homedir()}/.fayz-toolchain/android-sdk`, '/private/tmp/fayz-toolchain/android-sdk'].find(d => existsSync(d)) || `${os.homedir()}/.fayz-toolchain/android-sdk`;
export const ADB = `${SDK}/platform-tools/adb`;
export const pause = ms => new Promise(r => setTimeout(r, ms));
export const adb = (...args) => execFileSync(ADB, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
export const sh = cmd => adb('shell', cmd);

// ---------- Target device ----------
// Every run names its device before touching it. Scripts that change device state (PIN, permissions, API address,
// installs) run on an EMULATOR only; scripts meant for a phone need REAL_DEVICE_CONFIRM=<serial> of that phone, so
// nothing reaches the owner's Samsung by accident (e.g. when it is plugged in next to the emulator).
const die = message => { console.error(`\nTARGET REFUSED — ${message}\n`); process.exit(2); };
export function connectedDevices() {
  return execFileSync(ADB, ['devices', '-l'], { encoding: 'utf8' }).split('\n').slice(1).map(l => l.trim()).filter(Boolean)
    .map(l => ({ serial: l.split(/\s+/)[0], state: l.split(/\s+/)[1], model: l.match(/model:(\S+)/)?.[1] || '' }));
}
/** Resolves ANDROID_SERIAL (the one given, or the only connected device) and describes that device. */
export function target() {
  const ready = connectedDevices().filter(d => d.state === 'device');
  const list = ready.map(d => `${d.serial}${d.model ? ` (${d.model})` : ''}`).join(', ') || 'none';
  if (process.env.ANDROID_SERIAL) { if (!ready.some(d => d.serial === process.env.ANDROID_SERIAL)) die(`ANDROID_SERIAL=${process.env.ANDROID_SERIAL} is not connected (ready: ${list})`); }
  else if (ready.length === 1) process.env.ANDROID_SERIAL = ready[0].serial;
  else die(ready.length ? `several devices are connected (${list}) — choose one with ANDROID_SERIAL=<serial>` : 'no device is connected (start the emulator: scripts/android-qa/qa.sh emulator start)');
  const prop = k => sh(`getprop ${k}`);
  const emulator = prop('ro.kernel.qemu') === '1' || prop('ro.boot.qemu') === '1';
  return { serial: process.env.ANDROID_SERIAL, emulator, avd: emulator ? prop('ro.boot.qemu.avd_name') : '', model: prop('ro.product.model'), android: prop('ro.build.version.release'), api: prop('ro.build.version.sdk') };
}
const describe = t => `${t.serial} · ${t.emulator ? `EMULATOR ${t.avd || '?'}` : `PHYSICAL ${t.model}`} · Android ${t.android} (API ${t.api})`;
/** For scripts that change device state: an emulator only, never a physical phone. */
export function requireEmulator(script) {
  const t = target();
  if (!t.emulator) die(`${script} changes device state and runs on the QA emulator only; ${describe(t)} is a physical phone.`);
  const want = process.env.QA_AVD || 'qa-android16';
  if (t.avd !== want) console.warn(`note: AVD «${t.avd}», the default QA AVD is «${want}»`);
  console.log(`TARGET ${describe(t)}`);
  return t;
}
/** For scripts that may run on a phone: a physical device needs REAL_DEVICE_CONFIRM=<its serial>. */
export function requireDevice(script) {
  const t = target();
  if (!t.emulator && process.env.REAL_DEVICE_CONFIRM !== t.serial) die(`${script}: ${describe(t)} is a PHYSICAL phone. To run on it on purpose: REAL_DEVICE_CONFIRM=${t.serial} ANDROID_SERIAL=${t.serial} node ${script}`);
  console.log(`TARGET ${describe(t)}`);
  return t;
}

/** Bounds of the first node whose text or content-desc matches, from a UI Automator dump. */
export function findNode(pattern) {
  sh('uiautomator dump /sdcard/fayz-ui.xml >/dev/null 2>&1 || true');
  const xml = sh('cat /sdcard/fayz-ui.xml');
  for (const m of xml.matchAll(/<node [^>]*>/g)) {
    const node = m[0];
    const label = (node.match(/ text="([^"]*)"/)?.[1] || '') + '|' + (node.match(/ content-desc="([^"]*)"/)?.[1] || '') + '|' + (node.match(/ resource-id="([^"]*)"/)?.[1] || '');
    if (!pattern.test(label)) continue;
    const b = node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if (b) return { x: (Number(b[1]) + Number(b[3])) >> 1, y: (Number(b[2]) + Number(b[4])) >> 1, label };
  }
  return null;
}
export async function tapNode(pattern, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const n = findNode(pattern); if (n) { sh(`input tap ${n.x} ${n.y}`); return n; } await pause(700); }
  return null;
}
export const screenshot = file => execFileSync(ADB, ['exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 });

/** CDP session to the WebView page of `pkg`. */
export async function webview(pkg, port) {
  let pid = '';
  for (let i = 0; i < 40 && !pid; i++) { try { pid = sh(`pidof ${pkg}`); } catch { /* not started */ } if (!pid) await pause(500); }
  if (!pid) throw new Error(`${pkg} is not running`);
  try { adb('forward', '--remove', `tcp:${port}`); } catch { /* none */ }
  let page;
  for (let i = 0; i < 60 && !page; i++) {
    try { adb('forward', `tcp:${port}`, `localabstract:webview_devtools_remote_${pid}`); const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); page = list.find(t => t.type === 'page'); } catch { /* socket not yet open */ }
    if (!page) await pause(500);
  }
  if (!page) throw new Error(`no WebView page for ${pkg}`);
  const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((ok, bad) => { ws.addEventListener('open', ok, { once: true }); ws.addEventListener('error', bad, { once: true }); });
  let seq = 0; const waiting = new Map();
  ws.addEventListener('message', event => { const msg = JSON.parse(event.data); if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); } });
  const send = (method, params = {}, timeoutMs = 30000) => new Promise((resolve, reject) => { const id = ++seq; const timer = setTimeout(() => { waiting.delete(id); reject(new Error(`${method}: no answer in ${timeoutMs} ms (WebView paused or app in background)`)); }, timeoutMs); waiting.set(id, m => { clearTimeout(timer); m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result); }); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async (fn, ...args) => {
    const r = await send('Runtime.evaluate', { expression: `(${fn})(...${JSON.stringify(args)})`, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const text = () => evaluate(() => document.body.innerText);
  const waitFor = async (fn, timeout = 20000, ...args) => { const end = Date.now() + timeout; while (Date.now() < end) { try { if (await evaluate(fn, ...args)) return true; } catch { /* page navigating */ } await pause(400); } return false; };
  const click = (label, scope = 'button') => evaluate((l, s) => { const el = [...document.querySelectorAll(s)].find(b => (b.innerText || b.textContent || '').trim().includes(l)); if (!el) throw new Error('no button ' + l); el.click(); return true; }, label, scope);
  const setValue = (sel, v) => evaluate((s, val) => { const el = document.querySelector(s); if (!el) throw new Error('no ' + s); const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, val); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); return true; }, sel, v);
  return { send, evaluate, text, waitFor, click, setValue, close: () => ws.close() };
}

export function versionOf(pkg) {
  const out = sh(`dumpsys package ${pkg}`);
  return { code: Number(out.match(/versionCode=(\d+)/)?.[1] || 0), name: out.match(/versionName=(\S+)/)?.[1] || '', first: out.match(/firstInstallTime=(.+)/)?.[1]?.trim(), last: out.match(/lastUpdateTime=(.+)/)?.[1]?.trim() };
}
/** Points the debug shell at another API origin by editing its own preferences (run-as works on debug builds). */
export function setApiUrl(pkg, url) {
  sh(`am force-stop ${pkg}`);
  const xml = url ? `<?xml version='1.0' encoding='utf-8' standalone='yes' ?><map><string name="api_url">${url}</string></map>` : `<?xml version='1.0' encoding='utf-8' standalone='yes' ?><map></map>`;
  // Activity.getPreferences() uses the activity's class name relative to the package: the shared shell lives in
  // uz.fayzmarket.app, so the file is shared_prefs/uz.fayzmarket.app.MainActivity.xml.
  execFileSync(ADB, ['shell', `run-as ${pkg} sh -c 'mkdir -p shared_prefs && rm -f shared_prefs/MainActivity.xml && cat > shared_prefs/uz.fayzmarket.app.MainActivity.xml'`], { input: xml });
}
export const launch = pkg => { sh('cmd statusbar collapse'); return sh(`am start -W -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -n ${pkg}/uz.fayzmarket.app.MainActivity`); };
