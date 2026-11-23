// Seeds the LAN TEST server (scripts/deploy-qa/lan-test-server.sh) with test accounts and products.
// Refuses any https:// or non-private address, so it can never write to production.
//   node scripts/deploy-qa/lan-seed.mjs [http://192.168.x.x:8791]
import { execSync } from 'node:child_process';
const ip = process.env.LAN_IP || (() => { try { return execSync('ipconfig getifaddr en0 || ipconfig getifaddr en1', { encoding: 'utf8' }).trim(); } catch { return ''; } })();
const API = (process.argv[2] || `http://${ip}:${process.env.QA_PORT || 8791}`).replace(/\/+$/, '');
if (!/^http:\/\/(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|127\.)[\d.]+:\d+$/.test(API)) { console.error(`Refusing ${API}: only a private-network http:// test server`); process.exit(1); }
const call = async (p, { method = 'GET', auth, body, headers = {} } = {}) => { const r = await fetch(API + p, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(auth ? { Authorization: auth } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined }); const data = await r.json().catch(() => null); if (r.status >= 400 && r.status !== 409) throw new Error(`${method} ${p} → ${r.status} ${JSON.stringify(data)}`); return data; };
const health = await call('/health').catch(e => { console.error(`Test server not reachable at ${API}: ${e.message}`); process.exit(1); });
const OWNER = { email: 'owner@test.local', password: 'TestOwner-2026' }, COURIER = { email: 'kuryer@test.local', password: 'TestKuryer-2026' };
await call('/admin/bootstrap', { method: 'POST', headers: { 'X-Bootstrap-Secret': process.env.QA_BOOTSTRAP || 'qa-bootstrap' }, body: OWNER }).catch(() => undefined);
const owner = 'Bearer ' + (await call('/admin/login', { method: 'POST', body: OWNER })).token;
await call('/admin/users', { method: 'POST', auth: owner, body: { ...COURIER, role: 'courier', name: 'Test Kuryer', phone: '+998901234500' } }).catch(() => undefined);
await call('/admin/integrations/store_location', { method: 'PUT', auth: owner, body: { store_address: 'Toshkent, Chorsu', store_lat: '41.3264', store_lng: '69.2286' } });
const existing = (await call('/products')).products || [];
if (!existing.length) {
  const cat = await call('/admin/categories', { method: 'POST', auth: owner, body: { name: 'Sinov mahsulotlari', slug: 'sinov' } });
  for (const [i, [name, price]] of [['Sinov soati', 150000], ['Sinov quloqchini', 89000], ['Sinov sumkasi', 120000]].entries())
    await call('/admin/products', { method: 'POST', auth: owner, body: { name, slug: `sinov-${i + 1}`, description: 'Faqat sinov serverida', categoryId: cat.id, price, stock: 50, active: true, featured: i === 0, images: [] } });
}
console.log(`TEST server ${API} (${health.service}) seeded — this data exists only on this Mac.`);
console.log(`Products: ${((await call('/products')).products || []).map(p => p.name).join(', ')}`);
console.log(`Admin app (owner):   ${OWNER.email} / ${OWNER.password}`);
console.log(`Admin app (courier): ${COURIER.email} / ${COURIER.password}`);
console.log('Customer app: register with any +998 number — the SMS code is shown on screen (test mode).');
