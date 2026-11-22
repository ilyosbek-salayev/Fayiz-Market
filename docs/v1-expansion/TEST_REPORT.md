# Test hisoboti (2026-11-22, v1.1.1)

Barcha natijalar shu sessiyada haqiqatan bajarilgan. Muhitlar aniq ajratilgan: **lokal Worker** (izolyatsiyalangan D1, har safar yangi), **Chrome WebView emulyatsiyasi**, **Android 14 emulyatori** (haqiqiy APK, haqiqiy Android WebView — lekin telefon emas), **production** (faqat o‘qish).

| To‘plam | Muhit | Natija |
|---|---|---|
| `npm test` — PBKDF2, Telegram HMAC/replay, holat jadvali, OTP, email, test rejimi izolyatsiyasi | Node | **25/25** |
| `npm run typecheck` (api, admin, customer) | — | ✅ |
| `scripts/deploy-qa/expansion-verify.mjs` — auth, OTP, Telegram, rollar, kuryer chegaralari, tayinlash, kuzatuv, tasdiq/e’tiroz, sharhlar, integratsiyalar (8), audit | lokal Worker | **129/129** |
| `scripts/deploy-qa/provider-test-mode.mjs` — mock Eskiz/Resend/Google OAuth+FCM/Telegram/Routes, OTP echo o‘chiq: SMS, email ro‘yxat/parolsiz kirish/tiklash/bog‘lash, integratsiya testlari, Telegram replay, FCM JWT (RS256 tekshirildi), 404 token o‘chirilishi | lokal Worker + mock | **35/35** |
| `scripts/ui-qa/expansion-ui.mjs` — APK bundle’lari: SMS va **email** ro‘yxat, parolsiz email kirish, **OpenFreeMap xaritasi** (chizilishi, GPS, surib pin ko‘chirish), checkout, admin xaritasi, tayinlash, kuryer oqimi, kuzatuv xaritasi (kuryer + manzil), tasdiq, sharh, R2 rasm, overflow | lokal Worker + Chrome 158 | **54/54** |
| `scripts/ui-qa/regress.mjs` — asl V1 funksiyalari | lokal Worker + Chrome | **39/39** |
| `scripts/android-qa/upgrade.mjs` — v1.0.1 → v1.1.1 `adb install -r` | **Android 14 emulyatori** | **12/12** |
| `scripts/android-qa/native-qa.mjs` — barmoq izi, kamera, GPS, bildirishnoma, xarita, kuryer GPS | **Android 14 emulyatori** | **25/25** |
| `scripts/deploy-qa/production-readonly.mjs` — test rejimi yo‘qligi, 503 lar, guardlar, integratsiyalar | **production** (yozmaydi) | **20/20** |
| `scripts/deploy-qa/desktop-smoke.mjs` — paketlangan macOS `.app` | **production** | **9/9** |
| APK fayllari (aapt2, apksigner, assetlar) | lokal | ✅ |
| `.app` codesign, dmg checksum, exe PE/asar tarkibi | lokal | ✅ |

## Emulyatorda nima tekshirildi (`native-qa.mjs`)

- **Biometrika:** BiometricManager «available»; profilda yoqish → tizim BiometricPrompt → virtual barmoq izi → token Keystore kaliti bilan shifrlandi, WebView xotirasidan ochiq token o‘chdi; qayta ochilganda qulf ekrani; ro‘yxatdan o‘tmagan barmoq ochmaydi; to‘g‘ri barmoq sessiyani ochadi.
- **Xarita:** MapLibre + OpenFreeMap Android WebView’da WebGL bilan chiziladi (kalitsiz).
- **GPS:** shell Android ruxsatini so‘raydi («While using the app»), emulyator GPS nuqtasi WebView’ga yetadi, buyurtmaga koordinata yoziladi; kuryer ilovasi `watchPosition` orqali joyni yuboradi va harakatlanganda qayta yuboradi; ekranda ulashish belgisi.
- **Bildirishnoma:** admin ilova fonda — polling tizim bildirishnomasini chiqaradi (kanal `operations`, lock-screen private); shade’da bosilganda aynan shu buyurtma ochiladi.
- **Kamera:** «Kamerada suratga olish» → tizim kamera ilovasi → surat → ilovaga qaytdi, kichraytirildi (≈22 KB), R2’ga (lokal) yuklandi; galereyaga saqlanmadi.

## Shu sessiyada topilgan va tuzatilgan nuqsonlar

| Nuqson | Tuzatish |
|---|---|
| `maplibre-gl.css` keyin yuklanib xarita konteyneriga `position: relative` berardi → balandlik 0, xarita bo‘sh (Android WebView’da topildi) | `.map-box > .map-canvas` yuqoriroq spetsifiklik |
| APK asset papkasiga eski build fayllari qolishi mumkin edi | `build-apks.sh` papkani tozalaydi |
| Android shell noma’lum fayl turlarini `text/html` deb berardi | `.json`, `.wasm`, `octet-stream` qo‘shildi |
| Dev OTP faqat `ENVIRONMENT != production` bilan cheklangan edi (o‘zgaruvchi yo‘qolsa xavf) | endi `ENVIRONMENT=development` **va** `http://` URL shart |

## Sinalmagan (bloklangan)

- **Haqiqiy Android telefon** — telefon ulanmagan. Emulyator natijalari telefon natijasi deb da’vo qilinmaydi (real kamera, haqiqiy barmoq izi sensori, GPS signal, ishlab chiqaruvchi batareya cheklovlari farq qilishi mumkin).
- **Windows’da `.exe`** — Windows kompyuter yo‘q.
- **Jonli SMS, email, Telegram, FCM, Google Maps/Routes** — hisob ma’lumotlari va (Google/Resend uchun) billing/domen yo‘q. Kod yo‘llari mock provayderlar bilan sinalgan, haqiqiy provayder bilan emas.
- Telegram OAuth redirect oqimi (oauth.telegram.org) — haqiqiy bot kerak.
