# Fayz Market V1 — talablar va bajarilish holati

**Manba.** «FAYZ MARKET V1 — FINAL PRODUCT DEVELOPMENT & BUSINESS OPERATIONS» texnik topshirigʻi (2026-11-25) va egasining Samsung skrinshoti. Skrinshotda bosh sahifaning yuqori qismi qizil bilan belgilangan.

**Ish tartibi.**

- Mavjud repository va `main` branch’da davom ettirildi. Yangi branch ochilmadi.
- Oldingi Claude va Codex ishlari saqlandi; mavjud funksiyalar olib tashlanmadi.
- GitHub’ga push qilinmadi. Production’ga deploy faqat egasining aniq ruxsatidan keyin bajarildi; hech narsa oʻchirilmadi.

**Commitlar (lokal):**

| Commit | Tarkib |
|---|---|
| `2724c25` | Brend resurslari |
| `846e3b2` | API va migratsiya |
| `04a8033` | Ilovalar UI |
| `8799a70` | Moslik tuzatishi |
| `9b17653` | Test |
| `+docs` | Hujjatlar |

## Faza A — Audit (avvaldan nima bor edi)

| Talab | Auditda topilgan holat | V1 da |
|---|---|---|
| Logotiplar | 4 ta yangi fayl ildizda edi, Git’da yoʻq; ilovalarda eski F-sumka belgisi | Hammasi almashtirildi (`BRANDING_AND_UI.md`) |
| Doʻkon lokatsiyasi | Integratsiyalar boʻlimida 3 ta maydon (manzil, lat, lng); mijozga koʻrsatilmagan | Sozlamalarga koʻchirildi va kengaytirildi: nom, xarita picker; mijozga koʻrsatiladi |
| Banner | Bitta matnli banner (`banner_title/subtitle`), sumka SVG | CRUD, rasm, CTA, karusel, standart hero yangi belgi bilan |
| Toʻlov | Admin qoʻlda yozadigan jurnal (naqd, bank, terminal); checkoutda tanlov yoʻq; buyurtmada toʻlov holati yoʻq | Checkout usullari, holat mashinasi, Payme/Click endpointlari, admin boshqaruvi |
| Integratsiyalar | Server kalitlari faqat `wrangler secret`; panel faqat bor/yoʻqligini koʻrsatardi | Paneldan shifrlangan holda kiritish, tekshirish, yoqish/oʻchirish |
| Xarita | MapLibre + OpenFreeMap (Codex worker tuzatishi bilan); kuryerga Google Routes | Mijoz uchun doʻkon xaritasi va marshrut (ORS/Google); worker ulanishi oʻzgarmagan |
| Admin auth | Markaziy (bitta D1, sessiyalar), rollar owner/manager/courier | Oʻzgarmagan; 129 ta API testi bilan qayta tasdiqlandi |
| Workerlar | `fayz-market-api` (eski kod) va ortiqcha `fayz-market-api-production` (1.1.2 kodi) | Barcha distributivlar `fayz-market-api` ga ulanadi; root `wrangler.toml` endi ikkinchi Worker yarata olmaydi (`c396529`) |

## 17-boʻlim — Qabul mezonlari

