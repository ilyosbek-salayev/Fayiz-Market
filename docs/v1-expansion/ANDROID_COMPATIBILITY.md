# Android: ustidan yangilash mosligi (v1.1.1)

| | Xaridor | Admin (kuryer ham) |
|---|---|---|
| Fayl | `dist/apk/v1.1.1/fayz-market-customer-debug.apk` | `dist/apk/v1.1.1/fayz-market-admin-debug.apk` |
| Hajm | 644 012 bayt | 646 808 bayt |
| SHA-256 | `ecfd5e751ab15ff6dc432682bb7082dc3db189a91034b881ee538b50a895912e` | `8bd38997c70d2360a554ac2e9330f14c593ea3b9f34a2af795ec961f1c860773` |
| Paket | `uz.fayzmarket.customer` (o‘zgarmagan) | `uz.fayzmarket.admin` (o‘zgarmagan) |
| versionCode / name | 5 / 1.1.1 (1.0.0=1, 1.0.1=2, 1.1.0=3, 1.1.1 birinchi build=4) | 5 / 1.1.1 |
| Imzo | `CN=Android Debug`, SHA-256 `93f0f845…f89851` — v1.0.x/v1.1.0 bilan bir xil | bir xil |
| targetSdk / minSdk | 28 / 23 | 28 / 23 |

versionCode 5: barmoq izi kaliti yaroqsiz bo‘lganda (telefonga yangi barmoq izi qo‘shilsa) ilova qulf ekranida qotib qolmaydi — tuzatish APK tarkibini o‘zgartirgani uchun versionCode oshirildi, versionName 1.1.1 qoldi. Oldingi build (versionCode 4) `dist/apk/v1.1.1-vc4/` da saqlangan.

Upgrade zanjiri emulyatorda sinaldi: 1.0.1 (2) → 1.1.1 (4) → 1.1.1 (5), har biri `adb install -r` — 12/12 va 12/12, ma’lumot va firstInstallTime saqlandi.

APK hajmi oshdi (≈0,29 → 0,7 MB): ichida MapLibre GL (kalitsiz interaktiv xarita) alohida chunk sifatida bor, u faqat xarita ochilganda yuklanadi.

Tekshirilgan (`aapt2 dump badging`, `apksigner verify --print-certs`, `unzip -l`): paket, versiya, imzo, ruxsatlar, assetlar (eski build qoldiqlari yo‘q — `build-apks.sh` endi asset papkasini tozalaydi).

## Ruxsatlar

`ACCESS_FINE/COARSE_LOCATION` (faqat tugma bosilganda), `POST_NOTIFICATIONS`, `USE_BIOMETRIC`. `CAMERA` **so‘ralmaydi** — tizim kamera ilovasi `ACTION_IMAGE_CAPTURE` orqali ishlaydi, surat ilova keshiga yoziladi (galereyaga emas).

## O‘rnatish (ma’lumot o‘chmaydi)

```sh
adb install -r dist/apk/v1.1.1/fayz-market-customer-debug.apk
adb install -r dist/apk/v1.1.1/fayz-market-admin-debug.apk
```
`adb uninstall` / `pm clear` ishlatmang. `INSTALL_FAILED_UPDATE_INCOMPATIBLE` chiqsa — o‘chirmang, xabar bering.

## Sinov holati

| Muhit | Natija |
|---|---|
| **Android 14 emulyatori** (arm64, Google APIs) — `scripts/android-qa/upgrade.mjs` | ✅ 12/12: v1.0.1 o‘rnatilib, WebView xotirasiga marker yozildi → `adb install -r` v1.1.1 → paket, imzo, `firstInstallTime` va barcha localStorage kalitlari (savat, profil, buyurtmalar, mavzu, marker) saqlandi, yangi native ko‘prik metodlari bor |
| **Haqiqiy telefon** | ⏳ sinalmagan — telefon ulanmagan (`adb devices` bo‘sh). Emulyator natijasi haqiqiy qurilma natijasi o‘rnida da’vo qilinmaydi |

Eslatma: emulyatorda qayta sinash uchun `adb install -r -d` (pastga tushirish) faqat debug APK va emulyator uchun ishlatildi; telefoningizda bunday qilmang.

## Backend vs APK

Backend o‘zgarishlari (Worker) darhol amal qiladi va eski APK’lar bilan mos (production 20/20, o‘rnatilgan v1.0.x ilovalar ishlaydi). Xarita, email bilan kirish, kamera, joylashuv, biometrika va bildirishnomalar APK ichida — ular uchun v1.1.1 o‘rnatilishi **shart**.
