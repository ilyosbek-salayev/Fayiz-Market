// Visual QA driver. Emulates the Android WebView shell: the app bundle is served from
// <API>/__app/* (like MainActivity.shouldInterceptRequest) so API calls are same-origin.
import puppeteer from 'puppeteer-core';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const API = process.env.QA_API || 'http://127.0.0.1:8788';
const tag = process.argv[2] || 'after';
const only = process.argv[3] || 'all';
const out = path.join(process.env.QA_OUT || path.join(path.dirname(new URL(import.meta.url).pathname), 'shots'), tag);
await mkdir(out, { recursive: true });
const order = JSON.parse(await readFile(new URL('./qa-order.json', import.meta.url), 'utf8'));
const mime = f => f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.svg') ? 'image/svg+xml' : f.endsWith('.png') ? 'image/png' : f.endsWith('.woff2') ? 'font/woff2' : 'text/html';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-first-run', '--no-default-browser-check'] });
const report = [];

async function open(app, width, height, opts = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  await page.setViewport({ width, height, deviceScaleFactor: 2, isMobile: width < 700, hasTouch: width < 700 });
  if (opts.reducedMotion) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.setRequestInterception(true);
  page.on('request', async req => {
    const u = new URL(req.url());
    if (u.origin === API && u.pathname.startsWith('/__app/')) {
      const file = path.join(ROOT, 'apps', app, 'dist', u.pathname.slice(7) || 'index.html');
      try { return req.respond({ status: 200, contentType: mime(file), body: await readFile(file) }); } catch { return req.respond({ status: 404, body: '' }); }
    }
    if (opts.offline && u.origin === API) return req.abort('internetdisconnected');
    req.continue();
  });
  page.on('pageerror', e => report.push(`[${app} ${width}] pageerror ${e.message}`));
  page.on('dialog', async d => { report.push(`[${app} ${width}] NATIVE DIALOG: ${d.message()}`); await d.dismiss(); });
  await page.evaluateOnNewDocument((o, theme) => {
    if (!localStorage.getItem('qa_init')) {
      localStorage.setItem('qa_init', '1');
      localStorage.setItem('fayz_orders', JSON.stringify([o]));
      if (theme) localStorage.setItem('fayz_theme', theme);
    }
  }, order, opts.theme || '');
  await page.goto(`${API}/__app/index.html`, { waitUntil: 'networkidle0' });
  return { page, ctx };
}
const pause = ms => new Promise(r => setTimeout(r, ms));
async function click(page, text, selector = 'button, a, [role=button], [role=tab]') {
  const ok = await page.evaluate((t, s) => {
    const els = [...document.querySelectorAll(s)].filter(e => (e.getAttribute('aria-label') || e.textContent || '').trim().includes(t) && e.offsetParent !== null);
    const layer = document.querySelector('.overlay,.sheet-backdrop,.modal-backdrop,.drawer-backdrop[data-open=true]');
    const el = (layer && els.find(e => layer.contains(e))) || els[0];
    if (!el) return false; el.scrollIntoView({ block: 'center' }); el.click(); return true;
  }, text, selector);
  if (!ok) report.push(`missing control "${text}"`);
  await pause(450);
}
async function shot(page, name, width, full = true) {
  if (process.env.QA_LOG) console.log('shot', name, width);
  await pause(300);
  const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  if (m.sw > m.cw + 1) report.push(`OVERFLOW ${name}@${width}: scrollWidth ${m.sw} > ${m.cw}`);
  await page.screenshot({ path: path.join(out, `${name}-${width}.png`), fullPage: full });
}
async function type(page, selector, value) { await page.evaluate(s => { const e = document.querySelector(s); if (e) { e.focus(); e.select?.(); } }, selector); await page.keyboard.down('Meta'); await page.keyboard.press('a'); await page.keyboard.up('Meta'); await page.keyboard.press('Backspace'); await page.type(selector, value); }

