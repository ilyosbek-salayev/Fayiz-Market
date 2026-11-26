# Fayz Market V1 — haqiqiy qurilma sinovidan keyingi tuzatishlar (1.2.2)

| | |
|---|---|
| **Manba** | Egasining Samsung Galaxy A17 dagi sinovi (Customer va Admin 1.2.1) va «REAL DEVICE QA FIXES & FINAL UX REFINEMENT» topshirigʻi |
| **Versiya** | 1.2.2 (Android versionCode 9) |
| **Branch** | `main` (yangi branch ochilmadi) |
| **Kod commit’i** | `94ac876` |
| **Production** | **Oʻzgarmagan.** Migratsiya 0009 va Worker deploy egasining alohida ruxsatini kutmoqda (§9) |
| **GitHub push** | Qilinmagan (ruxsat kerak; push oldidan 0009 qoʻllanishi shart — §9) |

> **Muhim.** Bu hisobotdagi barcha natijalar lokal izolyatsiyalangan muhitda (yangi D1), Chrome’da va Android **emulyatorida** olingan. 1.2.2 hali **haqiqiy telefonda sinalmagan**. Haqiqiy qurilmada qayta tekshirish roʻyxati — §8.

## 1. Egasining sinovi: 37 ta tekshiruv

| Natija | Soni | Topshiriqda koʻrsatilgan ID’lar |
|---|---|---|
| PASS | 28 | C05, C06, C11, C12, C13, C14, C15, K02, K03 va boshqalar |
| FAIL | 2 | **C07**, **A06** |
| QISMAN | 3 | **A01**, **A03**, **U01** |
| SINOVSIZ | 4 | **A11**, **A12**, **K01**, **K04** |

37 qatorli toʻliq jadval egasida. Repoda faqat topshiriqda keltirilgan ID’lar va izohlar bor, shuning uchun qolgan PASS qatorlari bu yerda takrorlanmadi.

### PASS boʻlsa ham kamchiligi bor deb izohlanganlar

| ID | Egasining izohi | 1.2.2 dagi javob |
|---|---|---|
| C14, C15 | Olib ketish va kuryer orqali yetkazish aniq koʻrinmaydi; hisob-kitob toʻliq emas | §3.4 |
| C11, C12 | GPS faqat checkout’da; bosh sahifa va profilda yoʻq | §3.5 |
| C05, C06 | Uzun tavsif noqulay; variant tanlash va tavsiyalar yoʻq | §3.3 |
| C13 | Google Maps ochiladi, lekin ilova ichida marshrut koʻrinmadi | §3.6 |
| K02, K03 | Kuryer funksiyasi super admin orqali koʻrilgan, kuryer hisobining ruxsatlari isbotlanmagan | §4, kuryer RBAC |

## 2. Topilgan va tuzatilgan xatolar

| # | Xato | Sabab | Tuzatish | Isbot |
|---|---|---|---|---|
| 1 | **U01.** Xodim parolini yozishda har harfdan keyin fokus yoʻqoladi | `Modal` va `Sheet` effektida `onClose` bogʻliqlik edi. Ota komponent har harfda qayta chizilganda inline `onClose` yangilanar, effekt qayta ishlab, fokusni oynaning oʻziga olardi. «Parolni tiklash» oynasida aniq takrorlandi | Fokus faqat oyna ochilganda beriladi. `onClose` ref orqali oʻqiladi. Admin va mijoz ilovasida ikkalasi ham tuzatildi | UI: haqiqiy klaviatura bosishlari bilan 8 ta maydon/oyna (xodim formasi, parolni tiklash, mahsulot, integratsiya, checkout) |
| 2 | **A01.** Chiqib qayta kirilganda toʻgʻri parol ham «notoʻgʻri» chiqadi | Haqiqiy telefonda qayta yaratilmadi. Ehtimoliy sabablar kodda topildi: (a) Samsung klaviaturasi email oxiriga boʻsh joy yoki boshiga katta harf qoʻshadi; (b) «parolni koʻrsatish» rejimida avtomatik katta harf va avtotuzatish ishlaydi; (c) 10 belgidan qisqa parolga ilova serverga bormay «parol notoʻgʻri» deb yozardi; (d) 5 ta xatodan keyingi vaqtinchalik blok tushunarsiz edi | Email ilova va serverda `trim` + kichik harf. Parol maydonlarida `autoCapitalize/autoCorrect/spellCheck` oʻchirildi. Aniq xabarlar: «Yana N ta urinish qoldi», «15 daqiqaga toʻxtatildi», «Parol kamida 10 belgi». Kirishdan oldin eski token tozalanadi. Muddati tugagan sessiya tushuntiriladi | API 8 ta, UI 11 ta tekshiruv |
| 3 | GPS qayta bosilganda eski, noaniq nuqta qaytadi | `maximumAge: 30000` 30 soniya ichida keshdagi nuqtani qaytarardi | Manzil oynasida qayta bosilganda yangi oʻlchov soʻraladi (`maximumAge: 0`) | UI: ±900 m → ±15 m |
| 4 | Yetkazish narxi 0 boʻlsa, mijozga jim «bepul» koʻrinardi | «Tarif yoʻq» va «bepul» farqlanmagan | Tarif rejimi: belgilangan / bepul / operator aniqlaydi (§3.4) | API 14 ta, UI 6 ta |

