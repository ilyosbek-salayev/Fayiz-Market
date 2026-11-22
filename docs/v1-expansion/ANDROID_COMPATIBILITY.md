# Android: ustidan yangilash mosligi (v1.1.0)

| | Xaridor | Admin (kuryer ham) |
|---|---|---|
| Fayl | `dist/apk/v1.1.0/fayz-market-customer-debug.apk` | `dist/apk/v1.1.0/fayz-market-admin-debug.apk` |
| Hajm | 289 089 bayt | 292 719 bayt |
| SHA-256 | `1c1e8d4f6c867ade2e68b4fd04c14d75ed20522a46119ac6151c68c367855416` | `0948df16ec084fe0870be58ae4ef3f60e856d55a7242723c47fc9aab158bdfe3` |
| Paket | `uz.fayzmarket.customer` (o‘zgarmagan) | `uz.fayzmarket.admin` (o‘zgarmagan) |
| versionCode / name | 3 / 1.1.0 (avval 1→2) | 3 / 1.1.0 |
| Imzo | `CN=Android Debug`, SHA-256 `93f0f845…f89851` — v1.0.0/v1.0.1 bilan bir xil | bir xil |

Tekshirilgan: `aapt2 badging`, `apksigner --print-certs`, manifest (ruxsatlar, provider `<paket>.captures`, `singleTop`), dex klasslari (`MainActivity`, `Biometrics`, `CaptureProvider`), bundle, secret qidiruvi (0).

## Yangi ruxsatlar

`ACCESS_FINE/COARSE_LOCATION` (checkout va kuryer, faqat so‘ralganda), `POST_NOTIFICATIONS`, `USE_BIOMETRIC`. `CAMERA` **so‘ralmaydi** — tizim kamera ilovasi `ACTION_IMAGE_CAPTURE` orqali ishlaydi, surat ilova keshiga yoziladi (galereyaga emas).

## O‘rnatish (ma’lumot o‘chmaydi)

```sh
adb install -r dist/apk/v1.1.0/fayz-market-customer-debug.apk
adb install -r dist/apk/v1.1.0/fayz-market-admin-debug.apk
```
`adb uninstall` / `pm clear` ishlatmang. In-place o‘rnatish qurilmada **sinalmagan** (`adb devices` bo‘sh). `INSTALL_FAILED_UPDATE_INCOMPATIBLE` chiqsa — o‘chirmang, xabar bering.

## Saqlanadigan ma’lumotlar

Origin o‘zgarmadi (v1.0.1 dagi production manzil) → savat, profil, mavzu, saqlangan buyurtma tokenlari saqlanadi. Mijoz akkaunti ixtiyoriy; mehmon buyurtmalari avvalgidek ishlaydi. O‘rnatilgan v1.0.x ilovalar yangi backend bilan ishlashda davom etadi (production API 74/74).

## Backend vs APK

Backend o‘zgarishlari (Worker) darhol amal qiladi. Yangi ekranlar, kamera, joylashuv, biometrika va bildirishnomalar APK ichida — ular uchun v1.1.0 o‘rnatilishi **shart**.
