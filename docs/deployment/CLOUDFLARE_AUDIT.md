# Cloudflare audit (2026-11-22)

Branch: `feat/v1-premium-ui` (asosi `d17c0c6`). Bu hujjat deploy'dan oldin repozitoriy va akkaunt qanday holatda bo‘lganini, hamda ulanish xatolarining tasdiqlangan sabablarini yozadi.

## Haqiqiy arxitektura

| Qism | Texnologiya | Joyi |
|---|---|---|
| API | Cloudflare Worker, Hono 4, TypeScript | `apps/api/src/index.ts` |
| Ma’lumotlar bazasi | Cloudflare D1 (SQLite) | `apps/api/migrations/0001…0004` |
| Rasmlar | Cloudflare R2 (`IMAGES` binding) | `POST /admin/images`, `GET /images/:key` |
| Xaridor ilovasi | React 19 + Vite, Java WebView APK | `apps/customer`, `apps/android/customer` |
| Admin ilovasi | React 19 + Vite, Java WebView APK | `apps/admin`, `apps/android/admin` |
| Desktop admin | Electron (bu vazifada tegilmadi) | `apps/desktop` |

Expo yo‘q. `apps/mobile` npm workspaces'ga kirmaydigan eski papka, ishlatilmaydi.

**API manzili qanday aniqlanadi.** APK veb-bundle'ni o‘z ichida saqlaydi va uni `<API manzili>/__app/index.html` sifatida ochadi. `MainActivity.shouldInterceptRequest` `/__app/*` so‘rovlarini APK ichidagi assets'dan beradi. Natijada UI va API bir origin'da ishlaydi: `location.origin` API manzilining o‘zi, CORS kerak emas.

API manzili `SharedPreferences["api_url"]`dan olinadi. U yo‘q bo‘lsa, build vaqtida berilgan `default_api_url` ishlatiladi (`-PfayzApiUrl`, aks holda `build.gradle`dagi qiymat). Audit vaqtida standart qiymat `http://192.168.1.106:8787`, ya'ni Mac'dagi lokal `wrangler dev` edi.

## API marshrutlari

Ochiq marshrutlar:
- `GET /health`, `/settings`, `/categories`
- `GET /products` (`q`, `category`, `featured`, `sort`, `page`, `limit`), `/products/:slug`
- `GET /p/:slug` (ulashish sahifasi), `/images/:key`
- `POST /orders`, `GET /orders/:id` (`Authorization: Order <token>`)

Admin marshrutlari (`Authorization: Bearer <session>`):
- `POST /admin/bootstrap` (`X-Bootstrap-Secret`), `/admin/login`, `/admin/logout`, `GET /admin/me`
- `GET/POST /admin/users` (faqat owner)
- `GET/POST /admin/products`, `PUT/DELETE /admin/products/:id`, `POST /admin/products/:id/adjust-stock`
- `POST /admin/categories`, `PUT/DELETE /admin/categories/:id` (o‘chirish faqat owner)
- `POST /admin/images`
- `GET /admin/orders`, `/admin/orders/:id`, `PATCH /admin/orders/:id/status`, `POST /admin/orders/:id/payments`
- `GET /admin/reports/summary`, `PUT /admin/settings` (faqat owner)

## Kerakli D1 jadvallari

`categories`, `products`, `product_images`, `admins`, `sessions`, `orders`, `order_items`, `inventory_adjustments`, `payments`, `settings`, `login_attempts`. Ularga qo‘shimcha 9 ta trigger bor: qoldiq, narx, holat o‘tishi, ortiqcha to‘lov va to‘langan buyurtmani bekor qilish qoidalari.

Mahsulot variantlari jadvali **mavjud emas**: V1 sxemasida variantlar yo‘q, shuning uchun yaratilmadi.

## Muhit talablari

