# Fayz Market V1.1.1: Samsung Galaxy A17'da Telegram orqali qo'lda sinov (USB/ADB'siz)

**Natijalar ustunini faqat telefonni qo'lida ushlab turgan odam to'ldiradi.** Bu hujjatdagi birorta real telefon natijasi oldindan PASS deb belgilanmagan. Emulyatorda tekshirilganlari alohida ko'rsatilgan va ular real telefon natijasi o'rnini bosmaydi.

## 1. Yuboriladigan fayllar

| Telegram'da yuboriladigan fayl (Mac, Finder) | Ilova | Paket | Versiya | Hajm | SHA-256 |
|---|---|---|---|---|---|
| `Fayiz-Market/dist/telegram/FayzMarket-Mijoz-v1.1.1.apk` | Fayz Market (mijoz) | `uz.fayzmarket.customer` | 1.1.1 (versionCode 5) | 644 012 B | `ecfd5e751ab15ff6dc432682bb7082dc3db189a91034b881ee538b50a895912e` |
| `Fayiz-Market/dist/telegram/FayzMarket-Admin-v1.1.1.apk` | Fayz Market Admin (admin + kuryer) | `uz.fayzmarket.admin` | 1.1.1 (versionCode 5) | 646 808 B | `8bd38997c70d2360a554ac2e9330f14c593ea3b9f34a2af795ec961f1c860773` |

To'liq yo'l: `/Users/ilyosbek/Documents/GitHub/Fayiz-Market/dist/telegram/`. Finder'da **Go → Go to Folder…** (⇧⌘G) oynasiga shu yo'lni kiriting.

Bular `dist/apk/v1.1.1/` dagi fayllarning nomi o'zgartirilgan nusxalari (SHA-256 bir xil). APK fayl nomi o'rnatishga ta'sir qilmaydi.

**APK'lar tekshirildi (2026-11-23, Mac'da):**
- Ikkalasi joriy commit `f3f9e98` dan noldan qayta yig'ilganda baytma-bayt bir xil chiqdi.
- `targetSdk` 28, `minSdk` 23. Standart server production: `https://fayz-market-api.ilyosbeksalayev240.workers.dev`.
- Imzo: `CN=Android Debug`, sertifikat SHA-256 `93f0f845…f89851`. Bu v1.0.0–v1.1.1 ning hammasi bilan bir xil, shuning uchun telefondagi eski versiya ustidan yangilanadi.
- Rebuild talab qilinmadi.

## 2. Xavfsiz sinov muhiti: test buyurtmalari production'ga yozilmaydi

**Tanlangan variant: Mac'dagi lokal sinov serveri, Wi-Fi orqali.** Cloudflare resursi yaratilmaydi, production D1/R2 ishlatilmaydi.

- Server Mac'da ishlaydi va o'zining alohida bazasidan foydalanadi. Ishga tushirish: `scripts/deploy-qa/lan-test-server.sh`, test ma'lumotlari: `node scripts/deploy-qa/lan-seed.mjs`.
- Telefon Mac bilan **bir xil Wi-Fi** tarmog'ida bo'lishi kerak. Ilova ichidagi "Server manzili" sozlamasiga `http://192.168.2.37:8791` kiritiladi. Bu Mac'ning hozirgi Wi-Fi manzili; server ishga tushganda aniq manzilni o'zi chiqaradi.
- Sinov serverida SMS yuborilmaydi: tasdiqlash kodi ekranda «Lokal sinov rejimi» oynasida ko'rinadi.
- Sinov serverida "Sinov soati", "Sinov quloqchini" va "Sinov sumkasi" mahsulotlari bor. Production'da ular yo'q, shuning uchun qaysi serverda ekaningizni shu mahsulotlardan bilasiz.
- Test hisoblari faqat shu Mac'dagi serverda mavjud:
  - Admin (egasi): `owner@test.local` / `TestOwner-2026`
  - Kuryer: `kuryer@test.local` / `TestKuryer-2026`
- `lan-seed.mjs` `https://` yoki ommaviy manzilga yozishni rad etadi. Production'ga yozishga urinish sinab ko'rildi va rad etildi.

**Mac'da emulyatorda tekshirilgan (real telefon emas):**
- APK haqiqatan `http://192.168.2.37:8791` ga ulanadi. Debug APK'da HTTP ruxsat etilgan.
- Ikkala ilovada ilova ichidagi oyna orqali sinov serveriga o'tish va production'ga qaytish ishlaydi.
- Sinov serverida mahsulotlar ko'rinadi, admin test hisobi bilan kiradi.

