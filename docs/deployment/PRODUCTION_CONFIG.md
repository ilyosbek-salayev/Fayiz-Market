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

### Cloudflare Workers Builds (GitHub ulanishi) — 2026-11-25

Dashboard’dagi Git build `fayz-market-api` uchun repository ildizidan (`/`) build buyruqsiz `npx wrangler deploy` ishlatadi. Ildizda konfiguratsiya bo‘lmagani uchun Wrangler 4 framework aniqlashga o‘tib, *“application detection logic has been run in the root of a workspace”* xatosi bilan to‘xtagan (build `e160d1d6`, commit `2dd4f66`). Endi ildizdagi `wrangler.toml` aynan `[env.production]`ni takrorlaydi; `apps/api/deploy-config.test.ts` ikkalasi farqlansa yiqiladi. Ildizdan qurilgan bundle qo‘lda deploy bundle’i bilan bir xil (yo‘l izohlaridan tashqari SHA-256 mos).

2026-11-25 hodisa: ildizdan `npx wrangler deploy --env production` (ildizda `[env.production]` yo‘q paytda) alohida `fayz-market-api-production` Worker’ini yaratdi. Endi ildiz konfiguratsiyasida ham `[env.production]` (`name = "fayz-market-api"`) bor va uchala yo‘l bitta Worker’ga boradi: ildizdan `npx wrangler deploy`, ildizdan `npx wrangler deploy --env production`, `apps/api`dan `npx wrangler deploy --env production`. Tafsilot: `docs/v1-expansion/evidence-post-codex/worker-name-incident/README.md`.

Muhim: Git build ulangan branch’ga push **production’ga avtomatik deploy** qiladi. Dashboard → Settings → Build → Branch control’da production branch `main` bo‘lishi kerak. Ildizdan remote D1/R2 buyruqlarini tasodifan ishlatmang — ildiz konfiguratsiyasi production resurslariga qaraydi.

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

## Fayz Market V1 (1.2.0) — production’ga chiqarildi (2026-11-25)

Zaxira `dist/backups/fayz-market-before-1.2.0-20261125-055823.sql` → migratsiya 0007 ✅ → deploy Version `43b2cc54-4565-47ff-9d91-c82c042ebce0` → secret `INTEGRATIONS_MASTER_KEY` (faol versiya `90b70a16-42fe-473d-bcea-4e5fe015698f`). Production secretlari: `BOOTSTRAP_SECRET`, `INTEGRATIONS_MASTER_KEY`.

- Migratsiya `0007_v1_storefront.sql` (faqat qoʻshimcha: bannerlar, logo tarixi, buyurtma toʻlov/qabul ustunlari va trigger’lar, `payment_transactions`, `integration_secrets`). Eski Worker yangi sxemada ishlashi tasdiqlangan (`docs/v1/evidence/old-worker-on-0007/`), shuning uchun tartib: zaxira → migratsiya → deploy.
- Yangi Cloudflare secret: `INTEGRATIONS_MASTER_KEY` (32 bayt, base64) — paneldan kiritilgan integratsiya kalitlarini AES-256-GCM bilan shifrlaydi; D1’da saqlanmaydi.
- Ixtiyoriy secretlar (paneldan ham kiritiladi): `ORS_API_KEY`, `PAYME_KEY`, `PAYME_TEST_KEY`, `CLICK_SECRET_KEY`.
- Yangi ochiq endpointlar: `GET /storefront`, `POST /store/route`, `POST /payments/payme`, `POST /payments/click/prepare`, `POST /payments/click/complete`.
- Aniq buyruqlar va rollback: `docs/v1/RELEASE_REPORT.md` §4.

2026-11-25: ortiqcha Worker `fayz-market-api-production` (2026-11-25 hodisasi, deploy `eb2fd9e9`) egasining tasdigʻi bilan oʻchirildi. Akkauntda endi faqat `fayz-market-api` bor.
