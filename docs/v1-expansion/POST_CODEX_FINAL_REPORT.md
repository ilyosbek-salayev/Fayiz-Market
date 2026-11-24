# Fayz Market — Post-Codex yakuniy release hisoboti

Sana: 2026-11-25 (Asia/Tashkent). Bajardi: Claude (Codex to‘xtagan joydan davom). Branch: `main`. Barcha raqamlar shu sessiyada qayta ishga tushirilgan testlardan; loglar [`evidence-post-codex/`](evidence-post-codex/) ichida. «EMULATOR» natijasi fizik telefon natijasi emas.

## 1. Codex’dan qabul qilingan ishlar

Codex’ning commit qilinmagan barcha o‘zgarishlari **o‘zgartirilmasdan** bitta commit sifatida qabul qilindi (`1d66a73`):

- **API xavfsizligi:** atomik OTP urinish byudjeti; parol almashtirilganda boshqa sessiyalarni bekor qilish; noma’lum akkaunt uchun bitta PBKDF2 (timing); admin login per-IP limit; JSON 64 KiB / rasm 5 MB body limiti; buyurtma va yetkazish o‘tishlari D1 batch + version guard; terminal bosqichda GPS tozalash; push token `DELETE` endpointlari; faqat aktiv kuryerga push; dev rejimi faqat loopback.
- **Android:** `OriginPolicy` (scheme+host+port aniq origin), API almashtirish menyusi faqat debug buildda, Telegram sahifasida native bridge olib tashlanadi, frame CSP, release’da cleartext/backup o‘chiq; versionCode 6.
- **Desktop:** Electron 45.4.1; IPC faqat ilovaning asosiy oynasi va `web/index.html`dan.
- **UI:** MapLibre 6.19.0 worker Vite asset URL orqali; buyurtma tarixida qisman xato butun ro‘yxatni yo‘qotmaydi; versiya root `package.json`dan (1.1.2).
- **Dependency:** MapLibre, Zod 4, Vitest 5, Sharp, minimatch override; `package-lock.json` qayta tiklandi (HEAD `91c1416` uni o‘chirgan edi).
- Hujjatlar `docs/codex-audit/*` va dalillar saqlandi; yangi natijalar alohida bo‘lim sifatida qo‘shildi.

## 2. Tasdiqlangan tuzatishlar

| Codex tuzatishi | Qanday tasdiqlandi |
|---|---|
| MapLibre Web Worker / Vite asset | Chrome UI 54/54; **Android APK WebView** ichida worker `/__app/assets/…` dan `shouldInterceptRequest` orqali 200 bilan berildi va OpenFreeMap plitkalari chizildi (customer va admin, 6/6); real checkout xaritasi + GPS pin native QA’da; **paketlangan macOS** ilovada worker file-origin’da chiziladi va ilova bundle’i aynan paketdagi worker faylga ishora qiladi (`new URL(…, import.meta.url)`) |
| Customer location picker | Native QA: xarita chiziladi, runtime ruxsat, emulyator GPS pin’ni markazga qo‘yadi, buyurtma aynan shu koordinata bilan saqlanadi |
| Admin xaritasi / kuryer tracking | Extended UI (markerlar, tracking sheet) + native QA (kuryer `watchPosition`, ≥15 s/≥30 m qoidasi, ekrandagi indikator) |
| Security tuzatishlari | Security regression 11/11, API 129/129, unit 49/49 |
| TypeScript | `npm run typecheck` exit 0 |
| Dependency | `npm audit` — 0 ta ma’lum zaiflik |
| API mosligi | Integration 38/38; yangi migratsiya yo‘q; production D1’da kutilayotgan migratsiya yo‘q |
| UI/UX regressiya | V1 UI 43/43 (39 asl assertion saqlangan) |

## 3. Claude yakunlagan ishlar

1. **Cloudflare Workers Build xatosi** (skrinshotdagi build `e160d1d6`): sabab — repository ildizida Wrangler konfiguratsiyasi yo‘q, Wrangler 4 esa framework aniqlashga o‘tib *“application detection logic has been run in the root of a workspace”* bilan to‘xtaydi (lokal qayta hosil qilindi). Tuzatish: ildizda `wrangler.toml` (aynan `apps/api` `[env.production]`), drift testi `apps/api/deploy-config.test.ts`. Toza clone’da `npm clean-install` + `npx wrangler deploy --dry-run` exit 0; ildizdan qurilgan bundle qo‘lda deploy bundle’i bilan bir xil (yo‘l izohlaridan tashqari SHA-256 `3df09acf…`). Dashboard sozlamalari o‘zgartirilmadi.
2. **Yagona `main` branch:** `feat/v1-premium-ui` boshqa ikki branchni to‘liq o‘z ichiga olgani tekshirildi; `main` shundan yaratildi va barcha ish shu yerda.
3. **Test infrastrukturasi:** Android QA `ws` importi tuzatildi; yangi APK WebView xarita probe; desktop smoke va runner dalillar papkasini parametrlaydi; artefakt metadata skripti.
4. **Release build commit’dan:** APK `b03fb5c` (`--rerun-tasks`), DMG/EXE `7ce81cf`; Codex’ning commit qilinmagan tree’dan qurilgan nomzodlari almashtirildi.
5. **Runtime QA:** emulyatorda upgrade, ochilish, xarita, to‘liq native QA; macOS paketlangan smoke; Windows build integrity.
6. **`dist/` tartiblandi** va `RELEASE_MANIFEST-1.1.2.md` yozildi; Codex hujjatlariga post-Codex bo‘limlari qo‘shildi.