**Cheklovlar:**
- Sinov davomida Mac yoqiq, uyquga ketmagan va server ishlab turgan bo'lishi kerak.
- Telefon mobil internetga o'tib qolsa, server ko'rinmaydi.
- Ommaviy Wi-Fi'da ishlatmang: server ishlab turganda shu tarmoqdagi istalgan qurilma unga ulana oladi.

### Variant B: Cloudflare staging (faqat loyiha, yaratilmagan)

Bu variant uyda emas, istalgan joyda yoki boshqa odamlar sinovi uchun kerak. **Sizning roziligingizsiz hech narsa yaratilmaydi.** Tayyorlanadigan resurslar production'dan to'liq ajratilgan:

| Resurs | Nomi | Production bilan aloqasi |
|---|---|---|
| Worker | `fayz-market-api-staging` (workers.dev) | Alohida skript va URL |
| D1 | `fayz-market-staging` | Alohida baza, migratsiyalar 0001–0006 |
| R2 | `fayz-market-images-staging` | Alohida bucket |
| Secret | `BOOTSTRAP_SECRET` (yangi qiymat) | Production secret'i ishlatilmaydi |

Rozilik berilgandan keyin bajariladigan buyruqlar (hozir **bajarilmagan**):
1. `wrangler d1 create fayz-market-staging` va `wrangler r2 bucket create fayz-market-images-staging`.
2. `wrangler.toml` ga yangi `[env.staging]` bo'limi qo'shiladi: yangi D1 id, R2 nomi va `ENVIRONMENT="staging"`. Production bo'limiga tegilmaydi.
3. `wrangler d1 migrations apply fayz-market-staging --env staging --remote` va `wrangler secret put BOOTSTRAP_SECRET --env staging`.
4. `wrangler deploy --env staging`.
5. APK qayta yig'ilmaydi: ilovadagi server manziliga staging URL kiritiladi.

Staging'ning cheklovi: u `https://` da ishlaydi, shuning uchun "kod ekranda ko'rinadi" rejimi ishlamaydi. Mijozni ro'yxatdan o'tkazish uchun haqiqiy SMS yoki email provayderi (Eskiz/Resend) kerak bo'ladi. Ro'yxatdan o'tmasdan (mehmon sifatida) buyurtma berish esa ishlaydi.

Narxi Cloudflare'ning bepul limitlari ichida bo'lishi kutiladi: Workers, D1 va R2'ning bepul ulushlari. R2 hisobda allaqachon yoqilgan.

## 3. O'rnatishdan oldin (telefonda)

| # | Qadam | Kutilgan natija | Natija (✅ / ❌ / —) | Izoh |
|---|---|---|---|---|
| P1 | Sozlamalar → Telefon haqida → Dasturiy ta'minot: Android va One UI versiyasini yozing | — | | |
| P2 | Sozlamalar → Ilovalar → Fayz Market va Fayz Market Admin: hozirgi versiyani yozing (yo'q bo'lsa "o'rnatilmagan") | — | | |
| P3 | Mijoz ilovasida production'da savat, kirish yoki barmoq izi yoqilganini yozing | — | | Keyin solishtirish uchun |
| P4 | Sozlamalar → Xavfsizlik va maxfiylik → **Auto Blocker** yoqilgan bo'lsa, vaqtincha o'chiring | Telegram'dan o'rnatish to'silmaydi | | Sinovdan keyin qayta yoqing |

## 4. Telegram orqali o'rnatish (ustidan yangilash)