async function customer(width, height = 844, opts = {}) {
  const suffix = opts.theme ? `-${opts.theme}` : '';
  const { page, ctx } = await open('customer', width, height, opts);
  await pause(600);
  await shot(page, `c-home${suffix}`, width);
  if (opts.quick) { await ctx.close(); return; }
  await click(page, 'Katalog'); await shot(page, 'c-catalog', width);
  await click(page, 'QA: Klassik', '.pcard-hit, .product'); await shot(page, 'c-product', width);
  await click(page, 'Savatga qoʻshish'); await shot(page, 'c-product-added', width, false);
  await click(page, 'Orqaga');
  await click(page, 'QA: Juda uzun', '.pcard-hit, .product'); await click(page, 'Savatga qoʻshish'); await click(page, 'Orqaga');
  await click(page, 'Savat'); await shot(page, 'c-cart', width);
  await click(page, 'Buyurtma berish'); await shot(page, 'c-checkout', width, false);
  await click(page, 'Buyurtmani yuborish'); await shot(page, 'c-checkout-error', width, false);
  await click(page, 'Bekor qilish');
  await click(page, 'Buyurtmalar'); await pause(800); await shot(page, 'c-orders', width);
  await click(page, 'Profil'); await shot(page, 'c-profile', width);
  await ctx.close();
}
async function customerEmpty(width) {
  const ctx = await browser.createBrowserContext(); const page = await ctx.newPage();
  await page.setViewport({ width, height: 800, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.setRequestInterception(true);
  page.on('request', async req => { const u = new URL(req.url()); if (u.origin === API && u.pathname.startsWith('/__app/')) { const f = path.join(ROOT, 'apps/customer/dist', u.pathname.slice(7)); try { return req.respond({ status: 200, contentType: mime(f), body: await readFile(f) }); } catch { return req.respond({ status: 404, body: '' }); } } req.continue(); });
  await page.goto(`${API}/__app/index.html`, { waitUntil: 'networkidle0' });
  await click(page, 'Savat'); await shot(page, 'c-cart-empty', width);
  await click(page, 'Buyurtmalar'); await shot(page, 'c-orders-empty', width);
  await click(page, 'Katalog'); await page.type('input[type=search], .search input', 'yoʻqmahsulot'); await pause(900); await shot(page, 'c-search-empty', width);
  await ctx.close();
  const off = await open('customer', width, 800, { offline: true }); await pause(500); await shot(off.page, 'c-offline', width); await off.ctx.close();
}
async function admin(width, height = 900) {
  const { page, ctx } = await open('admin', width, height);
  await shot(page, 'a-login', width, false);
  await type(page, 'input[type=email]', 'qa-owner@example.invalid');
  await type(page, 'input[type=password]', 'QaLocalPassword123!');
  await click(page, 'Kirish'); await pause(1000);
  await shot(page, 'a-dashboard', width);
  const nav = async label => { if (width < 900) { await click(page, 'Menyu', '.menu-btn'); await shot(page, 'a-drawer', width, false); } await click(page, label, 'nav button, nav a, aside button'); await pause(700); };
  await nav('Mahsulotlar'); await shot(page, 'a-products', width);
  await click(page, 'Mahsulot qoʻshish'); await shot(page, 'a-product-form', width, width < 760);
  await click(page, 'Bekor qilish');
  await click(page, 'Qoldiq'); await shot(page, 'a-stock', width, false); await click(page, 'Bekor qilish');
  await nav('Kategoriyalar'); await shot(page, 'a-categories', width);
  await nav('Buyurtmalar'); await shot(page, 'a-orders', width);
  await click(page, 'Koʻrish'); await pause(700); await shot(page, 'a-order-modal', width, false);
  await page.keyboard.press('Escape'); await click(page, 'Yopish');
  await nav('Sozlamalar'); await pause(500); await shot(page, 'a-settings', width);
  await ctx.close();
  const off = await open('admin', width, height, { offline: true }); await shot(off.page, 'a-login-offline', width, false); await off.ctx.close();
}

if (only === 'all' || only === 'customer') for (const w of [320, 360, 390, 412, 430, 768, 1024]) await customer(w);
if (only === 'all' || only === 'themes') for (const t of ['green', 'blue', 'black']) await customer(390, 844, { theme: t });
if (only === 'all' || only === 'empty') { await customerEmpty(390); await customerEmpty(320); }
if (only === 'all' || only === 'admin') for (const w of [360, 390, 768, 1024, 1280, 1440, 1920]) await admin(w);
if (only.startsWith('c')) { const w = Number(only.slice(1)); if (w) await customer(w); }
if (only.startsWith('a') && only !== 'all' && only !== 'admin') { const w = Number(only.slice(1)); if (w) await admin(w); }
await browser.close();
await writeFile(path.join(out, 'report.txt'), report.join('\n') + '\n');
console.log(report.length ? report.join('\n') : 'no issues logged');
