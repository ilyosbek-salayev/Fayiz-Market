// Isolated regression runner. Never points a mutating suite at production.
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// QA_EVIDENCE_DIR keeps a later run from overwriting earlier evidence logs.
const evidence = process.env.QA_EVIDENCE_DIR || 'docs/codex-audit/evidence';
await mkdir(evidence, { recursive: true });
const chrome = process.env.CHROME_PATH || `${process.env.HOME}/Desktop/Google Chrome.app/Contents/MacOS/Google Chrome`;
const run = async (cmd, args, name, env = {}) => {
  const log = await open(`${evidence}/${name}.log`, 'w');
  const child = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: ['ignore', log.fd, log.fd] });
  const code = await new Promise(r => child.once('exit', r)); await log.close();
  console.log(`${name}: exit ${code}`); return code;
};
async function suite(name, port, bootstrap, commands) {
  if (process.env.QA_SUITES && !process.env.QA_SUITES.split(',').includes(name)) return true;
  const socket = createServer();
  await new Promise(r => socket.listen(0, '127.0.0.1', r));
  port = socket.address().port;
  await new Promise(r => socket.close(r));
  const dir = await mkdtemp(join(tmpdir(), 'fayz-codex-'));
  const env = { QA_API: `http://127.0.0.1:${port}`, TEST_API_URL: `http://127.0.0.1:${port}`, QA_PORT: String(port), QA_BOOTSTRAP: bootstrap, TEST_BOOTSTRAP_SECRET: bootstrap, CHROME_PATH: chrome, WRANGLER_LOG_PATH: join(dir, 'wrangler.log') };
  const log = await open(join(dir, 'worker.log'), 'w');
  const worker = spawn('bash', ['scripts/deploy-qa/local-worker.sh', join(dir, 'db')], { env: { ...process.env, ...env }, stdio: ['ignore', log.fd, log.fd], detached: true });
  try {
    let ready = false;
    for (let i = 0; i < 90; i++) { try { if ((await fetch(env.QA_API + '/health', { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch {} await new Promise(r => setTimeout(r, 500)); }
    if (!ready) throw new Error(`Worker startup failed; ${dir}/worker.log`);
    for (const [file, label] of commands) if (await run('node', [file], label, env)) return false;
    return true;
  } finally { try { process.kill(-worker.pid, 'SIGTERM'); } catch {} await log.close(); }
}
const outcomes = [];
for (const job of [
  () => suite('api', 8796, 'qa-bootstrap', [['scripts/deploy-qa/expansion-verify.mjs', 'expansion-api']]),
  () => suite('integration', 8792, 'qa-bootstrap', [['scripts/integration.mjs', 'integration']]),
  () => suite('expansion', 8793, 'qa-bootstrap', [['scripts/ui-qa/expansion-ui.mjs', 'expansion-ui']]),
  () => suite('regression', 8794, 'qa-local-secret-only', [['scripts/ui-qa/seed.mjs', 'regression-seed'], ['scripts/ui-qa/regress.mjs', 'regression-ui']]),
  () => suite('security', 8795, 'qa-bootstrap', [['scripts/codex-audit/security-regression.mjs', 'security-regression']]),
]) { try { outcomes.push(await job()); } catch (error) { console.error(String(error)); outcomes.push(false); } }
process.exitCode = outcomes.every(Boolean) ? 0 : 1;
