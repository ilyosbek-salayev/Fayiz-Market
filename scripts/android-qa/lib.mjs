// Helpers for driving the real APKs on an Android EMULATOR (not a physical phone): adb, UI Automator taps for
// system dialogs, and Chrome DevTools Protocol into the app's WebView (debug builds are inspectable).
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import WebSocket from 'ws';

// ~/.fayz-toolchain survives a reboot; /private/tmp (the old location) is wiped by macOS.
const SDK = process.env.ANDROID_HOME || [`${os.homedir()}/.fayz-toolchain/android-sdk`, '/private/tmp/fayz-toolchain/android-sdk'].find(d => existsSync(d)) || `${os.homedir()}/.fayz-toolchain/android-sdk`;
export const ADB = `${SDK}/platform-tools/adb`;
export const pause = ms => new Promise(r => setTimeout(r, ms));
export const adb = (...args) => execFileSync(ADB, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
export const sh = cmd => adb('shell', cmd);

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
  const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((ok, bad) => { ws.once('open', ok); ws.once('error', bad); });
  let seq = 0; const waiting = new Map();
  ws.on('message', raw => { const msg = JSON.parse(raw); if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); } });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; waiting.set(id, m => m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)); ws.send(JSON.stringify({ id, method, params })); });
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
