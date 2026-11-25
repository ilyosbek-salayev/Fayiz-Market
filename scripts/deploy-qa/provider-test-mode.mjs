// LOCAL TEST MODE for external integrations — separate from the real integrations.
//
// Starts (1) a mock that imitates Eskiz SMS, Resend email, Google OAuth + FCM HTTP v1, Telegram Bot API and Google
// Routes on 127.0.0.1:8790 and (2) an isolated local Worker on 127.0.0.1:8789 whose providers point at that mock
// (DEV_MOCK_PROVIDERS) with OTP echo OFF. Codes are therefore read from the SMS/email the mock "delivered", the FCM
// JWT is verified with the generated service-account public key, and dead push tokens must be pruned — the
// Worker runs its real provider code paths. The Worker honours DEV_MOCK_PROVIDERS only with ENVIRONMENT=development
// on a plain-http URL (unit-tested), so none of this can reach production.
//
//   node scripts/deploy-qa/provider-test-mode.mjs
import { createServer } from 'node:http';
import { generateKeyPairSync, createVerify, createHash, createHmac } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const MOCK_PORT = 8790, WORKER_PORT = 8789;
const API = `http://127.0.0.1:${WORKER_PORT}`, MOCK = `http://127.0.0.1:${MOCK_PORT}`;
const here = dirname(fileURLToPath(import.meta.url));
const results = []; const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };

// ---------- Fake credentials (never real; generated per run) ----------
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const account = { type: 'service_account', project_id: 'fayz-qa-mock', client_email: 'fcm@fayz-qa-mock.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
const ESKIZ = { email: 'qa@eskiz.mock', password: 'mock-password' }, RESEND_KEY = 're_mock_key_for_local_tests', ROUTES_KEY = 'mock-routes-key';
const BOT = '123456789:AAH-local-qa-token';

// ---------- Mock providers ----------
const log = { sms: [], email: [], oauth: [], fcm: [], telegram: [], routes: [] };
const b64urlDecode = s => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const mock = createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c); const raw = Buffer.concat(chunks);
  const url = new URL(req.url, MOCK); const auth = req.headers.authorization || '';
  const json = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  const form = async () => Object.fromEntries(await new Response(raw, { headers: { 'content-type': req.headers['content-type'] || '' } }).formData());
  try {
    if (url.pathname === '/eskiz/api/auth/login') { const f = await form(); return f.email === ESKIZ.email && f.password === ESKIZ.password ? json(200, { data: { token: 'mock-eskiz-token' } }) : json(401, { message: 'bad credentials' }); }
    if (url.pathname === '/eskiz/api/message/sms/send') { if (auth !== 'Bearer mock-eskiz-token') return json(401, {}); const f = await form(); log.sms.push(f); return json(200, { id: 'sms-' + log.sms.length, status: 'waiting' }); }
    if (url.pathname === '/resend/emails') { if (auth !== `Bearer ${RESEND_KEY}`) return json(401, {}); const m = JSON.parse(raw); log.email.push(m); return json(200, { id: 'email-' + log.email.length }); }
    if (url.pathname === '/resend/domains') return auth === `Bearer ${RESEND_KEY}` ? json(200, { data: [{ name: 'fayz.test', status: 'verified' }] }) : json(401, {});
    if (url.pathname === '/google-oauth/token') {
      const assertion = new URLSearchParams(raw.toString()).get('assertion') || '';
      const [h, c, sig] = assertion.split('.');
      const valid = !!sig && createVerify('RSA-SHA256').update(`${h}.${c}`).verify(publicKey, b64urlDecode(sig));
      const claims = valid ? JSON.parse(b64urlDecode(c)) : {};
      log.oauth.push({ valid, claims });
      return valid && claims.iss === account.client_email && claims.scope === 'https://www.googleapis.com/auth/firebase.messaging' ? json(200, { access_token: 'mock-google-access', expires_in: 3600 }) : json(400, { error: 'invalid_grant' });
    }
    const fcm = url.pathname.match(/^\/fcm\/v1\/projects\/([^/]+)\/messages:send$/);
    if (fcm) {
      if (auth !== 'Bearer mock-google-access') return json(401, {});
      const body = JSON.parse(raw); log.fcm.push({ project: fcm[1], ...body.message });
      return body.message.token.startsWith('dead-') ? json(404, { error: { status: 'NOT_FOUND', message: 'Requested entity was not found.' } }) : json(200, { name: `projects/${fcm[1]}/messages/${log.fcm.length}` });
    }
    const tg = url.pathname.match(/^\/telegram\/bot(.+)\/getMe$/);
    if (tg) { log.telegram.push(tg[1]); return tg[1] === BOT ? json(200, { ok: true, result: { id: 123456789, is_bot: true, username: 'FayzQaBot' } }) : json(401, { ok: false }); }
    if (url.pathname === '/routes/directions/v2:computeRoutes') { if (req.headers['x-goog-api-key'] !== ROUTES_KEY) return json(403, {}); log.routes.push(JSON.parse(raw)); return json(200, { routes: [{ distanceMeters: 2400, duration: '540s', polyline: { encodedPolyline: 'mock' } }] }); }
    json(404, { error: 'unknown mock route ' + url.pathname });
  } catch (e) { json(500, { error: String(e) }); }
});
await new Promise(r => mock.listen(MOCK_PORT, '127.0.0.1', r));

