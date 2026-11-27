# Fayz Market — Android QA (emulator-first) qoʻllanmasi

Asosiy avtomatik test qurilmasi: **EMULATOR `qa-android16`** (Android 16 / API 36, arm64, 4 GB, 4 vCPU, 1080×2340 @ 450 dpi = Galaxy A17 bilan bir xil 384 CSS px). Haqiqiy Samsung A17 faqat `REAL_DEVICE_CHECKLIST-1.2.3.md` dagi bandlar uchun.

Global vositalar `~/.fayz-toolchain` da (JDK 17, Android SDK, emulator, Maestro 2.13.0 — `README.md` oʻsha yerda). Ularni boshqaradigan skriptlar **shu repoda**: `scripts/android-qa/`.

## Buyruqlar

```bash
scripts/android-qa/qa.sh emulator start            # ~16 s, PIN 1111 oʻzi ochiladi (--window — oynasi bilan)
scripts/android-qa/qa.sh emulator status           # Android, GPU, Mac RAM/CPU/SSD
scripts/android-qa/qa.sh emulator stop             # sync + Android’ni oʻchirish (~4 s). `adb emu kill` ishlatmang
scripts/android-qa/qa.sh setup                     # yangi AVD: PIN 1111, virtual barmoq izi, animatsiyalar oʻchiq
scripts/android-qa/qa.sh target                    # testlar qaysi qurilmada ishlashini koʻrsatadi
scripts/android-qa/qa.sh build                     # web bundle + debug/release APK → dist/apk/v<versiya>
scripts/android-qa/qa.sh install debug|release     # adb install -r (uninstall’siz, maʼlumot saqlanadi)
scripts/android-qa/qa.sh regression                # hamma toʻplam ketma-ket
scripts/android-qa/qa.sh regression --resume       # uzilgan joydan davom (PASS boʻlganlar oʻtkazib yuboriladi)
scripts/android-qa/qa.sh screenshot <nom>          # emulator ekrani → docs/v1/screenshots/emulator-android16/manual/
scripts/android-qa/qa.sh resources start|stop|summary
scripts/android-qa/qa.sh toolchain-sync            # emulator.sh/resources.sh → ~/.fayz-toolchain/bin/qa-*
```

## Toʻplamlar

Har biri oʻzining **yangi lokal Worker**ida (yangi D1 + lokal R2, `adb reverse`). Production’ga yozilmaydi. Faqat `release-check` production’ni **oʻqiydi**: release ilovalarni ochadi, hech kim kirmaydi.

| Buyruq | Skript | Nimani qamraydi |
|---|---|---|
| `e2e` | `real-device-e2e.mjs` | Telefon+kod kirish, kategoriya, qidiruv, variantlar, savat, olib ketish/kuryer, manzil + klaviatura, buyurtma → admin holatlari → mijoz, rasm yuklash, tarif, tema, oflayn, Orqaga |
| `plan` | `emulator-plan-qa.mjs` | Real Device QA §8: U01, A01 (parol, chiqish/kirish ×3, barmoq izi), A06, admin doʻkon joylashuvi, C11–C15, GPS, matnli manzil, xarita (barmoq bilan surish), C13, tarif «Operator aniqlaydi», kuryer K01–K04, darhol yangilanish, Orqaga |
| `native` | `native-qa.mjs` | Keystore + BiometricPrompt, GPS ruxsati, MapLibre/WebGL, Android bildirishnomasi (fonda), kamera → yuklash, kuryer GPS ulashish |
| `maestro` | `maestro-local.mjs` + `maestro/*.yaml` | Mijoz smoke, Orqaga navigatsiyasi, admin kirish oynasi |
| `uiautomator` | `uiautomator-qa.mjs` | Android accessibility daraxti: tablar, nomlar (TalkBack), 48 dp touch target, EditText/parol, klaviatura, crash/ANR |
| `web` | typecheck, vitest, `ui-qa/real-device-fixes-ui.mjs` | Chrome UI 360/390/412/1280 px |
| `release-check` | `release-apk-check.mjs` | Release APK debug ustidan joyida, debuggable emas, production’ga qulflangan, server boshqaruvlari yoʻq |

Natijalar: `docs/v1/evidence/emulator-android16/`, skrinshotlar: `docs/v1/screenshots/emulator-android16/`, regressiya xulosasi: `regression-<versiya>.txt`. Barchasi **EMULATOR** deb belgilanadi.

## Qurilma xavfsizligi

- `qa.sh` testlarga faqat ishlayotgan `qa-android16` emulatorining seriyasini beradi (`ro.kernel.qemu=1` tekshiriladi). Samsung ulanib turgan boʻlsa ham unga tegmaydi.
- Holatni oʻzgartiradigan skriptlar (`setup-emulator`, `native-qa`, `emulator-plan-qa`, `maestro-local`, `uiautomator-qa`, `release-apk-check`, `upgrade`, …) `requireEmulator()` bilan haqiqiy telefonni **rad etadi**.
- Telefon uchun moʻljallangan skriptlar (`real-device-*`, `install-open-check`, `map-worker-probe`) haqiqiy telefonda faqat `REAL_DEVICE_CONFIRM=<seriya> ANDROID_SERIAL=<seriya>` bilan ishlaydi.

## Maxfiy dalillar

- `.local-qa/` — git-ignored: haqiqiy telefon skrinshotlari (`private-screenshots/`), regressiya holati, loglar, resurs CSV.
- Haqiqiy telefon skriptlari skrinshotlarni standart holatda `.local-qa/private-screenshots/real-device/…` ga yozadi.
- Ism, telefon raqami, GPS, savdo summalari va qurilma seriyasi `docs/` ga tushmasin. Repo GitHub’da ochiq.

## Muammolar

| Belgi | Sabab va yechim |
|---|---|
| Yangi oʻrnatilgan APK qayta yuklashdan keyin yoʻqoldi | Emulator `adb emu kill` bilan oʻchirilgan. Doim `qa.sh emulator stop` |
| `uiautomator dump` «Killed» | Maestro drayveri UiAutomation’ni ushlab turibdi: `adb shell am force-stop dev.mobile.maestro` |
| GPS so‘ralmaydi | Android ikki rad etishdan keyin soʻramaydi: `pm clear-permission-flags <pkg> android.permission.ACCESS_FINE_LOCATION user-set user-fixed` |
| Eski savat/manzil/bildirishnoma | Lokal origin xotirasi saqlanib qolgan; skriptlar oʻz origin’ini tozalaydi |
| Maestro WebView tabini bosmaydi | Daraxtda ekrandan tashqaridagi takroriy «Katalog»/«Savat» bor: tablar nuqta boʻyicha bosiladi |
