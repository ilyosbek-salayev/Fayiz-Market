# Fayz Market — Android 16 emulator QA muhiti va natijalar

| | |
|---|---|
| **Sana** | 2026-11-27 |
| **Qurilma** | **EMULATOR** `qa-android16` (Android 16 / API 36, arm64) — MacBook Air M5 ichida. Bu haqiqiy Samsung Galaxy A17 sinovi **emas**. |
| **Ilovalar** | Customer va Admin release **1.2.2** (vc 9, production’dagi) va joriy kod **1.2.3** (vc 10, debug + release) |
| **Maʼlumotlar** | Har bir sinov alohida lokal Worker’da: yangi D1 + lokal R2, `adb reverse` orqali. Production’ga faqat oʻqish uchun 3 marta ulanildi: release 1.2.2 va 1.2.3 ni ochish, bir marta debug ilovani diagnostika uchun ochish (hech kim kirmadi, hech narsa yozilmadi). |
| **Holat** | Kod oʻzgarishlari **commit qilinmagan**, push/deploy qilinmagan. |

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

| Toʻplam | Natija | Dalil |
|---|---|---|
| Release 1.2.2 oʻrnatish va ochish (prod, faqat oʻqish) | **7/7** (+1 INFO) | `evidence/emulator-android16/release-1.2.2-open.txt` |
| Debug 1.2.3 → 1.2.2 release ustidan joyida (maʼlumot saqlanadi) | Success, firstInstallTime saqlandi | `install-debug-over-release.txt` |
| E2E: mijoz → buyurtma → admin → holatlar → mijoz, Orqaga, klaviatura, tema, oflayn | **35/35** (tuzatishdan oldin ham, keyin ham) | `e2e-isolated.txt` |
| Native: barmoq izi (Keystore), GPS, MapLibre/WebGL, bildirishnoma, kamera, kuryer GPS | **25/25** | `native-qa.txt` |
| Real Device QA rejasi §8 (U01, A01, A06, C11–C15, tarif, K01–K04, Orqaga) | **44/44** (birinchi ishda 2 ta haqiqiy xato topildi, §3) | `plan-qa.txt` |
| Maestro (mijoz smoke, Orqaga, admin kirish oynasi) | **3/3** | `maestro/report.xml` |
| Chrome UI regressiyasi (360/390/412/1280 px) | **100/100** | `regression/ui-verify.txt` |
| Typecheck + unit | OK, **73/73** | `regression/typecheck-unit.txt` |
| Release 1.2.3 test-serverga qaratilgan debug ustidan (prod, faqat oʻqish) | **11/11** | `release-1.2.3-over-debug.txt` |

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

```bash
source ~/.fayz-toolchain/env.sh && qa-emulator start && export ANDROID_SERIAL=emulator-5554
adb install -r apps/android/customer/build/outputs/apk/debug/customer-debug.apk
adb install -r apps/android/admin/build/outputs/apk/debug/admin-debug.apk
node scripts/android-qa/real-device-e2e.mjs        # 35 ta, izolyatsiya qilingan Worker
node scripts/android-qa/emulator-plan-qa.mjs       # §8 rejasi, 44 ta
node scripts/android-qa/maestro-local.mjs          # Maestro flow’lari
# native-qa.mjs: avval QA_PORT=8791 scripts/deploy-qa/local-worker.sh <yangi-papka>
qa-emulator stop
```

Yangi fayllar: `scripts/android-qa/emulator-plan-qa.mjs`, `scripts/android-qa/maestro-local.mjs`, `scripts/android-qa/maestro/*.yaml`. Skrinshotlar: `docs/v1/screenshots/emulator-android16/`.

## 6. Distributivlar (commit qilinmagan)

| Fayl | Hajm | SHA-256 |
|---|---|---|
| `dist/apk/v1.2.3/fayz-market-customer.apk` | 1 040 286 | `c195485f373b85cf89e569190fb76c4f7eaf3bfc17cc7e77d87e4b3100c22c4b` |
| `dist/apk/v1.2.3/fayz-market-admin.apk` | 1 087 312 | `03b1d2e3438d9400a4d29f1afc60d3ddc071108dc2bfca51c0de4a12c5782f6c` |

Release, debuggable emas, production’ga qulflangan, sertifikat `93f0f845…f89851` (1.2.2 bilan bir xil). Oldingi 1.2.3 build (26-noyabr, 22:41) oʻchirilmadi: `dist/archive/apk-v1.2.3-build-20261126-2241/`. API oʻzgarmadi — Worker deploy kerak emas. Desktop admin (DMG/EXE) F1 tuzatishi uchun keyinroq qayta yigʻilishi kerak.
