# Mustaqil test natijalari

Audit 2026-11-24–25. Quyidagi sonlar saqlangan yakuniy dalillardan olinadi. Production’da faqat GET va Cloudflare read-only metadata tekshirildi. Lokal testlar yangi D1/R2 kataloglarida bajarildi; bu production yoki fizik telefon natijasi emas.

| Test | Natija | Dalil |
|---|---|---|
| Vitest | VERIFIED — 46/46 | `evidence/unit.txt` |
| TypeScript API/admin/customer | VERIFIED — exit 0 | `evidence/typecheck.txt` |
| Backend expansion | VERIFIED — 129/129 | `evidence/expansion-api.txt` |
| Asl API integration + lokal R2 | VERIFIED — 38/38 | `evidence/integration.txt` |
| V1 browser regressiyasi | VERIFIED — 43/43 (39 original + 4 yangi) | `evidence/regression-ui.txt` |
| Kengaytirilgan UI | VERIFIED — 54/54, worker fixdan keyin | `evidence/expansion-ui.txt` |
| SMS/email/Telegram/FCM/Routes mock | VERIFIED — 35/35 mock, real provider emas | `evidence/mock-providers.txt` |
| Yangi security integration | VERIFIED — 11/11: parallel OTP, session revoke, oversized body, push cleanup | `evidence/security-regression.txt` |
| Production GET-only | VERIFIED — 11/11 | `evidence/production-get.txt` |
| Android origin policy (JVM) | VERIFIED — 9/9 | `evidence/android-origin.txt` |
| QA path safety | VERIFIED — mavjud path rad, sentinel saqlangan | `evidence/local-worker-safety.txt` |
| Android build/certificate/package | Build log va metadata bilan VERIFIED; native runtime emas | `evidence/android-build.txt`, `apk-signature.txt`, `customer-apk.txt`, `admin-apk.txt` |
| macOS candidate read-only smoke | 8 checks: launch, UI, no Node globals, IPC, GET | `evidence/desktop-readonly.txt` |
| Old DMG checksum | VERIFIED — VALID | `evidence/dmg-verify.txt` |
| Windows real runtime | NOT TESTED | Windows qurilmasi yo‘q; build runtime PASS emas |
| Android native/real-device/upgrade | NOT TESTED | ADB qurilmalar ro‘yxati bo‘sh; oldingi emulyator natijasi qayta da’vo qilinmadi |
| Jonli provayderlar va app-killed push | BLOCKED | Hisob/secret/native FCM ulanishi yetishmaydi |
| Dependency audit | 14 → 0 ta ma’lum zaiflik | `npm-audit.json`, `npm-audit-after.json` |

## Qayta tiklangan buyurtma xatosi

`refreshOrders` ichidagi nested Promise.all bitta 404’da barcha muvaffaqiyatlarni tashlab yuborar edi. Unit test guest muvaffaqiyati + guest 404 + account muvaffaqiyatini tekshiradi; account 401 va to‘liq offline ham bor. Browser test haqiqiy lokal order bilan yonma-yon `99999999` missing ID saqlaydi: valid status qoladi, retry warning bor, ikkala local token saqlanadi. Asl 39 assertion olib tashlanmadi.

## Muvaffaqiyatsiz urinishlar yashirilmadi

- Sandbox lokal listen/ADB/DNS’ni blokladi. Faqat tegishli ruxsatdan keyin qayta bajarildi.
- Version metadata importida noto‘g‘ri relative path — build failed; tuzatildi.
- Release/debug `usesCleartextTraffic` manifest merge conflict — tools:replace bilan tuzatildi, keyingi Android build o‘tdi.
- Npm hoisting’dan so‘ng umumiy UI React types’ni topmadi — root dev dependency bilan tuzatildi.
- Parallel Wrangler inspector port to‘qnashuvi ba’zi suite’larni boshlatmadi. Runner unique HTTP port, inspector port 0 va ketma-ket suite’lardan foydalanadi. Bu urinishlar PASS soniga qo‘shilmadi.
- Map UI dastlab 8/9’da to‘xtadi. Diagnostic «Worker failed to load»ni ko‘rsatdi; MapLibre Vite worker URL explicit asset sifatida qo‘shildi. Oldingi muvaffaqiyatsizlik `evidence/map-worker-failure.txt`da, yangi to‘liq UI log alohida.
- Eski production `api-verify.mjs` 74-testli yozuvchi skript, `production-readonly.mjs` esa ayrim POST/login amallariga ega. Ular production’da ishga tushirilmadi. Yangi `scripts/codex-audit/production-get.mjs` faqat GET yuboradi.

## Takrorlash

`npm ci` → `npm test` → `npm run typecheck`. UI uchun avval `VITE_ANDROID_BUILD=1 npm run build:customer` va `VITE_ANDROID_BUILD=1 npm run build:admin`, keyin `node scripts/codex-audit/run-local.mjs`. Chrome manzilini `CHROME_PATH` bilan bering. `QA_SUITES=api,integration,regression,expansion,security` yordamida tor to‘plam tanlanadi. Mock: `node scripts/deploy-qa/provider-test-mode.mjs`. Hech bir mutating suite’ga production URL bermang.

UI sinovi davomida shu `apps/*/dist` fayllarini boshqa desktop/Android build bilan almashtirmang. Yakuniy artefaktni tekshirganda paket ichidagi bundle va test qilingan bundle mosligini qayta tekshiring. Security/feature test coverage barcha mumkin bo‘lgan holatlarni qamramaydi; yuklama, crash injection va fizik qurilmalar alohida.
