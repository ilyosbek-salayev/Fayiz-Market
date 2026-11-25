# Fayz Market V1 — doʻkon egasiga topshirish

Bu hujjat doʻkon egasi (super admin) uchun: tizim nimalarni qila oladi, kundalik ish qanday bajariladi va qanday cheklovlar bor.

## 1. Tarkib

| Qism | Kim uchun | Qayerda |
|---|---|---|
| **Fayz Market** (Android) | Xaridorlar | `dist/apk/v1.2.0/fayz-market-customer-debug.apk` |
| **Fayz Market Admin** (Android) | Egasi, administratorlar, kuryerlar | `dist/apk/v1.2.0/fayz-market-admin-debug.apk` |
| **Fayz Market Admin** (macOS) | Egasi, administratorlar | `dist/desktop/fayz-market-admin-1.2.0-macos-arm64.dmg` |
| **Fayz Market Admin** (Windows) | Egasi, administratorlar | `dist/desktop/fayz-market-admin-1.2.0-windows-x64-setup.exe` |
| Server | — | Cloudflare Worker `fayz-market-api`, D1 `fayz-market`, R2 `fayz-market-images` |

Foydalanuvchiga mahsulot nomi «Fayz Market V1» sifatida koʻrsatiladi. Texnik versiya 1.2.0 (Android versionCode 7), shuning uchun ilova eski versiya ustidan yangilanadi.

## 2. Bir hisob — barcha admin ilovalari

- Android Admin, macOS Admin va Windows Admin bitta markaziy serverdan foydalanadi: `https://fayz-market-api.ilyosbeksalayev240.workers.dev`.
- Bitta email va parol uchala ilovada ham ishlaydi.
- Parol bir joyda oʻzgartirilsa, boshqa qurilmalardagi sessiyalar yopiladi va yangi parol hamma joyda amal qiladi.
- Har bir xodim alohida hisob bilan ishlaydi (Sozlamalar → Xodimlar). Umumiy parol ishlatmang.

| Rol | Imkoniyat |
|---|---|
| Super admin (owner) | Hammasi: brend, doʻkon manzili, toʻlov usullari, integratsiya kalitlari, xodimlar, pulni qaytarish |
| Admin (manager) | Mahsulot, kategoriya, buyurtma, toʻlovni qayd etish va holat, bannerlar, sharhlar |
| Kuryer | Faqat oʻziga biriktirilgan yetkazishlar |

## 3. Kundalik ish

**Brend va logotip.** Sozlamalar → Brend va koʻrinish → «Yangi logo» → preview → Saqlash.

- Mijoz ilovasi yangi logoni keyingi ochilishda oladi, APK almashtirish shart emas.
- «Standart logoga qaytarish» va «Avvalgi logotiplar» tugmalari bilan avvalgi holatga qaytiladi.

**Doʻkon manzili.** Sozlamalar → Doʻkon joylashuvi.

- Manzil nomi va toʻliq manzilni kiriting, xaritadagi pin bilan nuqtani aniq belgilang, Saqlang.
- Bu manzil mijozning bosh sahifasida, «Doʻkonga yoʻl» xaritasida, olib ketishda va kuryer marshrutida ishlatiladi.

**Bannerlar.** Bannerlar → Banner qoʻshish.

- Sarlavha, tavsif, tugma (katalog, kategoriya, mahsulot yoki doʻkon xaritasi), rasm va rangni tanlang.
- Telefondagi koʻrinishi preview’da darhol chiqadi.
- «Yashirish» bannerni vaqtincha oʻchiradi, «Oʻchirish» butunlay olib tashlaydi.

**Toʻlov usullari.** Sozlamalar → Toʻlov va qabul qilish.

- Naqd, terminal, bank oʻtkazmasi (rekvizitlar bilan) va «Doʻkondan olib ketish»ni yoqish yoki oʻchirish mumkin.

