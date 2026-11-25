# V1 UX takomillashtirish — 1.2.1 (haqiqiy Android fikr-mulohazasi va `ilova app.pdf`)

**Manbalar:**

- egasining «REAL ANDROID QA FEEDBACK & ADMIN LOGIN UX FIX» topshirigʻi (2026-11-25);
- `~/Documents/Work/documents/ilova app.pdf` — 4 bet: matn va Uzum Market skrinshotlari.

**Ish tartibi:** branch `main`. Yangi branch ochilmadi, push qilinmadi, production’ga deploy qilinmadi. Kod commit’i: `625ea54`.

## 1. Egasining haqiqiy telefon sinovi (qayd uchun)

- **Kim sinadi.** Egasi Customer va Admin 1.2.0 ni **haqiqiy Samsung Galaxy A17** da oʻzi sinadi.
- **Natija.** Ilovalar ochiladi, u tekshirgan asosiy jarayonlar ishlaydi. UI/UX, joylashuv va maʼlumot kiritish qulayligini yaxshilash soʻraldi.
- **Bu natija egasiniki.** 1.2.1 ning oʻzi haqiqiy telefonda hali **sinalmagan** (pastda §5).
- **Haqiqiy credentials bilan sinalmagan integratsiyalar:** Payme, Click, SMS (Eskiz), Telegram, Resend, Firebase, OpenRouteService. Ular **production sinovdan oʻtgan deb belgilanmaydi.** Ular faqat kod, unit, mock va lokal sinovlardan oʻtgan.

## 2. Bajarilgan talablar

| # | Talab | Qanday hal qilindi | Dalil |
|---|---|---|---|
| 1 | Admin login’da server, debug yoki API tugmasi boʻlmasin | Login ekranida faqat logo, Email, Parol (koʻrsatish/yashirish tugmasi bilan) va «Kirish» bor. Server tugmasi va xato banneridagi «Server manzili» olib tashlandi | Chrome: debug build’da ham yoʻq. Emulyator release va debug: yoʻq |
| 2 | Production’ga avtomatik ulanish | **Release APK** (debuggable emas) doim build’ga yozilgan production manzilini ishlatadi. Telefonda avvalgi debug build qoldirgan sinov server manzili oʻchiriladi (unga bogʻliq barmoq izi sessiyasi bilan birga) | Emulyator: sinov serverga yoʻnaltirilgan debug ustidan release → production doʻkon ochildi (11/11) |
| 3 | Texnik sozlamalar faqat ruxsatli joyda | «Texnik sozlamalar» faqat **debug** build’da va faqat **super admin**ga, Sozlamalar ichida. Manager va kuryer koʻrmaydi. Release’da umuman yoʻq, Android menyusida ham «API manzili» yoʻq | Chrome 4 ta tekshiruv, emulyator |
| 4 | Debug va production ajratilgan | Ishlab chiquvchi uchun debug APK qoladi: `apps/android/*/build/outputs/apk/debug/`, lokal server, CDP sinovlari. Doʻkonga faqat release beriladi. Sertifikat bir xil, shuning uchun eski ilova ustidan yangilanadi | `scripts/build-apks.sh`, `build.gradle` |
| 5 | Customer’dagi server sozlamasi buzilmasin | Customer debug build’dagi «Texnik sozlamalar» saqlandi. Release’da yashirin | Chrome va emulyator |
| 6 | Narx kiritish: «1 000 000», boshidagi 0, kursor | Yangi `NumberInput`: boʻsh joy bilan guruhlaydi; 0 oʻrniga placeholder turadi; «05» → «5»; kursor yozilgan raqamdan keyin qoladi; paste qilinganda faqat raqamlar olinadi. Narx, qoldiq, qoldiq farqi, toʻlov summasi, banner tartibi va yetkazish narxida ishlatiladi. Pul formati hamma joyda «1 000 000 soʻm» | Unit 5 ta; Chrome 5 ta (390 px), mahsulot 1 000 000 bilan saqlandi |
| 7 | Integratsiyalar tushunarli boʻlsin | Ixcham roʻyxat va holatlar xulosasi (Ulangan / Tekshirish kerak / Sozlanmagan). Bosilganda bosqichli oyna ochiladi: 1) nima kerak; 2) maʼlumotlar; 3) maxfiy kalitlar; 4) tekshirish va yoqish. Texnik `ENV` nomlari sarlavhadan olib tashlandi | Skrinshotlar `admin-integrations*.png` |
| 8 | Credentials boʻlmasa «Connected» koʻrsatilmasin | «Ulangan» faqat **haqiqiy** tekshiruv muvaffaqiyatli oʻtganda va undan keyin kalit almashmagan boʻlsa. Boshqa holatlar: «Sozlangan · tekshirilmagan» yoki «Sozlangan · ichki tekshiruv oʻtdi» (Payme/Click — bank bilan ulanganini daʼvo qilmaydi), «Sozlanmagan», «Xato» | Chrome: Payme «Sozlanmagan»; ORS testdan oldin «tekshirilmagan», keyin «Ulangan» |
| 9 | PDF: telefon raqam + kod bilan kirish | «Fayz Market’ga kirish» oynasi: +998 doimiy, raqam formatlanadi → «Kodni olish» → 6 xonali kod (avtomatik yuboriladi) → kirish. Yangi raqam boʻlsa, parolsiz hisob ochiladi va ism soʻraladi. Parol, email va Telegram «Boshqa usullar»da saqlandi | API 8 ta tekshiruv, Chrome 5 ta |
| 10 | PDF: GPS joylashuv avtomatik, xarita ixtiyoriy | Checkout ochilganda telefonda aniqlangan GPS nuqta avtomatik biriktiriladi («Joriy joylashuvingiz (GPS)»). Aniqlanmagan boʻlsa: «Joylashuvimni aniqlash (GPS)» yoki «Xaritada tanlash». Kuryer koordinatani oladi | Chrome |
| 11 | PDF: kuryer mijoz telefonini koʻrsin | Bu **avvaldan bor edi**: kuryer oynasida telefon va «Qoʻngʻiroq» tugmasi | Oldingi expansion-ui toʻplami |
| 12 | PDF: kuryer xizmat haqi buyurtmaga alohida qoʻshilsin | Admin «Yetkazib berish narxi» va «Bepul yetkazib berish chegarasi»ni belgilaydi. Server haqni hisoblab, buyurtmaga alohida qator qilib qoʻshadi (olib ketishda 0). Mijoz, admin va toʻlov summasi (Payme/Click/bank) shu jami summadan foydalanadi | API 9 ta tekshiruv, Chrome 2 ta |
| 13 | PDF: toʻlov usullari | Olib ketishda toʻlash, doʻkon hisobiga oʻtkazma, kuryer orqali, onlayn — 1.2.0 da qilingan. Yetkazish haqi endi qoʻshildi | `BANNERS_AND_PAYMENTS.md` |
| 14 | Mobil va desktop UX | Profil kirish tugmalari 390 px da ustma-ust (avval sahifa yonga surilardi — sinov topdi va tuzatildi). Sozlamalar panellari orasida boʻsh joy. Integratsiya oynasi mobil’da pastdan ochiladi | Overflow tekshiruvlari, skrinshotlar |