## 3. Qoʻshilgan, oldindan kelishilgan V1 imkoniyatlari

### 3.1 Mahsulot variantlari (C07, A06) — `0009_variants_checkout.sql`

**Admin.** Mahsulot oynasida «Variantlar (ixtiyoriy)» boʻlimi bor:

- variant turlari: **Rang, Model, Xotira, Oʻlcham** yoki boshqa (eng koʻpi 3 ta);
- qiymatlar chip koʻrinishida kiritiladi;
- barcha kombinatsiyalar avtomatik yaratiladi (eng koʻpi 100 ta);
- har bir kombinatsiya uchun: narx, chegirmagacha narx, qoldiq, rasm (mahsulot rasmlaridan), «Sotuvda» belgisi.

Oddiy mahsulot uchun bu boʻlim majburiy emas.

**Server tekshiruvlari:**

- takrorlangan kombinatsiya → 409;
- roʻyxatda yoʻq qiymat yoki tushib qolgan tur → 400;
- begona rasm URL → 400;
- chegirmagacha narx joriy narxdan kichik → 400.

**Yaxlitlik:**

- Notoʻgʻri variant bilan yaratilgan mahsulot bazada qoldirilmaydi.
- Buyurtmada ishlatilgan variant oʻchirilmaydi, faqat sotuvdan olinadi; tarix saqlanadi.
- Eski (1.2.1) admin ilovasi variant maydonlarini yubormaydi, shuning uchun mavjud variantlar oʻchmaydi.

**Qoldiq.** Variantli mahsulot qoldigʻi har bir variantda alohida turadi. «Qoldiq» oynasi qaysi variant ekanini soʻraydi; tuzatishlar audit qilinadi.

**Ombor triggerlari.** Oddiy mahsulotlar uchun eski qoidalar oʻzgarmadi. Variantlar uchun xuddi shu kafolatlar alohida ishlaydi:

- narx tekshiruvi;
- qoldiq tekshiruvi;
- qoldiqni kamaytirish;
- buyurtma bekor qilinganda qoldiqni qaytarish.

**Mijoz:**

- karta «… soʻm dan» va «N ta variant» koʻrsatadi; «+» tugmasi mahsulot sahifasini ochadi;
- sahifada rang va xotira chiplari bor; yetarli boʻlmagan kombinatsiya chizilgan holda koʻrsatiladi;
- tanlangan variantning narxi, eski narxi, chegirma foizi, qoldigʻi va rasmi koʻrinadi;
- savatda har bir variant alohida qator; miqdor shu variant qoldigʻidan oshmaydi.

**Buyurtma:**

- server variantni, mahsulotga tegishliligini, qoldiqni va narxni tekshiradi; mijoz yuborgan narx va summa ishlatilmaydi;
- qatorda variant ID, yorliq va «Nom (Qora · 128 GB)» saqlanadi; shu yorliq kuryer, admin va eski ilovalarda ham koʻrinadi.

