# Admin → Integratsiyalar: API kalitlari va xavfsizlik — Fayz Market V1

## 1. Nima oʻzgardi

**Avval:** server kalitlarini faqat terminalda `wrangler secret put` bilan qoʻshish mumkin edi. Panel ularning faqat bor-yoʻqligini koʻrsatardi.

**Endi:** Owner kalitlarni **admin paneldan** kiritadi, almashtiradi va oʻchiradi. Kalitni kod ichiga yozish shart emas.

- Kalitlar D1’da **faqat shifrlangan holda** saqlanadi.
- Cloudflare secret orqali qoʻyilgan eski usul ham ishlayveradi.
- Ikkalasi boʻlsa, paneldagi qiymat ustun turadi. Paneldagi qiymat oʻchirilsa, Cloudflare secret yana ishlaydi.

| Integratsiya | Guruh | Ochiq maydonlar (`settings`) | Maxfiy kalitlar | «Ulanishni tekshirish» |
|---|---|---|---|---|
| OpenFreeMap | Xarita | — | — | Haqiqiy: uslub va plitkalar |
| Marshrut (OpenRouteService) | Xarita | — | `ORS_API_KEY` | Haqiqiy: Toshkent ichida marshrut |
| Google Maps (ixtiyoriy) | Xarita | `google_maps_key` (browser, ochiq) | — | Haqiqiy: Geocoding |
| Google Routes (ixtiyoriy) | Xarita | — | `GOOGLE_ROUTES_KEY` | Haqiqiy: computeRoutes |
| Telegram Login | Kirish | `telegram_bot_username` | `TELEGRAM_BOT_TOKEN` | Haqiqiy: `getMe`, username mosligi |
| SMS (Eskiz) | Kirish | — | `SMS_PROVIDER`, `ESKIZ_EMAIL`, `ESKIZ_PASSWORD`, `ESKIZ_FROM` | Haqiqiy: Eskiz’ga kirish (SMS yuborilmaydi) |
| Email (Resend) | Kirish | — | `EMAIL_PROVIDER`, `RESEND_API_KEY`, `EMAIL_FROM` | Haqiqiy: domen holati |
| Push (FCM) | Bildirishnoma | — | `FCM_SERVICE_ACCOUNT` (JSON) | Haqiqiy: Google OAuth token |
| Payme | Toʻlov | `payme_merchant_id`, `payme_mode`, «Faol» | `PAYME_TEST_KEY`, `PAYME_KEY` | **Ichki**: endpoint va kalit mosligi (Payme sandbox emas) |
| Click | Toʻlov | `click_service_id`, `click_merchant_id`, `click_merchant_user_id`, «Faol» | `CLICK_SECRET_KEY` | **Ichki**: imzo tekshiruvi (Click kabineti emas) |

Har bir kartada quyidagilar bor:

- nomi va vazifasi;
- holat: **Ulangan / Sozlanmagan / Xato**;
- narx;
- ochiq maydonlar;
- maxfiy kalitlar: kiritilganmi, qayerdan (panel yoki Cloudflare), qachon. Qiymat **hech qachon** koʻrsatilmaydi;
- yozish uchun maydon;
- «Paneldagi qiymatni oʻchirish»;
- sozlash bosqichlari;
- «Ulanishni tekshirish» — natija turi bilan: *Haqiqiy ulanish / Sandbox / Ichki tekshiruv*;
- Payme va Click’da «Faollashtirish / Oʻchirish».

Faollashtirish sozlash tugamaguncha rad etiladi (`409 NOT_CONFIGURED`). Tekshiruv soatiga 10 marta bilan cheklangan. Xato matnidagi uzun tokenga oʻxshash qatorlar `…` bilan yashiriladi.

## 1a. Koʻrinish va holatlar (1.2.1)

Sahifa ixcham roʻyxatga aylantirildi:

- har bir xizmat — bitta qator: holat nuqtasi, nom, vazifa, holat belgisi;
- yuqorida xulosa: Ulangan / Tekshirish kerak / Sozlanmagan / Xato;
- qator bosilganda bosqichli oyna ochiladi: **1) Nima kerak → 2) Maʼlumotlar → 3) Maxfiy kalitlar → 4) Tekshirish va yoqish**;
- texnik `ENV` nomlari faqat sichqoncha olib borilganda chiqadigan izohda.

