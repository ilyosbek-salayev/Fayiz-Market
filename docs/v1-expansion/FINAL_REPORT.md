# Fayz Market V1 kengaytirish — yakuniy hisobot

**Loyiha to‘liq tugallangan deb e’lon qilinmaydi**: kod va avtomatik/emulyatsiya testlari tayyor, lekin bir qator qabul mezonlari tashqi hisob ma’lumotlari, billing tasdig‘i va qurilmalarni kutmoqda (pastda).

## Natija

**MIJOZ → ADMIN → KURYER → TASDIQ → SHARH** oqimi Cloudflare backend’da ishlaydi va UI orqali uchidan-uchigacha sinaldi (48/48), backend qoidalari 129/129, asl V1 39/39, production kontrakti 74/74.

| Talab | Holat |
|---|---|
| Mavjud funksiyalar buzilmagan | ✅ (39/39, production 74/74; o‘rnatilgan v1.0.x ilovalar ishlaydi) |
| Production backend | ✅ `https://fayz-market-api.ilyosbeksalayev240.workers.dev`, 0005 migratsiya (zaxira bilan) |
| R2 | ✅ faol va sinalgan |
| Ro‘yxatdan o‘tish / login | ✅ parol; SMS OTP — ⚙️ Eskiz; Telegram — ⚙️ bot |
| Biometrika | ✅ kod (Keystore + BiometricPrompt); 📱 qurilmada sinalmagan |
| Kamera / galereya | ✅ yuklash R2 ga; kamera 📱 |
| Xaritadan manzil | ✅ GPS + koordinata saqlanadi; interaktiv xarita ⚙️ Maps kaliti |
| Kuryer roli, tayinlash, ruxsatlar | ✅ |
| Navigatsiya | ✅ Google Maps havolasi; masofa/ETA ⚙️ Routes kaliti |
| Kuzatuv | ✅ kuryer ilovasi ochiq bo‘lganda |
| Bildirishnomalar | ✅ ilova ochiq/minimallashgan; yopiq — ⚙️ FCM |
| Tasdiq va tasdiqlangan sharhlar | ✅ |
| Integratsiyalar xavfsizligi | ✅ secret qiymati hech qachon qaytmaydi |
| Android APK’lar | ✅ v1.1.0, paket va imzo saqlangan; in-place o‘rnatish 📱 |
| macOS installer | ✅ yaratildi va shu Mac’da sinaldi (8/8) |
| Windows installer | ✅ yaratildi; 📱 Windows’da sinalmagan |

## Artefaktlar

- `dist/apk/v1.1.0/fayz-market-customer-debug.apk`, `…/fayz-market-admin-debug.apk`
- `dist/desktop/Fayz-Market-Admin-macOS.dmg`, `dist/desktop/Fayz-Market-Admin-Setup.exe`
- Zaxira: `dist/backups/fayz-market-pre-0005-apply-*.sql`

## Bloklangan (sizdan kerak)

1. **Google Maps** browser kaliti (Google Cloud billing — tasdig‘ingizsiz yoqilmadi). **Routes** — ixtiyoriy.
2. **SMS**: Eskiz.uz hisobi + shablon tasdig‘i + 4 ta secret.
3. **Telegram**: bot, `/setdomain`, token secret, username.
4. **Firebase** (yopiq ilovaga push): loyiha, `google-services.json`, service account.
5. **Telefon**: USB debugging bilan ulash — in-place o‘rnatish, kamera, barmoq izi, GPS, bildirishnoma sinovi.
6. **Windows** kompyuterda `.exe` sinovi; tarqatish uchun kod imzosi (Apple Developer ID / Windows sertifikat) — ixtiyoriy.

## Ma’lum cheklovlar

- Kuryer joylashuvi faqat ilova ochiq bo‘lganda yuboriladi (foreground service yo‘q).
- Bildirishnomalar polling orqali (20–30 s); FCM sozlanmaguncha ilova yopiq bo‘lsa kelmaydi.
- Email orqali admin parolini tiklash yo‘q — super admin tiklaydi.
- APK’lar debug build (Play Store uchun release kalit alohida bosqich).

Batafsil: `ARCHITECTURE`, `FEATURE_MATRIX`, `AUTH_SECURITY`, `MAPS_DELIVERY`, `COURIER_WORKFLOW`, `NOTIFICATIONS`, `INTEGRATIONS_SETUP`, `DESKTOP_BUILD`, `ANDROID_COMPATIBILITY`, `TEST_REPORT`, `PROGRESS`.