### 3.2 Xususiyatlar va chegirma (A03)

- **Xususiyatlar.** «Nomi — qiymati» roʻyxati, masalan: Material — Charm, Kafolat — 12 oy. Mahsulot sahifasida jadval boʻlib koʻrinadi.
- **Chegirma.** «Chegirmagacha narx» maydoni. Checkout’da «Chegirma» qatori chiqadi va server buni `discount_total` ga yozadi. Jami summaga chegirma ikki marta taʼsir qilmaydi.

### 3.3 Mahsulot sahifasi (C05, C06)

- Uzun tavsif 4 qator koʻrinadi, «Batafsil koʻrish» uni ochadi, «Yopish» qaytadan yopadi.
- Pastda «Sizga ham yoqishi mumkin» boʻlimi bor. Tavsiyalar D1 katalogidan olinadi: avval oʻsha kategoriya, keyin umumiy xususiyatlar, keyin tanlanganlar. Faqat sotuvdagi mahsulotlar chiqadi, mahsulotning oʻzi chiqmaydi.
- Tavsiya bosilganda haqiqiy mahsulot sahifasi ochiladi.
- AI yoki alohida tavsiya infratuzilmasi ishlatilmadi.

### 3.4 Checkout: olib ketish yoki kuryer, hisob-kitob (C14, C15)

**Ikki tanlov doim koʻrinadi:**

| Tanlov | Nima koʻrsatiladi |
|---|---|
| Doʻkondan olib ketish | Doʻkon manzili, «yetkazish haqi qoʻshilmaydi». Admin bu usulni yoqmagan boʻlsa, karta nofaol holda sababi bilan koʻrinadi |
| Kuryer orqali yetkazish | Kuryer narxi, tasdiqlangan manzil (GPS yoki xarita), podyezd va qavat |

**Hisob-kitob qatorlari:**

- mahsulotlar summasi;
- chegirma (boʻlsa);
- kuryer yoki yetkazish haqi;
- yakuniy jami.

Server summani qayta hisoblaydi.

**Yetkazish tarifi** (Admin → Sozlamalar → Toʻlov):

| Rejim | Nima boʻladi |
|---|---|
| Belgilangan narx | Narx qoʻshiladi; bepul chegara boʻlsa, undan yuqorisi bepul |
| Bepul | Kuryer narxi qoʻshilmaydi |
| Operator aniqlaydi | Tarif hali yoʻq. Taxminiy narx **koʻrsatilmaydi**. Buyurtma «Doʻkon aniqlaydi» belgisi bilan qabul qilinadi. Xodim buyurtma oynasida narxni kiritadi, server summani yangilaydi va mijozga xabar yuboradi. Toʻlov boshlangan, yoʻlga chiqqan yoki bekor qilingan buyurtmaning narxi oʻzgarmaydi. Onlayn toʻlov (Payme/Click) narx tasdiqlangunga qadar yopiq |

Eski admin ilovasi faqat narxni yuborganda: narx > 0 boʻlsa «belgilangan», 0 boʻlsa «operator aniqlaydi».

**Toʻlov usullari:**

- Payme/Click haqiqiy merchant kalitlarisiz checkout’da koʻrinmaydi.
- Naqd, terminal va bank oʻtkazmasi avvalgidek ishlaydi.

### 3.5 Bitta manzil komponenti (C11, C12)

Bosh sahifadagi «Sizning joylashuvingiz», profildagi «Manzil» va checkout’dagi «Yetkazish manzili» bitta oynadan foydalanadi. Oyna quyidagilarni qila oladi:

- GPS orqali aniqlash;
- xaritada pin surish;
- matnli manzil;
- podyezd, qavat, moʻljal;
- saqlangan manzillar (shu telefonda, 6 tagacha).

**Xavfsizlik qoidalari:**

- GPS nuqtasi mijoz tasdiqlamaguncha yetkazish manzili boʻlmaydi.
- Aniqligi ±150 m dan yomon nuqtani tasdiqlab boʻlmaydi: pinni xaritada toʻgʻrilash kerak.
- GPS ruxsati rad etilsa, xarita va matnli manzil ishlayveradi.