## 4. Test natijalari

| To‘plam | Natija |
|---|---|
| Unit (Vitest) | 49/49 |
| TypeScript | PASS |
| Backend expansion API | 129/129 |
| Integration + lokal R2 | 38/38 |
| V1 UI regressiya | 43/43 |
| Extended UI | 54/54 |
| Security regression | 11/11 |
| Provider mock (SMS/email/Telegram/FCM/Routes) | 35/35 — mock, real emas |
| npm audit | 0 |
| Cloudflare build simulyatsiyasi | PASS |
| Production GET-only + R2 rasm o‘qish | 11/11 + 200 |
| Android upgrade 1.1.1→1.1.2 | 12/12 (EMULATOR) |
| Android production’da ochilish | 10/10 (EMULATOR) |
| Android xarita worker | 6/6 (EMULATOR) |
| Android native QA | 25/25 (EMULATOR) |
| macOS paketlangan smoke | 11/11 (read-only) |
| Windows build integrity | PASS; runtime NOT TESTED |

Muvaffaqiyatsiz urinishlar: Android QA birinchi urinishda `ws` topilmagani uchun ishga tushmadi (test-infra, tuzatildi, assertion o‘zgarmadi). Boshqa yiqilish bo‘lmadi.

## 5. Qolgan BLOCKED funksiyalar

| Funksiya | Holat | Nima kerak |
|---|---|---|
| SMS OTP (Eskiz) | BLOCKED | Eskiz hisobi va sender tasdig‘i |
| Email OTP (Resend) | BLOCKED | Resend API key + o‘z domeni (SPF/DKIM) |
| Telegram login | BLOCKED | BotFather bot tokeni, `/setdomain` |
| Ilova yopiq paytdagi push (FCM) | BLOCKED/PARTIAL | Firebase loyiha, `google-services.json`, native FirebaseMessagingService (backend tayyor) |
| Fon rejimida kuryer GPS | MISSING | Rozilikli foreground service (dizayn `MISSING_FEATURES.md`da) |
| Google Maps/Routes | Ixtiyoriy | Billing roziligi |
| Play/notarized/imzolangan release | BLOCKED | Release key, Apple Developer ID, Windows sertifikat |

Production’da hozir faqat parol bilan kirish yoqilgan (`/auth/config`: phone/email/telegram `enabled:false`).

## 6. Android real-device holati

Fizik telefonda **NOT TESTED** (USB/ADB qurilma ulanmagan). Barcha Android runtime natijalari Android 14 emulyatorida (WebView 113). Qo‘lda sinov uchun: `dist/telegram/FayzMarket-{Mijoz,Admin}-v1.1.2.apk` va `TELEGRAM_QA_CHECKLIST.md` (1.1.1 nomlarini 1.1.2 bilan almashtirib); USB bilan: `node scripts/android-qa/upgrade.mjs dist/apk/v1.1.2`, `map-worker-probe.mjs`, `native-qa.mjs`.

## 7. macOS va Windows holati

- **macOS:** arm64 DMG, `hdiutil verify` VALID, paketlangan ilova read-only smoke 11/11 (login formasi, IPC himoyasi, production GET, xarita). Ad-hoc imzo, notarization yo‘q → Gatekeeper rad etadi; birinchi ochishda Finder’da o‘ng tugma → «Open». Owner login va buyurtma/mahsulot/R2 operatsiyalari production’ga yozmaslik qoidasi sabab desktop’da NOT TESTED (xuddi shu admin UI Chrome’da lokal Worker bilan to‘liq sinalgan).
- **Windows:** x64 NSIS, imzosiz; asar tarkibi macOS bilan bir xil, ichki exe PE32+ x86-64. Haqiqiy Windows’da o‘rnatish/ishga tushirish/xarita/bildirishnoma **NOT TESTED**.

## 8. Cloudflare production holati (faqat read-only)

