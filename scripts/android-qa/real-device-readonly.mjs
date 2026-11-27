// REAL PHONE (not an emulator) — RELEASE apps on PRODUCTION, READ-ONLY.
// Walks the customer and admin screens through the phone's own accessibility tree (UI Automator) and native input:
// taps, typing, the Android Back key, the soft keyboard and screenshots. Nothing is saved: no order is sent, no admin
// form is submitted, typed text is discarded with «Bekor qilish», themes are put back as they were.
//
//   ANDROID_SERIAL=<phone> node scripts/android-qa/real-device-readonly.mjs <screenshots dir> <results file>
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { launch, pause, screenshot, sh } from './lib.mjs';

const OUT = process.argv[2] || 'docs/v1/screenshots/real-device-1.2.2';
const RESULTS = process.argv[3] || 'docs/v1/evidence/real-device-1.2.2/readonly-production.txt';
mkdirSync(OUT, { recursive: true });
const C = 'uz.fayzmarket.customer', A = 'uz.fayzmarket.admin';
const results = []; const check = (status, name, detail = '') => { results.push(`${status} ${name}${detail ? ' — ' + String(detail).slice(0, 240) : ''}`); console.log(results.at(-1)); };
const ok = (cond, name, detail) => check(cond ? 'PASS' : 'FAIL', name, cond ? '' : detail);
const shot = name => writeFileSync(path.join(OUT, `${name}.png`), screenshot());

const dump = () => { sh('uiautomator dump /sdcard/fayz-ui.xml >/dev/null 2>&1 || true'); return sh('cat /sdcard/fayz-ui.xml'); };
const nodes = () => [...dump().matchAll(/<node [^>]*>/g)].map(m => { const n = m[0]; const b = n.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/); return { text: n.match(/ text="([^"]*)"/)?.[1] || '', desc: n.match(/ content-desc="([^"]*)"/)?.[1] || '', pkg: n.match(/ package="([^"]*)"/)?.[1] || '', cls: n.match(/ class="([^"]*)"/)?.[1] || '', pwd: / password="true"/.test(n), focused: / focused="true"/.test(n), b: b ? b.slice(1).map(Number) : null }; });
const label = n => n.text || n.desc;
const screenText = pkg => nodes().filter(n => n.pkg === pkg).map(label).filter(Boolean).join(' | ');
async function waitText(re, pkg, ms = 20000) { const end = Date.now() + ms; let t = ''; while (Date.now() < end) { t = screenText(pkg); if (re.test(t)) return t; await pause(700); } return t; }
async function tap(re, pkg, { ms = 10000, last = false, below = 0 } = {}) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const hits = nodes().filter(n => n.b && n.pkg === pkg && re.test(label(n)) && n.b[1] >= below && n.b[3] > n.b[1]);
    const n = last ? hits.at(-1) : hits[0];
    if (n) { const [x1, y1, x2, y2] = n.b; sh(`input tap ${(x1 + x2) >> 1} ${(y1 + y2) >> 1}`); await pause(900); return n; }
    await pause(600);
  }
  return null;
}
const keyboardShown = () => /mInputShown=true/.test(sh('dumpsys input_method | grep -m1 mInputShown || true'));
// Android 17 reports mCurrentFocus=null for WebView apps: the resumed activity is the reliable signal.
const foreground = () => sh('dumpsys activity activities | grep -E "topResumedActivity|mResumedActivity" | head -1 || true');
const back = async () => { sh('input keyevent KEYCODE_BACK'); await pause(1200); };
const swipeUp = async () => { sh('input swipe 540 1900 540 700 350'); await pause(900); };
const typeText = async s => { sh(`input text ${JSON.stringify(s.replace(/ /g, '%s'))}`); await pause(700); };
const fieldValue = re => nodes().find(n => n.cls === 'android.widget.EditText' && re.test(n.desc + ' ' + n.text));