Uchala joy bir xil, tasdiqlangan manzilni koʻrsatadi. 1.2.1 da yozilgan profil manzili birinchi ochilishda saqlangan manzilga aylanadi.

### 3.6 Doʻkonga yoʻl (C13)

- Ilova ichida MapLibre xaritasi bor (avvaldan mavjud edi).
- Joylashuvga ruxsat oldindan berilgan boʻlsa, xarita ochilishi bilan joylashuv aniqlanadi va marshrut chiziladi.
- Marshrut xizmati (OpenRouteService) ulanmagan boʻlsa, ilova buni aniq aytadi: «Admin → Integratsiyalar → Marshrut». Shunda toʻgʻri chiziq masofasi koʻrsatiladi, «Yoʻlga chiqish» esa Google Maps’ni ochadi.
- Production’da ORS kaliti hali kiritilmagan, shuning uchun telefonda ilova ichidagi marshrut hozir chiqmaydi. Bu xato emas, sozlash masalasi.

### 3.7 Qulflash va hisobdan chiqish (A01)

| Amal | Nima boʻladi |
|---|---|
| **Ilovani qulflash** | Faqat shu telefonda barmoq izi yoqilgan boʻlsa koʻrinadi. Sessiya xotiradan chiqadi, Android Keystore’da shifrlangan nusxa qoladi. Faqat shu telefonning barmoq izi bilan ochiladi |
| **Hisobdan chiqish** | Serverdagi sessiya bekor qilinadi, barmoq izi bilan kirish shu telefondan oʻchiriladi. Qayta kirish uchun parol kerak |

Kalit Keystore’dan tashqariga chiqmaydi: `allowBackup="false"`, kalit almashtirib boʻlmaydi. Parolni chetlab oʻtuvchi avtomatik kirish yoʻq. Kuryer ilovasida ham ikkala tugma bor.

## 4. Sinovdan oʻtmagan qismlar lokal muhitda (A11, A12, K01, K04)

| ID | Lokal natija | Isbot |
|---|---|---|
| A11 | Buyurtma va toʻlov boshqaruvi, yetkazish narxini belgilash: PASS | V1 UI 77/77, yangi UI (admin narx belgilaydi) |
| A12 | Integratsiyalar interfeysi: PASS. «Ulangan» faqat haqiqiy tekshiruvdan keyin chiqadi | V1 UI 77/77 |
| K01 | **Alohida kuryer hisobi.** 14 ta admin endpoint’i → 403. Boshqa kuryerning yetkazishi koʻrinmaydi (404). Telefon, manzil va nuqta faqat ish vaqtida koʻrinadi, yakunlangach yashiriladi. Oʻchirilgan kuryer hamma joydan chiqariladi (401). Kuryer ilovasida mahsulot, sozlamalar va integratsiyalar yoʻq | Yangi API, yangi UI |
| K04 | Bosqichlar: qabul → olish → yoʻlga chiqish → yetib kelish → topshirish → mijoz tasdigʻi → «Yetkazildi». Bosqichni oʻtkazib yuborish → 409 | Yangi API |

**Production’ga test maʼlumoti yozilmadi.**

## 5. Oʻzgartirilgan fayllar (`94ac876`)

**Yangi fayllar:**

- `apps/api/migrations/0009_variants_checkout.sql`
- `apps/api/src/catalog.ts`
- `apps/admin/src/variants.tsx`
- `apps/customer/src/address.tsx`
- `apps/customer/src/product.tsx`
- `scripts/v1/real-device-fixes-verify.mjs`
- `scripts/ui-qa/real-device-fixes-ui.mjs`

**Oʻzgarganlar:**

- API: `apps/api/src/{index,payments,delivery}.ts`, `packages/shared/src/index.ts`
- Admin: `apps/admin/src/{main,components,courier,storefront-admin}.tsx`, `apps/admin/src/style.css`
- Mijoz: `apps/customer/src/{main,components,account,storefront}.tsx`, `apps/customer/src/style.css`
- UI paketi: `packages/ui/src/{maps,storefront}.tsx`
- Versiya: `package.json`, `package-lock.json`, `apps/desktop/package.json`, `apps/android/*/build.gradle` (versionCode 9)

