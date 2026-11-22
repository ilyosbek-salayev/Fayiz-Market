# Jonli API tekshiruvi (2026-11-22)

Barcha tekshiruvlar haqiqiy production Worker'ida bajarildi: `https://fayz-market-api.ilyosbeksalayev240.workers.dev`, D1 `fayz-market`. Natijalar real HTTP javoblardan olingan.

## 1. API skripti — 70/71 o‘tdi

Skript: `scripts/deploy-qa/api-verify.mjs`.

**Sinov ma’lumotlari:**
- Barcha sinov yozuvlari `QA-PROD` nomi bilan yaratildi.
- **To‘lov yozilmadi.** To‘lov mantig‘i faqat yozuvni rad etadigan yo‘llar orqali tekshirildi: ortiqcha summa, manfiy summa, bekor qilingan buyurtma.
- Sinov buyurtmasi oxirida bekor qilindi, mahsulot esa yashirildi.

| Guruh | Natija |
|---|---|
| Ochiq endpointlar: `/health`, `/settings`, `/categories`, `/products`, noto‘g‘ri sort (400), mavjud bo‘lmagan slug (404) | 6/6 |
| Autentifikatsiya: token yo‘q (401) — 7 ta admin marshruti; soxta token (401); noto‘g‘ri parol (401); noto‘g‘ri kirish ma’lumoti (400); owner login (200, ~356 ms); `/admin/me` | 12/12 |
| Hisobot bazaviy qiymati | 1/1 |
| Kategoriya: yaratish, tahrirlash, takroriy slug (409), o‘chirish (owner) | 4/4 |
| Mahsulot: yaratish, manfiy narx (400), tahrirlash, ro‘yxat, qoldiq +2, qoldiqni 0 dan pastga tushirish (409 `STOCK_CONFLICT`) | 6/6 |
| Xaridor tomoni: qidiruv admin mahsulotini topadi, kategoriya filtri, `price_asc` saralash, mahsulot sahifasi, `/p/:slug` HTTPS havola | 5/5 |
| Checkout: noto‘g‘ri telefon (400), qoldiqdan ko‘p (409), buyurtma yaratish (201, jami 260 000), token bilan o‘qish, tokensiz (401), noto‘g‘ri token (404), qoldiq 6 → 4 | 7/7 |
| Admin buyurtmalari: ro‘yxat, holat filtri, tafsilot va to‘lovlar, `new→delivered` sakrashi (409), `new→confirmed`, xaridor yangi holatni ko‘radi | 6/6 |
| To‘lov: ortiqcha summa (409 `OVERPAYMENT`), manfiy summa (400), bekor qilingan buyurtma (409 `CANCELLED_ORDER`) — hech biri yozilmadi | 3/3 |
| Hisobot yangi buyurtmani ko‘rsatadi (0 → 1, summa +260 000, to‘lovlar o‘zgarmagan) | 1/1 |
| Bekor qilish va qoldiqni qaytarish (4 → 6) | 2/2 |
| Sozlamalar: o‘sha qiymatlar bilan saqlash, qiymatlar o‘zgarmadi | 2/2 |
| Administratorlar: ro‘yxat, manager qo‘shish va login; manager uchun `/admin/users`, sozlamalar va kategoriya o‘chirish 403; manager buyurtmalarni o‘qiy oladi; logout sessiyani bekor qiladi | 7/7 |
| Rasmlar: noto‘g‘ri kalit (400), rasm bo‘lmagan fayl (415) | 2/2 |
| **R2 ga yuklash** | **0/1 — HTTP 500 (R2 yoqilmagan, `IMAGES` binding yo‘q)** |
| CORS: begona origin ruxsat olmaydi, begona preflight 403; noto‘g‘ri JSON rad etiladi | 3/3 |
| Mahsulotni yashirish (DELETE) va xaridorga 404 | 2/2 |

