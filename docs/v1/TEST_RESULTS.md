# Sinov natijalari — Fayz Market V1 (texnik 1.2.0)

Sana: 2026-11-25.

**Kod.** `main`:

- `8799a70` — APK’lar shu commitdan qurildi;
- `9b17653` — DMG va EXE; `8799a70` dan farqi faqat bitta test skriptida.

Natijalar va loglar `docs/v1/evidence/`, skrinshotlar `docs/v1/screenshots/` da.

**Qoida.** Mutatsiya qiladigan har bir sinov yangi, alohida D1 bilan lokal Worker’da ishladi. Production faqat GET (read-only) bilan tekshirildi. Istisno bitta: §4 dagi ochiq aytilgan hodisa.

## 1. Yakuniy natijalar

| Toʻplam | Natija | Qayerda | Dalil |
|---|---|---|---|
| TypeScript (api, admin, customer) | PASS | — | `evidence/final/typecheck.log` |
| Unit (vitest; 17 tasi yangi) | **68/68** | Node | `evidence/final/unit.log` |
| **V1 API** (`scripts/v1/storefront-verify.mjs`) | **136/136** | Lokal Worker + ORS mock | `evidence/final/storefront-verify.log` |
| **V1 UI** (`scripts/ui-qa/v1-storefront-ui.mjs`) | **57/57** | Chrome, 360/390/412/768 px, admin 390/1280, dark | `evidence/final/v1-storefront-ui.log`, `screenshots/` |
| Oldingi: expansion API | **129/129** | Lokal Worker | `evidence/regression-rerun/expansion-api.log` |
| Oldingi: integration | **38/38** | Lokal Worker | `evidence/regression/integration.log` |
| Oldingi: expansion UI (admin, kuryer, mijoz) | **54/54** | Chrome | `evidence/regression-rerun/expansion-ui.log` |
| Oldingi: redesign regression UI | **43/43** | Chrome | `evidence/regression-rerun/regression-ui.log` |
| Oldingi: security regression | **11/11** | Lokal Worker | `evidence/regression/security-regression.log` |
| Oldingi: provider test mode (SMS, email, FCM, Telegram, Routes mock) | **35/35** | Lokal Worker + mock | `evidence/regression-rerun/provider-test-mode.log` |
| **Eski Worker (`c396529`) yangi sxemada (0007)** | **129/129 + 11/11** | Lokal Worker | `evidence/old-worker-on-0007/` |
| Android: 1.1.1 → 1.2.0 ustidan yangilash | **12/12** | **EMULATOR** (Android 14, WebView 113) | `evidence/emulator/upgrade-1.1.1-to-1.2.0.log` |
| Android: V1 oqimlari APK ichida | **12/12** | **EMULATOR** | `evidence/emulator/v1-storefront-emulator.txt`, `screenshots/emulator/` |
| macOS DMG: paketlangan ilova smoke (read-only) | **11/11** | macOS arm64 | `evidence/desktop/desktop-readonly-1.2.0.log` |
| Desktop: brend, Windows/macOS bundle bir xilligi | **4/4** | macOS | `evidence/desktop/desktop-brand-1.2.0.log`, `screenshots/desktop-macos-login.png` |

## 2. Qamrov (talablar boʻyicha)

**Branding**

- Dark va Light logo, proporsiya, kichik oʻlcham.
- Admin orqali yuklash → R2 → mijoz UI. Mijoz yangi logoni data-URI sifatida keshlaydi (oflayn).
- Standart logoga qaytarish.
- SVG, notoʻgʻri tur, hajm va oʻlcham rad etiladi.
- Manager, kuryer, anonim → 403/401.
- Launcher (adaptive icon) — APK badging bilan tasdiqlangan.

**Home UI**

- Header: belgi, nom, tavsif, «Doʻkonga yoʻl»; takroriy qidiruv belgisi yoʻq.
- Doʻkon va foydalanuvchi joylashuvi qatori.
- Banner karuseli; kategoriyalar va mahsulotlar (oldingi testlar).
- Dark rejim.
- Har bir kenglikda gorizontal overflow va matn kesilishi yoʻq.
- Back.

**Xarita**

- Ruxsat berilgan / rad etilgan holat (Chrome); emulyatorda Android ruxsat oynasi.
- Doʻkon manzili kiritilgan / kiritilmagan; MapLibre chiziladi.
- Doʻkon va mijoz pinlari.
- Routing ulangan (haqiqiy geometriya, masofa, vaqt, atributsiya) / ulanmagan (soxta chiziq yoʻq, «toʻgʻri chiziq» deb belgilangan masofa, tashqi navigatsiya).
- Juda uzoq nuqta 422; Back + scroll saqlanadi; Android system Back (emulyator).