**Eski testlarda ataylab qilingan oʻzgartirishlar** (funksiya olib tashlanmadi):

| Fayl | Oʻzgarish |
|---|---|
| `storefront-verify.mjs` | Doʻkon aniq «bepul yetkazish» bilan sozlanadi (tarifsiz holat endi «operator aniqlaydi») |
| `v1-storefront-ui.mjs` | 6 qadam: xarita oʻzi aniqlaydi; yangi «marshrut ulanmagan» matni; olib ketish kartasi; GPS tasdiqlangandan keyin biriktiriladi |
| `regress.mjs` | «Chiqish» → «Hisobdan chiqish» |
| `desktop-brand-check.mjs` | Production’da egasi yuklagan logo koʻrinishi kutiladi |
| Emulyator skriptlari | Manzil tasdigʻi; versiya `build.gradle` dan oʻqiladi |

## 6. Test natijalari (1.2.2, `94ac876`)

| Toʻplam | Natija | Qayerda | Dalil |
|---|---|---|---|
| TypeScript | PASS | — | `evidence/regression-1.2.2/typecheck.log` |
| Unit | **73/73** | Node | `evidence/regression-1.2.2/unit.log` |
| **Yangi:** real-device fixes API (variantlar, savat/checkout, tarif, login, kuryer RBAC) | **85/85** | Lokal Worker, yangi D1 | `evidence/real-device-fixes/api-verify.txt` |
| **Yangi:** real-device fixes UI (fokus, login/qulflash, admin variant muharriri, mahsulot sahifasi, savat, checkout, manzil, tarif, xarita, kuryer; 360/390/412/1280 px) | **100/100** | Chrome | `evidence/real-device-fixes/ui-verify.txt`, `screenshots/real-device-fixes/` |
| V1 API | **154/154** | Lokal Worker | `evidence/regression-1.2.2/storefront-verify.log` |
| V1 UI | **77/77** | Chrome | `evidence/regression-1.2.2/v1-storefront-ui.log` |
| expansion API / integration / security / provider | **129/129**, **38/38**, **11/11**, **35/35** | Lokal Worker + mock | `evidence/regression-1.2.2/` |
| expansion UI / regression UI | **54/54**, **43/43** | Chrome | Xuddi shu |
| Production’dagi kod (`9abec93`, oʻz `shared` paketi bilan) 0009 sxemasida | **154/154** | Lokal Worker | `evidence/prod-worker-on-0009/` |
| Release APK 1.2.2 → oʻrnatilgan 1.2.1 ustidan | **11/11** | **EMULATOR** | `evidence/real-device-fixes/emulator/release-apk-1.2.2.txt` |
| V1 oqimlari (debug 1.2.2, CDP, lokal Worker) | **15/15** | **EMULATOR** | `evidence/real-device-fixes/emulator/v1-storefront-emulator-1.2.2.txt` |
| macOS DMG: read-only smoke / brend va login | **11/11**, **5/5** | macOS arm64 | `evidence/real-device-fixes/desktop/` |

**Sinov jarayonida topilgan va tuzatilgan muammolar:**

- GPS kesh muammosi (§2, 3-band);
- faqat matnli manzil bosh sahifada koʻrinmasdi;
- admin variant jadvalida narx maydoni tor edi («520 000» qirqilardi);
- checkout’da variant nomi qirqilardi;
- yangi yorliqlar eski oqim bilan mos kelmasdi: «Xaritada tanlash» va «Shu joyni tasdiqlash» qaytarildi.

## 7. Integratsiyalar holati

