# Fayz Market 1.2.3 — Samsung Galaxy A17 da qoʻlda tekshirish roʻyxati

Bu roʻyxat **faqat haqiqiy telefon** uchun. Emulator natijalari (`EMULATOR_QA_ANDROID16.md`) bu yerga yozilmaydi va bu bandlarning oʻrnini bosmaydi.

| | |
|---|---|
| Qurilma | Samsung Galaxy A17 (SM-A175F), One UI, Samsung Keyboard |
| Ilovalar | Customer va Admin **release 1.2.3** (vc 10), 1.2.2 ustidan oʻrnatiladi (`dist/apk/v1.2.3/`) |
| Maʼlumotlar | Production. Faqat oʻqish yoki egasi rozi boʻlgan sinov buyurtmasi; sinov mahsuloti/buyurtmasi keyin oʻchiriladi |
| Skrinshotlar | Faqat `.local-qa/private-screenshots/real-device-1.2.3/` ga (git-ignored). Ism, telefon, joylashuv va summalar GitHub’ga chiqmasin |
| Natija | Har bandga **PASS / FAIL / BLOCKED** va izoh. Emulator natijasini bu yerga koʻchirmang |

## Tayyorgarlik

- [ ] Telefonda hozir qaysi versiya turibdi: Sozlamalar → Ilovalar → Fayz Market → Versiya (`1.2.2` kutiladi).
- [ ] Admin ilovada savatda nima borligini, kirish holatini va barmoq izi yoqilganini yozib qoʻying (yangilashdan keyin solishtirish uchun).

## 1. 1.2.2 ustidan 1.2.3 yangilash

| # | Qadam | Kutilgan natija | Natija |
|---|---|---|---|
| 1.1 | `fayz-market-customer.apk` (1.2.3) ni Telegram/fayl orqali ochib oʻrnating — **eski ilovani oʻchirmang** | «Yangilash» soʻraladi, Play Protect ogohlantirishi chiqishi mumkin («Baribir oʻrnatish») | |
| 1.2 | Mijoz ilovani oching | Savat, manzil va kirish saqlangan; versiya 1.2.3 | |
| 1.3 | Admin ilovasini xuddi shunday yangilang | Maʼlumotlar saqlangan. Barmoq izi yoqilgan boʻlsa, qulf ekrani barmoq izi bilan ochiladi | |
| 1.4 | Admin: Sozlamalar oxiri | «versiya 1.2.3» | |

## 2. Admin menyusi va Orqaga imo-ishorasi (One UI)

26-noyabrda telefonda **FAIL**, emulatorda PASS boʻlgan band.

| # | Qadam | Kutilgan natija | Natija |
|---|---|---|---|
| 2.1 | Admin → ☰ menyuni oching → ekran chetidan **Orqaga imo-ishorasi** | Menyu yopiladi, ilova ochiq qoladi | |
| 2.2 | Xuddi shuni pastki navigatsiya tugmalari rejimida (agar yoqilgan boʻlsa) «Orqaga» tugmasi bilan | Menyu yopiladi | |
| 2.3 | Buyurtmalar → bitta buyurtma oynasi → Orqaga | Oyna yopiladi, roʻyxat qoladi | |
| 2.4 | Mahsulotlar boʻlimida Orqaga | «Boshqaruv» ga qaytadi; yana Orqaga — ilovadan chiqadi | |
| 2.5 | Mijoz: mahsulot sahifasi / savat / checkout oynasi → Orqaga | Har biri bitta qatlamni yopadi, ilova yopilmaydi | |

## 3. Haqiqiy rasm yuklash — Samsung Camera va Galereya

26-noyabrda telefonda **FAIL** boʻlgan band.

| # | Qadam | Kutilgan natija | Natija |
|---|---|---|---|
| 3.1 | Admin → Mahsulotlar → yangi mahsulot → «Galereyadan tanlash» → Samsung Gallery’dan katta (5–12 MP) JPG | Oldindan koʻrish, «… KB · yuklashga tayyor» | |
| 3.2 | «Yuklash» | Rasm yuklanadi va mahsulot oynasida koʻrinadi | |
| 3.3 | «Kamerada suratga olish» → Samsung Camera → suratga olish → ✓ | Oldindan koʻrish; yuklash ishlaydi; surat telefon galereyasiga **saqlanmaydi** | |
| 3.4 | Tik va yotiq suratlar | Rasm aylanib qolmaydi (EXIF) | |
| 3.5 | Sinov mahsulotini saqlamasdan «Bekor qilish» (yoki saqlangan boʻlsa — oʻchirish) | Production’da ortiqcha mahsulot qolmaydi | |

