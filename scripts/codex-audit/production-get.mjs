// Public GET requests only. No owner login, OTP request, bootstrap or mutation.
const api = 'https://fayz-market-api.ilyosbeksalayev240.workers.dev';
let passed = 0, count = 0;
for (const [path, status] of [['/health', 200], ['/settings', 200], ['/categories', 200], ['/products', 200], ['/auth/config', 200], ['/admin/orders', 401], ['/courier/deliveries', 401], ['/customer/orders', 401], ['/__app/index.html', 404]]) {
  const r = await fetch(api + path, { signal: AbortSignal.timeout(20000) });
  count++; if (r.status === status) passed++;
  console.log(`${r.status === status ? 'PASS' : 'FAIL'} GET ${path}: ${r.status}`);
  if (path === '/auth/config') { const c = await r.json(); console.log('Auth availability:', JSON.stringify(c)); count++; if (c.phone?.devEcho === false && c.email?.devEcho === false) { passed++; console.log('PASS dev OTP echo disabled'); } }
}
const r = await fetch(api + '/health', { headers: { Origin: 'https://evil.example' } });
count++; if (!r.headers.get('access-control-allow-origin')) passed++;
console.log(`${passed}/${count} passed`); process.exitCode = passed === count ? 0 : 1;
