# Funksiyalar matritsasi

✅ ishlaydi va sinovdan o‘tgan · ⚙️ kod tayyor, tashqi sozlama/ruxsat kerak · 📱 qurilmada sinalmagan · ⛔ yo‘q

| Funksiya | Backend | Mijoz | Admin/Kuryer | Holat | Dalil |
|---|---|---|---|---|---|
| R2 rasm saqlash | ✅ | ✅ | ✅ | ✅ production | api-verify 74/74 |
| Telefon + SMS OTP ro‘yxatdan o‘tish | ✅ | ✅ | — | ⚙️ Eskiz kerak | lokal 129/129, UI 48/48 (dev kod) |
| Parol bilan kirish / tiklash | ✅ | ✅ | — | ✅ (tiklash ⚙️ SMS) | expansion-verify |
| Telegram login + replay himoyasi | ✅ | ✅ | — | ⚙️ bot + /setdomain | HMAC unit + lokal oqim |
| Biometrik kirish (mijoz va admin) | — | ✅ | ✅ | 📱 Android 9+ | APK tarkibi tekshirildi |
| Admin sessiya/parol, rollar | ✅ | — | ✅ | ✅ | 403/401 testlari |
| COURIER roli (admin ilovasida) | ✅ | — | ✅ | ✅ | 9 ta 403 tekshiruv, UI 48/48 |
| Kamera / galereya, preview, progress, R2 | ✅ | — | ✅ | ✅ brauzer, 📱 kamera | UI 48/48 |
| Checkout joylashuvi (GPS + pin) | ✅ | ✅ | — | ✅ GPS + OpenFreeMap xarita (kalitsiz); Google ixtiyoriy | UI 54/54, emulyator 25/25 |
| Admin: xarita, tayinlash, qayta tayinlash, audit | ✅ | — | ✅ | ✅ | 129/129, UI |
| Kuryer paneli, holatlar, navigatsiya | ✅ | — | ✅ | ✅ | UI |
| Masofa/ETA (Routes) | ✅ | — | ✅ | ⚙️ Routes kaliti (kalitsiz — soxta raqam yo‘q) | 503 testi |
| Kuzatuv (kuryer → mijoz) | ✅ | ✅ | ✅ | ✅ ilova ochiq bo‘lganda | UI 48/48 |
| Mijoz tasdig‘i / e’tiroz / admin hal qilishi | ✅ | ✅ | ✅ | ✅ | 129/129 |
| Sharh va kuryer bahosi (faqat tasdiqdan keyin) | ✅ | ✅ | ✅ moderatsiya | ✅ | 129/129, UI |
| Bildirishnoma: ilova ochiq/minimallashgan | ✅ | ✅ | ✅ | ✅ in-app; 📱 Android tizim bildirishnomasi | UI |
| Bildirishnoma: ilova yopiq / qayta yuklashdan keyin | ✅ FCM yuboruvchi | ⛔ | ⛔ | ⚙️ Firebase loyihasi kerak | — |
| Integratsiyalar sahifasi | ✅ | — | ✅ super admin | ✅ | secret qiymati qaytmasligi testlandi |
| macOS admin `.dmg` (arm64) | — | — | ✅ | ✅ shu Mac'da ishga tushirildi | desktop-smoke 8/8 |
| Windows admin `.exe` | — | — | ✅ | 📱 Windows'da ishga tushirilmagan | build + tarkib tekshirildi |

v1.1.1 qo‘shimchalari: email OTP (ro‘yxat, parolsiz kirish, tiklash, bog‘lash) — kod ✅, jonli ⚙️ Resend + domen; kalitsiz interaktiv xarita (MapLibre + OpenFreeMap) — ✅. Holatlar bo‘yicha yakuniy jadval: [FINAL_REPORT](FINAL_REPORT.md).
