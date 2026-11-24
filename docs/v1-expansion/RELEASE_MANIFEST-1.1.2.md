# Fayz Market 1.1.2 — release candidate manifest

Sana: 2026-11-25. Branch: `main`. Bu **release candidate** (RC): debug-imzoli APK, ad-hoc imzoli macOS va imzosiz Windows o‘rnatuvchi. Do‘kon (Play/App Store) yoki korporativ tarqatish uchun imzolangan release emas.

Nusxa: `dist/RELEASE_MANIFEST-1.1.2.md` (dist Git’ga kirmaydi). To‘liq mashina-o‘qiladigan metadata: [`evidence-post-codex/artifacts-1.1.2.json`](evidence-post-codex/artifacts-1.1.2.json) — `node scripts/release/artifact-metadata.mjs <fayllar>` bilan qayta hosil qilinadi.

## Nega 1.1.2

Oxirgi tarqatilgan versiya 1.1.1 (versionCode 5; Telegram orqali yuborilgan nusxalar `ecfd5e75…`/`8bd38997…`). Codex auditi undan keyin API xavfsizligi, Android origin siyosati, Electron IPC, MapLibre 6 worker va dependency tuzatishlarini kiritdi — bu ilova kodini o‘zgartiradi, shuning uchun 1.1.1 nomi bilan tarqatib bo‘lmaydi. Patch release: 1.1.2, Android versionCode 6 (5 dan katta — eski ilova ustidan yangilanadi).

## Source

| | |
|---|---|
| APK build commit | `b03fb5c` (`main`), `gradlew --rerun-tasks` bilan to‘liq qayta qurilgan |
| Desktop build commit | `7ce81cf` (`main`) — `b03fb5c`dan farqi faqat `scripts/android-qa/*` (ilova kodiga ta’sir qilmaydi) |
| Working tree | Toza (faqat foydalanuvchining `.DS_Store` o‘zgarishi; ilovaga kirmaydi) |
| Node / npm (build) | v26.13.1 / 11.20.0; Electron 45.4.1; electron-builder 26 |
| Android | compileSdk 35, minSdk 23, targetSdk 28, JDK 17 (`~/.fayz-toolchain`) |

## Yakuniy distributivlar

| Fayl | Paket / bundle ID | Versiya | Arxitektura | Hajm (bayt) | SHA-256 | Imzo |
|---|---|---|---|---|---|---|
| `dist/apk/v1.1.2/fayz-market-customer-debug.apk` | `uz.fayzmarket.customer` | 1.1.2 (vc 6) | Universal (Java/WebView, native `.so` yo‘q) | 872 960 | `283783f06a90697c6436b3924ac4e28df7445062abbc0e92b1b40e6140865fac` | Android Debug, v1+v2, sertifikat `93f0f845…f89851` |
| `dist/apk/v1.1.2/fayz-market-admin-debug.apk` | `uz.fayzmarket.admin` | 1.1.2 (vc 6) | Universal (Java/WebView) | 875 398 | `e13968d9f091d20550c412fe665adfa3c999ee7ff8c6ffa9cf67a5a8a551650a` | Android Debug, v1+v2, sertifikat `93f0f845…f89851` |
| `dist/desktop/fayz-market-admin-1.1.2-macos-arm64.dmg` | `uz.fayzmarket.admin` | 1.1.2 | arm64 (Apple Silicon) | 120 180 743 | `16b6d37b38607bd3de90136438346cafb7431b902ab84cbc878a15b2842d0925` | ad-hoc; Developer ID va notarization yo‘q — Gatekeeper `rejected` |
| `dist/desktop/fayz-market-admin-1.1.2-windows-x64-setup.exe` | NSIS, AppUserModelId `uz.fayzmarket.admin` | 1.1.2 | x64 ilova (`PE32+ x86-64`), o‘rnatuvchi stub PE32 | 121 907 276 | `fd68f9481ef59834ed89b83e09ea7836881ed3a397f88f18bbc17a5be65d576c` | Imzosiz (PE certificate table = 0) |

Telegram orqali yuborish uchun nusxalar (SHA-256 yuqoridagi APK’lar bilan bir xil): `dist/telegram/FayzMarket-Mijoz-v1.1.2.apk`, `dist/telegram/FayzMarket-Admin-v1.1.2.apk`.