**Bannerlar**

- Create / Read / Update / Disable / Delete; R2 rasm.
- `javascript:` va begona URL rad etiladi.
- Mobil layout; CTA → kategoriya va → xarita.
- Bo‘sh holatda standart banner; ruxsatlar.

**Toʻlov**

- Naqd; terminal; olib ketish (manzil talab qilinmaydi, kuryer tayinlab boʻlmaydi).
- Bank oʻtkazmasi: rekvizitlar → «Pulni oʻtkazdim» → xodim muvaffaqiyatsiz deydi → qayta → qisman → toʻliq → «Toʻlandi».
- Rad etiladigan holatlar:
  - takroriy hujjat raqami;
  - ortiqcha summa;
  - toʻlangan buyurtmaga yangi toʻlov;
  - toʻlangan buyurtmani bekor qilish;
  - qaytarish manager uchun yopiq; ikkinchi qaytarish;
  - bekor qilingan toʻlovni qayta ochish;
  - eskirgan `from` (ikki xodim bir vaqtda);
  - mijoz yuborgan summa va holat eʼtiborsiz qoldiriladi.
- 1.1.x mijozi (yangi maydonlarsiz) → yetkazish + naqd.
- **Payme (mock imzolangan soʻrovlar):**
  - barcha 6 metod; idempotentlik;
  - ikkinchi tranzaksiya → -31051; perform → paid;
  - bekor qilish: perform’dan oldin -1, keyin -2 (refund);
  - notoʻgʻri kalit, summa, buyurtma, metod.
- **Click (mock):** imzo, summa, buyurtma, prepare/complete, takroriy complete → -4, provayder xatosi → failed.
- **Integratsiya:** sozlanmasdan yoqib boʻlmaydi; yoqilmaguncha checkoutda koʻrinmaydi.

**Integratsiyalar**

- AES-GCM: D1’da faqat shifrlangan qiymat; API, audit va `/settings` da qiymat yoʻq.
- Owner-only; formatlar tekshiriladi.
- «Ulanishni tekshirish» natija turi bilan; oʻchirish darhol taʼsir qiladi.

**Regressiya.** Oldingi Claude/Codex toʻplamlari yuqorida, hammasi PASS.

## 3. Birinchi yugurishda topilgan va tuzatilgan xatolar (yashirilmaydi)

| Topilgan | Sabab | Hal etilishi |
|---|---|---|
| expansion-api 127/129, expansion-ui 52/54 | V1’da `store_location` integratsiyasi roʻyxatdan olib tashlangan edi. **1.1.x admin ilovalari** doʻkon manzilini shu endpoint orqali saqlaydi — moslik buzilgan edi | Yashirin «legacy» yozuv sifatida qaytarildi (`8799a70`). Yangi panel uni koʻrsatmaydi |
| expansion-api, provider-mode: «aynan 8 ta integratsiya» | Roʻyxat ataylab kengaydi (ORS, Payme, Click) | Tekshiruv endi «8 ta asl integratsiyaning hammasi bor» deb tekshiradi |
| expansion-ui: Telegram kalit nomi koʻrinmadi | Sozlanmagan karta yopiq turardi | Sozlanmagan karta avvalgidek ochiq turadi |
| regression-ui: versiya yozuvi | Spec boʻyicha «Fayz Market V1 · versiya 1.2.0» | Tekshiruv yangi yozuvga moslandi |
| V1 UI: 3 ta FAIL (birinchi yugurish) | Test skriptidagi selektorlar: boshqa panelning «Saqlash» tugmasi, katta-kichik harf | Skript tuzatildi; 57/57 |

## 4. Hodisa: test login’i production manziliga yoʻnaltirilgan edi — bazaga yetmagan

- **Nima boʻldi.** Desktop paketlash admin bundle’ini `VITE_API_URL=production` bilan qurdi. Shundan keyin ishga tushgan V1 UI skriptining admin qismi test login’ini production manziliga yubormoqchi boʻldi. Bu mavjud boʻlmagan `v1-owner@example.invalid` email edi.
- **Natija: production’ga hech narsa yozilmagan.**
  - Sahifa `http://127.0.0.1` dan ochilgan edi, shuning uchun brauzer avval CORS tekshiruvini (preflight) yuboradi.
  - Production Worker faqat oʻz origin’iga ruxsat beradi va preflight’ni rad etadi.
  - Shu sababli POST soʻrov umuman yuborilmagan.
