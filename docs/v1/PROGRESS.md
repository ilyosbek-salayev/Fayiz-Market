# Progress

- 2026-11-22: Repository and Git remote audited. No implementation or specification recovered. Created `feat/v1-complete` branch.
- 2026-11-22: New TypeScript monorepo initialization started.
- 2026-11-22: Worker API, four D1 migrations, Expo customer app, React admin, and Electron wrapper implemented. Native Android project generated.
- 2026-11-22: 38 local Worker integration checks, 3 shared tests, TypeScript checks, admin build, Android JS export, and D1 migrations passed.
- 2026-11-22: Official Temurin JDK 17 and Android command-line tools downloaded and verified in `/private/tmp/fayz-toolchain`. Android SDK package installation paused at Google's license acceptance prompt; user approval requested asynchronously.
- 2026-11-22: Browser visual QA attempted; CUA browser host unavailable. Cloudflare production untouched.
- 2026-11-22: Native Safari fallback allowed a desktop visual check of admin login, dashboard, product, and order views. Order status labels were changed to Uzbek. Narrow-screen visual QA remains open.
- 2026-11-22: Local V1 root commit `cd8ad18` created. `git push -u origin feat/v1-complete` failed: `fatal: could not read Username for 'https://github.com': Device not configured`. Local branch and commit are preserved.
- 2026-11-22: Follow-up admin localization/QA commit `afd8eb7` created. GitHub Desktop published `feat/v1-complete`; `git ls-remote --heads origin feat/v1-complete` confirmed the remote SHA `afd8eb7a3cd693665515648abf56c0584ad301d6`.

- 2026-11-22: JDK 17 and Android SDK installed. User changed the priority to two real-phone debug APKs and explicitly excluded Expo. Created `feat/v1-native-apks` branch and implemented `apps/customer` plus two Java Android shells in `apps/android`.
- 2026-11-22: Bundled customer and admin interfaces in separate APKs. Gradle assembled both successfully; copied verified files to `dist/apk/`. Active root scripts and CI no longer run Expo. Legacy `apps/mobile` remains only in Git history/workspace for reference, outside active npm workspaces.
- 2026-11-22: Fresh Worker/D1/R2 integration 38/38 and shared tests 3/3 passed. Separate local phone database seeded with three test products and a temporary admin account. Additional API smoke flow passed through order creation, admin confirmation and payment report.
- 2026-11-22: `adb devices -l` listed no phone. Physical Android UI remains unverified. Production deployment and Google Play untouched.

Next action: connect an Android phone, install both files from `dist/apk/`, keep the local Worker running using `BUILD_INSTRUCTIONS.md`, and perform the listed UI workflow. Fix any device-specific defect found. Then decide separately on HTTPS production and release signing.

## Fayz Market V1 (texnik 1.2.0) — 2026-11-25, `main`

- Faza A (audit): mavjud funksiyalar, 4 ta yangi logo fayli, Workerlar holati (faqat GET) va migratsiyalar oʻrganildi → `FAYZ_MARKET_V1_REQUIREMENTS.md`.
- Faza B (branding): tasdiqlangan logolar `assets/brand/source/` ga nusxalandi; `scripts/brand/render-brand.mjs` ilova belgisi, splash, Android launcher/status, desktop ikonkasini hosil qiladi; admin «Brend va koʻrinish» (`2724c25`, `04a8033`).
- Faza C/D (home, xarita): header, doʻkon/joylashuv qatorlari, doʻkon xaritasi + marshrut (ORS/Google), Android Back.
- Faza E (bannerlar), F (toʻlovlar: naqd/terminal/bank/olib ketish, holat mashinasi, Payme/Click), G (shifrlangan integratsiya kalitlari) — migratsiya `0007_v1_storefront.sql` (`846e3b2`).
- Faza H (QA): V1 API 136/136, V1 UI 57/57, unit 68/68, oldingi toʻplamlar hammasi PASS (birinchi yugurishda topilgan 1.1.x admin moslik xatosi tuzatildi: `8799a70`), eski Worker + yangi sxema 129/129, emulyator 12/12 + 12/12, desktop 11/11 + 4/4 → `TEST_RESULTS.md`.
- Faza I (release): APK vc 7 (`8799a70`), DMG/EXE (`9b17653`); 1.1.2 RC fayllari Savatga koʻchirildi → `RELEASE_REPORT.md`, `dist/RELEASE_MANIFEST.md`.
- Faza J (handover): `CLIENT_HANDOVER.md`, `ADMIN_INTEGRATIONS.md`, `BANNERS_AND_PAYMENTS.md`, `STORE_LOCATION_AND_MAP.md`, `BRANDING_AND_UI.md`.
- Ochiq (oʻsha paytda): production migratsiya + deploy + `INTEGRATIONS_MASTER_KEY` (keyin, 2026-11-25 da bajarildi), GitHub push (egasi), haqiqiy telefon va Windows sinovi, Payme/Click shartnomasi.

## 1.2.1 — 2026-11-25

- Egasi 1.2.0 ni haqiqiy Samsung A17 da sinadi (ishladi). UX va admin login boʻyicha fikr va `ilova app.pdf` qabul qilindi.
- `625ea54`, `23175e0`:
  - release APK (production’ga qulflangan);
  - toza admin login, texnik sozlamalar faqat debug + super admin;
  - NumberInput, integratsiyalar sahifasi;
  - telefon+kod bilan kirish, GPS, yetkazish haqi (migratsiya 0008).
- QA: API 154, UI 77, unit 73, oldingi toʻplamlar PASS, emulyator 11 + 14, desktop 11 + 5.
- dist: faqat 1.2.1. 1.2.0 Savatga koʻchirildi.
- Production (egasining ruxsati bilan): zaxira → 0008 ✅ → Worker `6955fdd2` → read-only smoke 11/11.
- Ochiq:
  - push;
  - 1.2.1 haqiqiy telefonda;
  - Windows;
  - real credentials (SMS va hokazo).

## 1.2.2 — 2026-11-26

- Egasi 1.2.1 ni Samsung A17 da sinadi: 37 ta tekshiruv — 28 PASS, 2 FAIL (C07, A06), 3 QISMAN (A01, A03, U01), 4 SINOVSIZ.
- `94ac876` — qilingan ishlar:
  - variantlar va xususiyatlar (migratsiya 0009);
  - chegirma va tavsiyalar;
  - checkout: olib ketish yoki kuryer, hisob qatorlari, tarif rejimi;
  - bitta manzil komponenti;
  - fokus xatosi (Modal/Sheet);
  - login normallashtirish, qulflash va hisobdan chiqish;
  - xarita oʻzi aniqlaydi.
- QA:
  - yangi API 85/85, yangi UI 100/100;
  - V1 154 + 77; oldingi toʻplamlar 129, 38, 11, 35, 54, 43;
  - production kodi 0009 da 154/154;
  - emulyator 11 + 15; desktop 11 + 5.
- dist: faqat 1.2.2. 1.2.1 Savatga koʻchirildi.
- Ochiq:
  - production’ga 0009 + deploy (ruxsat kerak; push undan **keyin**);
  - A17 da qayta sinov;
  - Windows;
  - real credentials;
  - «olib ketish» ni egasi yoqishi.