**Toʻlovni tasdiqlash.** Buyurtmalar → buyurtma → Toʻlov.

- Pulni olganingizdan keyin «Toʻlovni qayd etish»ni bosing. Bank yoki terminal uchun hujjat raqamini ham kiriting.
- Summa toʻliq qoplanganda holat avtomatik «Toʻlandi» boʻladi.
- Pul kelmagan boʻlsa: «Muvaffaqiyatsiz» va sababi. Sabab mijozga koʻrinadi.
- Pulni qaytarish (faqat egasi): «Pul qaytarildi deb belgilash» va sababi.

**Olib ketish buyurtmasi.** Holatlar ketma-ketligi: Tasdiqlash → Tayyorlanmoqda → **Olib ketishga tayyor** → **Topshirildi**. Bunday buyurtmaga kuryer kerak emas.

**Koʻrinish.** Sozlamalar → Koʻrinish → Yorugʻ / Qorongʻi / Tizim boʻyicha. Bu sozlama faqat shu qurilmaga tegishli.

## 4. Cheklovlar (ochiq aytilmoqda)

1. **Onlayn toʻlov (Payme, Click)** kodda tayyor, lekin **ishga tushirilmagan**: merchant shartnomasi va kalitlar yoʻq.
   - Shuning uchun xaridorga koʻrinmaydi.
   - Ishga tushirish: `BANNERS_AND_PAYMENTS.md` §3 (hujjatlar roʻyxati shu yerda).
2. **Marshrut chizigʻi** uchun OpenRouteService kaliti kerak (bepul roʻyxatdan oʻtish).
   - Kalit boʻlmasa, xaritada doʻkon va xaridor koʻrinadi, «Yoʻlga chiqish» esa Google Maps’da haqiqiy yoʻlni ochadi.
3. **Kalitlarni paneldan saqlash** uchun kerak boʻlgan `INTEGRATIONS_MASTER_KEY` production’da oʻrnatilgan (2026-11-25).
4. **Android ikonka, bildirishnoma belgisi va desktop ikonka** faqat yangi APK, DMG yoki EXE bilan oʻzgaradi. Paneldagi logo ilova ichidagi brendingni boshqaradi.
5. **APK’lar debug imzoli.** Google Play uchun release kalit kerak.
   - Release kalit bilan imzolangan ilova hozirgi debug ilova ustidan yangilanmaydi: bir marta qayta oʻrnatish kerak boʻladi.
6. **macOS DMG** Apple Developer ID bilan imzolanmagan: birinchi ochishda «Open anyway» kerak. **Windows EXE** imzosiz: SmartScreen ogohlantiradi.
7. **Haqiqiy telefon (Samsung) va Windows kompyuterda sinov** bu ishda bajarilmagan. Tekshiruv roʻyxati: `TEST_RESULTS.md` §5.
8. **SMS, Email, Telegram, FCM** — ularning maʼlumotlari kiritilmaguncha tegishli funksiyalar oʻchiq turadi.

## 5. Ishga tushirish tartibi

Bularning hammasi egasining ruxsati bilan bajariladi. **1–5-qadamlar 2026-11-25 da bajarildi.** Server tayyor, endi ilovalarni tarqatish mumkin.

1. **D1 zaxira nusxa** (export).
2. **Migratsiya** `0007_v1_storefront.sql`. U faqat qoʻshimcha jadval va ustunlar yaratadi, mavjud maʼlumotlarni oʻzgartirmaydi.
3. **Worker deploy** (`apps/api` papkasidan, `--env production`).
4. **`INTEGRATIONS_MASTER_KEY`** — bir marta oʻrnatiladi.
5. **Smoke test.** `/health`, `/storefront` va admin panelga kirish.
6. **Ilovalarni tarqatish.** APK, DMG va EXE faqat 1–5-qadamlardan keyin tarqatiladi.

Aniq buyruqlar: `RELEASE_REPORT.md` §4.