| # | Qadam | Kutilgan natija | Natija | Izoh |
|---|---|---|---|---|
| I1 | Mac'dagi Telegram'dan ikkala `.apk` faylni o'zingizga ("Saved Messages") **fayl sifatida** yuboring | Telefonda ikkita fayl ko'rinadi | | |
| I2 | Telefonda `FayzMarket-Mijoz-v1.1.1.apk` ni bosing; "Noma'lum ilovalarni o'rnatish" so'ralsa, Telegram'ga ruxsat bering | O'rnatish oynasi chiqadi | | |
| I3 | Oynada **"Yangilash" (Update)** yozuvi chiqishi kerak, "O'rnatish" emas (agar ilova avval o'rnatilgan bo'lsa) | Yangilash muvaffaqiyatli | | |
| I4 | Play Protect "eski Android uchun yaratilgan" yoki "noma'lum ishlab chiquvchi" desa → **Baribir o'rnatish** | O'rnatiladi | | Debug imzo va targetSdk 28 uchun bu kutilgan holat |
| I5 | Xuddi shunday `FayzMarket-Admin-v1.1.1.apk` ni o'rnating | Yangilash muvaffaqiyatli | | |
| I6 | Sozlamalar → Ilovalar: ikkalasida **1.1.1** | 1.1.1 | | Ilova ichidagi "Fayz Market V1.0" yozuvi eski bezak matni, haqiqiy versiya emas |
| I7 | Mijoz ilovasini oching: P3 da yozganlaringiz (savat, kirish) joyida | Ma'lumotlar saqlangan | | |

**"Ilova o'rnatilmadi" yoki "paket mos kelmaydi" (package conflicts) chiqsa:** to'xtang, eski ilovani **o'chirmang**, xabarning skrinshotini yuboring. Bu telefondagi eski ilova boshqa kalit bilan imzolanganini bildiradi.

## 5. Production'da faqat ko'rish (yozuvsiz)

| # | Qadam | Kutilgan natija | Natija | Izoh |
|---|---|---|---|---|
| R1 | Mijoz ilovasi ochiladi, bosh sahifa chiqadi | Xatosiz yuklanadi | | Production katalogi hozir bo'sh bo'lishi mumkin |
| R2 | Birinchi ochilishda bildirishnoma ruxsati so'ralsa → Ruxsat berish | — | | |
| R3 | Admin ilovasi ochiladi, kirish ekrani chiqadi | "Boshqaruv paneliga kirish" | | Production'ga kirish ixtiyoriy: kirish ma'lumotlar bazasiga sessiya yozuvini qo'shadi, buyurtma qo'shmaydi |

## 6. Sinov serveriga o'tish

Sinovni boshlashdan oldin menga yozing, Mac'da serverni ishga tushirib, aniq manzilni aytaman.

| # | Qadam | Kutilgan natija | Natija | Izoh |
|---|---|---|---|---|
| S1 | Mijoz: **Profil → Texnik sozlamalar → Server (API) manzili** → eski matnni o'chirib `http://192.168.2.37:8791` ni kiriting → Saqlash | Ilova qayta ochiladi, "Sinov …" mahsulotlari ko'rinadi | | |
| S2 | Admin: kirish ekranida **Server manzili (sinov)** → shu manzil → Saqlash | Kirish ekrani qayta ochiladi | | |

⚠️ **Barmoq izi haqida:** ilova telefonda barmoq izi bilan kirishni faqat bitta saqlaydi. Agar P3 da production uchun barmoq izi yoqilgan bo'lsa, sinov serverida uni yoqish production'dagisini almashtiradi. Keyin production'da parol bilan kirib, barmoq izini qayta yoqishingiz kerak bo'ladi.

## 7. Funksional sinovlar (sinov serverida)

