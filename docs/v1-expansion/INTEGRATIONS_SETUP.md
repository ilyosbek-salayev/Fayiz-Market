# Integratsiyalarni ulash (Sozlamalar → Integratsiyalar, faqat super admin)

Ochiq qiymatlar panelda saqlanadi (D1 `settings`, ilovalarga beriladi). Maxfiy kalitlar **faqat** Cloudflare secret — Worker ichidan ularni xavfsiz yozib bo‘lmaydi, shuning uchun panel aniq buyruqni ko‘rsatadi va faqat “o‘rnatilgan/yo‘q” holatini qaytaradi. «Tekshirish» tugmasi haqiqiy provayderga ulanadi va natija audit jurnaliga yoziladi.

Barcha buyruqlar `apps/api` papkasidan:

| Integratsiya | Panelda | Secret | To‘lov |
|---|---|---|---|
| Do‘kon joylashuvi | manzil, lat, lng | — | bepul |
| Google Maps | browser API kaliti (`AIza…`, referrer cheklangan) | — | Google billing (tasdiqingiz kerak) |
| Google Routes | — | `npx wrangler secret put GOOGLE_ROUTES_KEY --env production` | har so‘rov pullik |
| Telegram Login | bot username | `npx wrangler secret put TELEGRAM_BOT_TOKEN --env production` | bepul |
| SMS (Eskiz.uz) | — | `SMS_PROVIDER` (= `eskiz`), `ESKIZ_EMAIL`, `ESKIZ_PASSWORD`, `ESKIZ_FROM` | har SMS pullik |
| Push (FCM) | — | `FCM_SERVICE_ACCOUNT` (JSON) + Android build o‘zgarishi | bepul |

Telegram qo‘shimcha: @BotFather → `/setdomain` → `fayz-market-api.ilyosbeksalayev240.workers.dev`.
Eskiz: SMS shabloni tasdiqlanishi kerak: «Fayz Market tasdiqlash kodi: %w. Kodni hech kimga bermang.»

Secret qo‘yilgach Worker darhol yangi qiymatni oladi (APK qayta build kerak emas). Hech qanday pullik xizmat men tomondan yoqilmadi.