// ---------- Isolated Worker pointed at the mock ----------
const dir = mkdtempSync(join(tmpdir(), 'fayz-provider-qa-'));
const envFile = join(dir, 'providers.env');
const q = v => `'${v}'`; // dotenv single quotes are literal: the JSON keeps its own \n escapes for the PEM key
writeFileSync(envFile, [
  `DEV_MOCK_PROVIDERS=${MOCK}`,
  `SMS_PROVIDER=eskiz`, `ESKIZ_EMAIL=${ESKIZ.email}`, `ESKIZ_PASSWORD=${ESKIZ.password}`, `ESKIZ_FROM=4546`,
  `EMAIL_PROVIDER=resend`, `RESEND_API_KEY=${RESEND_KEY}`, `EMAIL_FROM=${q('Fayz Market <kod@fayz.test>')}`,
  `GOOGLE_ROUTES_KEY=${ROUTES_KEY}`, `FCM_SERVICE_ACCOUNT=${q(JSON.stringify(account))}`,
].join('\n') + '\n', { mode: 0o600 });
const worker = spawn('bash', [join(here, 'local-worker.sh'), join(dir, 'db')], { env: { ...process.env, QA_PORT: String(WORKER_PORT), QA_ENV_FILE: envFile, QA_OTP_ECHO: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
let workerLog = ''; worker.stdout.on('data', d => { workerLog += d; }); worker.stderr.on('data', d => { workerLog += d; });
const shutdown = () => { try { worker.kill('SIGTERM'); } catch { /* gone */ } mock.close(); rmSync(dir, { recursive: true, force: true }); };

async function call(path, { method = 'GET', auth, body, headers = {} } = {}) {
  const res = await fetch(API + path, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(auth ? { Authorization: auth } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}
const codeFrom = s => String(s).match(/\b(\d{6})\b/)?.[1];
const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 8000) { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await wait(150); } return false; }

try {
  const up = await until(async () => { try { return (await fetch(API + '/health')).ok; } catch { return false; } }, 90000);
  if (!up) throw new Error('Worker did not start:\n' + workerLog.slice(-2000));
  const stamp = Date.now().toString(36);

  // ---------- Configuration report ----------
  let r = await call('/auth/config');
  check('test mode: SMS and email enabled through providers, OTP echo off', r.data.phone?.enabled && r.data.phone?.devEcho === false && r.data.email?.enabled && r.data.email?.devEcho === false, JSON.stringify(r.data));

  // ---------- SMS (Eskiz path) ----------
  const phone = '+99891' + String(Date.now()).slice(-7);
  r = await call('/auth/otp', { method: 'POST', body: { phone, purpose: 'register' } });
  check('SMS OTP: API returns no code when a provider sends it', r.status === 200 && r.data.devCode === undefined, JSON.stringify(r.data));
  const sms = log.sms.at(-1);
  check('SMS OTP: Eskiz login + send with the number and code', sms?.mobile_phone === phone.slice(1) && !!codeFrom(sms?.message) && sms?.from === '4546');
  r = await call('/auth/register', { method: 'POST', body: { phone, code: codeFrom(sms?.message), password: 'CustomerPass-123', name: 'SMS Mijoz' } });
  const phoneCustomer = 'Customer ' + r.data.token;
  check('SMS OTP: code delivered by SMS registers the account', r.status === 201 && r.data.customer?.phoneVerified === true);

  // ---------- Email (Resend path) ----------
  const email = `mijoz-${stamp}@example.com`;
  r = await call('/auth/email/otp', { method: 'POST', body: { email: 'not-an-email', purpose: 'register' } }); check('email OTP: invalid address → 400', r.status === 400);
  r = await call('/auth/email/otp', { method: 'POST', body: { email: email.toUpperCase(), purpose: 'register' } });
  let mail = log.email.at(-1);
  check('email OTP: Resend receives from/to/subject with the code, API returns no code', r.status === 200 && r.data.devCode === undefined && mail?.to?.[0] === email && mail?.from === 'Fayz Market <kod@fayz.test>' && !!codeFrom(mail?.subject) && codeFrom(mail?.subject) === codeFrom(mail?.text));
  r = await call('/auth/email/otp', { method: 'POST', body: { email, purpose: 'register' } }); check('email OTP: resend within 60 s → 429', r.status === 429 && r.data.error?.code === 'RESEND_TOO_SOON');
  r = await call('/auth/email/register', { method: 'POST', body: { email, code: '000000' === codeFrom(mail.text) ? '111111' : '000000', name: 'Email Mijoz' } }); check('email OTP: wrong code rejected', r.status === 400 && r.data.error?.code === 'INVALID_CODE');
  r = await call('/auth/email/register', { method: 'POST', body: { email, code: codeFrom(mail.text), name: 'Email Mijoz' } });
  let emailCustomer = 'Customer ' + r.data.token;
  check('email OTP: register without password (passwordless account)', r.status === 201 && r.data.customer?.email === email && r.data.customer?.emailVerified === true && r.data.customer?.hasPassword === false);
  r = await call('/auth/email/register', { method: 'POST', body: { email, code: codeFrom(mail.text), name: 'Email Mijoz' } }); check('email OTP: code cannot be reused', r.status === 400);
  r = await call('/auth/email/otp', { method: 'POST', body: { email, purpose: 'register' } }); check('email OTP: registered email cannot register again', r.status === 409 && r.data.error?.code === 'EMAIL_TAKEN');
  // Passwordless sign-in. The 60 s resend guard applies per address, so the code request waits it out.
  await wait(61000);
  const before = log.email.length;
  r = await call('/auth/email/otp', { method: 'POST', body: { email, purpose: 'login' } }); mail = log.email.at(-1);
  check('email login: code sent to the verified address', r.status === 200 && log.email.length === before + 1 && /kirish/.test(mail.subject));
  r = await call('/auth/email/login', { method: 'POST', body: { email, code: codeFrom(mail.text) } });
  check('email login: code signs in to the same account', r.status === 200 && r.data.customer?.email === email);
  const unknownBefore = log.email.length;
  r = await call('/auth/email/otp', { method: 'POST', body: { email: `yoq-${stamp}@example.com`, purpose: 'login' } });
  check('email login: unknown address answers like success but sends nothing', r.status === 200 && log.email.length === unknownBefore);
  r = await call('/auth/email/login', { method: 'POST', body: { email: `yoq-${stamp}@example.com`, code: '123456' } }); check('email login: unknown address cannot sign in', r.status === 400);
  // Password set via reset, then password login by email.
  await wait(61000);
  r = await call('/auth/email/otp', { method: 'POST', body: { email, purpose: 'reset' } }); mail = log.email.at(-1);
  r = await call('/auth/email/reset', { method: 'POST', body: { email, code: codeFrom(mail.text), password: 'EmailPassword-123' } });
  check('email reset: sets a password and logs out other devices', r.status === 200);
  r = await call('/auth/me', { auth: emailCustomer }); check('email reset: old session revoked', r.status === 401);
  r = await call('/auth/login', { method: 'POST', body: { email, password: 'EmailPassword-123' } }); emailCustomer = 'Customer ' + r.data.token;
  check('password login by email works', r.status === 200 && r.data.customer?.hasPassword === true);
  r = await call('/auth/login', { method: 'POST', body: { email, password: 'WrongPassword-123' } }); check('password login by email: wrong password → 401', r.status === 401);
  // Link an email to the SMS account; the taken address is refused.
  r = await call('/auth/email/otp', { method: 'POST', body: { email, purpose: 'link' }, auth: phoneCustomer }); check('email link: address used by another account → 409', r.status === 409);
  const email2 = `sms-${stamp}@example.com`;
  r = await call('/auth/email/otp', { method: 'POST', body: { email: email2, purpose: 'link' } }); check('email link: needs a session', r.status === 401);
  r = await call('/auth/email/otp', { method: 'POST', body: { email: email2, purpose: 'link' }, auth: phoneCustomer }); mail = log.email.at(-1);
  r = await call('/auth/email/link', { method: 'POST', body: { email: email2, code: codeFrom(mail.text) }, auth: phoneCustomer });
  check('email link: SMS account gains a verified email', r.status === 200 && r.data.customer?.email === email2 && r.data.customer?.phoneVerified === true);

  // ---------- Staff, integrations tests through the mock ----------
  r = await call('/admin/bootstrap', { method: 'POST', headers: { 'X-Bootstrap-Secret': 'qa-bootstrap' }, body: { email: `owner-${stamp}@example.com`, password: 'OwnerPassword-123' } });
  r = await call('/admin/login', { method: 'POST', body: { email: `owner-${stamp}@example.com`, password: 'OwnerPassword-123' } }); const owner = 'Bearer ' + r.data.token;
  await call('/admin/integrations/telegram', { method: 'PUT', auth: owner, body: { telegram_bot_username: 'FayzQaBot' } });
  r = await call('/admin/integrations', { auth: owner });
  check('integrations: all 8 original entries present, secrets reported only as present', ['store_location', 'openfreemap', 'google_maps', 'google_routes', 'telegram', 'sms', 'email', 'fcm'].every(k => r.data.integrations?.some(i => i.key === k)) && !JSON.stringify(r.data).includes(RESEND_KEY) && !JSON.stringify(r.data).includes('PRIVATE KEY') && r.data.integrations.find(i => i.key === 'email')?.configured === true);
  for (const [key, expect] of [['sms', /Eskiz/], ['email', /fayz\.test domeni tasdiqlangan/], ['telegram', /@FayzQaBot/], ['fcm', /fayz-qa-mock/], ['google_routes', /Marshrut/]]) {
    r = await call(`/admin/integrations/${key}/test`, { method: 'POST', auth: owner });
    check(`integration test "${key}" runs against the mock`, r.status === 200 && r.data.ok === true && expect.test(r.data.message), JSON.stringify(r.data));
  }

  // ---------- Telegram Login (signature path, no network) ----------
  const tgData = { id: '777001', first_name: 'Tg', username: 'tg_qa', auth_date: String(Math.floor(Date.now() / 1000)) };
  const dcs = Object.keys(tgData).sort().map(k => `${k}=${tgData[k]}`).join('\n');
  const tgAuth = { ...tgData, hash: createHmac('sha256', createHash('sha256').update(BOT).digest()).update(dcs).digest('hex') };
  r = await call('/auth/telegram', { method: 'POST', body: { auth: tgAuth } }); check('Telegram login: payload signed with the test bot token accepted', r.status === 200 && r.data.customer?.telegram?.username === 'tg_qa');
  r = await call('/auth/telegram', { method: 'POST', body: { auth: tgAuth } }); check('Telegram login: replay refused', r.status === 401 && r.data.error?.code === 'TELEGRAM_REPLAYED');

  // ---------- FCM HTTP v1 (JWT → OAuth → send, dead-token pruning) ----------
  r = await call('/admin/push-token', { method: 'POST', auth: owner, body: { token: 'live-token-' + 'x'.repeat(40), platform: 'android' } });
  r = await call('/admin/push-token', { method: 'POST', auth: owner, body: { token: 'dead-token-' + 'x'.repeat(40), platform: 'android' } });
  check('FCM: staff device tokens registered', r.status === 200);
  r = await call('/admin/categories', { method: 'POST', auth: owner, body: { name: 'Sinov', slug: `sinov-${stamp}` } });
  r = await call('/admin/products', { method: 'POST', auth: owner, body: { name: 'Sinov mahsulot', slug: `sinov-${stamp}`, description: '', categoryId: r.data.id, price: 10000, stock: 10, active: true, featured: false, images: [] } }); const productId = r.data.id;
  const order = async () => call('/orders', { method: 'POST', body: { customerName: 'Push Sinov', phone: '+998901112233', address: 'Toshkent, Chilonzor 1', note: '', items: [{ productId, quantity: 1 }] } });
  r = await order(); check('FCM: new order created', r.status === 201, String(r.status));
  await until(() => log.fcm.length >= 2);
  const oauth = log.oauth.at(-1);
  check('FCM: service-account JWT is RS256-signed and verifies with the public key', oauth?.valid === true && oauth.claims.aud === 'https://oauth2.googleapis.com/token' && oauth.claims.exp - oauth.claims.iat === 3600);
  const sent = log.fcm.filter(m => m.project === 'fayz-qa-mock');
  check('FCM: message sent to both tokens with title, data and Android channel', sent.length === 2 && sent.every(m => /Yangi buyurtma/.test(m.notification?.title) && m.data?.kind === 'new_order' && m.android?.notification?.channel_id === 'operations'));
  const count = log.fcm.length;
  r = await order(); await until(() => log.fcm.length > count);
  await wait(500);
  const second = log.fcm.slice(count);
  check('FCM: token answered 404 was pruned; the live token still receives', second.length === 1 && second[0].token.startsWith('live-'), second.map(m => m.token.slice(0, 5)).join(','));
} catch (error) {
  check('script completed', false, String(error?.stack || error));
} finally {
  shutdown();
}
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
