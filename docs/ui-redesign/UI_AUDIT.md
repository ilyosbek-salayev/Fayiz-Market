# UI audit — Fayz Market V1.0 (2026-11-22)

Redizayndan oldin joriy repository holati tekshirildi. Avvalgi hisobotlardagi raqamlar avtomatik qabul qilinmadi.

## Haqiqiy frontend arxitekturasi

| Qism | Texnologiya | Holat |
|---|---|---|
| `apps/customer` | React 19 + Vite 6, bitta `main.tsx` | Android mijoz APK ichiga bundle qilinadi |
| `apps/admin` | React 19 + Vite 6, bitta `main.tsx` | Android admin APK, Windows (Electron) va brauzer |
| `apps/android/{customer,admin}` | Java `Activity` + `WebView` | Faol Android build. Expo yo‘q |
| `apps/desktop` | Electron qobig‘i, `fayzDesktop.request` ko‘prigi | Tegilmadi |
| `apps/mobile` | Eski Expo papkasi | npm workspace'da yo‘q, build'da ishlatilmaydi, tegilmadi |
| `packages/shared` | Zod sxemalari, `money()` | Tegilmadi |
| `apps/api` | Cloudflare Worker (Hono), D1, R2 | Tegilmadi |

Android qobig‘i web bundle'ni `<API host>/__app/*` manzilidan `shouldInterceptRequest` orqali APK assets'dan beradi. Shuning uchun API so‘rovlari same-origin bo‘ladi.

## Testlar (joriy holat)

- `npm run typecheck`: API, admin, customer — o‘tdi.
- `npm test`: **3/3** (faqat `packages/shared`). Avvalgi hisobotlarda aytilgan "81 frontend test" repoda **mavjud emas**. Frontend uchun avtomatik test fayli yo‘q edi.
- `scripts/integration.mjs`: API darajasidagi integratsion skript (alohida Worker kerak).

## Ekran → fayl → biznes mantiq xaritasi

| Ekran | Fayl (oldin) | Bog‘langan mantiq |
|---|---|---|
| Bosh sahifa, Katalog | `apps/customer/src/main.tsx` | `load()`: `/products`, `/categories`, `/settings`, `/products?featured=1`; qidiruv/kategoriya/saralash state |
| Mahsulot | o‘sha | `setSelected`, `quantity()`, ulashish (`FayzNative.share`), deep link `fayz-product` |
| Savat | o‘sha | `cart`, `cartProducts` (localStorage), `quantity()` |
| Checkout | o‘sha | `submit()`: validatsiya, narx/qoldiqni qayta tekshirish, `POST /orders` |
| Buyurtmalar | o‘sha | `refreshOrders()`: `GET /orders/:id` + `Order <token>` |
| Profil | o‘sha | `fayz_profile`, `fayz_theme` (localStorage) |
| Admin login | `apps/admin/src/main.tsx` | `POST /admin/login`, `sessionStorage` |
| Boshqaruv | o‘sha | `GET /admin/reports/summary` |
| Mahsulotlar | o‘sha | CRUD, `adjust-stock`, `POST /admin/images` |
| Kategoriyalar | o‘sha | CRUD (o‘chirish faqat egasi) |
| Buyurtmalar | o‘sha | ro‘yxat, holat o‘tishlari, to‘lov qaydi |
| Sozlamalar | o‘sha | `PUT /admin/settings`, `GET/POST /admin/users` (faqat egasi) |

Topshiriqda sanalgan **Inventory, Payments, Reports** admin'da alohida bo‘lim sifatida mavjud emas. Mavjud joylari:

- qoldiq — Mahsulotlar ichidagi "Qoldiq" amali;
- to‘lovlar — Buyurtma tafsilotlari ichida;
- hisobot — Boshqaruv sahifasi.

API'da to‘lovlar ro‘yxati yoki ombor harakatlari tarixi uchun alohida endpoint yo‘q. Shuning uchun yangi bo‘limlar **yaratilmadi**.

