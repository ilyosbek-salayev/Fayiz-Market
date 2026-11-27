// READ-ONLY probe on an Android device/emulator: inside each installed APK's real WebView (bundled UI under the
// configured API origin), loads the bundled MapLibre chunk with the bundled Web Worker file that
// packages/ui/src/maps.tsx registers via setWorkerUrl, draws an OpenFreeMap map and waits for tiles.
// This is the check a desktop/Chrome E2E cannot replace: the worker script must be served by the APK's
// shouldInterceptRequest from /__app/assets, not fetched from the network (production answers 404 there).
// Nothing is signed in and nothing is written to the API.
//   node scripts/android-qa/map-worker-probe.mjs
import { readdirSync } from 'node:fs';
import { launch, pause, sh, webview, requireDevice } from './lib.mjs';
requireDevice(import.meta.url.split('/').pop());

const results = []; const check = (ok, name, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };
for (const [pkg, app, port] of [['uz.fayzmarket.customer', 'customer', 9461], ['uz.fayzmarket.admin', 'admin', 9462]]) {
  const assets = readdirSync(`apps/android/${app}/src/main/assets/assets`);
  const mapFile = assets.find(f => /^maplibre-gl-[^.]+\.js$/.test(f) && !f.includes('worker'));
  const workerFile = assets.find(f => /^maplibre-gl-worker-.+\.js$/.test(f));
  sh(`am force-stop ${pkg}`); launch(pkg); await pause(1500);
  const w = await webview(pkg, port);
  await w.waitFor(() => document.readyState === 'complete' && document.body.innerText.length > 20, 40000);
  const origin = await w.evaluate(() => location.origin);
  const appRefersWorker = await w.evaluate(async file => {
    const scripts = [...document.querySelectorAll('script[src]')].map(s => s.src);
    for (const src of scripts) if ((await (await fetch(src)).text()).includes(file)) return true;
    return false;
  }, workerFile);
  check(appRefersWorker, `${pkg}: app bundle registers the bundled worker (${workerFile})`);
  const served = await w.evaluate(async file => { const r = await fetch('/__app/assets/' + file); return `${r.status} ${r.headers.get('content-type')}`; }, workerFile);
  check(/^200 /.test(served), `${pkg}: worker script served by the APK (shouldInterceptRequest)`, served);
  const result = await w.evaluate(async ({ mapFile, workerFile }) => {
    const mod = await import('/__app/assets/' + mapFile); const ml = mod.default ?? mod;
    ml.setWorkerUrl('/__app/assets/' + workerFile);
    const el = document.createElement('div'); el.style.cssText = 'position:fixed;left:0;top:0;width:360px;height:360px;z-index:99999'; document.body.appendChild(el);
    const map = new ml.Map({ container: el, style: 'https://tiles.openfreemap.org/styles/liberty', center: [69.2797, 41.3111], zoom: 12, attributionControl: { compact: true } });
    const outcome = await new Promise(resolve => {
      const timer = setTimeout(() => resolve('timeout'), 45000);
      map.once('idle', () => { clearTimeout(timer); resolve(map.areTilesLoaded() ? 'loaded' : 'no tiles'); });
      map.on('error', e => { clearTimeout(timer); resolve('error: ' + String(e.error?.message || e.error)); });
    });
    const canvas = el.querySelector('canvas.maplibregl-canvas');
    const size = canvas ? `${canvas.width}x${canvas.height}` : 'no canvas';
    map.remove(); el.remove();
    return `${outcome}; canvas ${size}; ${navigator.userAgent.match(/Chrome\/[\d.]+/)?.[0]}`;
  }, { mapFile, workerFile });
  check(result.startsWith('loaded'), `${pkg}: MapLibre worker + OpenFreeMap tiles draw inside the APK WebView`, `${result}; origin ${origin}`);
  w.close();
}
const device = sh('getprop ro.product.model') + ' / Android ' + sh('getprop ro.build.version.release') + (sh('getprop ro.kernel.qemu') === '1' ? ' (EMULATOR)' : ' (physical device)');
console.log(`\n${results.filter(Boolean).length}/${results.length} passed — ${device}`);
process.exit(results.every(Boolean) ? 0 : 1);
