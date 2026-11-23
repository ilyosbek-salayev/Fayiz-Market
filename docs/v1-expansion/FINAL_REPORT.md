# Fayz Market V1.1.1 — yakuniy hisobot

**Loyiha to‘liq tugallangan deb e’lon qilinmaydi.** Kod, avtomatik testlar va Android emulyatori sinovlari tayyor; bir qator funksiyalar haqiqiy telefon, Windows kompyuter va tashqi hisob ma’lumotlarini kutmoqda.

Belgilar: **Verified** — haqiqiy muhitda ishga tushirib tasdiqlangan (qaysi muhit ko‘rsatilgan). **Partial** — kod tayyor va qisman sinalgan, lekin yakuniy muhitda emas. **Blocked** — sizdan biror narsa kerak.

## Funksiyalar

| Funksiya | Holat | Dalil / nima yetishmaydi |
|---|---|---|
| Mavjud V1 funksiyalari buzilmagan | **Verified** | regress 39/39; production 20/20; v1.0.x ilovalar yangi backend bilan ishlaydi |
| Production backend + D1 0001–0006 | **Verified** | Worker `9ff0b7fb`; 0006 oldin production nusxasida sinaldi, zaxira `dist/backups/fayz-market-pre-0006-*.sql`; ma’lumot o‘zgarmadi (1 owner, 10 sozlama) |
| R2 rasm saqlash | **Verified** | production (oldingi sessiya 74/74), emulyatorda kamera → yuklash (lokal R2) |
| Parol bilan ro‘yxat/kirish/tiklash | **Verified** | lokal 129/129, UI 54/54 |
| SMS OTP | **Partial** | kod yo‘li mock Eskiz bilan 35/35; production → 503 (to‘g‘ri). **Blocked:** Eskiz hisobi |
| Email OTP (yangi) | **Partial** | ro‘yxat, parolsiz kirish, tiklash, bog‘lash — mock Resend va UI’da sinalgan; production → 503. **Blocked:** Resend + o‘z domeningiz |
| Telegram Login | **Partial** | imzo/replay/bog‘lash testlari; `getMe` mock. **Blocked:** bot token + `/setdomain` |
| Productionda test token / dev OTP yo‘qligi | **Verified** | unit testlar + production 20/20 (devEcho=false, `qa-bootstrap` → 403); secretlar: faqat `BOOTSTRAP_SECRET` |
| Barmoq izi (mijoz, admin) | **Verified (emulyator)** / Partial (telefon) | Android 14 emulyatori: prompt, Keystore shifrlash, noto‘g‘ri barmoq rad, to‘g‘ri barmoq ochadi. Haqiqiy telefonda sinalmagan |
| Yangi barmoq izi qo‘shilganda (kalit yaroqsiz) | **Verified (emulyator, mijoz)** / Partial (admin) | mijoz 7/7: prompt chiqmaydi, shifrlangan sessiya o‘chadi, faqat «Parol bilan kirish» qoladi, keyingi ochilishda qulf yo‘q. Admin: xuddi shu `invalidated` yo‘li parol formasiga o‘tkazadi — kod va typecheck, emulyatorda alohida sinalmagan |
| Kamera / galereya → R2 | **Verified (emulyator)** / Partial (telefon) | tizim kamera ilovasi, preview, yuklash, galereyaga saqlanmaydi |
| GPS (checkout, kuryer) | **Verified (emulyator)** / Partial (telefon) | ruxsat dialogi, koordinata buyurtmada, kuryer `watchPosition` va qayta yuborish |
| Interaktiv xarita kalitsiz (MapLibre + OpenFreeMap) | **Verified** | Android WebView (emulyator), Chrome, macOS `.app` ichida chiziladi; pin surish, GPS markazlash, kuzatuv/admin markerlar |
| Google Maps (ixtiyoriy) | **Blocked** | browser kaliti + Google billing tasdig‘i |
| Masofa/ETA (Google Routes) | **Blocked** | `GOOGLE_ROUTES_KEY`; kalitsiz 503, masofa o‘ylab topilmaydi |
| Kuryer roli, tayinlash, holatlar, tasdiq, e’tiroz | **Verified** | lokal 129/129, UI 54/54, emulyatorda kuryer oqimi |
| Bildirishnomalar — ilova ochiq/fonda | **Verified (emulyator)** | Android tizim bildirishnomasi, bosilsa buyurtma ochiladi; desktop — lokal UI sinovi |
| Bildirishnomalar — ilova yopiq (FCM) | **Partial / Blocked** | backend sender mock bilan 35/35 (JWT, yuborish, o‘lik tokenni o‘chirish). **Blocked:** Firebase loyihasi, `google-services.json`, Android client |
| Sharhlar va kuryer bahosi (faqat tasdiqdan keyin) | **Verified** | lokal + UI |
| Integratsiyalar sahifasi (secret qaytmaydi) | **Verified** | production 20/20 (8 ta yozuv, qiymatlar yo‘q) |
| Android APK v1.1.1, paket va imzo saqlangan | **Verified** | aapt2/apksigner; imzo `93f0f845…f89851` |
| In-place yangilash (ma’lumot saqlanadi) | **Verified (emulyator)** / Partial (telefon) | 1.0.1 (2) → 1.1.1 (4) → 1.1.1 (5) `adb install -r` 12/12 + 12/12 |
| macOS admin `.app` + `.dmg` | **Verified** | codesign, dmg VALID, `.app` production’ga qarshi 9/9 |
| Windows `.exe` | **Partial** | haqiqiy NSIS build, x64 ilova, ichida production URL; **Windows’da ishga tushirilmagan** |
| Kod imzosi (Apple Developer ID / Windows sertifikat) | **Blocked** | ixtiyoriy, pullik |