## 4. Samsung Keyboard

| # | Qadam | Kutilgan natija | Natija |
|---|---|---|---|
| 4.1 | Admin kirish: emailni **katta harf bilan** va oxirida **boʻsh joy** bilan yozing | Kirish ishlaydi | |
| 4.2 | Parol maydoni: avtotuzatish/avto-katta harf parolni buzmaydi | Kirish ishlaydi | |
| 4.3 | Sozlamalar → Xodimlar → «Parolni tiklash» oynasida parolni bir marta bosib oxirigacha yozing (saqlamang) | Har bir harf yoziladi, fokus yoʻqolmaydi | |
| 4.4 | Mijoz: qidiruv, checkout ism/telefon/manzil | Klaviatura maydonni yopmaydi; Orqaga avval klaviaturani yopadi | |
| 4.5 | Oʻzbek lotin harflari (oʻ, gʻ) va emoji | Toʻgʻri yoziladi | |

## 5. Haqiqiy GPS va manzil (1.2.3 tuzatishi)

| # | Qadam | Kutilgan natija | Natija |
|---|---|---|---|
| 5.1 | Bosh sahifa → «Sizning joylashuvingiz» → ruxsat **bermang** → manzilni faqat yozing → tasdiqlang | Bosh sahifada yozilgan manzil. «Xaritada belgilangan nuqta» **paydo boʻlmaydi** | |
| 5.2 | Yana oching → «Joylashuvimni aniqlash (GPS)» → ruxsat bering (ochiq havoda va bino ichida) | Joriy joylashuv ±… m; aniqlik 150 m dan yomon boʻlsa tasdiqlash bloklanadi | |
| 5.3 | Eski joydan boshqa joyga borib qayta aniqlang | Eski (keshdagi) nuqta emas, yangi nuqta | |
| 5.4 | Xaritani barmoq bilan suring | Pin yangi nuqtani koʻrsatadi | |
| 5.5 | Checkout va Profil | Xuddi shu manzil | |
| 5.6 | Admin → Sozlamalar → Doʻkon joylashuvi: manzilni yozing (xaritaga tegmang) — **saqlamang** | Kenglik/uzunlik maydonlari oʻz-oʻzidan oʻzgarmaydi | |

## 6. Haqiqiy barmoq izi sensori

| # | Qadam | Kutilgan natija | Natija |
|---|---|---|---|
| 6.1 | Admin → Sozlamalar → «Barmoq izi bilan kirish» ni yoqing | Samsung biometrik oynasi; yoqildi | |
| 6.2 | ☰ → «Ilovani qulflash» → barmoq izi | Xuddi shu sessiya ochiladi | |
| 6.3 | Roʻyxatdan oʻtmagan barmoq | Ochilmaydi | |
| 6.4 | «Hisobdan chiqish» → qayta ochish | Faqat parol soʻraladi | |
| 6.5 | Mijoz ilovasida xuddi shu (Profil → barmoq izi) | Ishlaydi | |

## 7. One UI bildirishnomalari va batareya tejash

| # | Qadam | Kutilgan natija | Natija |
|---|---|---|---|
| 7.1 | Admin ilovani fonga oʻtkazing; boshqa telefondan sinov buyurtmasi (egasi roziligi bilan) | «Yangi buyurtma» bildirishnomasi | |
| 7.2 | Bildirishnomani bosing | Oʻsha buyurtma ochiladi | |
| 7.3 | Sozlamalar → Batareya → Fayz Market Admin «Cheklangan» / «Chuqur uyqu» | Bildirishnoma kechikishi yoki kelmasligi qayd etiladi (kutilgan cheklov) | |
| 7.4 | Ekran qulfida bildirishnoma | Mazmuni yashirin («private») | |
| 7.5 | Mijoz: kuryer «Mijozga topshirdim» dan keyin ilovani oching | «Ha, qabul qildim» kartasi darhol chiqadi (1.2.3 tuzatishi) | |

## 8. Yakun

- [ ] Sinov buyurtmasi/mahsuloti production’dan olib tashlandi (egasi tasdiqladi).
- [ ] Skrinshotlar faqat `.local-qa/private-screenshots/real-device-1.2.3/` da.
- [ ] FAIL boʻlgan har bir band uchun: qadam, kutilgan va haqiqiy natija, telefon versiyasi (One UI, Android), vaqt.