## Skrinshotlarda ko‘ringan muammolar va sabablari

| # | Muammo | Sabab (kodda topildi) |
|---|---|---|
| 4.1 | "API MANZILI / YANGILASH" har ekranda | `MainActivity.java` WebView ustiga ikkita native `Button` qo‘shgan |
| 4.2 | Featured kartalar kesilgan, sodda header | `.featured .product{min-width:156px}` + to‘liq kenglikdagi rail; header faqat matn |
| 4.3 | Qidiruv va chiplar juda katta | `label.search` + 44px balandlikdagi har bir chip, saralash alohida qatorda |
| 4.4 | Checkout qo‘pol modal, `alert()` | `alert()` 3 joyda; WebView uni native `AlertDialog`ga aylantiradi |
| 4.6 | Bo‘sh buyurtmalar faqat matn | `<p>Hali buyurtma yoʻq</p>` |
| 4.8 | Admin navigatsiyasi kesilgan | `<650px` da sidebar gorizontal `overflow:auto` qatoriga aylanadi |
| 4.9 | Admin jadvali mobil'da sig‘maydi | `table{min-width:680px}`, karta ko‘rinishi yo‘q |
| 4.10 | "Failed to fetch" | Quyida |
| 4.11 | Bir xil placeholder rasm | `scripts/prepare-phone-test.mjs` sinov mahsulotlariga launcher ikonkasini rasm sifatida yuklagan; rasmsiz mahsulotda "Fayz Market" matni chiqadi |
| — | Pastki nav kontentni yopadi | `padding-bottom:66px`, lekin nav + safe-area balandligi bilan mos emas |
| — | Mahsulot o‘chirishda `confirm()` | Native dialog |
| — | Mobil'da Onest yuklanmaydi | Admin Google Fonts'dan import qilgan, xaridor `Arial` ishlatgan |

## "Failed to fetch" diagnostikasi (4.10)

Shu mashinada ishlab turgan telefon sinovi Workeriga (`http://192.168.1.106:8787`) Settings ekrani chaqiradigan barcha so‘rovlar yuborildi. Login qilinib, oxirida logout bajarildi:

```
/admin/me 200 · /categories 200 · /settings 200 · /admin/users 200
/admin/reports/summary 200 · /admin/orders 200 · /admin/products 200
```

Barcha endpointlar ishlaydi. CORS ham sabab emas: APK'da sahifa API bilan bir xil origin'dan ochiladi. `Failed to fetch` — bu `fetch()` server bilan umuman bog‘lana olmaganda chiqaradigan `TypeError`. Ehtimoliy sabablar: o‘sha paytda telefon Macdagi Workerga yeta olmagan (Wi‑Fi uzilishi, Mac uyquga ketishi yoki Worker to‘xtashi, firewall). **Backend nuqsoni topilmadi, backend o‘zgartirilmadi.**

UI tomonda bu endi xom inglizcha xabar sifatida chiqmaydi. Uning o‘rniga "Serverga ulanib boʻlmadi. Internet yoki Wi‑Fi aloqasini tekshirib, qayta urinib koʻring." xabari, **Qayta urinish** tugmasi va debug build'da **Server manzili** tugmasi ko‘rsatiladi.

## Ruxsat etilgan fayllar to‘plami (tahrirdan oldin belgilangan)

- `apps/customer/index.html`, `apps/customer/src/*`
- `apps/admin/index.html`, `apps/admin/src/*`
- `packages/ui/**` (yangi: dizayn tokenlari, shrift fayllari, ikonkalar, formatlash yordamchilari)
- `apps/android/{customer,admin}/src/main/java/.../MainActivity.java` — faqat taqdimot: dev panelni olib tashlash, status bar rangi, `woff2` MIME, debug JS ko‘prigi. Build konfiguratsiyasi, manifest, Gradle va imzo tegilmadi.
- `docs/ui-redesign/*`