- **Isbot.** Deploy oldidan olingan production D1 zaxirasi (`fayz-market-before-1.2.0-20261125-055823.sql`) ertalabki `…-before-1.1.2-deploy-20261125-025828.sql` bilan **SHA-256 boʻyicha aynan bir xil** (`a540dcb6…`). Oraliqda bazada hech qanday yozuv paydo boʻlmagan.
- **Takrorlanmasligi uchun.** `v1-storefront-ui.mjs` endi bundle ichida `*.workers.dev` manzilini koʻrsa, ishga tushmaydi (`exit 2`). Bu tekshirib koʻrilgan.

## 5. Sinalmagan yoki bloklangan (aniq)

| Narsa | Holat | Sabab / keyingi qadam |
|---|---|---|
| Haqiqiy Android telefon (Samsung A17 va boshqalar) | **NOT TESTED** | Telefon ulanmagan. Pastdagi roʻyxat bilan tekshiring |
| Windows’da oʻrnatish va ishga tushirish | **NOT TESTED** | Windows qurilma yoʻq. Faqat build yaxlitligi va bundle bir xilligi tekshirildi |
| macOS’da owner login va toʻliq oqim (paketlangan) | NOT TESTED | Production’ga yozmaslik uchun. Login va kalitlar lokal Chrome’da sinaldi |
| Payme / Click sandbox | **BLOCKED** | Merchant hisobi va test kalitlari yoʻq |
| Production merchant toʻlovi | **NOT TESTED** | Shartnoma va ruxsat yoʻq |
| OpenRouteService haqiqiy API | NOT TESTED | Kalit yoʻq. Sinov mock bilan; haqiqiy chaqiruv «Ulanishni tekshirish» tugmasida |
| Production’da V1 (migratsiya + deploy) | **BAJARILDI** 2026-11-25 (egasining ruxsati bilan): 1.2.0 va 1.2.1 | §6, §7 |

### Haqiqiy telefon uchun tekshiruv roʻyxati (Samsung A17)

1. 1.1.x ustidan 1.2.0 ni oʻrnating (eski ilovani oʻchirmang). Savat va kirish saqlanganini tekshiring.
2. Launcher’da yangi belgi turibdimi: Customer qora, Admin oq.
3. Bosh sahifa:
   - header kesilmayaptimi;
   - status bar bilan ustma-ust tushmayaptimi;
   - «Aniqlash» → ruxsat oynasi chiqadimi;
   - rad etilsa xarita pini ochiladimi.
4. Oʻng yuqori belgi → xarita.
   - Production’ga deploy va ORS kaliti boʻlsa → marshrut;
   - aks holda «Yoʻlga chiqish» Google Maps’ni ochadimi;
   - **system Back** bosh sahifaga qaytaradimi va scroll joyida qoladimi.
5. Bannerni surish, tugmasini bosish.
6. Checkout:
   - olib ketish;
   - bank oʻtkazmasi (yoqilgan boʻlsa) → rekvizitlar → «Pulni oʻtkazdim»;
   - admin ilovada tasdiqlash.
7. Qorongʻi mavzu: logo almashadimi.
8. Klaviatura ochilganda checkout maydonlari koʻrinib qoladimi; modal va sheet yopiladimi; internet uzilganda ilova nima koʻrsatadi.

## 6. Production’ga chiqarish (2026-11-25, egasining ruxsati bilan)

| Qadam | Natija |
|---|---|
| Akkaunt | `Ilyosbeksalayev240@gmail.com's Account`, `8c9b943e…82ca` (`wrangler whoami`) |
| D1 zaxira | `dist/backups/fayz-market-before-1.2.0-20261125-055823.sql` (20 706 bayt, 0600, SHA-256 `a540dcb6…`) |
| Migratsiya | `0007_v1_storefront.sql` ✅ (23 buyruq). Undan keyin «No migrations to apply». Eski Worker GET’lari 200. Mavjud 2 ta buyurtmaning toʻlov holati jurnaldan toʻldirildi (1 paid, 1 pending) |
| Deploy | `fayz-market-api` → Version `43b2cc54-4565-47ff-9d91-c82c042ebce0`; bindinglar: D1 `fayz-market`, R2 `fayz-market-images`, `ENVIRONMENT=production` |
| Secret | `INTEGRATIONS_MASTER_KEY` qoʻshildi (qiymat hech qayerda koʻrsatilmagan) → faol versiya `90b70a16-42fe-473d-bcea-4e5fe015698f` |
| Read-only smoke | `production-get.mjs` **11/11**, `/storefront` 200, `DELETE /customer/push-token` kirishsiz 401, `/admin/integrations` kirishsiz 401, Payme (sozlanmagan) → -32504. Dalil: `evidence/production/` |
| Rollback (kerak boʻlsa) | `cd apps/api && npx wrangler rollback 9ff0b7fb-15b2-4340-b78f-af0ec6a7332c --env production` — eski kod yangi sxemada ishlashi tasdiqlangan |
| Ortiqcha Worker | `fayz-market-api-production` (yagona deploy `eb2fd9e9`) egasining tasdigʻi bilan **oʻchirildi**. Oʻchirish konfiguratsiyasiz papkadan `--name` bilan bajarildi. Natija: uning `/health` → 404; asosiy Worker 11/11, faol versiya `90b70a16` oʻzgarmagan; D1 (2 buyurtma, 2 mahsulot, 1 admin) va R2 joyida |

