// Runs the Maestro flows in scripts/android-qa/maestro/ on the DEBUG apps against an ISOLATED local Worker (fresh D1,
// a small seed). Production is never contacted. Both apps are pointed back to their default API at the end.
//   source ~/.fayz-toolchain/env.sh && ANDROID_SERIAL=emulator-5554 node scripts/android-qa/maestro-local.mjs [flow.yaml ...]
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { adb, pause, setApiUrl, sh } from './lib.mjs';

const ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const PORT = Number(process.env.QA_PORT || 8795), API = `http://127.0.0.1:${PORT}`;
const SERIAL = process.env.ANDROID_SERIAL || 'emulator-5554';
const OUT = path.join(ROOT, process.env.MAESTRO_OUT || 'docs/v1/evidence/emulator-android16/maestro');
const flows = process.argv.slice(2).length ? process.argv.slice(2) : ['customer-smoke.yaml', 'back-navigation.yaml', 'admin-login-screen.yaml'].map(f => path.join(ROOT, 'scripts/android-qa/maestro', f));
const C = 'uz.fayzmarket.customer', A = 'uz.fayzmarket.admin';
for (const p of [C, A]) if (!/DEBUGGABLE/.test(sh(`dumpsys package ${p} | grep -m1 'flags=' || true`))) { console.error('install the DEBUG builds first'); process.exit(2); }

const dir = mkdtempSync(path.join(tmpdir(), 'fayz-maestro-'));
const worker = spawn('bash', [path.join(ROOT, 'scripts/deploy-qa/local-worker.sh'), path.join(dir, 'db')], { env: { ...process.env, QA_PORT: String(PORT) }, stdio: 'ignore', detached: true });
for (let i = 0; i < 240; i++) { try { if ((await fetch(API + '/health')).ok) break; } catch { /* starting */ } await pause(500); }
const call = async (p, method, body, auth) => (await fetch(API + p, { method, headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}), ...(p === '/admin/bootstrap' ? { 'X-Bootstrap-Secret': 'qa-bootstrap' } : {}) }, body: JSON.stringify(body) })).json();
const OWNER = { email: 'maestro-owner@example.invalid', password: 'MaestroOwner-2026' };
await call('/admin/bootstrap', 'POST', OWNER);
const auth = 'Bearer ' + (await call('/admin/login', 'POST', OWNER)).token;
const cat = (await call('/admin/categories', 'POST', { name: 'Soatlar', slug: 'soatlar' }, auth)).id;
await call('/admin/products', 'POST', { name: 'Klassik soat', slug: 'klassik-soat', description: 'Charm tasma.', categoryId: cat, price: 245000, stock: 5, active: true, featured: true, images: [] }, auth);

let code = 1;
try {
  adb('reverse', `tcp:${PORT}`, `tcp:${PORT}`);
  setApiUrl(C, API); setApiUrl(A, API);
  mkdirSync(OUT, { recursive: true });
  // Screenshots from takeScreenshot land in the working directory → run inside OUT.
  execFileSync('maestro', ['--device', SERIAL, 'test', '--format', 'junit', '--output', path.join(OUT, 'report.xml'), '--test-output-dir', path.join(OUT, 'artifacts'), ...flows], { cwd: OUT, stdio: 'inherit', env: { ...process.env, MAESTRO_CLI_NO_ANALYTICS: '1' } });
  code = 0;
} catch (e) { code = e.status || 1; }
finally {
  for (const p of [C, A]) { try { setApiUrl(p, null); } catch { /* device gone */ } }
  try { adb('reverse', '--remove', `tcp:${PORT}`); } catch { /* none */ }
  try { process.kill(-worker.pid, 'SIGTERM'); } catch { /* gone */ }
  rmSync(dir, { recursive: true, force: true });
}
process.exit(code);
