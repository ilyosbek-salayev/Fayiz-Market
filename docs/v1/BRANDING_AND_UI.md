# Branding va UI — Fayz Market V1

## 1. Tasdiqlangan logotiplar

Loyiha ildiziga joylangan 4 ta fayl ochib koʻrildi. Tarkibi:

| Asl fayl | Turi | Fon | Repository nusxasi (manba) |
|---|---|---|---|
| `logo dark.png` | Belgi (aravacha + F), matnsiz | qora | `assets/brand/source/fayz-mark-dark.png` |
| `logo light.png` | Belgi, matnsiz | oq | `assets/brand/source/fayz-mark-light.png` |
| `logo dark mode.png` (= `logo`, SHA-256 bir xil) | Toʻliq logo: belgi + «FAYZ MARKET» | qora | `assets/brand/source/fayz-logo-dark.png` |
| `logo light mode.png` | Toʻliq logo | oq | `assets/brand/source/fayz-logo-light.png` |

- Asl fayllar **oʻchirilmadi va oʻzgartirilmadi**. Ular ildizda (Git’dan tashqarida) turibdi, bayt-bayt nusxalari esa `assets/brand/source/` da.
- Logo **qayta chizilmadi**. `scripts/brand/render-brand.mjs` faqat quyidagilarni bajaradi:
  - kontent chegarasi boʻyicha kesadi (fon rangi bilan);
  - kvadratga toʻldiradi;
  - oʻlchamini oʻzgartiradi.
- **Geometriya bir xil.** Asl light belgining kontenti dark belgiga nisbatan ~9 % kattaroq va surilgan edi (1099×1012 va 1006×953 px). Skript ikkalasida kontentni bir xil ulushga (86 %) va markazga keltiradi. Natijada Dark/Light almashganda belgi joyidan siljimaydi.

### Hosil qilingan resurslar

| Fayl | Qayerda ishlatiladi |
|---|---|
| `packages/ui/src/brand/mark-{light,dark}.webp` (384 px) | Ilova ichidagi belgi: header, sidebar, login, qulf ekrani, kuryer paneli, banner, xaritadagi doʻkon pini |
| `packages/ui/src/brand/logo-{light,dark}.webp` (640 px) | Toʻliq logo (`BrandLogo` komponenti) |
| `apps/*/index.html` ichidagi data-URI | JS yuklanguncha koʻrinadigan splash; internetsiz ham ishlaydi |
| `apps/android/customer/src/main/res/mipmap-*` | Customer launcher: **dark** belgi. Legacy PNG va adaptive icon (API 26+) |
| `apps/android/admin/src/main/res/mipmap-*` | Admin launcher: **light** belgi, Customer’dan ajralib turishi uchun |
| `apps/android/shared/res/drawable-*dpi/ic_stat_fayz.png` | Status-bar bildirishnoma belgisi: belgining oq siluetidan, Android talabi boʻyicha |
| `apps/desktop/build/icon.png` (1024 px) | macOS va Windows ikonkasi (`.icns`/`.ico` electron-builder hosil qiladi) |

Eski F-sumka belgisi (`BrandMark` SVG, `drawable-nodpi/launcher.png`, `ic_stat_fayz.xml`) olib tashlandi. Ular yangi belgi bilan almashtirildi.

## 2. Dark/Light tanlash

- `BrandMark` (`packages/ui/src/brand.tsx`) mavzuni `data-theme` boʻyicha aniqlaydi:
  - Customer’da «Qora» mavzu = dark;
  - Admin’da «Qorongʻi» yoki «Tizim boʻyicha» = dark.
- Mavzu almashganda mos belgi avtomatik chiqadi. Bu skrinshotlarda koʻrinadi: `customer-home-dark-390.png`, `admin-settings-dark.png`.
- Admin uchun yangi **Koʻrinish** paneli qoʻshildi: Yorugʻ / Qorongʻi / Tizim boʻyicha. Tanlov faqat shu qurilmaga tegishli. `index.html` dagi skript mavzuni birinchi kadrdan oldin oʻrnatadi, shuning uchun ekran «miltillamaydi».
- Rasm hech qachon choʻzilmaydi (`object-fit: contain`, kvadrat). Rasm yuklanmasa, ilova ichidagi tasdiqlangan logo koʻrsatiladi (`onError`).

## 3. Admin → Sozlamalar → Brend va koʻrinish