| # | Qadam | Kutilgan natija | Natija | Izoh |
|---|---|---|---|---|
| C1 | Mijoz → Profil → Kirish → Ro'yxatdan o'tish: istalgan `+998…` raqam | Kod ekranda «Lokal sinov rejimi» oynasida chiqadi; kiritgach hisob ochiladi | | |
| C2 | Profil → **Barmoq izi bilan kirish** ni yoqing → tizim oynasiga barmoq qo'ying | Yoqiladi | | |
| C3 | Ilovani to'liq yoping (so'nggi ilovalardan surib tashlang) va qayta oching | "Barmoq izi bilan ochish" ekrani | | |
| C4 | Avval **ro'yxatdan o'tmagan** barmoqni qo'ying | Rad etiladi, ilova qulfda qoladi | | |
| C5 | Keyin to'g'ri barmoqni qo'ying | Ilova ochiladi, profilingiz ko'rinadi | | |
| C6 | Katalog → "Sinov soati" → Savatga qo'shish → Savat → Buyurtma berish → **Xaritadan manzil tanlash** | Xarita chiziladi (OpenFreeMap) | | |
| C7 | **Joylashuvimni aniqlash** → Android joylashuv ruxsati → Ruxsat berish | Belgi sizning joyingizga ko'chadi | | GPS yoqilgan bo'lsin |
| C8 | Shu joyni tasdiqlash → ism va manzil → **Buyurtmani yuborish** | `FM-…` raqamli buyurtma | | |
| A1 | Admin → `owner@test.local` / `TestOwner-2026` → Kirish (bildirishnoma ruxsati so'ralsa → Ruxsat berish) | Boshqaruv paneli, C8 buyurtmasi ro'yxatda | | |
| A2 | Admin ilovasini fonga o'tkazing (Home). Mijoz ilovasidan yana bitta buyurtma bering. 20–60 soniya kuting | "Yangi buyurtma FM-…" tizim bildirishnomasi | | |
| A3 | Bildirishnomani bosing | Admin ilovada aynan shu buyurtma ochiladi | | |
| A4 | Buyurtma → Holatni o'zgartirish → **Tasdiqlangan**; Kuryer → Test Kuryer → **Tayinlash** | Kuryer tayinlandi | | |
| A5 | Mahsulotlar → Mahsulot qo'shish → **Kamerada suratga olish** → suratga oling → ✓ | Rasm ilovada oldindan ko'rinadi | | |
| A6 | **Yuklash** | Rasm mahsulot oynasida ko'rinadi | | |
| A7 | Telefon Galereyasini oching | Ilovada olingan surat galereyada **yo'q** | | Bekor qilish bilan mahsulotni saqlamasdan chiqing |
| K1 | Admin → Chiqish → `kuryer@test.local` / `TestKuryer-2026` | Kuryer paneli, tayinlangan buyurtma | | |
| K2 | Buyurtma → **Qabul qilish** (joylashuv ruxsati → Ruxsat berish) → **Do'kondan oldim** → **Yo'lga chiqdim** | "Joylashuv ulashilmoqda" yozuvi | | |
| C9 | Mijoz → Buyurtmalar → **Kuzatish** | Kuryer belgisi xaritada sizning joyingizda | | |
| K3 | Kuryer → **Manzilga yetib keldim** → **Mijozga topshirdim** | Buyurtma mijoz tasdig'ini kutadi | | |
| C10 | Mijoz → Buyurtmalar → **Ha, qabul qildim** | Holat "Yetkazildi"; baholash taklif qilinadi | | |
| C11 | (ixtiyoriy) Telefon sozlamalarida yangi barmoq izi qo'shing → mijoz ilovasini oching | "Barmoq izlari o'zgargani uchun bu usul o'chirildi"; faqat parol bilan kirish qoladi | | Keyin qo'shilgan barmoq izini o'chirishingiz mumkin |

## 8. Production'ga qaytarish (majburiy)

| # | Qadam | Kutilgan natija | Natija | Izoh |
|---|---|---|---|---|
| E1 | Mijoz: Profil → barmoq izini **o'chiring** → Chiqish | — | | Sinov hisobi telefonda qolmasligi uchun |
| E2 | Mijoz: Profil → Texnik sozlamalar → Server (API) manzili → `https://fayz-market-api.ilyosbeksalayev240.workers.dev` → Saqlash | "Sinov …" mahsulotlari yo'qoladi | | |
| E3 | Admin: Chiqish → Server manzili (sinov) → shu production manzili → Saqlash | Kirish ekrani | | |
| E4 | Mijoz ilovasida P3/I7 dagi ma'lumotlar (savat, kirish) joyida | Saqlangan | | |
| E5 | Auto Blocker'ni qayta yoqing (P4) | — | | |

## 9. Natijani qaytarish

Jadvaldagi ❌ va "Izoh"larni hamda xato chiqqan ekranlar skrinshotini yuboring. Shular asosida `docs/v1-expansion/REAL_DEVICE_REPORT.md` yoziladi. Unda real telefon natijalari emulyator natijalaridan alohida ko'rsatiladi.

## Ma'lum holatlar

- Mijoz ilovasidagi "Fayz Market V1.0" yozuvi eski matn. Haqiqiy versiya: Sozlamalar → Ilovalar → **1.1.1**.
- Agar saqlangan mehmon buyurtmalaridan biri serverda topilmasa, "Buyurtmalarim" ro'yxati butunlay xato ko'rsatadi (`apps/customer/src/main.tsx:136`). Production'da bu faqat buyurtma bazadan o'chirilsa yuz beradi.
- Telefon qayta yoqilgandan keyin ilovalar ekran qulfi bir marta ochilmaguncha ishga tushmaydi. Bu odatiy Android xatti-harakati.
