// NON-MUTATING production contract check. Creates no products, orders, customers or codes:
//  • public reads (health, settings, catalog, image route, bundled app shell);
//  • test-mode isolation: no OTP echo / mock providers in production, code endpoints answer 503 (no provider);
//  • auth guards (401/403) and CORS;
//  • optional owner login (QA_OWNER_EMAIL + QA_OWNER_PASSWORD) to read the integrations list, then logout —
//    the only write is the session row that logout deletes again.
//   node scripts/deploy-qa/production-readonly.mjs
const API = (process.env.QA_API || 'https://fayz-market-api.ilyosbeksalayev240.workers.dev').replace(/\/+$/, '');
const results = []; const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };
async function call(path, { method = 'GET', auth, body, headers = {} } = {}) {
  const res = await fetch(API + path, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(auth ? { Authorization: auth } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}
try {
  let r = await call('/health'); check('health', r.status === 200 && r.data.ok === true);
  r = await call('/settings'); check('public settings readable, no secrets', r.status === 200 && !/AAH-|\bre_[A-Za-z0-9]{8,}|PRIVATE KEY|ESKIZ_PASSWORD/.test(JSON.stringify(r.data)));
  r = await call('/categories'); check('categories readable', r.status === 200 && Array.isArray(r.data.categories));
  r = await call('/products'); check('products readable', r.status === 200 && Array.isArray(r.data.products));
  r = await call('/auth/config');
  check('production: no OTP echo for SMS or email', r.status === 200 && r.data.phone?.devEcho === false && r.data.email?.devEcho === false, JSON.stringify(r.data));
  check('production: SMS / email / Telegram honestly reported as not configured', r.data.phone?.enabled === false && r.data.email?.enabled === false && r.data.telegram?.enabled === false);
  r = await call('/auth/otp', { method: 'POST', body: { phone: '+998900000000', purpose: 'register' } });
  check('SMS code request → 503 SMS_NOT_CONFIGURED (no code generated or returned)', r.status === 503 && r.data.error?.code === 'SMS_NOT_CONFIGURED' && !('devCode' in (r.data || {})));
  r = await call('/auth/email/otp', { method: 'POST', body: { email: 'probe@example.com', purpose: 'register' } });
  check('email code request → 503 EMAIL_NOT_CONFIGURED (no code generated or returned)', r.status === 503 && r.data.error?.code === 'EMAIL_NOT_CONFIGURED' && !('devCode' in (r.data || {})));
  r = await call('/auth/telegram', { method: 'POST', body: { auth: { id: '1', auth_date: '1', hash: 'x' } } }); check('Telegram login → 503 until a bot is configured', r.status === 503);
  r = await call('/admin/bootstrap', { method: 'POST', headers: { 'X-Bootstrap-Secret': 'qa-bootstrap' }, body: { email: 'x@example.com', password: 'Whatever-12345' } });
  check('QA bootstrap secret is not accepted in production', r.status === 403);
  r = await call('/admin/orders'); check('admin endpoints need a session → 401', r.status === 401);
  r = await call('/courier/deliveries'); check('courier endpoints need a session → 401', r.status === 401);
  r = await call('/customer/orders'); check('customer endpoints need a session → 401', r.status === 401);
  r = await call('/auth/login', { method: 'POST', body: { email: 'not-an-email', password: 'x' } }); check('invalid login body → 400', r.status === 400);
  r = await fetch(API + '/health', { headers: { Origin: 'https://evil.example' } }); check('CORS does not allow foreign origins', r.headers.get('access-control-allow-origin') !== 'https://evil.example');
  r = await fetch(API + '/__app/index.html'); check('APK shell path is not served by the Worker (bundled in the APK)', r.status === 404 || r.status === 401);
  if (process.env.QA_OWNER_EMAIL && process.env.QA_OWNER_PASSWORD) {
    r = await call('/admin/login', { method: 'POST', body: { email: process.env.QA_OWNER_EMAIL, password: process.env.QA_OWNER_PASSWORD } });
    check('owner login', r.status === 200 && r.data.admin?.role === 'owner');
    const owner = 'Bearer ' + r.data.token;
    r = await call('/admin/integrations', { auth: owner });
    const list = r.data.integrations || [];
    check('integrations: 8 entries incl. OpenFreeMap (configured) and Email (not configured)', list.length === 8 && list.find(i => i.key === 'openfreemap')?.configured === true && list.find(i => i.key === 'email')?.configured === false, list.map(i => `${i.key}:${i.configured ? 'on' : 'off'}`).join(' '));
    check('integrations never return secret values', !/\bre_[A-Za-z0-9]{8,}|AAH-|PRIVATE KEY/.test(JSON.stringify(r.data)));
    r = await call('/admin/logout', { method: 'POST', auth: owner }); check('owner logout (session removed)', r.status === 200);
  } else console.log('SKIP owner checks (QA_OWNER_EMAIL / QA_OWNER_PASSWORD not set)');
} catch (error) { check('script completed', false, String(error?.stack || error)); }
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