| Holat | Qachon |
|---|---|
| **Ulangan** | Haqiqiy (live) tekshiruv muvaffaqiyatli oʻtgan va undan keyin kalit almashmagan |
| **Sozlangan · tekshirilmagan** | Kerakli maʼlumot bor, lekin hali tekshirilmagan yoki kalit tekshiruvdan keyin almashgan |
| **Sozlangan · ichki tekshiruv oʻtdi** | Payme/Click: serverimiz va kalit mos. Bank yoki provayder bilan haqiqiy ulanish **daʼvo qilinmaydi** |
| **Sozlanmagan** | Kerakli kalit yoki maydon yoʻq. Credentials boʻlmasa hech qachon «Ulangan» chiqmaydi |
| **Xato** | Oxirgi tekshiruv muvaffaqiyatsiz yoki kalitni ochib boʻlmaydi |

## 2. Shifrlash

- **Algoritm.** AES-256-GCM (WebCrypto). Har bir yozuvda tasodifiy 12 baytli IV. Kalit nomi GCM *additional data* sifatida ishlatiladi, shuning uchun shifrlangan qiymatni boshqa nomga koʻchirib boʻlmaydi.
- **Asosiy kalit.** Cloudflare secret `INTEGRATIONS_MASTER_KEY` (32 bayt, base64). U **D1’da saqlanmaydi**, kodda ham yoʻq.
  - D1’da faqat `key_id` turadi: kalit SHA-256’ining 12 belgili prefiksi. U qiymat qaysi kalit bilan shifrlanganini bildiradi.
- **Jadval.** `integration_secrets(name, ciphertext, iv, key_id, updated_by, updated_at)`.
- **Ochish.** Faqat Worker ichida, 30 soniyalik xotira keshi bilan. Paneldagi oʻzgarish oʻsha isolate’da darhol, boshqalarida 30 soniya ichida kuchga kiradi.
- **Hech qayerga chiqmaydi:**
  - API javoblari;
  - `/settings` va `/storefront`;
  - audit jurnali — unda faqat kalit **nomi** bor;
  - loglar;
  - customer bundle.

  Bularning hammasi avtomatik test bilan tekshiriladi: test qiymatni API javoblari, audit va D1 baytlari ichidan qidiradi.
- **Huquq.** Oʻqish va oʻzgartirish faqat Owner (super admin). Manager → 403, kuryer → 403.
- **Asosiy kalit almashtirilsa** (rotation), eski qiymatlar panelda «Shifr kaliti mos emas» deb koʻrinadi. Ularni qayta kiritish kerak. Server ularni ishlatmaydi va soxta «ulangan» demaydi.
- Cloudflare akkauntining API tokeni panelda **saqlanmaydi**, chunki u bu roʻyxatda yoʻq va server rad etadi.

## 3. Bir martalik sozlash (production) — egasining ruxsati bilan

**Holat:** `INTEGRATIONS_MASTER_KEY` production’da **2026-11-25 da oʻrnatildi**, egasining ruxsati bilan (faol versiya `90b70a16…`). Kalit boʻlmagan muhitda (masalan, yangi akkaunt yoki kalit oʻchirilgan boʻlsa):

- panel «Shifrlash kaliti oʻrnatilmagan» deb ogohlantiradi;
- kalit saqlash `409 MASTER_KEY_MISSING` qaytaradi;
- qolgan barcha funksiyalar ishlaydi.

O‘rnatish uchun `apps/api` papkasidan bitta buyruq kifoya. Kalit terminalga chiqmaydi, toʻgʻridan-toʻgʻri Cloudflare’ga uzatiladi:

```bash
cd /Users/ilyosbek/Documents/GitHub/Fayiz-Market/apps/api && openssl rand -base64 32 | npx wrangler secret put INTEGRATIONS_MASTER_KEY --env production
```

- Bu kalit yoʻqolsa, paneldagi kalitlarni qayta kiritish kerak boʻladi. Lekin pul va buyurtma maʼlumotlari yoʻqolmaydi.
- Kalitni parol menejerida saqlash ixtiyoriy: Cloudflare uni xavfsiz saqlaydi va qayta koʻrsatmaydi.

## 4. Sinov dalillari

`scripts/v1/storefront-verify.mjs`, integratsiya boʻlimi:

- ruxsatlar (manager → 403);
- notoʻgʻri format → 400;
- boshqa integratsiyaning kaliti rad etiladi;
- D1’da faqat shifrlangan qiymat (tekshiruv `wrangler d1 execute` bilan);
- javobda qiymat yoʻq;
- haqiqiy (mock) ORS chaqiruvi;
- oʻchirish darhol taʼsir qiladi;
- audit’da faqat nom.

Unit testlar (`apps/api/v1-storefront.test.ts`):

- shifrlash va ochish;
- boshqa nom yoki boshqa kalit bilan ochilmaydi;
- har safar yangi IV;
- notoʻgʻri asosiy kalit rad etiladi.
