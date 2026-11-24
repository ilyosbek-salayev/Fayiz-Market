# Fayz Market — mustaqil loyiha auditi

Audit: 2026-11-24–25 (Asia/Tashkent). Boshlang‘ich HEAD `91c1416`, branch `feat/v1-premium-ui`. Ish boshida faqat `.DS_Store` o‘zgargan; unga tegilmadi. Ushbu hisobot kod ko‘rigi, yangi lokal sinovlar va production read-only dalillarini ajratadi. Oldingi hisobotdagi PASS avtomatik qabul qilinmadi.

**Xulosa: pilot uchun asos mavjud, to‘liq tijoriy topshirish hali tayyor emas.** Hisoblar, fizik qurilmalar va production patch joylashtirish alohida yakunlanishi kerak. [Testlar](TEST_RESULTS.md), [xavfsizlik](SECURITY_REPORT.md), [release](RELEASE_READINESS.md).

## Arxitektura va discovery

React 19/Vite klientlari → Java Android WebView yoki Electron → Hono Cloudflare Worker → D1 + R2. Faol backend Cloudflare-only; yangi backend, Expo yoki GitHub Actions qo‘shilmadi. `apps/mobile` ichida eski React Native/Expo qoldig‘i bor, u root workspace yoki faol APK buildga kirmaydi; o‘chirilmadi.

Ko‘rilgan manbalar: root README, `docs/v1`, `docs/ui-redesign`, `docs/deployment`, `docs/v1-expansion/{ARCHITECTURE,PROGRESS,FINAL_REPORT,TEST_REPORT,TEST_MODES,INTEGRATIONS_SETUP,MAPS_DELIVERY,NOTIFICATIONS,TELEGRAM_QA_CHECKLIST}.md`, `dist/RELEASE_MANIFEST.md`. `docs/v1-expansion/REAL_DEVICE_REPORT.md` yo‘q; amaldagi qo‘llanmalar `docs/deployment/REAL_DEVICE_QA.md` va Telegram checklist. Checklist bajarilgani haqida mustaqil dalil topilmadi.

| Modul | Kod | Mustaqil holat |
|---|---|---|
| Auth/accounts | `apps/api/src/customers.ts`, `password.ts`, `otp.ts`, `email.ts`, `telegram.ts` | Lokal auth/OTP/session/Telegram mock sinalgan; haqiqiy provayderlar BLOCKED |
| Katalog, ombor, to‘lov | `apps/api/src/index.ts`, `packages/shared/src/index.ts` | Lokal API/UI bilan VERIFIED; DB triggerlar qoldiq, narx, ortiqcha to‘lovni cheklaydi |
| Orders | `index.ts`, `customer/main.tsx`, `order-history.ts` | Lokal VERIFIED; bitta eski token qolgan tarixni yashirmaydi |
| Yetkazish/kuryer | `delivery.ts`, `lifecycle.ts`, `admin/courier.tsx` | Lokal rollar, IDOR, lifecycle sinovlari; fizik GPS NOT TESTED |
| Reviews | `delivery.ts`, `staff.ts`, `customer/account.tsx` | Sotib olingan/tasdiqlangan buyurtmaga bog‘lash va moderatsiya mavjud |
| Notifications | `push.ts`, `packages/ui/src/native.ts`, `admin/expansion.tsx` | Polling/local OS notifications; yopiq Android push tugallanmagan |
| Settings/integrations | `staff.ts`, `admin/expansion.tsx` | Owner-only sozlash; secret qiymatlari klientga berilmaydi |
| Storage | `migrations/0001…0006`, R2 binding | Lokal D1/R2 CRUD VERIFIED; remote migrations list pending yo‘qligini tasdiqladi; yangi remote R2 upload bajarilmadi |
| Android | `apps/android/shared/java`, customer/admin Gradle | APK build/imzo tekshiruvi; joriy native runtime sinovi NOT TESTED |
| Desktop | `apps/desktop/main.cjs`, `preload.cjs` | IPC/keychain implementatsiyasi; platforma holati release hisobotida |

## Customer — majburiy 20 tekshiruv

