# Integratsiyalarni ulash (Sozlamalar → Integratsiyalar, faqat super admin)

Ochiq qiymatlar panelda saqlanadi (D1 `settings`, ilovalarga beriladi). Maxfiy kalitlar **faqat** Cloudflare secret — Worker ichidan ularni xavfsiz yozib bo‘lmaydi, shuning uchun panel aniq buyruqni ko‘rsatadi va faqat “o‘rnatilgan/yo‘q” holatini qaytaradi. «Tekshirish» tugmasi haqiqiy provayderga ulanadi va natija audit jurnaliga yoziladi.

Barcha buyruqlar `apps/api` papkasidan:

| Integratsiya | Panelda | Secret | To‘lov |
|---|---|---|---|
| Do‘kon joylashuvi | manzil, lat, lng | — | bepul |
| Xarita (OpenFreeMap) | — (sozlash shart emas) | — | **bepul**, kalit yo‘q — asosiy xarita |
| Google Maps (ixtiyoriy) | browser API kaliti (`AIza…`, referrer cheklangan) | — | Google billing (tasdiqingiz kerak). Kiritilsa xarita Google’ga almashadi va manzil nomi avtomatik yoziladi |
| Google Routes | — | `npx wrangler secret put GOOGLE_ROUTES_KEY --env production` | har so‘rov pullik |
| Telegram Login | bot username | `npx wrangler secret put TELEGRAM_BOT_TOKEN --env production` | bepul |
| SMS (Eskiz.uz) | — | `SMS_PROVIDER` (= `eskiz`), `ESKIZ_EMAIL`, `ESKIZ_PASSWORD`, `ESKIZ_FROM` | har SMS pullik |
| Email (Resend) | — | `EMAIL_PROVIDER` (= `resend`), `RESEND_API_KEY`, `EMAIL_FROM` (masalan `Fayz Market <kod@domeningiz.uz>`) | bepul tarif 3 000 xat/oy; **o‘z domeningiz kerak** (SPF/DKIM) |
| Push (FCM) | — | `FCM_SERVICE_ACCOUNT` (JSON) + Android build o‘zgarishi | bepul |

Telegram qo‘shimcha: @BotFather → `/setdomain` → `fayz-market-api.ilyosbeksalayev240.workers.dev`.
Eskiz: SMS shabloni tasdiqlanishi kerak: «Fayz Market tasdiqlash kodi: %w. Kodni hech kimga bermang.»

Email: `workers.dev` domenidan xat yuborib bo‘lmaydi — Resend’da tasdiqlangan domen shart. Muqobil: domen Cloudflare’ga ulangach Cloudflare Email Sending (adapter yozish kerak bo‘ladi).

Lokal test rejimi (mock provayderlar) haqiqiy integratsiyadan alohida: [TEST_MODES](TEST_MODES.md).

Secret qo‘yilgach Worker darhol yangi qiymatni oladi (APK qayta build kerak emas). Hech qanday pullik xizmat men tomondan yoqilmadi.
