# Sinov natijalari — Fayz Market V1 (texnik 1.2.0)

Sana: 2026-11-25.

**Kod.** `main`:

- `8799a70` — APK’lar shu commitdan qurildi;
- `9b17653` — DMG va EXE; `8799a70` dan farqi faqat bitta test skriptida.

Natijalar va loglar `docs/v1/evidence/`, skrinshotlar `docs/v1/screenshots/` da.

**Qoida.** Mutatsiya qiladigan har bir sinov yangi, alohida D1 bilan lokal Worker’da ishladi. Production faqat GET (read-only) bilan tekshirildi. Istisno bitta: §4 dagi ochiq aytilgan hodisa.

## 1. Yakuniy natijalar

| Toʻplam | Natija | Qayerda | Dalil |
|---|---|---|---|
| TypeScript (api, admin, customer) | PASS | — | `evidence/final/typecheck.log` |
| Unit (vitest; 17 tasi yangi) | **68/68** | Node | `evidence/final/unit.log` |
| **V1 API** (`scripts/v1/storefront-verify.mjs`) | **136/136** | Lokal Worker + ORS mock | `evidence/final/storefront-verify.log` |
| **V1 UI** (`scripts/ui-qa/v1-storefront-ui.mjs`) | **57/57** | Chrome, 360/390/412/768 px, admin 390/1280, dark | `evidence/final/v1-storefront-ui.log`, `screenshots/` |
| Oldingi: expansion API | **129/129** | Lokal Worker | `evidence/regression-rerun/expansion-api.log` |
| Oldingi: integration | **38/38** | Lokal Worker | `evidence/regression/integration.log` |
| Oldingi: expansion UI (admin, kuryer, mijoz) | **54/54** | Chrome | `evidence/regression-rerun/expansion-ui.log` |
| Oldingi: redesign regression UI | **43/43** | Chrome | `evidence/regression-rerun/regression-ui.log` |
| Oldingi: security regression | **11/11** | Lokal Worker | `evidence/regression/security-regression.log` |
| Oldingi: provider test mode (SMS, email, FCM, Telegram, Routes mock) | **35/35** | Lokal Worker + mock | `evidence/regression-rerun/provider-test-mode.log` |
| **Eski Worker (`c396529`) yangi sxemada (0007)** | **129/129 + 11/11** | Lokal Worker | `evidence/old-worker-on-0007/` |
| Android: 1.1.1 → 1.2.0 ustidan yangilash | **12/12** | **EMULATOR** (Android 14, WebView 113) | `evidence/emulator/upgrade-1.1.1-to-1.2.0.log` |
| Android: V1 oqimlari APK ichida | **12/12** | **EMULATOR** | `evidence/emulator/v1-storefront-emulator.txt`, `screenshots/emulator/` |
| macOS DMG: paketlangan ilova smoke (read-only) | **11/11** | macOS arm64 | `evidence/desktop/desktop-readonly-1.2.0.log` |
| Desktop: brend, Windows/macOS bundle bir xilligi | **4/4** | macOS | `evidence/desktop/desktop-brand-1.2.0.log`, `screenshots/desktop-macos-login.png` |

## 2. Qamrov (talablar boʻyicha)

**Branding**

- Dark va Light logo, proporsiya, kichik oʻlcham.
- Admin orqali yuklash → R2 → mijoz UI. Mijoz yangi logoni data-URI sifatida keshlaydi (oflayn).
- Standart logoga qaytarish.
- SVG, notoʻgʻri tur, hajm va oʻlcham rad etiladi.
- Manager, kuryer, anonim → 403/401.
- Launcher (adaptive icon) — APK badging bilan tasdiqlangan.

**Home UI**

- Header: belgi, nom, tavsif, «Doʻkonga yoʻl»; takroriy qidiruv belgisi yoʻq.
- Doʻkon va foydalanuvchi joylashuvi qatori.
- Banner karuseli; kategoriyalar va mahsulotlar (oldingi testlar).
- Dark rejim.
- Har bir kenglikda gorizontal overflow va matn kesilishi yoʻq.
- Back.