| Resurs | Holat |
|---|---|
| Akkaunt | `Ilyosbeksalayev240@gmail.com's Account` (`8c9b943e…82ca`) |
| Worker | `fayz-market-api`, joriy versiya `9ff0b7fb` (2026-11-22). Muvaffaqiyatsiz Git build hech narsa deploy qilmagan. Codex/Claude tuzatishlari **production’da hali yo‘q** |
| D1 `fayz-market` | `migrations list --remote`: kutilayotgan migratsiya yo‘q (0001–0006) |
| R2 `fayz-market-images` | Bucket mavjud; mahsulot rasmi GET 200 `image/jpeg` |
| Secrets | Faqat nomlar tekshirildi: `BOOTSTRAP_SECRET` |
| Public API | GET-only 11/11; dev OTP echo o‘chiq; begona Origin’ga CORS yo‘q |
| Owner credential | Rotation **tavsiya etiladi (P0)**, avtomatik almashtirilmadi |

Production’ga hech qanday yozish, deploy, migratsiya yoki secret o‘zgarishi bajarilmadi.

## 9. Git va release versiyasi

- Branch `main` (lokal), push qilinmagan. Commitlar: `1d66a73` (Codex audit), `7bc075b` (Cloudflare root config), `209f420`, `b03fb5c`, `7ce81cf` (QA/release skriptlari), so‘ng hujjatlar commit’i.
- `main` ⊇ `feat/v1-premium-ui` ⊇ `feat/v1-native-apks` ⊇ `feat/v1-complete`. Eski branchlar o‘chirilmadi. GitHub’da `main` yo‘q (avvalgi `origin/main` upstream qoldig‘i tozalandi); default branch hozir `feat/v1-complete`.
- Versiya: **1.1.2** (Android versionCode 6). 1.1.1 — oxirgi tarqatilgan versiya, arxivda.

## 10. Fayl yo‘llari

| Mahsulot | Yo‘l | SHA-256 |
|---|---|---|
| Customer Android APK | `dist/apk/v1.1.2/fayz-market-customer-debug.apk` | `283783f06a90697c6436b3924ac4e28df7445062abbc0e92b1b40e6140865fac` |
| Admin Android APK | `dist/apk/v1.1.2/fayz-market-admin-debug.apk` | `e13968d9f091d20550c412fe665adfa3c999ee7ff8c6ffa9cf67a5a8a551650a` |
| macOS Admin DMG | `dist/desktop/fayz-market-admin-1.1.2-macos-arm64.dmg` | `16b6d37b38607bd3de90136438346cafb7431b902ab84cbc878a15b2842d0925` |
| Windows Admin EXE | `dist/desktop/fayz-market-admin-1.1.2-windows-x64-setup.exe` | `fd68f9481ef59834ed89b83e09ea7836881ed3a397f88f18bbc17a5be65d576c` |

Batafsil (hajm, imzo, arxitektura, sinov holati, o‘chirilgan fayllar): [RELEASE_MANIFEST-1.1.2.md](RELEASE_MANIFEST-1.1.2.md).

## 11. Mijozga topshirishga tayyorlik bahosi

**Release candidate: tayyor (texnik).** Kod bitta branchda, barcha avtomatik testlar o‘tdi, artefaktlar aniq commit’ga bog‘langan va emulyator/macOS’da ishga tushirib tekshirilgan, Cloudflare build xatosi tuzatilgan.

**Tijoriy topshirish: hali NO-GO** — quyidagilar yopilmaguncha:

1. Owner parolini almashtirish (P0) va eski sessiyalarni bekor qilish.
2. Patch’ni production’ga chiqarish (egasi tasdig‘i bilan: `main` push + Cloudflare production branch = `main`, yoki qo‘lda deploy) va so‘ng GET smoke.
3. Fizik Android telefonda 1.1.2 ustidan yangilash va asosiy oqim (checkout, xarita, kamera, bildirishnoma).
4. Windows kompyuterda o‘rnatish va admin login.
5. Real SMS/email/Telegram/FCM kerak bo‘lsa — hisoblar va acceptance test.

Pilot (do‘kon ichida, parol bilan kirish, ochiq ilova bildirishnomalari) uchun 1.1.2 RC 1–2 bandlardan keyin ishlatilishi mumkin.

## 12. Qo‘shimcha: `fayz-market-api-production` hodisasi (2026-11-25)

Ildizdan `npx wrangler deploy --env production` ildiz `wrangler.toml`da `[env.production]` yo‘qligi sabab alohida `fayz-market-api-production` Worker’ini (`eb2fd9e9`) yaratdi — u production D1/R2’ga ulangan, 1.1.2 kodida, faqat o‘z workers.dev manzilida, ilovalardan trafik yo‘q. Asosiy `fayz-market-api` o‘zgarmadi (`9ff0b7fb`). Repo tuzatildi: ildizga `[env.production]` (`name = "fayz-market-api"`) va regressiya testi; endi uchala deploy yo‘li bitta Worker’ga boradi. Ortiqcha Worker’ni o‘chirish tartibi va dalillar: [`evidence-post-codex/worker-name-incident/README.md`](evidence-post-codex/worker-name-incident/README.md).