## 7. 1.2.1 — UX takomillashtirish (haqiqiy telefon fikri + `ilova app.pdf`)

**Egasining oʻz sinovi.** Egasi 1.2.0 ni **haqiqiy Samsung Galaxy A17** da sinadi. Ilovalar ochildi va u tekshirgan asosiy jarayonlar ishladi. Bu egasining natijasi. 1.2.1 haqiqiy telefonda hali sinalmagan.

**Haqiqiy credentials bilan sinalmagan:** Payme, Click, SMS (Eskiz), Telegram, Resend, Firebase, OpenRouteService. Ular production sinovdan oʻtgan deb **belgilanmaydi**.

| Toʻplam | Natija | Qayerda | Dalil |
|---|---|---|---|
| TypeScript | PASS | — | `evidence/final/typecheck.log` |
| Unit (raqam formati, NumberInput qoʻshildi) | **73/73** | Node | `evidence/final/unit.log` |
| V1 API (+ telefon+kod bilan kirish, yetkazish haqi) | **154/154** | Lokal Worker | `evidence/final/storefront-verify.log` |
| V1 UI (+ admin login, texnik sozlamalar, narx inputi, integratsiya holatlari, telefon bilan kirish, GPS, haq) | **77/77** | Chrome 360–1280 | `evidence/final/v1-storefront-ui.log` |
| Oldingi: expansion API / integration / security | **129/129**, **38/38**, **11/11** | Lokal Worker | `evidence/regression-1.2.1/` |
| Oldingi: expansion UI / regression UI | **54/54**, **43/43** | Chrome | Xuddi shu |
| Oldingi: provider test rejimi | **35/35** | Lokal Worker + mock | Xuddi shu |
| Joriy production Worker (`43a90d3`) 0008 sxemasida | **136/136** | Lokal Worker | `evidence/prod-worker-on-0008/` |
| Release APK: sinov serverga yoʻnaltirilgan debug 1.2.0 ustidan | **11/11** | **EMULATOR** | `evidence/emulator/release-apk-1.2.1.txt` |
| V1 oqimlari (debug 1.2.1, CDP) | **14/14** | **EMULATOR** | `evidence/emulator/v1-storefront-emulator-1.2.1.txt` |
| macOS DMG smoke / brend va login | **11/11**, **5/5** | macOS | `evidence/desktop/*-1.2.1.log` |

**Oldingi toʻplamlardagi oʻzgarishlar** — faqat yangi yorliq va kirish yoʻllari; funksiya olib tashlanmagan:

- parol bilan roʻyxatdan oʻtish «Boshqa usullar» ichida;
- checkoutda xarita tugmasi endi «Xaritada tanlash» (avval GPS);
- integratsiyaning texnik nomlari sozlash oynasida;
- pul formati boʻlinmaydigan boʻshliq bilan.

**Sinov topgan va tuzatilgan xatolar:**

- profil kirish tugmalari 390 px da sahifani yonga surardi — tugmalar ustma-ust qoʻyildi, overflow tekshiruvi qoʻshildi;
- oldingi UI testlari eski yorliqlarni qidirardi — testlar yangilandi.