| Imkoniyat | Qanday ishlaydi |
|---|---|
| Light / Dark logotip | Har biri alohida yuklanadi, har biri uchun alohida preview |
| Brend nomi, qisqa tavsif | Bosh sahifa headerida koʻrinadi |
| Preview | Har bir logo yorugʻ va qorongʻi fonda 88/40/24 px oʻlchamda. Qoʻshimcha ravishda ikki rejimdagi header maketi |
| Saqlash / Bekor qilish | Faqat oʻzgarish boʻlsa faol |
| Avvalgi logoga qaytarish | `brand_logo_history` jadvali. «Standart logoga qaytarish» ilova ichidagi tasdiqlangan logoni tiklaydi |
| Huquq | Oʻzgartirish faqat Owner (super admin). Admin (manager) faqat koʻradi. Kuryerga yopiq |

**Yuklashda tekshiruvlar.** Server `POST /admin/branding/logo`:

- faqat PNG, WebP yoki JPEG qabul qiladi. SVG rad etiladi, chunki ichida skript boʻlishi mumkin;
- fayl tarkibi (magic bytes va sarlavha) eʼlon qilingan turga mos boʻlishi shart;
- hajmi 1 MB gacha;
- oʻlchami 128–2048 px;
- tomonlar nisbati 0,8–1,25 (kvadratga yaqin);
- rasm R2’ga hash nomi bilan yoziladi va audit jurnaliga qayd etiladi.

Ilova faylni yuborishdan oldin uni 512 px PNG holiga keltiradi (shaffoflik saqlanadi).

**Real yangilanish.** Logo, nom va tavsif `GET /storefront` va `GET /settings` orqali tarqaladi, shuning uchun yangi APK kerak emas.

- Customer yangi logoni qurilmada data-URI sifatida keshlaydi, va internet uzilganda oxirgi koʻrilgan logo ishlayveradi.
- Kesh boʻlmasa, ilova ichidagi logo koʻrsatiladi.

**Cheklov (yashirilmaydi).** Bularni operatsion tizim chizadi, shuning uchun ular faqat yangi APK/DMG/EXE bilan oʻzgaradi:

- Android launcher ikonkasi;
- bildirishnoma belgisi;
- desktop ikonkasi.

Paneldagi logo ilova *ichidagi* brendingni boshqaradi.

## 4. Customer bosh sahifasi (qizil belgilangan hudud)

| Element | V1 |
|---|---|
| Header chap qismi | Yangi belgi (40 px), brend nomi, qisqa tavsif. Uzun matn `…` bilan qisqaradi |
| Header oʻng qismi | Takroriy qidiruv belgisi **olib tashlandi**. Oʻrniga «Doʻkonga yoʻl» (directions) tugmasi, 48 px |
| Qidiruv | Uzun input saqlandi. Bosilganda katalog qidiruvi fokus bilan ochiladi. Loading, empty, error holatlari oʻzgarmagan |
| Doʻkon manzili | «Doʻkon manzili: …» qatori. Admin kiritgan manzildan olinadi; kiritilmagan boʻlsa «Manzil hali kiritilmagan» |
| Foydalanuvchi joylashuvi | «Sizning joylashuvingiz: Aniqlash» (pastda batafsil) |
| Banner | Admin boshqaradigan bannerlar karuseli; banner boʻlmasa yangi belgi bilan standart hero |
| Kategoriyalar, tanlangan mahsulotlar, barcha mahsulotlar, bottom navigation | Oʻzgarmagan |

**Joylashuv qatori**:

- Bosilganda joylashuv bir marta (one-shot) aniqlanadi.
- Ruxsat berilmasa, ilova ishlashda davom etadi: «Sizning joylashuvingiz» oynasi xarita pini bilan ochiladi va qoʻlda tanlash mumkin.
- Natija faqat shu telefonda (`localStorage`) saqlanadi. Fon kuzatuvi yoʻq.
- Aniqlangan joylashuv koordinata va doʻkongacha boʻlgan masofa (~X km, «toʻgʻri chiziq boʻyicha» deb belgilangan) bilan koʻrsatiladi.

## 5. Responsive va mavzular — tekshirilgan oʻlchamlar

Ekran oʻlchamlari:

- 360, 390, 412, 768 px — Chrome, mobil emulyatsiya, DPR 2;
- admin 390 px va 1280 px.

Har bir oʻlchamda avtomatik tekshirildi:

- gorizontal overflow yoʻq;
- header, banner va joylashuv matni kesilmaydi (`…` boʻlsa ham ataylab);
- elementlar mavjud.

Natija: `docs/v1/screenshots/v1-storefront-ui-results.txt`. Skrinshotlar ham `docs/v1/screenshots/` da:

- `customer-home-{360,390,412,768}.png`, `customer-home-dark-390.png`, `customer-home-custom-logo.png`;
- `admin-settings-brand.png`, `admin-settings-390.png`, `admin-settings-dark.png`, `admin-logo-preview.png`.

Samsung A17 ~412 px kenglikka toʻgʻri keladi. Shu oʻlcham Chrome’da sinaldi; haqiqiy telefonda **NOT TESTED** (qarang: `TEST_RESULTS.md`).