## 2. APK bundle'lari bilan UI tekshiruvi — 20/20 o‘tdi

Skript: `scripts/deploy-qa/ui-smoke.mjs`.

**Qanday sinaldi:**
- Headless Chrome Android WebView'ni emulyatsiya qildi: `<API>/__app/*` so‘rovlari `apps/*/dist`dagi APK bundle'idan berildi, qolgan barcha so‘rovlar haqiqiy HTTPS API'ga yuborildi.
- Ekran kengligi 390 px (telefon) va 1280 px.

**O‘tgan tekshiruvlar:**
1. Admin: noto‘g‘ri parolda xato banneri chiqadi.
2. Admin: login va Cloudflare'dan Boshqaruv.
3. Admin: **Sozlamalar yuklandi** (do‘kon ma’lumoti va administratorlar). Telefonda xato bergan ekran shu.
4. Admin: Kategoriyalar yuklandi.
5. Admin UI'da mahsulot yaratildi va D1'da saqlandi (99 000 so‘m, 3 dona).
6. Xaridor: bosh sahifa banneri Cloudflare'dan keldi.
7. Xaridor: qidiruv admin mahsulotini topdi.
8. Xaridor: mahsulot sahifasi ochildi.
9. Xaridor: savatga qo‘shildi (ilova ichidagi toast).
10. Xaridor: miqdor 2 ga oshirildi.
11. Xaridor: checkout validatsiyasi ishladi.
12. Xaridor: checkout D1'da buyurtma yaratdi.
13. Xaridor: buyurtmalar ro‘yxatida "Yangi" holati ko‘rindi.
14. Qoldiq 3 → 1 ga kamaydi.
15. Admin: buyurtmani topib ochdi.
16. Admin: holatni "Tasdiqlangan"ga o‘zgartirdi, D1'da saqlandi.
17. Admin: logout.
18. Xaridor: "Tasdiqlangan" holatini ko‘rdi.
19. Native `alert`/`confirm` dialoglari chiqmadi.
20. Ilovalarda tarmoq xatosi yoki 5xx javob bo‘lmadi.

Skrinshotlar faqat lokal ishchi nusxada saqlangan (Git'ga kirmaydi): Boshqaruv, Sozlamalar, Kategoriyalar, Mahsulotlar, buyurtma modali, bosh sahifa, katalog, mahsulot, checkout, buyurtmalar.

## 3. Tozalash

Sinovdan keyin, D1 to‘liq eksport qilingach, faqat `QA-PROD` belgili yozuvlar o‘chirildi:
- 2 ta buyurtma va ularning qatorlari;
- 2 ta mahsulot, 1 ta qoldiq yozuvi, 1 ta kategoriya;
- 1 ta sinov manager akkaunti, login urinishi yozuvi va sinov sessiyalari.

Production hozirgi holati:
- 0 ta kategoriya, mahsulot va buyurtma;
- 0 ta to‘lov;
- 1 ta owner;
- 5 ta sozlama.

Buyurtma va mahsulot ID'lari `AUTOINCREMENT` sababli 3 dan boshlanadi. Bu kosmetik farq.

## Qayta ishga tushirish

```sh
npm i --prefix scripts/ui-qa --no-save --no-package-lock puppeteer-core@23.11.1   # faqat UI tekshiruvi uchun
export QA_API=https://fayz-market-api.ilyosbeksalayev240.workers.dev
export ADMIN_EMAIL='...' ADMIN_PASSWORD='...'    # dist/production-admin-credentials.txt dan
node scripts/deploy-qa/api-verify.mjs                       # sinov yozuvlarini yaratadi
QA_CATEGORY_ID=<api-verify yaratgan kategoriya> node scripts/deploy-qa/ui-smoke.mjs
```

Ikkala skript ham productionda sinov yozuvlarini qoldiradi. Ularni yuqoridagi kabi, avval eksport qilib, keyin tozalash kerak.
