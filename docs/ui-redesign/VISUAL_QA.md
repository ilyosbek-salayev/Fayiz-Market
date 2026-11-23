# Vizual QA va regressiya natijalari (2026-11-22)

Barcha natijalar shu mashinada haqiqatan render qilingan ilovadan olindi. Simulyatsiya qilingan natija yo‘q.

## Muhit

- **Ilova**: `VITE_ANDROID_BUILD=1` bilan build qilingan `apps/customer/dist` va `apps/admin/dist`. Bu APK ichiga kiradigan bundle'ning aynan o‘zi.
- **Android WebView emulyatsiyasi**: Chrome (headless, puppeteer-core). `<API>/__app/*` so‘rovlari diskdagi bundle'dan beriladi, xuddi `MainActivity.shouldInterceptRequest` kabi. API chaqiruvlari same-origin.
- **Backend**: izolyatsiyalangan lokal Worker (`wrangler dev --local`, port 8788, scratchpad'dagi alohida D1/R2). Foydalanuvchining telefon sinovi bazasiga (`:8787`) yozish amali qilinmadi. U yerda faqat Settings diagnostikasi uchun o‘qish so‘rovlari, login va logout bajarildi.
- **QA ma’lumotlari**: nomi `QA:` bilan boshlanadigan 7 ta sinov mahsuloti, 5 kategoriya, 1 buyurtma va 1 to‘lov. Ular ichida uzun nom, rasmsiz mahsulot, 0 qoldiq, keng (1200×700) va tik (600×1000) rasmlar, uzun manzil bor. **Bular haqiqiy katalog emas** va ilova kodiga kiritilmagan.
- **Device scale factor 2**, mobil kengliklarda `isMobile` va `hasTouch` yoqilgan.

## Qamrov

| Ilova | Kengliklar | Ekranlar |
|---|---|---|
| Xaridor | 320, 360, 390, 412, 430, 768, 1024 | bosh sahifa, katalog, mahsulot, "qo‘shildi" toast, savat, checkout, checkout xatosi, buyurtmalar, profil |
| Xaridor mavzulari | 390 × yashil, ko‘k, qora | barcha yuqoridagi ekranlar |
| Xaridor holatlari | 390, 320 | bo‘sh savat, bo‘sh buyurtmalar, topilmagan qidiruv, offline (server uzilgan) |
| Admin | 360, 390, 768, 1024, 1280, 1440, 1920 | login, boshqaruv, drawer (`<1024`), mahsulotlar, mahsulot formasi, qoldiq, kategoriyalar, buyurtmalar, buyurtma modali, sozlamalar, offline login |

**Yakuniy ishga tushirish: 147 skrinshot, gorizontal overflow 0, JS xatosi 0, native dialog 0.**

Har bir skrinshotda `documentElement.scrollWidth > clientWidth` tekshiruvi avtomatik bajariladi.

## Jarayonda topilgan va tuzatilgan nuqsonlar

| Topilma | Kenglik | Tuzatish |
|---|---|---|
| Checkout sheet kontenti o‘ngga toshgan (grid treki `nowrap` matn bilan cho‘zilgan) | barcha | `grid-template-columns: minmax(0,1fr)` |
| Kartada `1,289,000 s...` narxi qirqilgan | 390 | Qo‘shish tugmasi rasm burchagiga ko‘chirildi, narx to‘liq kenglikda |
| Hero sarlavhasi sumka grafigi ustiga chiqqan | 390 | Grafik pastki o‘ng burchakka siljitildi |
| Mahsulot sahifasi pastki panelida narx qirqilgan | 320 | Tor ekranda tugma ikonkasi yashiriladi, shrift kichrayadi |
| Checkout CTA ichidagi summa sig‘magan | 320 | `<390px`da CTA ichidagi summa yashiriladi (summa yuqorida ko‘rinib turadi) |
| Admin jadvalida `visually-hidden` yorliqlar scroll konteyneridan "qochgan" | 768, 1024 | `.table-wrap` va `.act` pozitsiyalandi |
| 1024'da amallar ustuni ko‘rinmay qolgan | 1024 | Kategoriya nom ostiga ko‘chirildi, ustunlar 5 taga tushirildi |
| 1920'da kontent haddan tashqari keng | 1920 | `max-width: 1360px` |
| Mobil drawer yopiq holatda ham fokuslanadigan bo‘lgan | <1024 | `visibility: hidden` + kechiktirilgan transition |
| Kunlik savdo jadvalida summa qirqilgan | 390 | Mobil'da bar summa ostiga o‘tadi |

## Funksional regressiya — 39/39 o‘tdi

Skript: `scripts/ui-qa/regress.mjs`. Har bir tekshiruv haqiqiy tugma va maydonlar orqali bajariladi, natija esa API orqali tasdiqlanadi.

```
PASS home loads banner from /settings
PASS home renders products
PASS search filters catalog — QA: Klassik qoʻl soati
PASS clearing search restores list
PASS category chip filters — Sumkalar
PASS sort price ascending — 89000 ≤ 99000 ≤ 159000 ≤ 245000 ≤ 320000 ≤ 410000 ≤ 1289000
PASS product detail opens
PASS add to cart shows in-app toast (no native alert)
PASS cart persisted to localStorage — {"1":1,"3":2}
PASS cart lists items
PASS quantity increment — 2,2
PASS checkout validation shown inline
PASS order submitted via UI — FM-MWRSNYTL-3E20CE
PASS order stored locally and cart cleared
PASS order status visible (Yangi)
PASS profile persisted from checkout
PASS theme black applied & saved — rgb(21, 21, 19)
PASS theme green applied & saved — rgb(247, 250, 248)
PASS theme blue applied & saved — rgb(247, 249, 252)
PASS theme yellow applied & saved — rgb(250, 250, 247)
PASS wrong password shows error banner
PASS admin login → dashboard
PASS category created via UI
PASS product created via UI
PASS product edit saved — 180000
PASS stock adjustment saved — 7
PASS delete asks in-app confirmation (no native confirm)
PASS product hidden after confirmation
PASS order detail modal opens
PASS status change persisted — confirmed
PASS payment recorded and listed
PASS Escape closes modal
PASS store settings saved
PASS administrator added and listed
PASS mobile drawer opens from menu button
PASS drawer navigates and closes
PASS logout returns to login
PASS customer sees admin status change
PASS no native alert/confirm dialogs used
```

Bular **integratsion** testlar: UI → lokal Worker → lokal D1. Ular haqiqiy telefon yoki production muhitida bajarilmagan.

## Statik tekshiruvlar

- `npm run typecheck` — o‘tdi (api, admin, customer).
- `npm test` — 3/3 o‘tdi.
- Ikkala Vite build — o‘tdi.
- `npm run build:apks` (JDK 17, Android SDK 35, Gradle 8.13) — `BUILD SUCCESSFUL`. APK ichida yangi bundle, 4 ta woff2, yangi JS ko‘prigi metodlari bor; eski `LinearLayout` dev paneli va Expo yo‘q.
- API chaqiruvlari to‘plami eski va yangi `main.tsx` fayllarida aynan bir xil (`grep` bilan avtomatik solishtirildi).

## Saqlangan skrinshotlar

`docs/ui-redesign/screenshots/`. Fayllar 1x o‘lchamga kichraytirilgan, uzun sahifalar kesilgan.

- `before/` — eski UI: `c-home-390`, `c-catalog-390`, `c-checkout-error-390`, `c-orders-390`, `c-profile-390`, `a-dashboard-390/1280`, `a-products-390/1280`, `a-settings-390`.
- `after/` — 32 ta: xaridor 320/412/1024 kengliklarda, 4 mavzu (`*-green/blue/black-*`), bo‘sh va offline holatlar, admin 390/768/1024/1280/1440.

Full-page skrinshotlarda `position: fixed` pastki menyu sahifa o‘rtasida ko‘rinishi mumkin. Bu skrinshot artefakti: Chrome fixed elementni viewport joyida chizadi. Haqiqiy ekranda menyu doim pastda turadi.

## Qanday qayta ishga tushiriladi

```sh
# 1. Izolyatsiyalangan Worker
cd apps/api && npx wrangler d1 migrations apply fayz-market --local --persist-to /tmp/fayz-qa-db
npx wrangler dev --local --ip 127.0.0.1 --port 8788 --persist-to /tmp/fayz-qa-db \
  --var BOOTSTRAP_SECRET:qa-local-secret-only --var PUBLIC_BASE_URL:http://127.0.0.1:8788
# 2. Boshqa terminalda (repo ildizidan)
npm i --prefix scripts/ui-qa --no-save --no-package-lock puppeteer-core@23.11.1
VITE_ANDROID_BUILD=1 npm run build -w @fayz/customer && VITE_ANDROID_BUILD=1 npm run build -w @fayz/admin
node scripts/ui-qa/seed.mjs                 # faqat yangi, bo'sh bazada bir marta
node scripts/ui-qa/shoot.mjs after all      # skrinshotlar → scripts/ui-qa/shots/after
node scripts/ui-qa/regress.mjs              # 39 ta funksional tekshiruv (bazaga yozadi)
```

Chrome boshqa joyda bo‘lsa, `CHROME_PATH` env o‘zgaruvchisi bilan ko‘rsatiladi. `puppeteer-core` loyiha dependency'si emas va `package.json`ga qo‘shilmagan.

## Tekshirilmagan

- **Haqiqiy Android telefon**: `adb devices` bo‘sh. WebView'dagi klaviatura, fayl tanlagich, status bar rangi (`setSystemBars`), debug "Server manzili" dialogi qurilmada sinalmagan.
- Windows Electron admin (`apps/desktop`) qayta paketlanmagan va sinalmagan.
- `prefers-reduced-motion` CSS'da qo‘llab-quvvatlanadi, lekin u alohida skrinshot bilan tekshirilmagan.