| # | Mezon | Holat | Dalil |
|---|---|---|---|
| 1 | Mavjud asosiy funksiyalar saqlangan | **PASS** | Oldingi toʻplamlar: API 129/129, integration 38/38, expansion UI 54/54, regression UI 43/43, security 11/11, provider 35/35 |
| 2 | Eski logo UI’dan almashtirilgan | **PASS** | Header, splash, qulf ekrani, admin login, sidebar, kuryer, banner, xarita pini, launcher, status-bar, desktop |
| 3 | Dark/Light branding | **PASS** | Chrome (`customer-home-dark-390.png`, `admin-settings-dark.png`), emulyator |
| 4 | Admin brendingni boshqaradi | **PASS** | Yuklash → saqlash → mijozda koʻrinadi → qaytarish (UI va API testlari) |
| 5 | Doʻkon manzili admin tomonidan sozlanadi | **PASS** | `PUT /admin/store`, xarita picker |
| 6 | Mijoz doʻkon manzilini koʻradi | **PASS** | Bosh sahifa qatori, xarita, profil |
| 7 | Foydalanuvchi joylashuvi aniqlanadi yoki qoʻlda tanlanadi | **PASS** | Chrome: ruxsat berildi/rad etildi; emulyator: Android ruxsat oynasi |
| 8 | Location belgisi → navigatsiya | **PASS** | Xarita + marshrut (mock ORS) + «Yoʻlga chiqish» |
| 9 | Xaritada orqaga qaytish | **PASS** | Tugma, Escape, **Android system Back** (emulyator); scroll saqlanadi |
| 10 | Bannerlar admin orqali boshqariladi | **PASS** | CRUD API va UI |
| 11 | Banner oʻzgarishi mijozda koʻrinadi | **PASS** | Yangi APK’siz (`/storefront`) |
| 12 | Toʻlov usullari checkout’ga ulangan | **PASS** | Naqd, terminal, bank, olib ketish; Payme/Click sozlanganda |
| 13 | Soxta toʻlov tasdigʻi yoʻq | **PASS** | D1 trigger: «toʻlandi» faqat haqiqiy pul bilan; mijoz va frontend summasi eʼtiborsiz |
| 14 | Admin toʻlov holatlarini boshqaradi | **PASS** | Qayd etish, tekshirilmoqda, muvaffaqiyatsiz, qaytarish |
| 15 | API integratsiyalari xavfsiz sozlanadi | **PASS** | AES-GCM, owner-only, qiymat chiqmaydi. Production’da `INTEGRATIONS_MASTER_KEY` 2026-11-25 da oʻrnatildi |
| 16 | Bir admin hisobi barcha admin platformalarida | **PASS** (arxitektura va API) / NOT TESTED (Windows) | Bitta API va D1, bitta `/admin/login`. Android emulyator va Chrome’da login; macOS paketlangan ilova production’ni oʻqiydi; Windows’da sinalmagan |
| 17 | Android APK’lar build qilingan | **PASS** | vc 7, debug imzo (avvalgisi bilan bir xil), emulyatorda ustidan yangilash |
| 18 | macOS DMG tayyor va tekshirilgan | **PASS** (read-only) | Smoke 11/11, brend 4/4; ad-hoc imzo |
| 19 | Windows EXE, sinov holati aniq | **PASS** (build) / **NOT TESTED** (Windows’da) | Bundle macOS bilan bir xil |
| 20 | Eski funksiyalar regressiyasi | **PASS** | 1-mezonga qarang. Birinchi yugurishda topilgan moslik xatosi tuzatildi (`TEST_RESULTS.md` §3) |
| 21 | Production’ga ruxsatsiz oʻzgartirish yoʻq | **PASS** | Migratsiya, deploy va secret faqat egasining aniq ruxsatidan keyin bajarildi (`TEST_RESULTS.md` §6). Production manziliga yoʻnaltirilgan test login’i CORS tufayli bazaga yetmagan: zaxira xeshi bir xil (§4) |
| 22 | Natija dalillar bilan hujjatlashtirilgan | **PASS** | `docs/v1/*`, `docs/v1/evidence/`, `docs/v1/screenshots/` |

## Tashqi omilga bogʻliq — BLOCKED / NOT TESTED

- Payme va Click sandbox hamda production toʻlov — **BLOCKED**: merchant shartnomasi va kalitlar yoʻq.
- Haqiqiy telefon va Windows — **NOT TESTED**.
- Production deploy, 0007 migratsiya va `INTEGRATIONS_MASTER_KEY` — egasining ruxsati bilan **2026-11-25 da bajarildi** (`TEST_RESULTS.md` §6).
- OpenRouteService kaliti — egasi bepul roʻyxatdan oʻtadi. Kalit boʻlmasa ham ilova toʻgʻri ishlaydi.

## Qoʻshilmagan narsalar (ortiqcha imkoniyat qoʻshilmadi)

Quyidagilar qoʻshilmadi:

- yangi tashqi baza yoki hosting;
- Expo, GitHub Actions;
- avtomatik aylanadigan karusel;
- yangi komponent kutubxonasi;
- Cloudflare API tokenini panelda saqlash.

Shuningdek:

- `applicationId` oʻzgarmadi;
- signing kaliti oʻzgarmadi;
- versiya pasaytirilmadi.

## Qoʻshimcha: haqiqiy Android fikr-mulohazasi va `ilova app.pdf` (1.2.1)

| Talab | Holat |
|---|---|
| Admin login’da server, debug yoki API tugmasi yoʻq | **PASS** — Chrome; emulyatorda release va debug |
| Production’ga avtomatik ulanish; eski sinov manzili tozalanadi | **PASS** (EMULATOR) |
| Texnik sozlamalar faqat debug build’da va faqat super admin uchun | **PASS** |
| Debug va production ajratilgan; customer debug sozlamasi saqlangan | **PASS** |
| Narx «1 000 000», boshidagi 0, kursor | **PASS** |
| Integratsiyalar tushunarli; credentials boʻlmasa «Ulangan» chiqmaydi | **PASS** |
| Telefon + kod bilan kirish | **PASS** (lokal). Production — deploy + SMS kerak |
| GPS checkout’ga avtomatik, xarita ixtiyoriy | **PASS** |
| Kuryer xizmat haqi alohida qoʻshiladi | **PASS** (lokal). Production — deploy kerak |
| Kuryerga mijoz telefoni | **PASS** (avvaldan bor edi) |
| Mahsulot xususiyatlari va aksiyalar (PDF’da «ixtiyoriy») | **Bajarilmagan** — ortiqcha imkoniyat qoʻshmaslik uchun |
| 1.2.1 haqiqiy telefonda, Windows’da | **NOT TESTED** |

Batafsil: `UX_REFINEMENT_1.2.1.md`.
