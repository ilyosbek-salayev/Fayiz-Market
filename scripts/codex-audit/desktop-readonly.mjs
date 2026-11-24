// Starts the candidate with a temporary profile. Does not log in or write to production.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const require = createRequire(new URL('../ui-qa/package.json', import.meta.url));
const puppeteer = require('puppeteer-core');
const asar = require('@electron/asar');
const profile = await mkdtemp(join(tmpdir(), 'fayz-desktop-audit-'));
// DESKTOP_RELEASE_DIR / QA_EVIDENCE_DIR let a later release candidate be smoke-tested without overwriting old evidence.
const releaseDir = process.env.DESKTOP_RELEASE_DIR || 'apps/desktop/release-audit-1.1.2';
const evidence = process.env.QA_EVIDENCE_DIR || 'docs/codex-audit/evidence';
const app = resolve(releaseDir, 'mac-arm64/Fayz Market Admin.app/Contents/MacOS/Fayz Market Admin');
const child = spawn(app, ['--remote-debugging-port=9417', `--user-data-dir=${profile}`], { stdio: 'ignore' });
let browser, passed = 0;
const check = (value, name) => { if (!value) throw new Error(name); passed++; console.log('PASS ' + name); };
try {
 for(let i=0;i<60;i++) { try { browser=await puppeteer.connect({browserURL:'http://127.0.0.1:9417',defaultViewport:null}); break; } catch {} await new Promise(r=>setTimeout(r,500)); }
 check(!!browser,'packaged app launches');
 let page;
 for(let i=0;i<30;i++) { page=(await browser.pages()).find(p=>p.url().startsWith('file:')); if(page)break; await new Promise(r=>setTimeout(r,300)); }
 check(!!page,'bundled file UI loads');
 await page.waitForSelector('input[type=email]',{timeout:20000});
 check(await page.$('input[type=password]'),'login form renders');
 check(await page.evaluate(()=>typeof window.require === 'undefined' && typeof window.process === 'undefined'),'renderer has no Node globals');
 check(await page.evaluate(()=>typeof window.fayzDesktop.request === 'function'),'isolated preload bridge available');
 check(await page.evaluate(async()=>!(await window.fayzDesktop.loadSession())),'temporary profile has no saved session');
 check(await page.evaluate(async()=>{const r=await window.fayzDesktop.request({path:'/categories',method:'GET'});return r.status===200 && Array.isArray(r.data.categories); }),'production categories read via IPC');
 check(await page.evaluate(async()=>{try{await window.fayzDesktop.request({path:'https://evil.example',method:'GET'});return false;}catch{return true;}}),'IPC rejects external API path');
 await page.screenshot({path:`${evidence}/desktop-login.png`});
 const entries = asar.listPackage(resolve(releaseDir, 'mac-arm64/Fayz Market Admin.app/Contents/Resources/app.asar'));
 const mapFile = entries.find(p => /\/assets\/maplibre-gl-[^-]+.*\.js$/.test(p) && !p.includes('worker')).split('/').pop();
 const workerFile = entries.find(p => /\/assets\/maplibre-gl-worker-.*\.js$/.test(p))?.split('/').pop();
 check(!!workerFile, 'packaged map worker asset present');
 // The app's own map code (packages/ui/src/maps.tsx → setWorkerUrl) must reference exactly this packaged worker file.
 const asarPath = resolve(releaseDir, 'mac-arm64/Fayz Market Admin.app/Contents/Resources/app.asar');
 const appChunks = entries.filter(p => /\/assets\/index-.*\.js$/.test(p)).map(p => asar.extractFile(asarPath, p.replace(/^[\\/]/, '')).toString('utf8'));
 check(appChunks.some(code => code.includes(workerFile)), 'app bundle points setWorkerUrl at the packaged worker: ' + workerFile);
 const mapResult = await page.evaluate(async ({ mapFile, workerFile }) => {
   const ml = await import('./assets/' + mapFile);
   ml.setWorkerUrl(new URL('./assets/' + workerFile, location.href).href);
   const el = document.createElement('div'); el.style.cssText='position:fixed;inset:40px;width:600px;height:400px';document.body.appendChild(el);
   const map = new ml.Map({container:el,style:'https://tiles.openfreemap.org/styles/liberty',center:[69.2797,41.3111],zoom:12});
   const result = await new Promise(resolve=>{const timer=setTimeout(()=>resolve('timeout'),25000);map.once('idle',()=>{clearTimeout(timer);resolve(map.areTilesLoaded()?'loaded':'no tiles');}); map.on('error',e=>{clearTimeout(timer);resolve(String(e.error?.message));});});
   map.remove();el.remove();return result;
 }, {mapFile,workerFile});
 check(mapResult==='loaded', 'packaged MapLibre/OpenFreeMap draws through file origin: '+mapResult);
 console.log(`${passed}/${passed} passed`);
} finally { if(browser) await browser.disconnect(); child.kill('SIGTERM'); }