| # | Funksiya | Holat va dalil |
|---|---|---|
| 1–2 | Ishga tushish, splash, navigatsiya | Browser UI VERIFIED; APK build VERIFIED; fizik splash/ochilish NOT TESTED |
| 3–5 | Katalog, kategoriya/qidiruv, detail/rasm | Lokal API + V1 UI regressiyasi VERIFIED |
| 6–7 | Savat va checkout | Lokal UI/API VERIFIED; stock/payment triggerlari integration sinovida |
| 8 | Buyurtma tarixi | VERIFIED: missing-order unit va browser regressiyasi, token saqlanadi |
| 9 | Serverni almashtirish | Debug-only kod; release native menyudagi bypass yopildi; qurilma sinovi NOT TESTED |
| 10 | Telefon/email/Telegram | Mock/local VERIFIED; production config’da uchalasi o‘chiq — BLOCKED |
| 11 | Biometrika | Keystore/BiometricPrompt kodi ko‘rildi; yangi auditda qurilma yo‘q — NOT TESTED |
| 12–13 | Yetkazish manzili/xarita/GPS | Matnli manzil mavjud; interaktiv xarita holati TEST_RESULTS’da; fizik GPS NOT TESTED |
| 14–15 | Status va kuryer lokatsiyasi | API tracking/role cheklovlari lokal sinovda; jonli fizik yo‘l sinovi yo‘q |
| 16–17 | Tasdiq va baholash | API lifecycle, takror/erta sharhni rad etish sinalgan |
| 18 | Bildirishnomalar | Ochiq UI polling kodi; FCM/native token lifecycle integratsiyasi tugallanmagan |
| 19 | Offline | V1 UI xabar/retry; offline checkout queue yo‘q; to‘lov yoki order muvaffaqiyati o‘ylab topilmaydi |
| 20 | Ustidan yangilash | Package ID va debug sertifikat mos; fizik in-place yangilash NOT TESTED |

## Admin, Courier, Desktop

Owner: xodim/integratsiya/settings; manager: kundalik katalog/order; courier: faqat o‘z delivery va ruxsat berilgan account endpointlari. Backend rollarni majburiy tekshiradi. R2 upload auth, MIME/magic bytes va 5 MB cheklovi bor; yangi umumiy body limit oqimni oldindan cheklaydi. Kamera/galereya tizim picker orqali; fizik sensorlar bu sessiyada sinalmadi.

Kuryer tracking `watchPosition`, faol deliverylar, kamida 15 s yoki 30 m interval, serverda 30/min limit; yakuniy bosqichlarda GPS yozuvi tozalanadi. Bu foreground service emas. Ilova yopilganda/fonda OS jarayonni to‘xtatsa, lokatsiya kafolatlanmaydi. Ruxsat rad etish xabari bor; yangi permission-revocation fizik sinovi kerak. Rozilikli foreground service loyihasi [MISSING_FEATURES](MISSING_FEATURES.md)da.

macOS safeStorage, isolated sandboxed renderer va tor preload ishlatiladi; yangi IPC guard iframe/boshqa window chaqiruvlarini rad etadi. Windows x64 installer konfiguratsiyasi NSIS, per-user, desktop/start shortcuts. Real Windows o‘rnatish/uninstall/update sinalmagan.

## Xarita

MapLibre/OpenFreeMap oldingi kodda allaqachon mavjud; yangidan qilingan deb da’vo qilinmaydi. Google key bo‘lmasa bepul engine tanlanadi. Checkout pin, admin/customer/courier markerlar va tashqi Google Maps navigation implementatsiyasi bor. WebGL/tarmoq xatosida koordinata va havola ko‘rsatiladi — bu fallback interaktiv xarita PASS hisoblanmaydi.

OpenFreeMap rasmiy sahifasi tijoriy foydalanishga ruxsat, API key/ro‘yxatdan o‘tish shart emas va public map requests uchun limit yo‘qligini bildiradi. Attribution saqlanadi; bepul servis uchun kafolatlangan SLA ushbu auditda aniqlanmadi. Offline download alohida qoidali; loyiha offline tiles yuklamaydi. [Provayder](https://openfreemap.org/), [qo‘llanma](https://openfreemap.org/quick_start/), [MapLibre litsenziyasi](https://github.com/maplibre/maplibre-gl-js/blob/main/LICENSE.txt). MapLibre kodi BSD-3-Clause; OSM/OpenMapTiles attribution ham saqlanishi kerak.