| Nomi | Turi | Vazifasi |
|---|---|---|
| `DB` | D1 binding | barcha ma’lumotlar |
| `IMAGES` | R2 binding | mahsulot rasmlari |
| `APP_ORIGIN` | var | CORS ruxsat etilgan yagona origin (APK'lar same-origin) |
| `PUBLIC_BASE_URL` | var | yuklangan rasm URL'lari va ulashish havolalari uchun |
| `BOOTSTRAP_SECRET` | secret | birinchi owner'ni yaratish (bir martalik) |

## Deploy'dan oldingi holat

- `wrangler.toml`: `database_id = "REPLACE_WITH_D1_DATABASE_ID"`, production muhiti yo‘q, `PUBLIC_BASE_URL` = `http://localhost:8787`.
- Wrangler 4.166.0 hech qaysi akkauntga kirmagan edi.
- Brauzer orqali OAuth login qilindi. `wrangler whoami` natijasi: email **ilyosbeksalayev240@gmail.com**, akkaunt "Ilyosbeksalayev240@gmail.com's Account", ID `8c9b943ebbbb7bcff4386e624c4482ca`. Boshqa akkaunt yo‘q.
- Akkauntdagi resurslar:
  - Worker'lar: 0;
  - D1 bazalar: 0;
  - R2: **yoqilmagan** (`code 10042: Please enable R2 through the Cloudflare Dashboard`);
  - workers.dev subdomeni: `ilyosbeksalayev240`.
- GitHub Actions, Pages yoki Git integratsiyasi yo‘q va qo‘shilmadi.

## Ulanish xatolarining tasdiqlangan sabablari

### 1. Telefonda "Sozlamalar yuklanmadi" va Kategoriyalarda "Aloqa yo‘q"

**Sabab:** telefon bilan Mac'dagi lokal Worker (`http://192.168.1.106:8787`) orasidagi Wi‑Fi aloqasi vaqti-vaqti bilan uzilgan. Backend nuqsoni emas.

Dalillar:
- **Bu xabar faqat bitta holatda chiqadi.** "Serverga ulanib bo‘lmadi" faqat `fetch` TypeError'da chiqadi, ya'ni HTTP javob umuman kelmaganda. 401, 403, 404, 500 va CORS xatolarida boshqa matn ko‘rsatiladi.
- **Endpointlar ishlagan.** `GET /settings`, `/categories` va `/admin/users` o‘sha Worker'dan 200 qaytargan.
- **Dashboard ma’lumoti lokal bazadan kelgan.** Dashboard'dagi raqamlar (1 buyurtma, 159 000 so‘m, 1 000 so‘m to‘lov, 3 mahsulot, 14 dona) Mac'dagi `.local-phone-db` bazasiga to‘liq mos keladi. Baza nusxasi faqat o‘qish uchun tekshirildi.
- **Backend telefondan yozuv olgan.** O‘sha bazada 13:33:05 UTC'da telefondan yaratilgan 2-buyurtma bor, ya'ni checkout backend'ga yetib borgan. Bu buyurtma 1 dona qoldiqni kamaytirgan: hozir 13 dona, 2 buyurtma.
- **Ko‘ringan ma’lumot kesh emas.** Ilovada lokal kesh yoki zaxira ma’lumot yo‘q: admin faqat sessiya tokenini `sessionStorage`da saqlaydi. Ekrandagi raqamlar avvalgi muvaffaqiyatli so‘rovdan React state'da qolgan. Keyingi `load()` (`/categories` va `/admin/me`) tarmoq xatosi bilan tugaganda Kategoriyalar ro‘yxati ham eski state'dan ko‘rsatilgan, ustida esa "Aloqa yo‘q" banneri chiqqan.

**Yechim:** ilovalarni Mac'dagi LAN serveriga emas, Cloudflare'dagi doimiy HTTPS Worker'ga ulash.

### 2. Productionda admin login, bootstrap va admin qo‘shish 500 qaytaradi (faqat Cloudflare'da)

`wrangler tail` logi:

```
NotSupportedError: Pbkdf2 failed: iteration counts above 100000 are not supported (requested 310000).
```

Kod parol hashini 310 000 PBKDF2 iteratsiyasi bilan hisoblardi. Cloudflare production Worker'lari 100 000 dan ortiq iteratsiyani rad etadi. Lokal `wrangler dev` esa bu cheklovni qo‘llamaydi, shuning uchun lokal va telefon sinovlarida xato ko‘rinmagan. Tuzatish [PRODUCTION_CONFIG](PRODUCTION_CONFIG.md#backend-tuzatishi)da yozilgan.

### 3. R2 akkauntda yoqilmagan

`POST /admin/images` 500 qaytaradi, chunki Worker'da `IMAGES` binding yo‘q. R2'ni faqat akkaunt egasi Cloudflare Dashboard'da yoqa oladi, bu to‘lov ma’lumotini talab qilishi mumkin. Batafsil: [DEPLOYMENT_REPORT](DEPLOYMENT_REPORT.md).

### 4. Kichik, eski xatti-harakat (tuzatilmadi)

Noto‘g‘ri JSON tanasi 400 o‘rniga 500 `INTERNAL_ERROR` qaytaradi. Bazaga hech narsa yozilmaydi, ilovalar esa doim to‘g‘ri JSON yuboradi. V1 funksiyasi uchun zarur bo‘lmagani sababli o‘zgartirilmadi.