**Xarita**

- Ruxsat berilgan / rad etilgan holat (Chrome); emulyatorda Android ruxsat oynasi.
- Doʻkon manzili kiritilgan / kiritilmagan; MapLibre chiziladi.
- Doʻkon va mijoz pinlari.
- Routing ulangan (haqiqiy geometriya, masofa, vaqt, atributsiya) / ulanmagan (soxta chiziq yoʻq, «toʻgʻri chiziq» deb belgilangan masofa, tashqi navigatsiya).
- Juda uzoq nuqta 422; Back + scroll saqlanadi; Android system Back (emulyator).

**Bannerlar**

- Create / Read / Update / Disable / Delete; R2 rasm.
- `javascript:` va begona URL rad etiladi.
- Mobil layout; CTA → kategoriya va → xarita.
- Bo‘sh holatda standart banner; ruxsatlar.

**Toʻlov**

- Naqd; terminal; olib ketish (manzil talab qilinmaydi, kuryer tayinlab boʻlmaydi).
- Bank oʻtkazmasi: rekvizitlar → «Pulni oʻtkazdim» → xodim muvaffaqiyatsiz deydi → qayta → qisman → toʻliq → «Toʻlandi».
- Rad etiladigan holatlar:
  - takroriy hujjat raqami;
  - ortiqcha summa;
  - toʻlangan buyurtmaga yangi toʻlov;
  - toʻlangan buyurtmani bekor qilish;
  - qaytarish manager uchun yopiq; ikkinchi qaytarish;
  - bekor qilingan toʻlovni qayta ochish;
  - eskirgan `from` (ikki xodim bir vaqtda);
  - mijoz yuborgan summa va holat eʼtiborsiz qoldiriladi.
- 1.1.x mijozi (yangi maydonlarsiz) → yetkazish + naqd.
- **Payme (mock imzolangan soʻrovlar):**
  - barcha 6 metod; idempotentlik;
  - ikkinchi tranzaksiya → -31051; perform → paid;
  - bekor qilish: perform’dan oldin -1, keyin -2 (refund);
  - notoʻgʻri kalit, summa, buyurtma, metod.
- **Click (mock):** imzo, summa, buyurtma, prepare/complete, takroriy complete → -4, provayder xatosi → failed.
- **Integratsiya:** sozlanmasdan yoqib boʻlmaydi; yoqilmaguncha checkoutda koʻrinmaydi.

**Integratsiyalar**

- AES-GCM: D1’da faqat shifrlangan qiymat; API, audit va `/settings` da qiymat yoʻq.
- Owner-only; formatlar tekshiriladi.
- «Ulanishni tekshirish» natija turi bilan; oʻchirish darhol taʼsir qiladi.

**Regressiya.** Oldingi Claude/Codex toʻplamlari yuqorida, hammasi PASS.

## 3. Birinchi yugurishda topilgan va tuzatilgan xatolar (yashirilmaydi)

| Topilgan | Sabab | Hal etilishi |
|---|---|---|
| expansion-api 127/129, expansion-ui 52/54 | V1’da `store_location` integratsiyasi roʻyxatdan olib tashlangan edi. **1.1.x admin ilovalari** doʻkon manzilini shu endpoint orqali saqlaydi — moslik buzilgan edi | Yashirin «legacy» yozuv sifatida qaytarildi (`8799a70`). Yangi panel uni koʻrsatmaydi |
| expansion-api, provider-mode: «aynan 8 ta integratsiya» | Roʻyxat ataylab kengaydi (ORS, Payme, Click) | Tekshiruv endi «8 ta asl integratsiyaning hammasi bor» deb tekshiradi |
| expansion-ui: Telegram kalit nomi koʻrinmadi | Sozlanmagan karta yopiq turardi | Sozlanmagan karta avvalgidek ochiq turadi |
| regression-ui: versiya yozuvi | Spec boʻyicha «Fayz Market V1 · versiya 1.2.0» | Tekshiruv yangi yozuvga moslandi |
| V1 UI: 3 ta FAIL (birinchi yugurish) | Test skriptidagi selektorlar: boshqa panelning «Saqlash» tugmasi, katta-kichik harf | Skript tuzatildi; 57/57 |

