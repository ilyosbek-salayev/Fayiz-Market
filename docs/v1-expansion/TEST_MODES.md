# Haqiqiy integratsiya va lokal test rejimi

Har bir tashqi xizmat uchun ikki yo‘l **alohida**: productionda faqat haqiqiy provayder; lokal test rejimi faqat kompyuterdagi izolyatsiyalangan Worker’da.

## Lokal test rejimi qachon yoqiladi

`apps/api/src/lib.ts → isDevelopment(env)`: **ikkala** shart bir vaqtda kerak:
1. `ENVIRONMENT=development` (aniq qiymat; bo‘sh yoki boshqa qiymat — test rejimi emas);
2. `PUBLIC_BASE_URL` `http://` bilan boshlanadi (deploy qilingan Worker har doim `https://`).

Production’da `wrangler.toml [env.production]` → `ENVIRONMENT="production"`, `https://…workers.dev`. Shuning uchun tasodifiy o‘zgaruvchi qo‘shilsa ham test rejimi yoqilmaydi (unit testlar bilan tasdiqlangan).

| Mexanizm | Lokal test rejimida | Production’da |
|---|---|---|
| `OTP_DEV_ECHO=1` (SMS/email kodi javobda) | kod javobda va ilovada «Lokal sinov rejimi» bannerida | e’tiborsiz; kod hech qachon qaytmaydi |
| `DEV_MOCK_PROVIDERS=http://127.0.0.1:<port>` | Eskiz, Resend, Google OAuth/FCM, Telegram Bot API, Google Routes so‘rovlari lokal mock’ga | e’tiborsiz; faqat loopback `http://` qabul qilinadi |
| `BOOTSTRAP_SECRET` (`qa-bootstrap`) | birinchi owner’ni yaratish | production’da boshqa secret; owner mavjud → 409; `qa-bootstrap` → 403 (tekshirildi) |
| Sinov Telegram tokeni `123456789:AAH-local-qa-token` | faqat `local-worker.sh` dagi `--var` | production’da `TELEGRAM_BOT_TOKEN` yo‘q → 503 |

Production secretlari ro‘yxati (2026-11-22, `wrangler secret list --env production`): faqat `BOOTSTRAP_SECRET`. Test tokeni, `OTP_DEV_ECHO`, `DEV_MOCK_PROVIDERS` yo‘q.

## Xizmatlar bo‘yicha

| Xizmat | Haqiqiy integratsiya (production) | Lokal test |
|---|---|---|
| SMS OTP | Eskiz.uz: `SMS_PROVIDER=eskiz`, `ESKIZ_EMAIL`, `ESKIZ_PASSWORD`, `ESKIZ_FROM`. Sozlanmagan → 503 `SMS_NOT_CONFIGURED` | (a) dev echo; (b) mock Eskiz — kod mock qabul qilgan SMS matnidan olinadi |
| Email OTP | Resend: `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM` (tasdiqlangan domen). Sozlanmagan → 503 `EMAIL_NOT_CONFIGURED` | (a) dev echo; (b) mock Resend — kod xat matnidan |
| Telegram Login | `TELEGRAM_BOT_TOKEN` secret + bot username + BotFather `/setdomain`; imzo HMAC-SHA256, 10 daqiqa, takrorga qarshi jadval | sinov tokeni bilan imzolangan payload; `getMe` mock |
| FCM push | `FCM_SERVICE_ACCOUNT` + Android’da Firebase Messaging client (hali yo‘q) | mock Google OAuth (JWT RS256 public key bilan tekshiriladi) + mock FCM v1 (404 token o‘chirilishi) |
| Google Routes | `GOOGLE_ROUTES_KEY` | mock — 2,4 km / 9 daqiqa (faqat test, ilovada ko‘rinmaydi) |

## Buyruqlar

```sh
node scripts/deploy-qa/provider-test-mode.mjs        # mock provayderlar + izolyatsiyalangan Worker (8789/8790), 35 tekshiruv
scripts/deploy-qa/local-worker.sh <tmp-db>           # dev echo rejimi (8788)
node scripts/deploy-qa/production-readonly.mjs       # production’da test rejimi yo‘qligini tekshiradi (yozmaydi)
```
