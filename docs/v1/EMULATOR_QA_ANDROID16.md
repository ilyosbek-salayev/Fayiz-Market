# Fayz Market — Android 16 emulator QA muhiti va natijalar

| | |
|---|---|
| **Sana** | 2026-11-27 |
| **Qurilma** | **EMULATOR** `qa-android16` (Android 16 / API 36, arm64) — MacBook Air M5 ichida. Bu haqiqiy Samsung Galaxy A17 sinovi **emas**. |
| **Ilovalar** | Customer va Admin release **1.2.2** (vc 9, production’dagi) va joriy kod **1.2.3** (vc 10, debug + release) |
| **Maʼlumotlar** | Har bir sinov alohida lokal Worker’da: yangi D1 + lokal R2, `adb reverse` orqali. Production’ga faqat oʻqish uchun 3 marta ulanildi: release 1.2.2 va 1.2.3 ni ochish, bir marta debug ilovani diagnostika uchun ochish (hech kim kirmadi, hech narsa yozilmadi). |
| **Holat** | 1.2.3 kodi `main` da (722d968 + yakuniy commit). GitHub’ga push va production deploy qilinmagan. |
| **Yakuniy regressiya** | 2026-11-27 20:08–20:21, `scripts/android-qa/qa.sh regression` — 8/8 toʻplam PASS (`evidence/emulator-android16/regression-1.2.3.txt`) |

## 1. Muhit

| Qism | Qiymat |
|---|---|
| Joy | `~/.fayz-toolchain` (mavjud JDK 17, SDK, platform-tools qayta ishlatildi; faqat Android 16 tizim obrazi va Maestro qoʻshildi) |
| Emulator / platform-tools | 37.3.10 / 37.0.3 (eng soʻnggi, yangilash kerak emas edi) |
| Tizim obrazi | `system-images;android-36;google_apis;arm64-v8a` r7 |
| AVD | 4096 MB RAM, 4 vCPU, 512 MB VM heap, 8 GB data, 1080×2340 @ 450 dpi → 384 CSS px (A17 bilan bir xil kenglik) |
| Tezlashtirish | Apple Hypervisor.Framework (HVF) — `emulator -accel-check` |
| Grafika | gfxstream + **guest ANGLE → Vulkan → Metal**, OpenGL ES **3.1** (oddiy `-gpu host` faqat GLES 3.0 va ogohlantirish berdi) |
| Yuklash | Har safar toza sovuq yuklash **~16 s**, toʻgʻri oʻchirish **3–4 s**; ilovalar, PIN 1111, virtual barmoq izi saqlanadi |
| Avtomatlashtirish | ADB + Chrome DevTools (WebView), UIAutomator (`uiautomator dump`), **Maestro 2.13.0** (SHA-256 tekshirilgan) |
| Boshqaruv | `qa-emulator start|stop|status|unlock`, `qa-resources` — `~/.fayz-toolchain/README.md` |

### Mac resurslari (QA davomida, 63 daqiqa, har 10 s)

| Koʻrsatkich | Qiymat |
|---|---|
| Emulator RAM (qemu RSS) | oʻrtacha 2,9 GB, maksimal 3,8 GB (sovuq yuklashdan keyin ~5,4 GB, macOS siqib kamaytiradi) |
| Emulator CPU | oʻrtacha 0,28 yadro, maksimal 2,7 yadro (10 dan) |
| Mac boʻsh xotira | eng kami 43 % · swap 0 MB |
| SSD | toolchain 15 GB (Android 16 obrazi 4,3 GB, AVD 2,3 GB), boʻsh joy 170 GB |

## 2. Natijalar (EMULATOR)

Yakuniy regressiya (bitta buyruq, har toʻplam oʻz lokal Worker’ida):