## Artefaktlar

| Fayl | Hajm | SHA-256 |
|---|---|---|
| `dist/apk/v1.1.1/fayz-market-customer-debug.apk` (1.1.1, versionCode 5) | 644 012 B | `ecfd5e75…912e` |
| `dist/apk/v1.1.1/fayz-market-admin-debug.apk` (1.1.1, versionCode 5) | 646 808 B | `8bd38997…0773` |
| `dist/desktop/fayz-market-admin-1.1.1-macos-arm64.dmg` (1.1.1) | 107 789 138 B | `3923631d…fea9` |
| `dist/desktop/fayz-market-admin-1.1.1-windows-x64-setup.exe` (1.1.1) | 92 180 248 B | `6037d172…64fb` |

## Sizdan kerak

1. **Telefon** (USB debugging): `adb install -r dist/apk/v1.1.1/*.apk`, so‘ng kamera, barmoq izi, GPS, bildirishnoma — emulyatordagi skriptlar telefonda ham ishlaydi.
2. **Windows kompyuter**: `fayz-market-admin-1.1.1-windows-x64-setup.exe` ni o‘rnatib sinash.
3. **Eskiz** (SMS), **Resend + domen** (email), **Telegram bot**, **Firebase** (yopiq ilovaga push), ixtiyoriy **Google Maps/Routes** — `INTEGRATIONS_SETUP.md`.

## Ma’lum cheklovlar

- Kuryer joylashuvi faqat ilova ochiq bo‘lganda yuboriladi (foreground service yo‘q).
- OpenFreeMap’da manzil nomini avtomatik aniqlash yo‘q — mijoz manzilni yozadi.
- APK’lar debug build (Play Store uchun release kalit alohida bosqich).

Batafsil: `TEST_REPORT`, `TEST_MODES`, `ANDROID_COMPATIBILITY`, `DESKTOP_BUILD`, `MAPS_DELIVERY`, `AUTH_SECURITY`, `INTEGRATIONS_SETUP`, `NOTIFICATIONS`, `PROGRESS`.
