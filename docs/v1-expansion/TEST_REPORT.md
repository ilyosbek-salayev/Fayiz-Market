# Test hisoboti (2026-11-22)

Barcha natijalar shu sessiyada haqiqatan bajarilgan. Lokal testlar izolyatsiyalangan Worker’da (`scripts/deploy-qa/local-worker.sh`, port 8788, har safar yangi D1); production testlari sinov yozuvlarini oxirida eksport + tozalash bilan o‘chiradi.

| To‘plam | Muhit | Natija |
|---|---|---|
| `npm test` (unit: PBKDF2, Telegram HMAC/replay oynasi, holat jadvali, OTP, prod-da dev OTP o‘chiqligi) | Node | **20/20** |
| `npm run typecheck` (api, admin, customer) | — | ✅ |
| `scripts/deploy-qa/expansion-verify.mjs` — auth, OTP, Telegram, parol tiklash, rate-limit, rollar, kuryer chegaralari, tayinlash/versiya, kuzatuv maxfiyligi, tasdiq/e’tiroz/hal qilish, sharhlar, xodimlar, integratsiyalar, audit | lokal Worker | **129/129** |
| `scripts/ui-qa/expansion-ui.mjs` — APK bundle’lari, WebView emulyatsiyasi: ro‘yxatdan o‘tish (OTP), GPS joylashuv, checkout, admin bildirishnomasi, tayinlash, kuryer oqimi, joylashuv ulashish, mijoz kuzatuvi, tasdiq, sharh, R2 rasm, xodimlar, integratsiyalar, 320/390/768/1280 overflow | lokal Worker + Chrome | **48/48** |
| `scripts/ui-qa/regress.mjs` — asl V1 funksiyalari | lokal Worker + Chrome | **39/39** (3 ta matn kutilmasi yangi bosqich nomlariga moslandi) |
| `scripts/deploy-qa/api-verify.mjs` — o‘rnatilgan ilovalar kontrakti + R2 | **production** | **74/74** |
| `scripts/deploy-qa/desktop-smoke.mjs` — paketlangan macOS ilova | **production** | **8/8** |
| APK tekshiruvi (versiya, imzo, manifest, dex, secret) | lokal | ✅ |

## Topilgan va tuzatilgan nuqsonlar

| Nuqson | Tuzatish |
|---|---|
| Productionda admin login 500 (PBKDF2 310k > Workers 100k) | `password.ts`, eski hashlar mos (oldingi sessiya) |
| Noto‘g‘ri JSON 500 | 400 `INVALID_JSON` |
| Telefon bog‘lashda 409 o‘rniga 429; qayta tayinlashda noto‘g‘ri sabab | tekshiruvlar tartibi |
| Checkout `location` state global `location.hash` ni yopib, deep link’ni buzardi | `dropoff` deb nomlandi |
| Kuryer amalidan keyin joylashuv ulashish yoqilmasdi | ro‘yxat har amaldan keyin yangilanadi |
| Tasdiqdan keyin kuryerni baholash taklif qilinmasdi | yangilangan buyurtma bilan ochiladi |
| Kalitsiz xaritada kuryer nuqtasi ko‘rinmasdi | barcha nuqtalar ro‘yxati |
| Bo‘sh fayl yuklanishi | oldindan rad etiladi |
| Desktop ma’lumot papkasi `@fayz/desktop` | `Fayz Market Admin` |
| Desktop installerga eski bundle’lar tushishi | `copy-admin` tozalaydi |

## Sinalmagan (bloklangan)

- Haqiqiy Android qurilma: kamera, barmoq izi, tizim bildirishnomasi, GPS, Telegram OAuth, in-place `adb install -r`.
- Windows’da `.exe` ishga tushirish.
- Jonli SMS, Telegram, Google Maps/Routes, FCM — hisob ma’lumotlari yo‘q.
