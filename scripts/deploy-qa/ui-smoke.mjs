// End-to-end UI check of the APK bundles against a deployed Worker, emulating the Android WebView:
// <API>/__app/* is answered from apps/<app>/dist (exactly what MainActivity.shouldInterceptRequest does),
// everything else goes to the real API over HTTPS.
// Usage: QA_API=https://... ADMIN_EMAIL=... ADMIN_PASSWORD=... QA_CATEGORY_ID=<existing test category id> \
//        node scripts/deploy-qa/ui-smoke.mjs
// Creates one "QA-PROD UI ..." product and one test order (cancelled at the end). Records no payment.
// Needs puppeteer-core:  npm i --prefix scripts/ui-qa --no-save --no-package-lock puppeteer-core@23.11.1
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
const require = createRequire(new URL('../ui-qa/package.json', import.meta.url));
const puppeteer = require('puppeteer-core');
const ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const API = (process.env.QA_API || '').replace(/\/+$/, '');
const EMAIL = process.env.ADMIN_EMAIL, PASSWORD = process.env.ADMIN_PASSWORD, CATEGORY = process.env.QA_CATEGORY_ID;
const SHOTS = process.env.QA_SHOTS || path.join(ROOT, 'scripts/deploy-qa/shots');
if (!API.startsWith('https://') || !EMAIL || !PASSWORD || !CATEGORY) { console.error('Set QA_API, ADMIN_EMAIL, ADMIN_PASSWORD, QA_CATEGORY_ID'); process.exit(2); }
await mkdir(SHOTS, { recursive: true });
const mime = f => f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.woff2') ? 'font/woff2' : 'text/html';
const results = []; let failed = 0; const dialogs = []; const created = { products: [], orders: [] };
const check = (ok, label, extra = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`); console.log(results.at(-1)); if (!ok) failed++; };
const pause = ms => new Promise(r => setTimeout(r, ms));
const stamp = Date.now().toString(36);
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const apiCalls = [];
async function open(app, width = 390) {
  const ctx = await browser.createBrowserContext(); const page = await ctx.newPage(); page.setDefaultTimeout(20000);
  await page.setViewport({ width, height: 844, deviceScaleFactor: 2, isMobile: width < 700, hasTouch: width < 700 });
  await page.setRequestInterception(true);
  page.on('request', async req => { const u = new URL(req.url()); if (u.origin === API && u.pathname.startsWith('/__app/')) { const f = path.join(ROOT, 'apps', app, 'dist', u.pathname.slice(7)); try { return req.respond({ status: 200, contentType: mime(f), body: await readFile(f) }); } catch { return req.respond({ status: 404, body: '' }); } } req.continue(); });
  page.on('response', res => { const u = new URL(res.url()); if (u.origin === API && !u.pathname.startsWith('/__app/')) apiCalls.push(`${app} ${res.request().method()} ${u.pathname} ${res.status()}`); });
  page.on('requestfailed', req => apiCalls.push(`${app} FAILED ${req.url()} ${req.failure()?.errorText}`));
  page.on('dialog', async d => { dialogs.push(d.message()); await d.accept(); });
  page.on('pageerror', e => check(false, `${app} page error`, e.message));
  await page.goto(`${API}/__app/index.html`, { waitUntil: 'networkidle0' });
  return { page, ctx };
}
const click = async (page, label, sel = 'button, a, label') => { const ok = await page.evaluate((t, s) => { const layer = document.querySelector('.sheet-backdrop,.modal-backdrop'); const els = [...document.querySelectorAll(s)].filter(e => (e.getAttribute('aria-label') || e.textContent || '').includes(t) && e.offsetParent !== null && (!layer || layer.contains(e))); if (!els[0]) return false; els[0].click(); return true; }, label, sel); await pause(700); return ok; };
const text = page => page.evaluate(() => document.body.innerText);
const setValue = (page, sel, v) => page.evaluate((s, val) => { const el = document.querySelector(s); const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, val); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); }, sel, v);
const api = async (p, init) => (await fetch(API + p, init)).json();
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
const productName = `QA-PROD UI Mahsulot ${stamp}`, productSlug = `qa-prod-ui-${stamp}`;
let order;

try {
  // ---------- Admin: login, dashboard, settings (the screen that failed on the phone), create product ----------
  {
    const { page, ctx } = await open('admin', 390);
    await setValue(page, 'input[type=email]', EMAIL); await setValue(page, 'input[type=password]', 'WrongPassword123');
    await click(page, 'Kirish'); await pause(1200);
    check((await text(page)).includes('Email yoki parol'), 'admin wrong password → error banner');
    await setValue(page, 'input[type=password]', PASSWORD); await click(page, 'Kirish'); await pause(2000);
    check((await text(page)).includes('Kunlik savdo'), 'admin login → dashboard from Cloudflare');
    await shot(page, 'admin-dashboard-390');
    await page.click('.menu-btn'); await pause(450);
    await page.evaluate(() => [...document.querySelectorAll('.side-nav button')].find(b => b.textContent.includes('Sozlamalar')).click()); await pause(2000);
    const st = await text(page);
    check(!st.includes('Sozlamalar yuklanmadi') && !st.includes('Aloqa yoʻq') && st.includes(EMAIL), 'admin Settings loads (store info + administrators)');
    await shot(page, 'admin-settings-390');
    await page.click('.menu-btn'); await pause(450);
    await page.evaluate(() => [...document.querySelectorAll('.side-nav button')].find(b => b.textContent.includes('Kategoriyalar')).click()); await pause(1500);
    check(!(await text(page)).includes('Aloqa yoʻq') && (await text(page)).includes('QA-PROD'), 'admin Categories loads');
    await shot(page, 'admin-categories-390');
    await ctx.close();
  }
  {
    const { page, ctx } = await open('admin', 1280);
    await setValue(page, 'input[type=email]', EMAIL); await setValue(page, 'input[type=password]', PASSWORD); await click(page, 'Kirish'); await pause(2000);
    await click(page, 'Mahsulotlar', '.side-nav button'); await pause(1200);
    await click(page, 'Mahsulot qoʻshish', '.topbar button');
    await setValue(page, '.modal input:not([type])', productName);
    await page.evaluate(() => { const els = document.querySelectorAll('.modal input.input'); els[1].setAttribute('data-q', 'slug'); els[2].setAttribute('data-q', 'price'); els[3].setAttribute('data-q', 'stock'); });
    await setValue(page, '[data-q=slug]', productSlug); await setValue(page, '[data-q=price]', '99000'); await setValue(page, '[data-q=stock]', '3');
    await setValue(page, '.modal select', String(CATEGORY));
    await page.click('.modal-foot .btn-primary'); await pause(2000);
    const prod = (await api(`/products/${productSlug}`)).product;
    if (prod) created.products.push(prod.id);
    check(prod?.price === 99000 && prod?.stock === 3, 'admin creates product via UI → stored in D1');
    await shot(page, 'admin-products-1280');
    await ctx.close();
  }

  // ---------- Customer: catalog, search, detail, cart, checkout, orders ----------
  {
    const { page, ctx } = await open('customer', 390);
    const home = await text(page);
    check(home.includes('Sevimli aksessuarlaringiz') && !home.includes('Aloqa yoʻq'), 'customer home loads banner from Cloudflare');
    await shot(page, 'customer-home-390');
    await click(page, 'Katalog', '.tabbar button');
    await page.type('.search-field input', `QA-PROD UI Mahsulot ${stamp}`); await pause(1800);
    const names = await page.$$eval('.grid .pcard-name', e => e.map(x => x.textContent));
    check(names.length === 1 && names[0] === productName, 'customer search finds the admin product', names.join(', '));
    await shot(page, 'customer-catalog-390');
    await click(page, productName, '.pcard-hit'); await pause(600);
    check((await text(page)).includes('Tavsif') || (await text(page)).includes('99,000') || (await text(page)).includes('99 000'), 'product detail opens');
    await shot(page, 'customer-product-390');
    await click(page, 'Savatga qoʻshish', '.action-bar button');
    check((await text(page)).includes('Savatga qoʻshildi'), 'add to cart (in-app toast)');
    await click(page, 'Orqaga');
    await click(page, 'Savat', '.tabbar button');
    await click(page, 'Koʻpaytirish'); await pause(300);
    check((await page.$$eval('.stepper b', e => e.map(x => x.textContent))).includes('2'), 'quantity increased to 2');
    await click(page, 'Buyurtma berish', '.action-bar button');
    await click(page, 'Buyurtmani yuborish', '.sheet-foot button');
    check((await text(page)).includes('Ism, +998 formatidagi telefon'), 'checkout validation shown');
    await setValue(page, '.sheet input[autocomplete=name]', 'QA-PROD UI Xaridor');
    await setValue(page, '.sheet input[type=tel]', '+998900000001');
    await setValue(page, '.sheet textarea[autocomplete=street-address]', 'QA-PROD sinov manzili, Toshkent');
    await shot(page, 'customer-checkout-390');
    await click(page, 'Buyurtmani yuborish', '.sheet-foot button'); await pause(2500);
    const t2 = await text(page); const number = (t2.match(/FM-[A-Z0-9-]+/) || [])[0];
    order = (await page.evaluate(() => JSON.parse(localStorage.getItem('fayz_orders') || '[]')))[0];
    if (order) created.orders.push(order.id);
    check(t2.includes('Buyurtma qabul qilindi') && number && order?.orderNumber === number, 'checkout creates order in D1', number);
    check((await text(page)).includes('Yangi'), 'customer order list shows status Yangi');
    await shot(page, 'customer-orders-390');
    await ctx.close();
  }
  const stock = (await api(`/products/${productSlug}`)).product?.stock;
  check(stock === 1, 'inventory decremented by order (3 → 1)', String(stock));

  // ---------- Admin: find the order, change status ----------
  {
    const { page, ctx } = await open('admin', 1280);
    await setValue(page, 'input[type=email]', EMAIL); await setValue(page, 'input[type=password]', PASSWORD); await click(page, 'Kirish'); await pause(2000);
    await click(page, 'Buyurtmalar', '.side-nav button'); await pause(1500);
    const found = await page.evaluate(n => { const row = [...document.querySelectorAll('.table tbody tr')].find(r => r.textContent.includes(n)); row?.click(); return Boolean(row); }, order.orderNumber); await pause(1500);
    check(found && (await text(page)).includes('QA-PROD UI Xaridor'), 'admin sees the customer order and opens it');
    await click(page, 'Tasdiqlangan', '.status-actions button'); await pause(2000);
    const o = await api(`/orders/${order.id}`, { headers: { Authorization: `Order ${order.accessToken}` } });
    check(o.order?.status === 'confirmed', 'admin status change stored in D1', o.order?.status);
    await shot(page, 'admin-order-1280');
    await page.keyboard.press('Escape'); await pause(300);
    await click(page, 'Chiqish', '.side-foot button'); await pause(1200);
    check(!!(await page.$('.login-card')), 'admin logout');
    await ctx.close();
  }
  {
    const { page, ctx } = await open('customer', 390);
    await page.evaluate(o => localStorage.setItem('fayz_orders', JSON.stringify([o])), order);
    await page.reload({ waitUntil: 'networkidle0' });
    await click(page, 'Buyurtmalar', '.tabbar button'); await pause(1500);
    check((await text(page)).includes('Tasdiqlangan'), 'customer sees the admin status change');
    await ctx.close();
  }
} catch (error) {
  check(false, 'smoke script completed', String(error?.stack || error));
} finally {
  check(dialogs.length === 0, 'no native alert/confirm dialogs', dialogs.join(' | '));
  const failedCalls = apiCalls.filter(c => / FAILED | 5\d\d$/.test(c));
  check(failedCalls.length === 0, 'no network failures or 5xx from the app', failedCalls.join(' | '));
  await writeFile(path.join(SHOTS, 'ui-smoke.json'), JSON.stringify({ api: API, created, order: order ? { id: order.id, orderNumber: order.orderNumber } : null, results, apiCalls }, null, 2));
  await browser.close();
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}