**Bajarilmagan qism (ataylab):** PDF’dagi «mahsulot xususiyatlari (rang, xarakteristika), aksiyalar» bandi hujjatda **«ixtiyoriy»** deb berilgan. Ortiqcha imkoniyat qoʻshmaslik talabi sababli hozir qilinmadi. Kerak boʻlsa, alohida topshiriq sifatida bajariladi.

## 3. Server tomoni (production’ga hali chiqmagan)

Migratsiya `0008_phone_login_delivery_fee.sql`:

- `otp_codes` jadvali qayta quriladi: unga `login` maqsadi qoʻshiladi. Barcha qatorlar oldin koʻchiriladi.
- `orders.delivery_fee` ustuni (standart qiymat 0).
- `delivery_fee` va `delivery_free_from` sozlamalari.

Yangi endpoint: `POST /auth/phone/login`. Oʻzgarganlari:

- `/auth/otp` — `purpose: login` qoʻshildi;
- `/auth/config` — `phone.codeLogin` maydoni;
- `/storefront` — `checkout.deliveryFee` va `checkout.deliveryFreeFrom`;
- `PUT /admin/payment-settings` — yetkazish narxi qabul qilinadi.

**Moslik:**

- Production’dagi joriy V1 Worker (`43a90d3`) 0008 sxemasida **136/136** sinovdan oʻtdi (`evidence/prod-worker-on-0008/`). Demak, migratsiyani deploy’dan oldin qoʻllash xavfsiz.
- Yangi 1.2.1 APK joriy production server bilan ham ishlaydi:
  - `phone.codeLogin` yoʻq boʻlsa, avvalgi kirish tugmalari koʻrinadi;
  - `deliveryFee` yoʻq boʻlsa, haq 0.
- Telefon+kod bilan kirish production’da **SMS provayderi (Eskiz) ulanmaguncha ishlamaydi**. Ilova buni ochiq yozadi va boshqa usullarni taklif qiladi.

## 4. Sinov natijalari (1.2.1)

| Toʻplam | Natija |
|---|---|
| API | 154/154 |
| Chrome UI | 77/77 |
| Unit | 73/73 |
| Oldingi toʻplamlar | Hammasi PASS: 129, 38, 54, 43, 11, 35 |
| Production Worker 0008 sxemasida | 136/136 |
| Emulyator: release | 11/11 |
| Emulyator: debug | 14/14 |
| Desktop | 11/11 va 5/5 |

Tafsilot: `TEST_RESULTS.md` §7. Distributivlar: `dist/RELEASE_MANIFEST.md`.

## 5. Haqiqiy qurilma — hali qilinadi

1.2.1 release APK’larni Samsung A17 ga **eski ilova ustidan** oʻrnating va tekshiring:

- login’da server tugmasi yoʻq, ilova production’ga ulanadi;
- narx maydonida 1 000 000 yozish;
- Integratsiyalar sahifasi;
- deploy’dan keyin: yetkazish haqi va telefon+kod bilan kirish (SMS ulangach).
