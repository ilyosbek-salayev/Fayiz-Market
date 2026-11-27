# Fayz Market V1 — 1.2.3 release manifest

| | |
|---|---|
| **Versiya** | 1.2.3 (Android versionCode 10) |
| **Kod** | `main`, 722d968 + 2026-11-27 dagi yakuniy commit (bitta qoʻshimcha app tuzatishi: `maps.tsx` dagi «panned» belgisi 2 s dan keyin oʻchadi). Build vaqtidagi app kodi yakuniy commit bilan bir xil |
| **API** | Oʻzgarmagan (production Worker ae2ae8d6, migration 0009 bilan mos). Worker deploy **kerak emas** |
| **Holat** | Lokal. GitHub’ga push qilinmagan, telefonlarga tarqatilmagan |

## Distributivlar (`dist/`, git-ignored)

| Fayl | Hajm (bayt) | SHA-256 | Build |
|---|---|---|---|
| `apk/v1.2.3/fayz-market-customer.apk` | 1 040 322 | `3eda0c64f18350ef3b6e35d9436a9e0a6a2264d3497d5e10e79ef77697e99410` | 2026-11-27 20:08 |
| `apk/v1.2.3/fayz-market-admin.apk` | 1 087 349 | `bf3d07a4dce0a1f3a04452343492eabe6d9cc31464bcf8386719509d7c0e08a6` | 2026-11-27 20:08 |
| `desktop/fayz-market-admin-1.2.3-macos-arm64.dmg` | 121 771 924 | `e25bf2ce31220ccf25c3e51e586706aea2a2fe4d0412625387accfdb107b0f41` | 2026-11-27 20:22 |
| `desktop/fayz-market-admin-1.2.3-windows-x64-setup.exe` | 122 468 137 | `d821627bd21c83bfac1e8868768e5a216b5f13af5ae2c7a57cd88921b4f2b232` | 2026-11-27 20:23 |

Oldingi 1.2.3 build (2026-11-26 22:41) oʻchirilmagan: `dist/archive/apk-v1.2.3-build-20261126-2241/`. 1.2.2 fayllari joyida.

## Android (ikkala APK)

| Maydon | Customer | Admin |
|---|---|---|
| Paket | `uz.fayzmarket.customer` | `uz.fayzmarket.admin` |
| versionCode / versionName | 10 / 1.2.3 | 10 / 1.2.3 |
| minSdk / targetSdk | 23 / 28 | 23 / 28 |
| Arxitektura | yoʻq (Java + WebView, hamma ABI) | xuddi shunday |
| Ruxsatlar | INTERNET, ACCESS_FINE/COARSE_LOCATION, POST_NOTIFICATIONS, USE_BIOMETRIC | xuddi shunday |
| Debuggable | yoʻq | yoʻq |
| Ichki API manzili | `https://fayz-market-api.ilyosbeksalayev240.workers.dev` (qulflangan, server sozlamasi yoʻq) | xuddi shunday |
| Imzo | v1 + v2, 1 imzo, `CN=Android Debug`, SHA-256 `93f0f845…f89851` | xuddi shunday |
| 1.2.2 ustidan yangilash | Bir xil sertifikat, vc 9 → 10: joyida yangilanadi (emulatorda tekshirildi) | xuddi shunday |

## Desktop Admin

| | macOS | Windows |
|---|---|---|
| Format | DMG (`hdiutil verify` VALID), `Fayz Market Admin.app`, arm64 | NSIS oʻrnatuvchi, x64 |
| Versiya / bundle id | 1.2.3 / `uz.fayzmarket.admin` | 1.2.3 |
| Imzo | ad-hoc, notarizatsiya yoʻq → Gatekeeper «rejected» (birinchi ochishda: oʻng tugma → Open) | Authenticode yoʻq → SmartScreen ogohlantiradi |
| Web bundle | 1.2.3 tuzatishlari bor (xarita, Orqaga); API = production | macOS bilan **aynan bir xil** (14 fayl) |
| Tekshiruv | Packaged ilova login ekrani: logo, «Fayz Market V1», faqat email + parol + Kirish — **5/5** (`scripts/release/desktop-brand-check.mjs`, login yoʻq) | Oʻrnatish va ishga tushirish: **BLOCKED** — MacBook’da Windows (yoki VM) yoʻq. Faqat build yaxlitligi va bundle bir xilligi tekshirildi |

## 1.2.2 → 1.2.3 oʻzgarishlar (foydalanuvchiga)

1. Android «Orqaga»: avval ochiq qatlam yopiladi (mahsulot sahifasi, oynalar, admin menyusi, boʻlimlar), keyin ilovadan chiqiladi.
2. Xarita: nuqta faqat xaritaga tegilganda yoki GPS bilan olinadi. Ilgari klaviatura ochilganda Toshkent markazi (41.3111, 69.2797) yetkazish/doʻkon nuqtasi boʻlib yozilardi.
3. Faqat yozilgan va tasdiqlangan manzil bosh sahifada ham koʻrinadi.
4. Mijoz ilovasiga qaytilganda buyurtmalar darhol yangilanadi.

## Maʼlum cheklovlar

- APK’lar Android debug sertifikati bilan imzolangan (1.0 dan beri, joyida yangilash uchun). Play Store’dan oldin alohida release kalitiga oʻtish kerak — bu bir marta qayta oʻrnatishni talab qiladi.
- targetSdk 28: Android 13+ birinchi ochilishda bildirishnoma ruxsatini oʻzi soʻraydi; Play Store yangi ilovalar uchun targetSdk 35 talab qiladi.
- Desktop imzosiz (macOS notarizatsiya, Windows Authenticode yoʻq).
