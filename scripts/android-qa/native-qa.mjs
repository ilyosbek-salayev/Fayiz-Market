// Native features of the real v1.1.x APKs on an Android 14 EMULATOR (this is NOT a physical-phone test).
// Requires: a booted emulator with a PIN and an enrolled virtual fingerprint (id 1), both APKs installed, and an
// isolated local Worker:  QA_PORT=8791 scripts/deploy-qa/local-worker.sh <tmp-db>
// The apps are pointed at http://127.0.0.1:8791 through `adb reverse` + their own debug preferences, and are
// pointed back to production at the end. No uninstall, no data wipe.
//   node scripts/android-qa/native-qa.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { adb, findNode, launch, pause, screenshot, setApiUrl, sh, tapNode, webview } from './lib.mjs';

const PORT = 8791, API = `http://127.0.0.1:${PORT}`, OUT = 'scripts/android-qa/shots';
mkdirSync(OUT, { recursive: true });
const results = []; const check = (ok, name, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };
const shot = name => writeFileSync(`${OUT}/${name}.png`, screenshot());
const call = async (p, { method = 'GET', auth, body, headers = {} } = {}) => { const r = await fetch(API + p, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(auth ? { Authorization: auth } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, data: await r.json().catch(() => null) }; };
const finger = async (id = 1) => { adb('emu', 'finger', 'touch', String(id)); await pause(700); try { adb('emu', 'finger', 'remove', String(id)); } catch { /* older emulator */ } };
const geo = (lat, lng) => adb('emu', 'geo', 'fix', String(lng), String(lat));
const allowPermission = () => tapNode(/^(While using the app|Only this time|Allow|ALLOW)\|/i, 6000);
const notifications = pkg => sh('dumpsys notification --noredact').split('NotificationRecord(').filter(r => r.includes(`pkg=${pkg}`));
const waitNode = async (pattern, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { const n = findNode(pattern); if (n) return n; await pause(500); } return null; };
const C = 'uz.fayzmarket.customer', A = 'uz.fayzmarket.admin';

try {
  // ---------- Setup (local Worker only) ----------
  adb('reverse', `tcp:${PORT}`, `tcp:${PORT}`); sh('cmd statusbar collapse');
  const stamp = Date.now().toString(36);
  let r = await call('/admin/bootstrap', { method: 'POST', headers: { 'X-Bootstrap-Secret': 'qa-bootstrap' }, body: { email: 'owner@emu.example', password: 'OwnerPassword-123' } });
  r = await call('/admin/login', { method: 'POST', body: { email: 'owner@emu.example', password: 'OwnerPassword-123' } }); const owner = 'Bearer ' + r.data.token;
  r = await call('/admin/categories', { method: 'POST', auth: owner, body: { name: 'Soatlar', slug: `soat-${stamp}` } }); const categoryId = r.data.id;
  r = await call('/admin/products', { method: 'POST', auth: owner, body: { name: 'Emulyator soati', slug: `soat-${stamp}`, description: '', categoryId, price: 150000, stock: 20, active: true, featured: true, images: [] } }); const productId = r.data.id;
  await call('/admin/users', { method: 'POST', auth: owner, body: { email: 'kuryer@emu.example', password: 'CourierPass-123', role: 'courier', name: 'Emu Kuryer', phone: '+998901234500' } });
  await call('/admin/integrations/store_location', { method: 'PUT', auth: owner, body: { store_address: 'Toshkent, Chorsu', store_lat: '41.3264', store_lng: '69.2286' } });
  setApiUrl(C, API); setApiUrl(A, API);

  // ================= Customer app =================
  sh(`pm revoke ${C} android.permission.ACCESS_FINE_LOCATION`); sh(`pm revoke ${C} android.permission.ACCESS_COARSE_LOCATION`);
  launch(C); let c = await webview(C, 9411);
  await c.waitFor(() => document.body.innerText.includes('Emulyator soati') || document.body.innerText.includes('Katalog'), 40000);
  check((await c.evaluate(() => location.origin)) === API, 'customer: bundled UI served under the configured API origin', await c.evaluate(() => location.href));
  check((await c.evaluate(() => FayzNative.biometricStatus())) === 'available', 'customer: BiometricManager reports an enrolled fingerprint');

  // Account (phone + dev OTP on the local Worker), then fingerprint lock.
  const phone = '+99890' + String(Date.now()).slice(-7);
  r = await call('/auth/otp', { method: 'POST', body: { phone, purpose: 'register' } });
  r = await call('/auth/register', { method: 'POST', body: { phone, code: r.data.devCode, password: 'CustomerPass-123', name: 'Emu Mijoz' } });
  const customerToken = r.data.token;
  await c.evaluate(t => { FayzNative.biometricDisable(); localStorage.removeItem('fayz_bio_login'); localStorage.setItem('fayz_customer_token', t); }, customerToken); await c.evaluate(() => location.reload()); await pause(2500);
  c.close(); c = await webview(C, 9411);
  await c.waitFor(() => !!document.querySelector('.tabbar'), 30000);
  await c.click('Profil', '.tabbar button'); await c.waitFor(() => document.body.innerText.includes('Emu Mijoz'), 15000);
  check(await c.waitFor(() => !!document.querySelector('.toggle-row input[type=checkbox]'), 8000), 'customer: "Barmoq izi bilan kirish" offered in profile');
  await c.evaluate(() => document.querySelector('.toggle-row input[type=checkbox]').click());
  const prompt = await waitNode(/fingerprint|Barmoq izi|Fayz Market/i, 8000);
  check(!!prompt, 'customer: system BiometricPrompt shown', prompt?.label);
  shot('c-biometric-prompt'); await finger(1); await pause(1500);
  const stored = await c.evaluate(() => FayzNative.biometricStored() && localStorage.getItem('fayz_bio_login') === '1' && !localStorage.getItem('fayz_customer_token'));
  check(stored, 'customer: session token encrypted with the Keystore key; plain token removed from WebView storage');
  // Relaunch → locked → wrong finger refused → enrolled finger unlocks.
  sh(`am force-stop ${C}`); launch(C); c.close(); c = await webview(C, 9411);
  check(await c.waitFor(() => document.body.innerText.includes('Barmoq izi bilan ochish'), 20000), 'customer: app opens on the fingerprint lock screen');
  await c.click('Barmoq izi bilan ochish'); await pause(1500); await finger(9); await pause(1500); // id 9 is never enrolled
  check(!(await c.evaluate(() => document.body.innerText.includes('Emu Mijoz'))), 'customer: an unenrolled finger does not unlock');
  await finger(1);
  const unlocked = await c.waitFor(() => !document.body.innerText.includes('Barmoq izi bilan ochish') && !!document.querySelector('.tabbar'), 15000);
  await c.click('Profil', '.tabbar button').catch(() => undefined); await pause(1200);
  check(unlocked && await c.evaluate(() => document.body.innerText.includes('Emu Mijoz')), 'customer: enrolled fingerprint decrypts the session and unlocks');
  shot('c-unlocked');

  // GPS + interactive OpenFreeMap map in checkout.
  geo(41.3655, 69.2849);
  await c.click('Katalog', '.tabbar button'); await pause(1000);
  await c.evaluate(() => [...document.querySelectorAll('.pcard-hit')].find(x => x.textContent.includes('Emulyator soati')).click()); await pause(1200);
  await c.click('Savatga qoʻshish', '.action-bar button'); await pause(600);
  await c.click('Savat', '.tabbar button'); await pause(800); await c.click('Buyurtma berish', '.action-bar button'); await pause(1200);
  await c.click('Xaritadan manzil tanlash', '.sheet button');
  const drawn = await c.waitFor(() => { const cv = document.querySelector('.map-box[data-provider=openfreemap] canvas.maplibregl-canvas'); return !!cv && cv.getBoundingClientRect().height > 200; }, 40000);
  await pause(4000);
  check(drawn, 'customer: MapLibre + OpenFreeMap draws in the Android WebView (WebGL, no API key)');
  shot('c-map-openfreemap');
  await c.click('Joylashuvimni aniqlash', '.sheet button');
  const dialog = await allowPermission();
  check(!!dialog, 'customer: Android runtime location permission requested by the shell', dialog?.label);
  // The emulator reports the fix in float precision (41.365498…), so compare to ~1 m.
  check(await c.waitFor(() => /41\.3654(9\d|5\d), 69\.2848(9\d)|41\.3655\d\d, 69\.2849\d\d/.test(document.body.innerText), 20000), 'customer: emulator GPS fix reaches the WebView and centres the map pin');
  shot('c-gps-located');
  await c.click('Shu joyni tasdiqlash', '.sheet button'); await pause(600);
  await c.setValue('.sheet input[autocomplete=name]', 'Emu Mijoz'); await c.setValue('.sheet input[autocomplete=tel]', phone);
  await c.setValue('.sheet textarea[autocomplete=street-address]', 'Toshkent, Yunusobod 4-mavze, 12-uy');
  await c.click('Buyurtmani yuborish', '.sheet-foot button'); await pause(2500);
  shot('c-after-submit');
  const placed = (await c.text()).match(/FM-[A-Z0-9-]+/)?.[0];
  if (!placed) console.log('  checkout state:', JSON.stringify(await c.evaluate(() => ({ alerts: [...document.querySelectorAll('.banner, [role=alert], .field-error')].map(b => b.textContent), inputs: [...document.querySelectorAll('.sheet input, .sheet textarea')].map(i => (i.getAttribute('autocomplete') || i.placeholder) + '=' + i.value) }))));
  r = await call('/customer/orders', { auth: 'Customer ' + customerToken }); const order = r.data.orders.find(o => o.orderNumber === placed);
  check(Math.abs((order?.location?.lat ?? 0) - 41.3655) < 0.00002 && Math.abs((order?.location?.lng ?? 0) - 69.2849) < 0.00002, 'customer: order stored with the GPS coordinates', `${placed} ${order?.location?.lat},${order?.location?.lng}`);

  // ================= Admin app: notification + tap-to-open, camera =================
  launch(A); let a = await webview(A, 9412);
  await a.waitFor(() => !!document.querySelector('input[type=email]'), 30000);
  await allowPermission(); // Android 13+: notification permission for targetSdk < 33 apps on first launch
  sh(`pm grant ${A} android.permission.POST_NOTIFICATIONS`);
  await a.setValue('input[type=email]', 'owner@emu.example'); await a.setValue('input[type=password]', 'OwnerPassword-123');
  await a.click('Kirish'); await a.waitFor(() => document.body.innerText.includes('Kunlik savdo'), 20000);
  await pause(3000); // first poll sets the baseline
  r = await call('/orders', { method: 'POST', body: { customerName: 'Bildirishnoma Sinov', phone: '+998907770000', address: 'Toshkent, Mirobod 1', note: '', items: [{ productId, quantity: 1 }] } });
  const notifyOrder = r.data.order;
  sh('input keyevent KEYCODE_HOME'); // app in background: the poll keeps running while Android lets the process live
  let posted = false; for (let i = 0; i < 40 && !posted; i++) { posted = notifications(A).some(x => x.includes(notifyOrder.orderNumber) || x.includes('Yangi buyurtma')); if (!posted) await pause(1000); }
  check(posted, 'admin: Android system notification posted from the polling feed (app in background)');
  const rec = notifications(A).find(x => x.includes('Yangi buyurtma')) || '';
  check(/channel=operations|ChannelId=operations|operations/.test(rec) && /vis=PRIVATE|visibility=PRIVATE|VISIBILITY_PRIVATE/i.test(rec), 'admin: channel "operations", lock-screen visibility private');
  sh('cmd statusbar expand-notifications'); await pause(1500); shot('a-notification-shade');
  const tapped = await tapNode(/Yangi buyurtma/, 8000);
  check(!!tapped, 'admin: notification visible in the shade and tapped');
  a.close(); a = await webview(A, 9412);
  check(await a.waitFor(n => document.body.innerText.includes(n) && !!document.querySelector('.modal'), 15000, notifyOrder.orderNumber), 'admin: tapping the notification opens that order', notifyOrder.orderNumber);
  shot('a-order-opened');
  await a.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));

  // Camera → ACTION_IMAGE_CAPTURE → CaptureProvider → upload to (local) R2.
  await a.click('Mahsulotlar', '.side-nav button, .tabbar button, nav button').catch(() => undefined); await pause(1500);
  await a.click('Mahsulot qoʻshish'); await a.waitFor(() => document.body.innerText.includes('Kamerada suratga olish'), 10000);
  await a.click('Kamerada suratga olish', 'button.image-upload');
  let cameraOpen = false; for (let i = 0; i < 20 && !cameraOpen; i++) { cameraOpen = /com\.android\.camera|camera2/.test(sh('dumpsys activity activities | grep -E "topResumedActivity|mResumedActivity" || true')); if (!cameraOpen) { await allowPermission(); await pause(800); } }
  check(cameraOpen, 'admin: camera intent opens the system camera app');
  for (let i = 0; i < 4; i++) { const n = findNode(/^(NEXT|Next|NO THANKS|No thanks|Skip|OK|While using the app|Only this time|Allow)\|/); if (!n) break; sh(`input tap ${n.x} ${n.y}`); await pause(1000); }
  await pause(1500); shot('a-camera-app');
  const shutter = await tapNode(/shutter_button|Shutter/i, 8000);
  await pause(3500);
  const done = await tapNode(/done_button|Done|OK/i, 8000);
  check(!!shutter && !!done, 'admin: photo taken and confirmed in the camera app');
  a.close(); a = await webview(A, 9412);
  const preview = await a.waitFor(() => { const img = document.querySelector('.picker-preview img'); return !!img && img.src.startsWith('blob:') && img.naturalWidth > 0; }, 20000);
  check(preview, 'admin: captured photo returned to the WebView as a resized preview', await a.evaluate(() => document.querySelector('.picker-preview .t-caption')?.textContent || ''));
  if (preview) await a.click('Yuklash', '.picker-actions button');
  const uploaded = await a.waitFor(() => [...document.querySelectorAll('.modal img')].some(img => /\/images\//.test(img.src) && img.naturalWidth > 0), 30000);
  check(uploaded, 'admin: photo uploaded and shown from storage (R2 via local Worker)', uploaded ? '' : JSON.stringify(await a.evaluate(() => ({ imgs: [...document.querySelectorAll('.modal img')].map(i => i.src.slice(0, 60)), banners: [...document.querySelectorAll('.modal .banner, .modal [role=alert]')].map(b => b.textContent) }))));
  shot('a-camera-uploaded');
  const gallery = sh('content query --uri content://media/external/images/media --projection _display_name 2>/dev/null | grep -c "photo-" || true');
  check(gallery.trim() === '0', 'admin: photo not saved to the device gallery (app cache only)');
  await a.evaluate(() => [...document.querySelectorAll('.modal button')].find(b => b.textContent.includes('Bekor qilish'))?.click());

  // ================= Courier: GPS sharing from the admin app =================
  await call(`/admin/orders/${order.id}/status`, { method: 'PATCH', auth: owner, body: { status: 'confirmed' } });
  const courierId = (await call('/admin/couriers', { auth: owner })).data.couriers[0].id;
  r = await call(`/admin/orders/${order.id}/assign`, { method: 'POST', auth: owner, body: { courierId } });
  check(r.status === 200, 'setup: courier assigned to the GPS order', String(r.status));
  await a.evaluate(() => { sessionStorage.clear(); localStorage.removeItem('fayz_admin_bio'); location.reload(); }); await pause(2500);
  a.close(); a = await webview(A, 9412);
  sh(`pm revoke ${A} android.permission.ACCESS_FINE_LOCATION`); sh(`pm revoke ${A} android.permission.ACCESS_COARSE_LOCATION`);
  a.close(); launch(A); a = await webview(A, 9412);
  await a.waitFor(() => !!document.querySelector('input[type=email]'), 30000);
  await a.setValue('input[type=email]', 'kuryer@emu.example'); await a.setValue('input[type=password]', 'CourierPass-123');
  await a.click('Kirish'); await a.waitFor(() => document.body.innerText.includes('Kuryer paneli'), 20000);
  geo(41.3300, 69.2500);
  await a.evaluate(n => [...document.querySelectorAll('.delivery-card')].find(x => x.textContent.includes(n)).click(), placed); await pause(1500);
  for (const label of ['Qabul qilish', 'Doʻkondan oldim', 'Yoʻlga chiqdim']) { await a.click(label, '.courier-actions button'); await pause(1500); if (label === 'Qabul qilish') await allowPermission(); }
  await allowPermission();
  let t = null; for (let i = 0; i < 30; i++) { t = (await call(`/orders/${order.id}/tracking`, { auth: 'Customer ' + customerToken })).data; if (t?.courier) break; await pause(1000); }
  check(Math.abs((t?.courier?.lat ?? 0) - 41.33) < 0.0005 && Math.abs((t?.courier?.lng ?? 0) - 69.25) < 0.0005 && t.courier.live, 'courier: real WebView watchPosition shares the emulator GPS fix', JSON.stringify(t?.courier));
  geo(41.3400, 69.2600); // ~1.4 km away
  let moved = false; for (let i = 0; i < 45 && !moved; i++) { t = (await call(`/orders/${order.id}/tracking`, { auth: 'Customer ' + customerToken })).data; moved = Math.abs((t?.courier?.lat ?? 0) - 41.34) < 0.0005; if (!moved) await pause(1000); }
  check(moved, 'courier: movement is pushed again (≥15 s / ≥30 m rule)', JSON.stringify(t?.courier));
  check(await a.evaluate(() => document.body.innerText.includes('Joylashuv ulashilmoqda')), 'courier: on-screen sharing indicator');
  shot('k-sharing');
} catch (error) {
  check(false, 'script completed', String(error?.stack || error));
} finally {
  // Back to production defaults on the emulator; nothing is uninstalled or wiped.
  try { setApiUrl(C, ''); setApiUrl(A, ''); adb('reverse', '--remove', `tcp:${PORT}`); } catch { /* emulator gone */ }
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed (Android 14 emulator — not a physical device)`);
process.exit(results.every(Boolean) ? 0 : 1);