| Toʻplam | Natija | Qamrov | Dalil |
|---|---|---|---|
| `install` | PASS | debug 1.2.3 joyida | — |
| `e2e` | **35/35** | kirish, katalog, variantlar, savat, checkout, buyurtma → admin holatlari → mijoz, rasm yuklash, tarif, tema, oflayn, Orqaga | `e2e-isolated.txt` |
| `plan` (§8) | **47/47** | U01, A01 + barmoq izi, A06, **admin doʻkon joylashuvi**, C11–C15, GPS, matnli manzil, xaritani surish, C13, tarif «Operator aniqlaydi», kuryer K01–K04, darhol yangilanish | `plan-qa.txt` |
| `native` | **25/25** | Keystore/BiometricPrompt, GPS ruxsati, MapLibre/WebGL, fondagi bildirishnoma, kamera → yuklash, kuryer GPS | `native-qa.txt` |
| `maestro` | **3/3** | mijoz smoke, Orqaga, admin kirish oynasi | `maestro/report.xml` |
| `uiautomator` | **14 PASS · 2 WARN** | Android accessibility daraxti, tablar, nomlar, touch target, EditText/parol, klaviatura, crash/ANR | `uiautomator-qa.txt` |
| `web` | **100/100**, typecheck 0, unit **73/73** | Chrome UI 360/390/412/1280 px | `regression/` |
| `release-check` | **11/11** | release 1.2.3 debug ustidan, prod faqat oʻqildi | `release-1.2.3-over-debug.txt` |

Avvalgi bosqichdagi natijalar: release 1.2.2 ochish 7/7 (`release-1.2.2-open.txt`), debug 1.2.3 → release 1.2.2 ustidan (`install-debug-over-release.txt`). Uzilishdan keyin davom ettirish (`regression --resume`) sinaldi: 7 ta PASS oʻtkazib yuborildi, faqat qolgani qayta ishladi.

Desktop Admin 1.2.3: packaged macOS ilova login ekrani **5/5**; Windows oʻrnatish **BLOCKED** (Windows yoʻq) — `RELEASE_MANIFEST-1.2.3.md`.

## 3. Topilgan xatolar va tuzatishlar

### F1 — Xaritaga tegilmasa ham buyurtmaga notoʻgʻri nuqta yozilardi (P1, **tuzatildi**)

- **Belgi.** Mijoz GPS’ni rad etib manzilni faqat yozsa (yoki «Xaritada tanlash»ni ochib, xaritani surmasa) manzilga Toshkent markazi **41.3111, 69.2797** «Xaritada belgilangan nuqta» sifatida biriktirilardi. Admin buyurtma oynasi va kuryer shu nuqtaga yoʻnaltirilardi.
- **Sabab.** Klaviatura ochilganda WebView kichrayadi → MapLibre `resize` → `moveend`. Picker har qanday `moveend`ni (Google’da birinchi `idle`ni ham) mijoz tanlovi deb qabul qilardi. Chrome testlarida klaviatura yoʻq, shuning uchun faqat telefon/emulatorda chiqdi.
- **Taʼsir.** Production 1.2.2 da ham bor. Admin «Doʻkon joylashuvi» panelida ham xuddi shu: xaritaga tegmay manzil yozilsa, doʻkon nuqtasi standart markaz boʻlib saqlanishi mumkin edi.
- **Tuzatish.** `packages/ui/src/maps.tsx`: nuqta faqat inson xaritaga tekkandan keyin (surish, chimdish, +/−, gʻildirak) yoki ilova xaritani maʼlum nuqtaga surgandan keyin (GPS, saqlangan manzil) olinadi. `apps/customer/src/address.tsx` + `main.tsx`: faqat yozilgan va tasdiqlangan manzil (`confirmed`) bosh sahifada ham koʻrinadi; 1.2.2 avtomatik koʻchirgan eski profil matni («Data,») avvalgidek koʻrinmaydi.
- **Tekshiruv.** C11: yozilgan manzilda nuqta yoʻq; haqiqiy barmoq bilan surish → yangi nuqta; Chrome 100/100; E2E 35/35.
- **Tavsiya.** Production’dagi buyurtmalarda aynan `41.3111, 69.2797` nuqtasi bormi — ruxsatingiz bilan faqat oʻqish soʻrovi bilan tekshirish mumkin.

### F2 — Ilovaga qaytganda buyurtma holati 30 s gacha eski turardi (P2, **tuzatildi**)

- Kuryer «Mijozga topshirdim» bosgach mijoz ilovani ochsa, «Ha, qabul qildim» kartasi keyingi 30 soniyalik yangilanishgacha chiqmasdi.
- `apps/customer/src/main.tsx`: ilova qayta koʻringanda (`visibilitychange`) buyurtmalar darhol yangilanadi. Tekshiruv: karta **0 s** da chiqdi (K04).

### Maʼlumot uchun (xato emas)