| 1.2.1 da sinalmagan | Holat |
|---|---|
| Haqiqiy telefonda 1.2.1 | **NOT TESTED** (tekshiruv roʻyxati: `UX_REFINEMENT_1.2.1.md` §5) |
| Windows’da oʻrnatish | **NOT TESTED** |
| Telefon+kod bilan kirish production’da (haqiqiy SMS) | **NOT TESTED** — Eskiz (SMS) ulanmagan. Endpoint bor, lekin SMS yuborilmaguncha kod kelmaydi; ilova buni ochiq yozadi |
| Yetkazish haqi production’da | Server tayyor (`deliveryFee: 0` — admin hali narx belgilamagan). Haqiqiy buyurtma bilan **NOT TESTED** (production’ga yozilmadi) |

### 1.2.1 — production’ga chiqarish (2026-11-25, egasining ruxsati bilan: «Yes, deploy»)

| Qadam | Natija |
|---|---|
| Akkaunt | `8c9b943e…82ca` (`wrangler whoami`) |
| D1 zaxira | `dist/backups/fayz-market-before-1.2.1-20261125-075843.sql` (28 676 bayt, 0600, SHA-256 `f3c1acc3ee710952…`) |
| Migratsiya | `0008_phone_login_delivery_fee.sql` ✅ (8 buyruq). Undan keyin «No migrations to apply». Eski Worker GET’lari (`/health`, `/storefront`, `/auth/config`, `/products`) 200 |
| Deploy | `main` `94718f5` → `fayz-market-api` Version **`6955fdd2-e5ac-4cd7-bdc3-0a0ded818e95`** (100%). Bindinglar: D1 `fayz-market`, R2 `fayz-market-images`, `ENVIRONMENT=production`. Secretlar oʻzgarmadi |
| Read-only smoke | `production-get.mjs` **11/11**; `/storefront` → `checkout.deliveryFee`/`deliveryFreeFrom` bor; `/auth/config` → `phone.codeLogin: true` (`phone.enabled: false` — SMS yoʻq); `POST /auth/phone/login {}` → 400 (validatsiya, endpoint bor); kirishsiz `DELETE /customer/push-token` va `/admin/integrations` → 401. Dalil: `evidence/production/production-get-after-1.2.1.log` |
| Rollback (kerak boʻlsa) | `cd apps/api && npx wrangler rollback e5f9c48e-7760-4dfa-87af-5a7ca1283718 --env production` — 1.2.0 kodi 0008 sxemasida 136/136 ishlashi tasdiqlangan |

## 8. 1.2.2 — haqiqiy qurilma sinovidan keyingi tuzatishlar (`94ac876`)

Toʻliq hisobot: `REAL_DEVICE_QA_FIX_REPORT.md`. Barcha natijalar lokal izolyatsiyalangan muhit, Chrome va **emulyatorda** olingan. 1.2.2 haqiqiy telefonda **NOT TESTED**.

| Toʻplam | Natija | Qayerda | Dalil |
|---|---|---|---|
| TypeScript / Unit | PASS / **73/73** | Node | `evidence/regression-1.2.2/` |
| Yangi API: variantlar, savat/checkout, tarif, login, kuryer RBAC | **85/85** | Lokal Worker | `evidence/real-device-fixes/api-verify.txt` |
| Yangi UI: fokus, qulflash/chiqish, variantlar, checkout, manzil, xarita, kuryer (360/390/412/1280 px) | **100/100** | Chrome | `evidence/real-device-fixes/ui-verify.txt` |
| V1 API / V1 UI | **154/154** / **77/77** | Lokal Worker / Chrome | `evidence/regression-1.2.2/` |
| expansion API, integration, security, provider | **129/129**, **38/38**, **11/11**, **35/35** | Lokal Worker | Xuddi shu |
| expansion UI, regression UI | **54/54**, **43/43** | Chrome | Xuddi shu |
| Production’dagi kod 0009 sxemasida | **154/154** | Lokal Worker | `evidence/prod-worker-on-0009/` |
| Release APK eski 1.2.1 ustidan; V1 oqimlari | **11/11**; **15/15** | **EMULATOR** | `evidence/real-device-fixes/emulator/` |
| macOS DMG smoke; brend va login | **11/11**; **5/5** | macOS | `evidence/real-device-fixes/desktop/` |

| 1.2.2 da sinalmagan | Holat |
|---|---|
| Haqiqiy telefon (Samsung A17) | **NOT TESTED** (roʻyxat: `REAL_DEVICE_QA_FIX_REPORT.md` §8) |
| Windows’da oʻrnatish | **NOT TESTED** |
| Production’da 1.2.2 (0009 + Worker) | **Deploy qilinmagan** — egasining ruxsatini kutmoqda |
| Tashqi integratsiyalar haqiqiy kalitlar bilan | **NOT TESTED** / Payme, Click **BLOCKED** |