| Xizmat | Kod va lokal mock/sandbox | Haqiqiy provayder | Production |
|---|---|---|---|
| Eskiz SMS | PASS (provider-test-mode) | **NOT TESTED** — kalit yoʻq | Sozlanmagan. Telefon+kod bilan kirish SMS’siz ishlamaydi |
| Telegram login/bot | PASS (mock) | **NOT TESTED** | Sozlanmagan |
| Email OTP (Resend) | PASS (mock) | **NOT TESTED** | Sozlanmagan |
| Firebase FCM | PASS (mock) | **NOT TESTED** | Sozlanmagan |
| Payme | PASS (imzolangan sinov soʻrovlari) | **BLOCKED** — merchant shartnomasi yoʻq | Sozlanmagan, checkout’da koʻrinmaydi |
| Click | PASS (imzolangan sinov soʻrovlari) | **BLOCKED** | Sozlanmagan, koʻrinmaydi |
| OpenRouteService | PASS (mock) | **NOT TESTED** | Sozlanmagan. Ilova ichidagi marshrut oʻchiq, Google Maps zaxira sifatida ishlaydi |

Hammasini Admin → Integratsiyalar orqali sozlash mumkin. Kalitlar AES-256-GCM bilan shifrlanadi va bundle, log yoki hujjatlarga chiqmaydi.

## 8. Samsung Galaxy A17 da qayta tekshirish

Avval production’ga 0009 + Worker chiqariladi (§9), keyin 1.2.2 APK’lar **eski ilova ustidan** oʻrnatiladi.

1. **U01.** Sozlamalar → Xodimlar → kuryer yarating. Keyin «Parolni tiklash» oynasida parolni bir marta bosib, oxirigacha yozing.
2. **A01.** Kirish:
   - kirish → «Hisobdan chiqish» → toʻgʻri parol bilan qayta kirish (3 marta takrorlang);
   - email’ni katta harf bilan, oxirida boʻsh joy bilan yozib koʻring;
   - Sozlamalar → «Barmoq izi bilan kirish» ni yoqing → «Ilovani qulflash» → barmoq izi bilan oching;
   - «Hisobdan chiqish» dan keyin barmoq izi taklif qilinmasligini tekshiring.
3. **A06/A03.** Admin variantlar:
   - mahsulot qoʻshing: Rang (2 ta) × Xotira (2 ta);
   - har biriga narx, qoldiq va rasm bering, bittasini «Sotuvda» dan oling;
   - xususiyat qoʻshing;
   - «Qoldiq» tugmasi variantni soʻrashini tekshiring.
4. **C07.** Mijoz variantlari:
   - karta «… dan» va variant sonini koʻrsatadi;
   - rang yoki xotira almashtirilganda narx, rasm va qoldiq oʻzgaradi;
   - ikki xil variant savatda alohida qatorda turadi;
   - buyurtmada variant nomi koʻrinadi.
5. **C05/C06.** Mahsulot sahifasi: «Batafsil koʻrish» / «Yopish» va «Sizga ham yoqishi mumkin».
6. **C14/C15.** Checkout:
   - ikki tanlov koʻrinadi;
   - olib ketishda haq qoʻshilmaydi;
   - yetkazishda haq qatori va yakuniy jami chiqadi;
   - chegirmali mahsulotda «Chegirma» qatori chiqadi.
7. **Tarif.** Tarifni «Operator aniqlaydi» qilib qoʻying → buyurtma bering → admin buyurtma oynasida narxni kiriting → mijoz ilovasida summa yangilanishini tekshiring.
8. **C11/C12.** Manzil:
   - bosh sahifadagi «Sizning joylashuvingiz» → GPS → manzilni yozing → tasdiqlang;
   - shu manzil profil va checkout’da ham turishini tekshiring;
   - ruxsatni rad etib, manzilni qoʻlda kiriting.
9. **C13.** ORS kalitini kiritgandan keyin xarita ochilishi bilan marshrut chizilishini tekshiring. Kalitsiz holatda xabar koʻrinishi va Google Maps ochilishini tekshiring.
10. **K01–K04.** Alohida kuryer hisobi bilan kiring: kuryer admin boʻlimlarini koʻrmaydi. Bosqichlarni oxirigacha bajaring va mijoz tasdigʻini oling.
11. **Klaviatura.** Sheet va modal oynalarda klaviatura ochilganda maydonlar koʻrinib turishi va Orqaga tugmasi oynani yopishi.

## 9. Distributivlar va production

