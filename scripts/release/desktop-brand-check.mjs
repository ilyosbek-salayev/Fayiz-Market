// Packaged desktop admin (read-only): the login screen shows the approved brand symbol, and the Windows build
// carries the same web bundle as the macOS build. No login, no writes.
//   DESKTOP_RELEASE_DIR=apps/desktop/release SHOT=docs/v1/screenshots/desktop-login.png node scripts/release/desktop-brand-check.mjs
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const require = createRequire(new URL('../ui-qa/package.json', import.meta.url));
const puppeteer = require('puppeteer-core');
const asar = require('@electron/asar');
const dir = process.env.DESKTOP_RELEASE_DIR || 'apps/desktop/release';
let passed = 0, failed = 0;
const check = (ok, name, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && extra ? ' — ' + extra : ''}`); ok ? passed++ : failed++; };
const files = archive => Object.fromEntries(asar.listPackage(archive).filter(f => f.startsWith('/web/') && !asar.statFile(archive, f.slice(1)).files).map(f => [f, createHash('sha256').update(asar.extractFile(archive, f.slice(1))).digest('hex')]));
const mac = files(resolve(dir, 'mac-arm64/Fayz Market Admin.app/Contents/Resources/app.asar')), win = files(resolve(dir, 'win-unpacked/resources/app.asar'));
check(Object.keys(mac).length > 5 && JSON.stringify(mac) === JSON.stringify(win), `Windows and macOS installers carry the identical web bundle (${Object.keys(mac).length} files)`);
check(Object.keys(mac).some(f => /mark-light-.*\.webp$/.test(f)) && Object.keys(mac).some(f => /mark-dark-.*\.webp$/.test(f)), 'bundle contains the light and dark brand symbols');
const profile = await mkdtemp(join(tmpdir(), 'fayz-desktop-brand-'));
const child = spawn(resolve(dir, 'mac-arm64/Fayz Market Admin.app/Contents/MacOS/Fayz Market Admin'), ['--remote-debugging-port=9418', `--user-data-dir=${profile}`], { stdio: 'ignore' });
try {
  let browser; for (let i = 0; i < 60 && !browser; i++) { try { browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9418', defaultViewport: null }); } catch { await new Promise(r => setTimeout(r, 500)); } }
  let page; for (let i = 0; i < 30 && !page; i++) { page = (await browser.pages()).find(p => p.url().startsWith('file:')); if (!page) await new Promise(r => setTimeout(r, 300)); }
  await page.waitForSelector('.login-brand img.brand-mark', { timeout: 20000 });
  await new Promise(r => setTimeout(r, 1500));
  const mark = await page.$eval('.login-brand img.brand-mark', el => ({ src: el.getAttribute('src'), w: el.naturalWidth }));
  check(mark.w > 0 && /mark-light/.test(mark.src), 'packaged login screen shows the new brand symbol', JSON.stringify(mark));
  check((await page.evaluate(() => document.body.innerText)).includes('Fayz Market V1'), 'login footer reads "Fayz Market V1"');
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  await browser.disconnect();
} catch (e) { check(false, 'desktop brand check completed', String(e)); }
finally { child.kill(); console.log(`${passed}/${passed + failed} passed`); process.exitCode = failed ? 1 : 0; }