APK sertifikati 1.0.0…1.1.1 bilan bir xil debug kalit (`~/.android/debug.keystore`) — mavjud o‘rnatmalar ustidan yangilash mumkin. Kalit almashtirilsa (Play uchun release key), eski o‘rnatma ustidan yangilanmaydi.

## Sinov holati (har bir artefakt bo‘yicha)

| Artefakt | Build | Haqiqiy sinov | Holat |
|---|---|---|---|
| Customer APK | PASS | Emulyator (Android 14, WebView 113): 1.1.1→1.1.2 ustidan yangilash, ma’lumot saqlandi; production’da ochilish/UI/health; APK WebView ichida MapLibre worker + OpenFreeMap; native QA (biometrika, GPS, checkout xarita pini, buyurtma koordinatasi) lokal Worker bilan | EMULATOR PASS; **fizik telefon NOT TESTED** |
| Admin APK | PASS | Emulyator: ustidan yangilash; production’da ochilish; xarita worker; bildirishnoma (kanal, tap → buyurtma), kamera → preview → R2 (lokal Worker), galereyaga saqlanmaydi; kuryer GPS ulashish | EMULATOR PASS; **fizik telefon NOT TESTED** |
| macOS DMG | PASS (`hdiutil verify` VALID) | Paketlangan ilova read-only smoke 11/11: ishga tushish, login formasi, Node global yo‘q, preload bridge, IPC orqali production GET, tashqi path rad, xarita worker file-origin’da chiziladi, ilova bundle’i aynan paketdagi worker’ga ishora qiladi | READ-ONLY PASS; owner login va to‘liq operatsion oqim NOT TESTED (production’ga yozmaslik) |
| Windows EXE | PASS | Asar tarkibi macOS bilan bir xil (14 fayl), `Fayz Market Admin.exe` PE32+ x86-64, production API URL | Build integrity PASS; **Windows’da o‘rnatish/ishga tushirish NOT TESTED** (Windows qurilma yo‘q) |

Paketdagi web bundle = sinalgan bundle: Android assets 10+10 fayl UI regressiya sinalgan `apps/*/dist` bilan SHA-256 bo‘yicha bir xil; desktop asar ichidagi 14 fayl source build bilan bir xil (`evidence-post-codex/desktop-bundle-match.txt`).

## dist/ o‘zgarishlari (2026-11-25)

O‘zgarishdan oldingi to‘liq ro‘yxat va xeshlar: [`evidence-post-codex/dist-before.txt`](evidence-post-codex/dist-before.txt).

| Amal | Fayl | SHA-256 | Sabab |
|---|---|---|---|
| Arxivga ko‘chirildi | `dist/archive/v1.1.1/apk/*`, `desktop/*`, `telegram/*`, `RELEASE_MANIFEST-1.1.1.md` | `ecfd5e75…`, `8bd38997…`, `3923631d…`, `6037d172…` | Tarqatilgan 1.1.1 — telefonlardagi versiya; upgrade testi va rollback uchun saqlanadi (o‘chirilmadi) |
| O‘chirildi | `dist/desktop/fayz-market-admin-1.1.2-macos-arm64.dmg` (Codex nomzodi) | `0e0f07de8befca64c555932bb15dd6b5811559ebab7200629924116ccc0cf7e1` | Commit qilinmagan tree’dan qurilgan, xuddi shu nom/versiya; `7ce81cf`dan qurilgan va sinalgan DMG bilan almashtirildi |
| O‘chirildi | `dist/desktop/fayz-market-admin-1.1.2-windows-x64-setup.exe` (Codex nomzodi) | `62d02c5fc5cce5e004cba6b1a4425cccd41296f75cc3256cbd83bf458d1c5194` | Xuddi shu sabab |
| Almashtirildi | `dist/apk/v1.1.2/*.apk` (Codex nomzodi: customer `7e0fdfc5…ee`, admin `a34adc93…6d`) | yuqoridagi yangi xeshlar | Ochilgan tarkibi bir xil (`diff -r` toza); farq faqat inkremental zip qadoqlashda. Yangi APK’lar commit’dan to‘liq qayta qurilgan |
| O‘chirildi | `dist/apk/fayz-market-*-debug.apk` (ildiz) | `v1.1.2/` bilan bir xil | Takror nusxa; `build-apks.sh` keyingi buildda qayta yozadi |

Tegilmagan: `dist/backups/*` (maxfiy SQL zaxiralar — tarqatilmasin), `dist/*credentials*.txt` (0600, Git’ga kirmaydi), signing kalitlari (`~/.android/debug.keystore`).