| Fayl | Hajm (bayt) | SHA-256 | Holat |
|---|---|---|---|
| `dist/apk/v1.2.2/fayz-market-customer.apk` | 1 039 773 | `7f9f45d6cc4b20767f2bfb234a585f8ebbbca52d846c250844e23881b42cec36` | Release, debuggable emas, production’ga qulflangan, sertifikat `93f0f845…f89851` (1.2.1 bilan bir xil) |
| `dist/apk/v1.2.2/fayz-market-admin.apk` | 1 086 822 | `3799536e76ef7d19f71db98d2a79bb6b3f1aea47a98b071205e1b041fbb4de96` | Xuddi shu |
| `dist/desktop/fayz-market-admin-1.2.2-macos-arm64.dmg` | 121 771 748 | `6f61fd57d1cf7fc7250c28ab00d5909662eb68f74093975baf7c1baa0c090f23` | Ad-hoc imzo, notarizatsiya yoʻq |
| `dist/desktop/fayz-market-admin-1.2.2-windows-x64-setup.exe` | 122 467 722 | `58880657bd7c6d37f0b6821d5481a67e7fb826e7614d3915049f0aabd4f472c6` | Imzosiz. **Windows’da NOT TESTED** |

- 1.2.1 fayllari macOS Savatiga koʻchirildi: `~/.Trash/fayz-dist-1.2.1-20261126-204838/`. Roʻyxat: `evidence/dist-before-1.2.2.txt`.
- Debug APK’lar `apps/android/*/build/outputs/apk/debug/` da qoladi.

**Production holati (faqat oʻqildi, 2026-11-26):**

- egasi checkout sozlamalarini 3 marta saqlagan;
- «olib ketish» oʻchiq, yetkazish narxi 100 000 soʻm, 3 ta mahsulot, 4 ta buyurtma.

**0009 qoʻllanganda nima boʻladi:**

- tarif rejimi «belgilangan narx» boʻladi;
- «olib ketish» **oʻzgarmaydi**, chunki bu egasining tanlovi. Ikkinchi tanlov mijozga ishlashi uchun egasi Admin → Sozlamalar → Toʻlov → «Doʻkondan olib ketish» ni yoqadi.

**Chiqarish tartibi (egasining ruxsati bilan):**

1. Zaxira nusxa.
2. 0009 migratsiyasi.
3. Worker deploy yoki `main` push (Git build).
4. Read-only smoke.

> ⚠️ **0009 qoʻllanmasdan `main` push qilinmasin.** Cloudflare Workers Builds push’da yangi Worker’ni avtomatik deploy qiladi. Yangi kod `product_variants` jadvalini talab qiladi va 0009 boʻlmasa mahsulotlar roʻyxati ishlamay qoladi.
>
> Teskari tartib xavfsiz: hozirgi production kodi 0009 sxemasida 154/154 oʻtdi.

## 10. Topshirish boʻyicha yakuniy baho

**Tayyor (lokal, Chrome va emulyatorda isbotlangan):**

- egasi topgan 2 ta FAIL (C07, A06) va 3 ta QISMAN (A01, A03, U01) tuzatildi;
- izohlangan PASS kamchiliklari (C05, C06, C11–C15) bajarildi;
- 4 ta sinalmagan band (A11, A12, K01, K04) lokal muhitda alohida kuryer hisobi bilan tasdiqlandi.

**Hali tayyor emas:**

- 1.2.2 production’ga chiqmagan: 0009 + deploy ruxsat kutmoqda;
- haqiqiy A17 da qayta sinov qilinmagan (§8);
- Windows’da oʻrnatish sinalmagan;
- tashqi integratsiyalar haqiqiy kalitlar bilan sinalmagan.

**Baho:** mijozga topshirishdan oldin bitta qadam qoladi — production’ga chiqarish va egasining A17 dagi qayta sinovi. Bunda §8 roʻyxati toʻliq PASS boʻlishi kerak.

**Ataylab qilinmagan:**

- murakkab aksiyalar va promokodlar (faqat «chegirmagacha narx» qoʻshildi);
- server hisobida saqlanadigan manzillar (manzillar telefonda saqlanadi);
- variant uchun alohida rasm yuklash (rasm mahsulot rasmlaridan tanlanadi).
