# V1 kengaytirish — progress (keyingi sessiya shu fayldan davom etadi)

Branch: `feat/v1-premium-ui` · **Push qilinmagan** · Expo va GitHub Actions yo‘q · Oxirgi yangilanish: 2026-11-22 (v1.1.1).

## Commitlar

| Commit | Mazmun |
|---|---|
| `30b935f` | Cloudflare production config, PBKDF2 tuzatishi, v1.0.1 |
| `97acbfa` | Backend: akkauntlar, kuryer, yetkazish, kuzatuv, sharh, integratsiyalar, 0005 |
| `a2ed090` | Mijoz ilovasi kengaytmasi + umumiy UI modullari |
| `769188f` | Admin: kuryer paneli, xarita/tayinlash, xodimlar, sharhlar, integratsiyalar, kamera |
| `334a77c` | V1 regressiya testlari yangi yorliqlarga moslandi |
| `0244762` | Android qobig‘i v1.1.0 (umumiy `apps/android/shared`) |
| `81bf192` | Desktop: macOS dmg + Windows exe |
| `07c6d94` | `docs/v1-expansion/*` |
| `fb9aec5` | Barmoq izi kaliti yaroqsiz bo‘lganda tiklanish, versionCode 5, emulyator sozlash skripti |
| (keyingi) | Native QA tuzatishlari (toza qurilma), yakuniy hujjatlar |
| (oldingi) | v1.1.1: MapLibre + OpenFreeMap, email OTP (0006), lokal test rejimi/mock provayderlar, emulyator QA, APK/desktop 1.1.1, hujjatlar |

## Holat

Yakuniy jadval: [FINAL_REPORT](FINAL_REPORT.md). Production: Worker `9ff0b7fb`, D1 0001–0006, R2 `fayz-market-images`. Ma’lumot: 1 owner, 10 sozlama, 0 buyurtma.

## Keyingi aniq qadam

1. Telefonni USB debugging bilan ulash: `adb install -r dist/apk/v1.1.1/*.apk` (versionCode 5); so‘ng `node scripts/android-qa/upgrade.mjs` va `native-qa.mjs` ni telefonda (yoki qo‘lda `docs/deployment/REAL_DEVICE_QA.md`).
2. Windows kompyuterda `dist/desktop/Fayz-Market-Admin-Setup.exe` sinovi.
3. Foydalanuvchi qaroriga ko‘ra: Eskiz, Resend + domen, Telegram bot, Firebase, Google Maps/Routes — `INTEGRATIONS_SETUP.md`.
4. FCM sozlangach: Android’ga Firebase Messaging client + `google-services.json`, versionCode 5.

## Eslatmalar

- Lokal QA: `scripts/deploy-qa/local-worker.sh <dir>` (QA_PORT, QA_ENV_FILE, QA_OTP_ECHO) → `expansion-verify.mjs`, `scripts/ui-qa/expansion-ui.mjs` (`CHROME_PATH` — Chrome hozir `~/Desktop/Google Chrome.app` da); V1 regress: `QA_BOOTSTRAP=qa-local-secret-only` + `seed.mjs` + `regress.mjs`.
- Mock provayderlar: `node scripts/deploy-qa/provider-test-mode.mjs` (o‘zi Worker’ni ko‘taradi, 8789/8790).
- Production faqat o‘qish: `node scripts/deploy-qa/production-readonly.mjs` (+ `QA_OWNER_EMAIL/PASSWORD`).
- Toolchain endi `~/.fayz-toolchain` da (qayta yoqilganda o‘chmaydi): JDK `~/.fayz-toolchain/jdk/Contents/Home`, SDK `~/.fayz-toolchain/android-sdk` (platform 35, build-tools 34/35, emulator, `system-images;android-34;google_apis;arm64-v8a`), AVD `fayz34` (`ANDROID_AVD_HOME=~/.fayz-toolchain/avd`). O‘rnatish: `bash ~/.fayz-toolchain/setup.sh`. Yangi AVD’ni tayyorlash (PIN 1111, barmoq izi 1): `node scripts/android-qa/setup-emulator.mjs`. `lib.mjs` SDK’ni o‘zi topadi.
- Emulyator QA: `QA_PORT=8791 scripts/deploy-qa/local-worker.sh <dir>` → `node scripts/android-qa/native-qa.mjs`. Port 9333 ni `adb forward` band qilsa desktop smoke ishlamaydi (`adb forward --remove-all`).
