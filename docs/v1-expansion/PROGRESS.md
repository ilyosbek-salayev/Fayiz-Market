# V1 kengaytirish — progress (keyingi sessiya shu fayldan davom etadi)

Branch: `feat/v1-premium-ui` · **Push qilinmagan** · Expo va GitHub Actions yo‘q · Oxirgi yangilanish: 2026-11-22.

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
| (shu commit) | `docs/v1-expansion/*` |

## Fazalar

| Faza | Holat |
|---|---|
| 0 Stabilizatsiya (R2 ham) | ✅ |
| 1 Identifikatsiya va rollar | ✅ kod; SMS/Telegram jonli — ⚙️ hisob kerak; biometrika — 📱 |
| 2 Rasm (kamera/galereya → R2) | ✅ brauzerda; kamera — 📱 |
| 3 Xarita va manzil | ✅ GPS + koordinata; interaktiv xarita — ⚙️ Maps kaliti |
| 4 Kuryer operatsiyalari va kuzatuv | ✅ (foreground) |
| 5 Bildirishnomalar | ✅ ilova ochiq/minimallashganda; yopiq — ⚙️ FCM |
| 6 Sharhlar | ✅ |
| 7 Integratsiyalar | ✅ |
| 8 Desktop | ✅ macOS sinaldi; Windows — 📱 |
| 9 QA | ✅ 20 + 129 + 48 + 39 + 74 + 8 |

Production: Worker `fayz-market-api` (versiya `6f0db37f`), D1 0001–0005, R2 `fayz-market-images`. Production ma’lumoti: 1 owner, sozlamalar; sinov yozuvlari tozalangan.

## Keyingi aniq qadam

1. Telefonni USB debugging bilan ulab: `adb install -r dist/apk/v1.1.0/*.apk`, so‘ng `docs/deployment/REAL_DEVICE_QA.md` + kamera, barmoq izi, GPS, bildirishnoma.
2. Foydalanuvchi qaroriga ko‘ra: Google Maps kaliti (billing), Eskiz SMS, Telegram bot, Firebase — `INTEGRATIONS_SETUP.md`.
3. Windows kompyuterda `Fayz-Market-Admin-Setup.exe` sinovi.
4. FCM sozlangach: Android’ga Firebase Messaging client + `google-services.json`, versionCode 4.

## Eslatmalar

- Lokal QA: `scripts/deploy-qa/local-worker.sh <dir>` → `node scripts/deploy-qa/expansion-verify.mjs`, `node scripts/ui-qa/expansion-ui.mjs`; V1 regress uchun `QA_BOOTSTRAP=qa-local-secret-only` + `seed.mjs` + `regress.mjs`.
- Production tozalash: `scripts/deploy-qa/cleanup-qa.sh <r2-kalitlar>` (avval eksport).
- Foydalanuvchining eski `:8787` lokal serveri 0005 siz: kerak bo‘lsa `npx wrangler d1 migrations apply fayz-market --local --persist-to .local-phone-db` (`apps/api` dan).
- Toolchain `/private/tmp/fayz-toolchain` da — Mac qayta yoqilsa o‘chishi mumkin.
