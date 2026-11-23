# Production konfiguratsiyasi

Bu hujjatda maxfiy qiymat yo‘q. Parollar va kalitlar faqat Cloudflare secrets'da hamda gitignore qilingan `dist/` fayllarida saqlanadi.

## Resurslar

| Resurs | Qiymat |
|---|---|
| Cloudflare akkaunti | Ilyosbeksalayev240@gmail.com's Account, `8c9b943ebbbb7bcff4386e624c4482ca` |
| Worker | `fayz-market-api` |
| Production URL | **https://fayz-market-api.ilyosbeksalayev240.workers.dev** |
| D1 | `fayz-market`, ID `89f6ea76-65dd-43ea-a574-6dc17aed1ddd`, region EEUR, binding `DB` |
| R2 | **hali yo‘q**: akkauntda R2 yoqilmagan. Rejadagi nom `fayz-market-images`, binding `IMAGES` |
| Secret | `BOOTSTRAP_SECRET` (qiymati hech qayerda saqlanmagan; owner yaratilgach `/admin/bootstrap` 409 qaytaradi) |
| Vars | `APP_ORIGIN` va `PUBLIC_BASE_URL` = production URL |
| Preview URL'lar | o‘chirilgan (`preview_urls = false`) |

Worker versiyalari:

| Versiya | Izoh |
|---|---|
| `754e970c` | birinchi deploy: login PBKDF2 xatosi bilan |
| `ffb4e7d5` | PBKDF2 tuzatishi |
| `592e635a` | joriy: faqat secret yangilandi, kod `ffb4e7d5` bilan bir xil |

## `apps/api/wrangler.toml`

- Yuqori qismi (lokal `wrangler dev`) **o‘zgarmagan**, lokal ish jarayoni avvalgidek ishlaydi.
- Yangi `[env.production]` bo‘limi qo‘shildi:
  - `account_id` aniq yozilgan, shuning uchun boshqa akkauntga deploy qilib bo‘lmaydi;
  - D1 binding, vars va izohga olingan R2 bloki bor.

Deploy faqat shu buyruq bilan, `apps/api` papkasidan:

```sh
npx wrangler deploy --env production
```

Migratsiyalar:

```sh
npx wrangler d1 migrations list  fayz-market --env production --remote
npx wrangler d1 migrations apply fayz-market --env production --remote
```

Natija: `0001_initial`, `0002_invariants`, `0003_security` va `0004_home_banner` qo‘llandi. Tekshiruvda 11 ta biznes jadvali, `d1_migrations` jadvali, 9 ta trigger va 5 ta sozlama topildi. Migratsiyalarda `DROP`, `DELETE`, `ALTER` yoki `TRUNCATE` yo‘q.

## Administrator

- Birinchi owner `POST /admin/bootstrap` orqali yaratildi. Login: `owner@fayzmarket.uz`.
- Parol `dist/production-admin-credentials.txt` faylida: ruxsatlar `600`, fayl gitignore qilingan va Git'ga kirmaydi.
- Parolni parol menejeriga ko‘chirib, faylni o‘chirish tavsiya qilinadi.
- API'da parolni o‘zgartirish endpointi yo‘q (V1 doirasi). Kerak bo‘lsa, owner Sozlamalar sahifasida yangi owner qo‘shishi mumkin.

## Backend tuzatishi

**Muammo:** Cloudflare WebCrypto PBKDF2 100 000 iteratsiyadan ko‘pini rad etadi, kod esa 310 000 so‘rardi.

**O‘zgarish:**
- `apps/api/src/password.ts` (yangi fayl):
  - yangi hashlar `salt:100000:hash` formatida saqlanadi;
  - `verifyPassword` eski `salt:hash` (310 000) formatini ham tekshiradi, shuning uchun lokal dev bazalardagi mavjud parollar ishlashda davom etadi;
  - lokal `:8787` Worker'da eski hash bilan login va logout tekshirildi.
- `apps/api/src/index.ts`:
  - hash funksiyalari yangi moduldan import qilinadi;
  - login `verifyPassword`dan foydalanadi;
  - mavjud bo‘lmagan email uchun ham bitta kalit hisoblanadi, ya'ni javob vaqti avvalgidek saqlanadi.
- API kontrakti, javob formatlari, rate-limit, sessiyalar va rollar o‘zgarmagan.

**Regressiya testi:** `apps/api/src/password.test.ts`, 4 ta test. Ular tekshiradi:
- hech bir yo‘l 100 000 dan ortiq iteratsiya so‘ramaydi;
- to‘g‘ri va noto‘g‘ri parol to‘g‘ri farqlanadi;
- eski hash o‘qiladi;
- buzilgan hash xato tashlamaydi.

`npm test` natijasi 7/7, `npm run typecheck` o‘tdi.

**Xavfsizlik:** PBKDF2-SHA256 100 000 iteratsiya Cloudflare platformasidagi maksimal qiymat. Har bir hash uchun 32 baytli tasodifiy salt ishlatiladi. Login urinishlari 15 daqiqada 5 ta bilan cheklangan.

## Android konfiguratsiyasi

| | Avval | Hozir |
|---|---|---|
| Standart API (`build.gradle`) | `http://192.168.1.106:8787` | `https://fayz-market-api.ilyosbeksalayev240.workers.dev` |
| `versionCode` / `versionName` | 1 / 1.0.0 | 2 / 1.0.1 |
| Debug dialog sarlavhasi | "Lokal API manzili" | "Server (API) manzili" |

- Lokal sinov uchun manzilni avvalgidek almashtirish mumkin: `npm run build:apks -- -PfayzApiUrl=http://<IP>:8787`.
- APK ichida maxfiy ma’lumot yo‘q: bundle'lar `BOOTSTRAP_SECRET`, OAuth token va admin paroli bo‘yicha qidirib ko‘rildi, 0 ta topildi. APK faqat ochiq API manzilini biladi.

## Takroriy tekshiruv skriptlari

- `scripts/deploy-qa/api-verify.mjs` — 71 ta API tekshiruvi.
- `scripts/deploy-qa/ui-smoke.mjs` — APK bundle'lari bilan 20 ta UI E2E tekshiruvi.

Ikkala skript ham parolni faqat env o‘zgaruvchisidan oladi. Ishga tushirish: [API_VERIFICATION](API_VERIFICATION.md).

## Zaxira nusxa

Sinov yozuvlari tozalanishidan oldin D1 to‘liq eksport qilindi: `dist/backups/fayz-market-before-qa-cleanup-20261122-0558.sql` (Git'ga kirmaydi).

Keyingi zaxira nusxalar uchun:

```sh
npx wrangler d1 export fayz-market --env production --remote --output <fayl>.sql
```

D1 Time Travel ham istalgan oldingi holatga qaytarish imkonini beradi: Free planda oxirgi 7 kun, Paid planda 30 kun.