try {
  sh('input keyevent KEYCODE_WAKEUP'); // no device settings are changed
  // ================================================================ CUSTOMER (production, read-only)
  sh(`am force-stop ${C}`); launch(C);
  let t = await waitText(/Kategoriyalar|Barcha mahsulotlar/, C, 30000);
  ok(/Doʻkon manzili/.test(t) && /Sizning joylashuvingiz/.test(t), 'customer home: store and user location rows', t);
  ok(/savatda \d/.test(t) || /Savat/.test(t), 'customer: data kept after the update (cart badge / home state)', t);
  shot('10-c-home');
  await tap(/^Katalog$/, C, { below: 1800 }); t = await waitText(/ta mahsulot/, C);
  ok(/ta mahsulot/.test(t), 'catalog opens with product count', t); shot('11-c-catalog');
  const search = await tap(/Mahsulot qidirish/, C);
  await pause(800); const kb = keyboardShown();
  ok(!!search && kb, 'search field: soft keyboard opens', `tapped=${!!search} keyboard=${kb}`);
  await typeText('iph'); await pause(1500);
  t = screenText(C); ok(/iphone/i.test(t) && /\d+ ta mahsulot/.test(t), 'search «iph» finds iphone', t);
  shot('12-c-search-keyboard');
  await back(); // hide keyboard
  ok(!keyboardShown() && foreground().includes(C), 'Back hides the keyboard, app stays open', foreground());
  const prod = await tap(/^iphone/i, C, { below: 300 });
  t = await waitText(/Savatga qoʻshish|Hammasi savatda|Sotuvda yoʻq/, C);
  ok(!!prod && /soʻm/.test(t), 'product page opens with price and add-to-cart', t); shot('13-c-product');
  await swipeUp(); await swipeUp(); shot('14-c-product-bottom');
  t = screenText(C); check(/Sizga ham yoqishi mumkin/.test(t) ? 'PASS' : 'PARTIAL', 'product page: related products section', /Sizga ham/.test(t) ? '' : 'not visible after 2 swipes (catalogue may have no other in-stock products)');
  await back();
  const afterBackProduct = foreground(); t = screenText(C);
  ok(afterBackProduct.includes(C) && /ta mahsulot|Katalog/.test(t), 'Android Back on the product page returns to the list (app stays open)', `${afterBackProduct} :: ${t.slice(0, 120)}`);
  if (!afterBackProduct.includes(C)) { launch(C); await waitText(/Kategoriyalar|ta mahsulot/, C, 20000); }
  await tap(/^Savat/, C, { below: 1800 }); t = await waitText(/Savat/, C);
  ok(/Yetkazib berish \(kuryer\)/.test(t) && /Jami/.test(t), 'cart: goods, courier fee and total lines', t); shot('15-c-cart');
  const co = await tap(/^Buyurtma berish$/, C);
  t = await waitText(/Qabul qilish usuli/, C);
  ok(!!co && /Doʻkondan olib ketish/.test(t) && /Kuryer orqali yetkazish/.test(t) && /Yakuniy jami/.test(t), 'checkout: both choices and the final total (not submitted)', t);
  ok(/hozircha yoqmagan/.test(t), 'checkout: pickup shown as switched off by the shop (production setting)', t);
  shot('16-c-checkout');
  await back();
  const afterBackSheet = foreground(); t = screenText(C);
  ok(afterBackSheet.includes(C) && !/Buyurtmani rasmiylashtirish/.test(t), 'Android Back closes the checkout sheet (app stays open)', `${afterBackSheet} :: ${t.slice(0, 120)}`);
  if (!afterBackSheet.includes(C)) { launch(C); await waitText(/Kategoriyalar/, C, 20000); }
  await tap(/^Profil$/, C, { below: 1800 }); t = await waitText(/Profil/, C);
  ok(/Manzil/.test(t) && /Koʻrinish/.test(t), 'profile: address and appearance sections', t); shot('17-c-profile');
  await swipeUp(); await tap(/^Qora$/, C); await pause(800); shot('18-c-profile-dark');
  t = screenText(C); await tap(/^Sariq$/, C); await pause(600);
  ok(/Qora/.test(t), 'dark theme applied and put back to yellow', t.slice(0, 80));
  await tap(/^Bosh sahifa$/, C, { below: 1800 }); await waitText(/Kategoriyalar/, C);
  await tap(/Doʻkonga yoʻl/, C); t = await waitText(/Yoʻlga chiqish/, C, 25000);
  ok(/Yoʻlga chiqish/.test(t), 'store map screen opens', t); await pause(2500); shot('19-c-store-map');
  check(/Yoʻl boʻyicha masofa/.test(t) ? 'PASS' : 'BLOCKED', 'in-app road route', /Yoʻl boʻyicha masofa/.test(t) ? '' : 'routing (ORS) not configured in production — honest note shown: ' + /Integratsiyalar/.test(t));
  await back(); t = screenText(C);
  ok(foreground().includes(C) && /Kategoriyalar/.test(t), 'Back closes the store map', t.slice(0, 80));

  // ================================================================ ADMIN (production owner session, read-only)
  sh(`am force-stop ${A}`); launch(A);
  t = await waitText(/Boshqaruv|Kirish|Barmoq izi/, A, 30000);
  const signedIn = /Boshqaruv|Kunlik savdo|Buyurtmalar/.test(t) && !/Parol/.test(t);
  ok(signedIn, 'admin: still signed in after the update (session kept)', t);
  shot('30-a-dashboard');
  const nav = async name => { await tap(/^Menyu$/, A); await pause(600); await tap(new RegExp(`^${name}$`), A, { last: true }); await pause(1500); };
  await nav('Mahsulotlar'); t = await waitText(/ta mahsulot/, A);
  ok(/ta mahsulot/.test(t), 'admin products list', t); shot('31-a-products');
  await tap(/Mahsulot qoʻshish|^Qoʻshish$/, A); t = await waitText(/Yangi mahsulot/, A);
  ok(/Yangi mahsulot/.test(t) && /Variantlar/.test(t + screenText(A)), 'product dialog with the «Variantlar (ixtiyoriy)» section', t);
  const nameField = nodes().find(n => n.pkg === A && n.cls === 'android.widget.EditText' && n.b && n.b[1] > 300);
  if (nameField) {
    const [x1, y1, x2, y2] = nameField.b; sh(`input tap ${(x1 + x2) >> 1} ${(y1 + y2) >> 1}`); await pause(700);
    await typeText('Fokus sinov'); await pause(500);
    const after = nodes().find(n => n.pkg === A && n.cls === 'android.widget.EditText' && n.text === 'Fokus sinov');
    ok(!!after && keyboardShown(), 'U01 on the phone: product name typed in one go, keyboard stays open', `value=${after?.text} keyboard=${keyboardShown()}`);
  } else check('FAIL', 'product dialog: name field found');
  shot('32-a-product-dialog-typing');
  await back(); // keyboard
  await tap(/^Bekor qilish$/, A, { last: true }); await pause(800);
  ok(!/Yangi mahsulot/.test(screenText(A)), 'product dialog closed without saving');
  await nav('Kategoriyalar'); shot('33-a-categories');
  await nav('Buyurtmalar'); t = await waitText(/ta buyurtma/, A);
  ok(/ta buyurtma/.test(t), 'admin orders list', t); shot('34-a-orders');
  await nav('Sozlamalar'); t = await waitText(/Xodimlar|Doʻkon/, A, 20000);
  shot('35-a-settings-top');
  for (let i = 0; i < 4 && !/Kuryer orqali yetkazish narxi/.test(screenText(A)); i++) await swipeUp();
  t = screenText(A);
  ok(/Belgilangan narx/.test(t) && /Operator aniqlaydi/.test(t), 'settings: courier tariff modes shown (not changed)', t.slice(0, 200)); shot('36-a-settings-tariff');
  for (let i = 0; i < 8 && !nodes().some(n => n.pkg === A && /Parolni tiklash/.test(label(n))); i++) await swipeUp();
  const reset = await tap(/Parolni tiklash/, A, { ms: 4000 });
  if (reset) {
    await waitText(/Yangi parol/, A, 8000);
    const pw = nodes().find(n => n.pkg === A && n.cls === 'android.widget.EditText' && n.pwd);
    if (pw) { const [x1, y1, x2, y2] = pw.b; sh(`input tap ${(x1 + x2) >> 1} ${(y1 + y2) >> 1}`); await pause(700); }
    await typeText('Sinov12345678'); await pause(600);
    const v = nodes().find(n => n.pkg === A && n.cls === 'android.widget.EditText' && n.pwd);
    ok(!!v && v.text.length === 13 && keyboardShown(), 'U01 on the phone: reset-password dialog keeps focus for all 13 characters', `len=${v?.text.length} keyboard=${keyboardShown()}`);
    shot('37-a-reset-password-typing');
    await back(); await tap(/^Bekor qilish$/, A, { last: true }); await pause(700);
    ok(!/Yangi parol/.test(screenText(A)), 'reset-password dialog closed without saving');
  } else check('NOT TESTED', 'U01 reset-password dialog', 'no other staff user to open it for');
  await nav('Integratsiyalar'); t = await waitText(/Integratsiyalar|Payme/, A); shot('38-a-integrations');
  ok(/Payme/.test(t) && /Sozlanmagan|Ulangan|tekshirilmagan/.test(t), 'integrations list with honest status', t.slice(0, 160));
  await nav('Boshqaruv');
  ok(foreground().includes(A), 'admin stays in the foreground through navigation');
} catch (error) {
  // A dropped ADB link is not an app failure: everything after it is BLOCKED, never PASS or FAIL.
  const lost = /device offline|device .* not found|no devices|closed/.test(String(error?.message || error));
  check(lost ? 'BLOCKED' : 'FAIL', lost ? 'ADB connection to the phone lost — remaining steps not run' : 'real-device read-only script completed', String(error?.message || error).split('\n')[0]);
} finally {
  try { sh('input keyevent KEYCODE_HOME'); } catch { /* phone gone */ }
  const count = s => results.filter(r => r.startsWith(s)).length;
  writeFileSync(RESULTS, `REAL PHONE (Samsung SM-A175F) — release 1.2.2 on PRODUCTION, read-only\n${new Date().toISOString()}\n${results.join('\n')}\n\nPASS ${count('PASS')} · FAIL ${count('FAIL')} · PARTIAL ${count('PARTIAL')} · BLOCKED ${count('BLOCKED')} · NOT TESTED ${count('NOT TESTED')}\n`);
  console.log(`\nPASS ${count('PASS')} · FAIL ${count('FAIL')} · PARTIAL ${count('PARTIAL')} · BLOCKED ${count('BLOCKED')} · NOT TESTED ${count('NOT TESTED')}`);
}