- **UIAutomator WARN:** mijoz bosh sahifasidagi «Katalogni ochish» tugmasi 43 dp, admin «Menyu» tugmasi 46×46 dp — Android tavsiyasi 48 dp (44 dp dan katta, ishlatsa boʻladi). Keyingi dizayn yangilanishida 48 dp ga chiqarish tavsiya etiladi.
- **Parol va accessibility:** Android 16 WebView parol belgilarini UiAutomation / accessibility xizmatlariga beradi («Show passwords» oʻchiq boʻlsa ham). Faqat foydalanuvchi yoqqan imtiyozli xizmatlar koʻradi; maydon `password=true` va ekranda yashirin. Ilova kodida tuzatib boʻlmaydi.
- **Admin doʻkon joylashuvi:** F1 tuzatishi u yerda ham tasdiqlandi — telefon klaviaturasi bilan manzil yozilganda koordinatalar boʻsh qoladi, haqiqiy surish nuqta qoʻyadi, «Saqlash» aynan shuni saqlaydi.

- **Bildirishnoma ruxsati.** Android 13+ targetSdk 28 ilovadan birinchi ochilishda ruxsat soʻraydi (OS oynasi) — Samsung’da ham shunday. Kelajakda targetSdk ≥ 33 qilinsa, ilova soʻrash vaqtini oʻzi tanlaydi.
- **GPS ikki marta rad etilsa** Android qayta soʻramaydi; ilova aniq xabar beradi, lekin Sozlamalarga oʻtish tugmasi yoʻq (tavsiya).
- **Haqiqiy telefondagi 2 ta FAIL (2026-11-26):** admin menyusini Orqaga bilan yopish va rasm yuklash — xuddi shu debug build bilan emulatorda **PASS**. Samsung’ga xos boʻlishi mumkin: A17 da qayta tekshirilishi shart.
- **Emulator xususiyati:** ruxsat berilgandan keyingi birinchi GPS javobi eski nuqtani ±100 m bilan qaytardi. Haqiqiy telefonda eski nuqta qabul qilinmasligini tekshirish kerak.

Skriptlardagi (ilova emas) tuzatishlar: `native-qa.mjs` 1.2.x manzil oynasiga moslandi; har bir sinov lokal origin xotirasini tozalaydi; `real-device-e2e.mjs` emulatorni oʻzi aniqlab, natijani **EMULATOR** deb yozadi; Maestro flow’lari WebView’dagi ekrandan tashqari takroriy matnlarni chetlab oʻtadi.

## 4. Faqat haqiqiy Samsung Galaxy A17 da tekshiriladi

Emulator bularni almashtirmaydi:

1. **Samsung Keyboard**: katta harf, oxiridagi boʻsh joy, avtotuzatish (A01, U01, checkout).
2. **Haqiqiy barmoq izi sensori** va Samsung biometrik oynasi.
3. **Haqiqiy GPS** (bino ichi/tashqarisi, aniqlik, eski nuqta) va F1 tuzatishi: GPS rad etilganda nuqta biriktirilmasligi.
4. **Samsung Camera va Galereya** orqali rasm yuklash (26-noyabrdagi FAIL).
5. **One UI orqaga imo-ishorasi**: admin menyusi, oynalar, mahsulot sahifasi (26-noyabrdagi FAIL).
6. **Bildirishnomalar** Samsung batareya tejash / fon cheklovlari va «Bezovta qilmang» rejimida.
7. **Production 1.2.2 ustidan 1.2.3 oʻrnatish** (maʼlumot saqlanishi, Play Protect ogohlantirishi).
8. **Yoʻlga chiqish**: telefondagi Google Maps / Yandex ilovasiga oʻtish; `tel:` qoʻngʻiroqlar.
9. Mobil tarmoq, internet uzilib-ulanishi, A17 tezligi (aylantirish, xotira).

## 5. Qayta ishga tushirish

Hammasi repo ichidagi bitta skript orqali — batafsil: [QA_ANDROID.md](QA_ANDROID.md).

```bash
scripts/android-qa/qa.sh emulator start
scripts/android-qa/qa.sh build
scripts/android-qa/qa.sh regression            # uzilsa: scripts/android-qa/qa.sh regression --resume
scripts/android-qa/qa.sh emulator stop
```

## 6. Distributivlar

Toʻliq maʼlumot (hajm, SHA-256, manifest, imzo, desktop): [RELEASE_MANIFEST-1.2.3.md](RELEASE_MANIFEST-1.2.3.md). Haqiqiy telefonda qolgan bandlar: [REAL_DEVICE_CHECKLIST-1.2.3.md](REAL_DEVICE_CHECKLIST-1.2.3.md).