## 4. Hodisa: bitta test login’i production’ga ketdi

- **Nima boʻldi.** Desktop paketlash admin bundle’ini `VITE_API_URL=production` bilan qurdi. Shundan keyin ishga tushgan V1 UI skriptining admin qismi test login’ini production’ga yubordi.
- **Taʼsir.** Mavjud boʻlmagan `v1-owner@example.invalid` uchun **bitta muvaffaqiyatsiz login**. Production D1’da `login_attempts` va `rate_limits` hisoblagichlariga bittadan yozuv qoʻshildi.
- **Taʼsir qilmaganlar:** hisob, buyurtma, mahsulot va sozlamalar oʻzgarmadi.
- **Tozalanmadi** — bu production’ga yozish boʻlardi. Yozuvlar 15 daqiqalik oynadan keyin eʼtiborga olinmaydi.
- **Takrorlanmasligi uchun.** `v1-storefront-ui.mjs` endi bundle ichida `*.workers.dev` manzilini koʻrsa, ishga tushmaydi (`exit 2`). Bu tekshirib koʻrilgan.

## 5. Sinalmagan yoki bloklangan (aniq)

| Narsa | Holat | Sabab / keyingi qadam |
|---|---|---|
| Haqiqiy Android telefon (Samsung A17 va boshqalar) | **NOT TESTED** | Telefon ulanmagan. Pastdagi roʻyxat bilan tekshiring |
| Windows’da oʻrnatish va ishga tushirish | **NOT TESTED** | Windows qurilma yoʻq. Faqat build yaxlitligi va bundle bir xilligi tekshirildi |
| macOS’da owner login va toʻliq oqim (paketlangan) | NOT TESTED | Production’ga yozmaslik uchun. Login va kalitlar lokal Chrome’da sinaldi |
| Payme / Click sandbox | **BLOCKED** | Merchant hisobi va test kalitlari yoʻq |
| Production merchant toʻlovi | **NOT TESTED** | Shartnoma va ruxsat yoʻq |
| OpenRouteService haqiqiy API | NOT TESTED | Kalit yoʻq. Sinov mock bilan; haqiqiy chaqiruv «Ulanishni tekshirish» tugmasida |
| Production’da V1 (migratsiya + deploy) | **BAJARILMAGAN** | Egasining alohida ruxsati kerak (`RELEASE_REPORT.md` §4) |

### Haqiqiy telefon uchun tekshiruv roʻyxati (Samsung A17)

1. 1.1.x ustidan 1.2.0 ni oʻrnating (eski ilovani oʻchirmang). Savat va kirish saqlanganini tekshiring.
2. Launcher’da yangi belgi turibdimi: Customer qora, Admin oq.
3. Bosh sahifa:
   - header kesilmayaptimi;
   - status bar bilan ustma-ust tushmayaptimi;
   - «Aniqlash» → ruxsat oynasi chiqadimi;
   - rad etilsa xarita pini ochiladimi.
4. Oʻng yuqori belgi → xarita.
   - Production’ga deploy va ORS kaliti boʻlsa → marshrut;
   - aks holda «Yoʻlga chiqish» Google Maps’ni ochadimi;
   - **system Back** bosh sahifaga qaytaradimi va scroll joyida qoladimi.
5. Bannerni surish, tugmasini bosish.
6. Checkout:
   - olib ketish;
   - bank oʻtkazmasi (yoqilgan boʻlsa) → rekvizitlar → «Pulni oʻtkazdim»;
   - admin ilovada tasdiqlash.
7. Qorongʻi mavzu: logo almashadimi.
8. Klaviatura ochilganda checkout maydonlari koʻrinib qoladimi; modal va sheet yopiladimi; internet uzilganda ilova nima koʻrsatadi.
