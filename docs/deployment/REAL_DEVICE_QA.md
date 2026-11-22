# Haqiqiy telefonda sinov

## Holat

Bu sessiyada telefon Mac'ga ulanmagan (`adb devices` bo‘sh). Shuning uchun **haqiqiy qurilmada men tomonimdan hech qanday sinov o‘tkazilmagan**.

Quyida ikki narsa bor: siz telefonda olgan natijalar (bu ish boshlanishidan oldin, lokal LAN server bilan) va Cloudflare'ga ulangandan keyin telefonda bajarish kerak bo‘lgan tekshiruvlar.

## Oldingi telefon sinovi (sizning natijalaringiz, LAN server `192.168.1.106:8787`)

| Tekshiruv | Natija | Izoh |
|---|---|---|
| Xaridor ilovasi ochiladi | o‘tdi | |
| Profil va mavzular | o‘tdi | |
| Admin Boshqaruv | o‘tdi | ma’lumot o‘sha paytdagi jonli lokal API'dan kelgan |
| Admin mahsulotlar (vizual) | o‘tdi | |
| Texnik interfeys | o‘tdi | |
| Katalog, qidiruv, savat, checkout, buyurtmalar, admin buyurtmalari | bloklangan | sababi: telefon va Mac orasidagi aloqa uzilishi ([CLOUDFLARE_AUDIT](CLOUDFLARE_AUDIT.md#ulanish-xatolarining-tasdiqlangan-sabablari)). Lokal bazada telefondan berilgan buyurtma bor, ya'ni checkout bir marta ishlagan |
| Admin Sozlamalar, Kategoriyalar | "Serverga ulanib bo‘lmadi" | o‘sha sabab |

Bu bloklangan funksiyalar Cloudflare'da UI orqali tekshirildi, natija 20/20 ([API_VERIFICATION](API_VERIFICATION.md)). Lekin bu brauzer emulyatsiyasi, haqiqiy telefon emas.

## Cloudflare'ga ulangandan keyin telefonda bajariladigan tekshiruvlar

Tayyorgarlik:
- v1.0.1 ni ustidan o‘rnating yoki ilovalarda server manzilini o‘zgartiring ([ANDROID_UPDATE_COMPATIBILITY](ANDROID_UPDATE_COMPATIBILITY.md)).
- Telefon Mac bilan bir Wi‑Fi'da bo‘lishi **shart emas**, istalgan internet yetadi.
- Sinov yozuvlarini "Sinov:" deb nomlang, keyin ularni yashirish oson bo‘ladi.

**Admin:**
1. `dist/production-admin-credentials.txt`dagi login bilan kiring.
2. Sozlamalar ochilishi kerak, "Sozlamalar yuklanmadi" chiqmasligi kerak.
3. Do‘kon telefoni va yetkazib berish matnini kiritib saqlang.
4. Kategoriya yarating.
5. Mahsulot yarating, rasm qo‘shmasdan. **R2 yoqilmaguncha rasm yuklash ishlamaydi.**
6. Boshqaruvda mahsulotlar soni va qoldiq ko‘rinishi kerak.

**Xaridor:**
7. Bosh sahifada mahsulot ko‘rinadi.
8. Katalog → qidiruv → mahsulot → savatga qo‘shish → miqdor.
9. Checkout: avval bo‘sh holda yuboring (xato chiqishi kerak), keyin to‘ldirib yuboring.
10. Buyurtmalar ro‘yxatida "Yangi" holati.

**Admin:**
11. Buyurtmalar → buyurtmani oching → "Tasdiqlangan".
12. Mahsulot qoldig‘i kamayganini tekshiring.

**Xaridor:**
13. Buyurtmalar → yangilash → "Tasdiqlangan" ko‘rinishi kerak.

**Qurilmaga xos tekshiruvlar:**
14. Klaviatura ochilganda maydonlar ko‘rinib turadimi.
15. Status bar rangi to‘g‘rimi.
16. Ulashish tugmasi ishlaydimi.
17. Internetni o‘chirib, keyin qayta yoqib ko‘ring: "Aloqa yo‘q" va "Qayta urinish" ishlashi kerak.

**R2 yoqilgandan keyin:**
18. Admin mahsulotiga rasm yuklang. Rasm adminda va xaridor ilovasida ko‘rinishi kerak.

**Natijani yozing:** har bir qadam uchun o‘tdi yoki o‘tmadi. O‘tmagan qadam uchun skrinshot va taxminiy vaqt yozing, Worker loglarini shu vaqt bo‘yicha tekshirib bo‘ladi:

```sh
cd apps/api && npx wrangler tail fayz-market-api
```
