// Functional regression through the redesigned UI against the isolated QA Worker (port 8788).
// Every check drives real controls; results are verified through the API, not assumed.
import puppeteer from 'puppeteer-core';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const API = process.env.QA_API || 'http://127.0.0.1:8788';
const mime = f => f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.woff2') ? 'font/woff2' : 'text/html';
const results = []; let failed = 0;
const check = (ok, label, extra = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`); if (!ok) failed++; };
const pause = ms => new Promise(r => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const dialogs = [];
async function open(app, width = 390) {
  const ctx = await browser.createBrowserContext(); const page = await ctx.newPage(); page.setDefaultTimeout(15000);
  await page.setViewport({ width, height: 844, isMobile: width < 700, hasTouch: width < 700 });
  await page.setRequestInterception(true);
  page.on('request', async req => { const u = new URL(req.url()); if (u.origin === API && u.pathname.startsWith('/__app/')) { const f = path.join(ROOT, 'apps', app, 'dist', u.pathname.slice(7)); try { return req.respond({ status: 200, contentType: mime(f), body: await readFile(f) }); } catch { return req.respond({ status: 404, body: '' }); } } req.continue(); });
  page.on('dialog', async d => { dialogs.push(d.message()); await d.accept(); });
  page.on('pageerror', e => check(false, `${app} page error`, e.message));
  await page.goto(`${API}/__app/index.html`, { waitUntil: 'networkidle0' });
  return { page, ctx };
}
const click = async (page, text, sel = 'button, a, label') => { const ok = await page.evaluate((t, s) => { const layer = document.querySelector('.sheet-backdrop,.modal-backdrop'); const els = [...document.querySelectorAll(s)].filter(e => (e.getAttribute('aria-label') || e.textContent || '').includes(t) && e.offsetParent !== null && (!layer || layer.contains(e))); if (!els[0]) return false; els[0].click(); return true; }, text, sel); await pause(500); return ok; };
const text = page => page.evaluate(() => document.body.innerText);
const setValue = (page, sel, v) => page.evaluate((s, val) => { const el = document.querySelector(s); const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, val); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); }, sel, v);
const api = async (p, init) => (await fetch(API + p, init)).json();

// ---------- Customer ----------
{
  const { page, ctx } = await open('customer');
  check((await text(page)).includes('Sevimli aksessuarlaringiz'), 'home loads banner from /settings');
  check(await page.$$eval('.pcard', els => els.length) > 0, 'home renders products');
  await click(page, 'Katalog', '.tabbar button');
  const before = await page.$$eval('.grid .pcard', e => e.length);
  await page.type('.search-field input', 'soat'); await pause(1200);
  const names = await page.$$eval('.grid .pcard-name', e => e.map(x => x.textContent));
  check(names.length >= 1 && names.every(n => /soat/i.test(n)), 'search filters catalog', names.join(', '));
  await click(page, 'Qidiruvni tozalash'); await pause(900);
  check(await page.$$eval('.grid .pcard', e => e.length) === before, 'clearing search restores list');
  await click(page, 'Sumkalar', '.chips button'); await pause(900);
  const cat = await page.$$eval('.grid .pcard-cat', e => e.map(x => x.textContent));
  check(cat.length > 0 && cat.every(c => c === 'Sumkalar'), 'category chip filters', cat.join(','));
  await click(page, 'Barchasi', '.chips button'); await pause(900);
  await setValue(page, '.sort-select select', 'price_asc'); await pause(900);
  const prices = await page.$$eval('.grid .price', e => e.map(x => Number(x.textContent.replace(/\D/g, ''))));
  check(prices.every((p, i) => !i || prices[i - 1] <= p), 'sort price ascending', prices.join(' ≤ '));
  await setValue(page, '.sort-select select', 'newest'); await pause(900);
  // product detail + add to cart
  await click(page, 'QA: Klassik', '.pcard-hit'); await pause(400);
  check((await text(page)).includes('Tavsif'), 'product detail opens');
  await click(page, 'Savatga qoʻshish', '.action-bar button');
  check((await text(page)).includes('Savatga qoʻshildi'), 'add to cart shows in-app toast (no native alert)');
  await click(page, 'Orqaga');
  // quick add from card
  await click(page, 'QA: Telefon gʻilofi — savatga', '.pcard-add'); await click(page, 'QA: Telefon gʻilofi — savatga', '.pcard-add');
  const cartLS = await page.evaluate(() => JSON.parse(localStorage.getItem('fayz_cart')));
  check(Object.values(cartLS).reduce((a, b) => a + b, 0) === 3, 'cart persisted to localStorage', JSON.stringify(cartLS));
  await click(page, 'Savat', '.tabbar button');
  check(await page.$$eval('.cart-row', e => e.length) === 2, 'cart lists items');
  await click(page, 'Koʻpaytirish'); await pause(200);
  const qty = await page.$$eval('.stepper b', e => e.map(x => x.textContent));
  check(qty.includes('2') || qty.includes('3'), 'quantity increment', qty.join(','));
  await click(page, 'Kamaytirish');
  // checkout validation
  await click(page, 'Buyurtma berish', '.action-bar button');
  await click(page, 'Buyurtmani yuborish', '.sheet-foot button');
  const t1 = await text(page);
  check(t1.includes('Ism, +998 formatidagi telefon') && t1.includes('Raqamni +998'), 'checkout validation shown inline');
  // fill & submit
  await setValue(page, '.sheet input[autocomplete=name]', 'Regress Xaridor');
  await setValue(page, '.sheet input[type=tel]', '+998901112233');
  await setValue(page, '.sheet textarea[autocomplete=street-address]', 'Toshkent, Chilonzor 7, 15-uy');
  await click(page, 'Buyurtmani yuborish', '.sheet-foot button'); await pause(1500);
  const t2 = await text(page);
  const number = (t2.match(/FM-[A-Z0-9-]+/) || [])[0];
  check(t2.includes('Buyurtma qabul qilindi') && !!number, 'order submitted via UI', number);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('fayz_orders')));
  check(saved[0]?.orderNumber === number && JSON.parse(await page.evaluate(() => localStorage.getItem('fayz_cart'))) && Object.keys(JSON.parse(await page.evaluate(() => localStorage.getItem('fayz_cart')))).length === 0, 'order stored locally and cart cleared');
  await pause(800);
  check((await text(page)).includes('Yangi'), 'order status visible (Yangi)');
  globalThis.__order = saved[0];
  // profile persisted & theme switching
  await click(page, 'Profil', '.tabbar button');
  const prof = await page.evaluate(() => JSON.parse(localStorage.getItem('fayz_profile')));
  check(prof.customerName === 'Regress Xaridor' && prof.phone === '+998901112233', 'profile persisted from checkout');
  for (const [label, key, bg] of [['Qora', 'black', 'rgb(21, 21, 19)'], ['Yashil', 'green', 'rgb(247, 250, 248)'], ['Koʻk', 'blue', 'rgb(247, 249, 252)'], ['Sariq', 'yellow', 'rgb(250, 250, 247)']]) {
    await click(page, label, '.theme-opt');
    const state = await page.evaluate(() => ({ t: document.documentElement.dataset.theme, ls: localStorage.getItem('fayz_theme'), bg: getComputedStyle(document.body).backgroundColor }));
    check(state.t === key && state.ls === key && state.bg === bg, `theme ${key} applied & saved`, state.bg);
  }
  await ctx.close();
}

// ---------- Admin ----------
{
  const { page, ctx } = await open('admin', 1280);
  await setValue(page, 'input[type=email]', 'qa-owner@example.invalid');
  await setValue(page, 'input[type=password]', 'WrongPassword123');
  await click(page, 'Kirish'); await pause(800);
  check((await text(page)).includes('Email yoki parol') || (await page.$('.banner-error')) !== null, 'wrong password shows error banner');
  await setValue(page, 'input[type=password]', 'QaLocalPassword123!');
  await click(page, 'Kirish'); await pause(1200);
  check((await text(page)).includes('Kunlik savdo'), 'admin login → dashboard');
  // category CRUD
  await click(page, 'Kategoriyalar', '.side-nav button'); await pause(700);
  await setValue(page, '.split input[placeholder="Masalan: Soatlar"]', 'Regress kamar'); await setValue(page, '.split input[placeholder="soatlar"]', 'regress-kamar');
  await click(page, 'Saqlash', '.split button'); await pause(900);
  const cats = (await api('/categories')).categories;
  const rc = cats.find(c => c.slug === 'regress-kamar');
  check(!!rc, 'category created via UI');
  // product create
  await click(page, 'Mahsulotlar', '.side-nav button'); await pause(800);
  await click(page, 'Mahsulot qoʻshish', '.topbar button');
  await setValue(page, '.modal input:not([type])', 'Regress: Charm kamar');
  const inputs = await page.$$('.modal input.input');
  await page.evaluate(() => { const els = document.querySelectorAll('.modal input.input'); els[1].setAttribute('data-q', 'slug'); els[2].setAttribute('data-q', 'price'); els[3].setAttribute('data-q', 'stock'); });
  await setValue(page, '[data-q=slug]', 'regress-charm-kamar'); await setValue(page, '[data-q=price]', '175000'); await setValue(page, '[data-q=stock]', '4');
  await setValue(page, '.modal select', String(rc.id));
  await page.click('.modal-foot .btn-primary'); await pause(1200);
  let prod = (await api('/products/regress-charm-kamar')).product;
  check(prod?.price === 175000 && prod?.stock === 4 && inputs.length >= 4, 'product created via UI');
  // edit price
  await page.evaluate(() => { const row = [...document.querySelectorAll('.table tbody tr')].find(r => r.textContent.includes('Regress: Charm kamar')); row.querySelector('button[title=Tahrirlash]').click(); }); await pause(500);
  await page.evaluate(() => { document.querySelectorAll('.modal input.input')[2].setAttribute('data-q', 'price2'); });
  await setValue(page, '[data-q=price2]', '180000'); await page.click('.modal-foot .btn-primary'); await pause(1200);
  prod = (await api('/products/regress-charm-kamar')).product;
  check(prod.price === 180000, 'product edit saved', String(prod.price));
  // stock adjust
  await page.evaluate(() => { const row = [...document.querySelectorAll('.table tbody tr')].find(r => r.textContent.includes('Regress: Charm kamar')); row.querySelector('button[title=Qoldiq]').click(); }); await pause(500);
  await page.evaluate(() => { const els = document.querySelectorAll('.modal input.input'); els[0].setAttribute('data-q', 'delta'); els[1].setAttribute('data-q', 'reason'); });
  await setValue(page, '[data-q=delta]', '3'); await setValue(page, '[data-q=reason]', 'Regress kirim'); await page.click('.modal-foot .btn-primary'); await pause(1200);
  prod = (await api('/products/regress-charm-kamar')).product;
  check(prod.stock === 7, 'stock adjustment saved', String(prod.stock));
  // hide product via confirmation dialog
  await page.evaluate(() => { const row = [...document.querySelectorAll('.table tbody tr')].find(r => r.textContent.includes('Regress: Charm kamar')); row.querySelector('button[title=Oʻchirish]').click(); }); await pause(400);
  check((await text(page)).includes('katalogdan yashiriladi'), 'delete asks in-app confirmation (no native confirm)');
  await click(page, 'Yashirish', '.modal-foot button'); await pause(1200);
  const hidden = await fetch(API + '/products/regress-charm-kamar');
  check(hidden.status === 404, 'product hidden after confirmation');
  // order status + payment
  await click(page, 'Buyurtmalar', '.side-nav button'); await pause(900);
  const num = globalThis.__order.orderNumber;
  await page.evaluate(n => { [...document.querySelectorAll('.table tbody tr')].find(r => r.textContent.includes(n)).click(); }, num); await pause(900);
  check((await text(page)).includes('Regress Xaridor'), 'order detail modal opens');
  await click(page, 'Tasdiqlangan', '.status-actions button'); await pause(1200);
  const custOrder = await api(`/orders/${globalThis.__order.id}`, { headers: { Authorization: `Order ${globalThis.__order.accessToken}` } });
  check(custOrder.order.status === 'confirmed', 'status change persisted', custOrder.order.status);
  await page.evaluate(() => document.querySelector('.pay-form input').setAttribute('data-q', 'amt'));
  await setValue(page, '[data-q=amt]', '50000'); await click(page, 'Toʻlovni qayd etish', '.pay-form button'); await pause(1200);
  check((await text(page)).includes('50,000') || (await text(page)).includes('50 000'), 'payment recorded and listed');
  await page.keyboard.press('Escape'); await pause(300);
  check(!(await page.$('.modal-backdrop')), 'Escape closes modal');
  // settings save
  await click(page, 'Sozlamalar', '.side-nav button'); await pause(900);
  await page.evaluate(() => document.querySelectorAll('.settings-form input.input')[0].setAttribute('data-q', 'phone'));
  await setValue(page, '[data-q=phone]', '+998 71 200 00 00');
  await click(page, 'Saqlash', '.settings-form .form-actions button'); await pause(1000);
  check((await api('/settings')).settings.contact_phone === '+998 71 200 00 00', 'store settings saved');
  // add admin
  await page.evaluate(() => { const f = document.querySelector('.add-admin'); f.querySelector('input[type=email]').setAttribute('data-q', 'ne'); f.querySelector('input[type=password]').setAttribute('data-q', 'np'); });
  await setValue(page, '[data-q=ne]', `regress-${Date.now()}@example.invalid`); await setValue(page, '[data-q=np]', 'RegressManager123!');
  await click(page, 'Qoʻshish', '.add-admin button'); await pause(1200);
  check(await page.$$eval('.rows li', e => e.length) >= 2, 'administrator added and listed');
  // mobile drawer navigation
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true }); await pause(400);
  const hiddenNav = await page.$eval('.sidebar', el => getComputedStyle(el).visibility);
  await page.click('.menu-btn'); await pause(450);
  const shownNav = await page.$eval('.sidebar', el => getComputedStyle(el).visibility);
  check(hiddenNav === 'hidden' && shownNav === 'visible', 'mobile drawer opens from menu button');
  await page.evaluate(() => [...document.querySelectorAll('.side-nav button')].find(b => b.textContent.includes('Boshqaruv')).click()); await pause(900);
  check((await text(page)).includes('Kunlik savdo') && await page.$eval('.sidebar', el => !el.classList.contains('open')), 'drawer navigates and closes');
  await click(page, 'Menyu', '.menu-btn'); await click(page, 'Chiqish', '.side-foot button'); await pause(900);
  check(!!(await page.$('.login-card')), 'logout returns to login');
  await ctx.close();
}
// customer sees new status
{
  const { page, ctx } = await open('customer');
  await page.evaluate(o => localStorage.setItem('fayz_orders', JSON.stringify([o])), globalThis.__order);
  await page.reload({ waitUntil: 'networkidle0' });
  await click(page, 'Buyurtmalar', '.tabbar button'); await pause(1000);
  check((await text(page)).includes('Tasdiqlangan'), 'customer sees admin status change');
  await ctx.close();
}
check(dialogs.length === 0, 'no native alert/confirm dialogs used', dialogs.join(' | '));
await browser.close();
console.log(results.join('\n')); console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
