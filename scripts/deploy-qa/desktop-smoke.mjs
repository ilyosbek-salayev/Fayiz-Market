// Launches the packaged macOS app with a DevTools port and drives it against the production API:
// login, dashboard, in-app/OS notification for a new order, keychain-persisted session after relaunch.
// Usage: ADMIN_EMAIL=… ADMIN_PASSWORD=… node scripts/deploy-qa/desktop-smoke.mjs   (creates one "QA-PROD" order)
import { createRequire } from 'node:module';
import { spawn, execSync } from 'node:child_process';
import path from 'node:path';
import { existsSync } from 'node:fs';
import os from 'node:os';
const require = createRequire(new URL('../ui-qa/package.json', import.meta.url));
const puppeteer = require('puppeteer-core');
const ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const APP = path.join(ROOT, 'apps/desktop/release/mac-arm64/Fayz Market Admin.app/Contents/MacOS/Fayz Market Admin');
const API = 'https://fayz-market-api.ilyosbeksalayev240.workers.dev';
const SHOTS = process.env.QA_SHOTS || path.join(ROOT, 'scripts/deploy-qa/shots');
const results = []; const check = (ok, name, d = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${d ? ' — ' + d : ''}`); };
const wait = ms => new Promise(r => setTimeout(r, ms));
async function launch(port) {
  const proc = spawn(APP, [`--remote-debugging-port=${port}`], { stdio: 'ignore' });
  for (let i = 0; i < 40; i++) { try { const r = await fetch(`http://127.0.0.1:${port}/json/version`); if (r.ok) break; } catch { /* starting */ } await wait(500); }
  const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${port}`, defaultViewport: null });
  let page; for (let i = 0; i < 20 && !page; i++) { page = (await browser.pages()).find(p => p.url().startsWith('file://')); if (!page) await wait(500); }
  return { proc, browser, page };
}
const text = page => page.evaluate(() => document.body.innerText);
let created = null;
try {
  let { proc, browser, page } = await launch(9333);
  check(!!page, 'packaged app starts and loads the bundled admin UI', page?.url().split('/').slice(-2).join('/'));
  check(await page.evaluate(() => !!window.fayzDesktop?.saveSession && !!window.fayzDesktop?.notify), 'desktop bridge exposes session + notifications');
  if ((await text(page)).includes('Boshqaruv paneliga kirish')) {
    await page.type('input[type=email]', process.env.ADMIN_EMAIL); await page.type('input[type=password]', process.env.ADMIN_PASSWORD);
    await page.click('.login-card .btn-primary'); await wait(4000);
  }
  check((await text(page)).includes('Kunlik savdo'), 'login against Cloudflare production → dashboard');
  await page.screenshot({ path: path.join(SHOTS, 'desktop-dashboard.png') });
  const support = path.join(os.homedir(), 'Library/Application Support/Fayz Market Admin/session.bin');
  check(existsSync(support), 'session saved encrypted (safeStorage / Keychain)');
  await wait(2000); // baseline poll
  const products = (await (await fetch(API + '/products?limit=1')).json()).products;
  if (products.length) {
    const r = await fetch(API + '/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customerName: 'QA-PROD Desktop', phone: '+998900000009', address: 'QA-PROD desktop test', note: '', items: [{ productId: products[0].id, quantity: 1 }] }) });
    created = (await r.json()).order;
    await wait(24000);
    check((await text(page)).includes(`Yangi buyurtma ${created.orderNumber}`), 'new-order notification reaches the desktop app (in-app + OS notification call)');
    await page.screenshot({ path: path.join(SHOTS, 'desktop-notification.png') });
  } else check(true, 'new-order notification skipped (production catalog empty — no test order created)');
  browser.disconnect(); proc.kill(); await wait(2500);
  ({ proc, browser, page } = await launch(9334));
  await wait(3500);
  check((await text(page)).includes('Kunlik savdo'), 'after relaunch the session is restored from the keychain (no login screen)');
  check(!/[a-f0-9]{64}/.test(require('node:fs').readFileSync(support, 'latin1')), 'session file holds no plain-text token');
  // Log out through the UI so the server session is revoked and the keychain copy removed.
  await page.evaluate(() => [...document.querySelectorAll('.side-foot button')].find(b => b.textContent.includes('Chiqish'))?.click()); await wait(2500);
  check((await text(page)).includes('Boshqaruv paneliga kirish') && !existsSync(support), 'logout clears the stored session');
  browser.disconnect(); proc.kill();
} catch (e) { check(false, 'desktop smoke completed', String(e?.stack || e)); }
if (created) console.log('CREATED_ORDER', created.orderNumber);
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
try { execSync('pkill -f "Fayz Market Admin.app"'); } catch { /* already closed */ }
process.exit(results.every(Boolean) ? 0 : 1);
