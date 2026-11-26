# Release hisoboti — Fayz Market V1

> **Joriy release: 1.2.2** (Android versionCode 9). Egasining Samsung A17 dagi sinovi boʻyicha tuzatishlar: mahsulot variantlari va xususiyatlari, checkout hisob-kitobi va kuryer tarifi, bitta manzil komponenti, admin fokus xatosi, qulflash va hisobdan chiqish.
>
> - Batafsil: `REAL_DEVICE_QA_FIX_REPORT.md`.
> - Fayllar: `dist/RELEASE_MANIFEST.md` (Git nusxasi `docs/v1/RELEASE_MANIFEST-1.2.2.md`).
> - Production’da (2026-11-26): zaxira → 0009 → Worker `ae2ae8d6` → read-only smoke 11/11. Rollback: `npx wrangler rollback 31ac4af9-6b12-45ba-b711-938ce320440f --env production`.
>
> **1.2.1 (tarix):** Android versionCode 8. Asosiy oʻzgarishlar:
>
> - doʻkonga beriladigan Android ilovalar endi **release** build: production’ga qulflangan, server yoki debug tugmasi yoʻq;
> - narx inputi tuzatildi;
> - integratsiyalar sahifasi soddalashtirildi;
> - telefon+kod bilan kirish, GPS avtomatik biriktirish, yetkazish haqi qoʻshildi.
>
> Fayllar, SHA-256 va sinov holati: `dist/RELEASE_MANIFEST.md` (Git nusxasi `docs/v1/RELEASE_MANIFEST-1.2.1.md`). Batafsil: `UX_REFINEMENT_1.2.1.md`.
>
> Server tomoni production’ga chiqarildi (2026-11-25, egasining ruxsati bilan): zaxira → migratsiya 0008 → Worker Version `6955fdd2-e5ac-4cd7-bdc3-0a0ded818e95` → read-only smoke 11/11. Rollback: `npx wrangler rollback e5f9c48e-7760-4dfa-87af-5a7ca1283718 --env production` (`apps/api` dan). Telefon+kod bilan kirish SMS (Eskiz) ulangandan keyin ishlaydi.
>
> Pastdagi 1.2.0 boʻlimlari tarix uchun saqlangan.

## 1.2.0 (tarix)

**Release turi:** release candidate (RC). Branch: `main`. Bu Play/App Store yoki korporativ tarqatish uchun imzolangan release emas:

- APK’lar debug imzoli;
- macOS ilovasi ad-hoc imzoli;
- Windows oʻrnatuvchisi imzosiz.

**Versiya.**

- Foydalanuvchiga «Fayz Market V1» deb koʻrsatiladi.
- Texnik versiya 1.2.0, Android versionCode **7**. Oldingi versionCode’lar 5 (1.1.1) va 6 (1.1.2). Versiya pasaytirilmadi.

## 1. Distributivlar

| Fayl | Paket / ID | Versiya | Arxitektura | Hajm (bayt) | SHA-256 | Imzo | Build |
|---|---|---|---|---|---|---|---|
| `dist/apk/v1.2.0/fayz-market-customer-debug.apk` | `uz.fayzmarket.customer` | 1.2.0 (vc 7) | Universal (Java/WebView) | 1 145 734 | `59462ea7690eddc3e98b7447b4afcfa695990485165987f2666692fb8d03e7a9` | Android Debug v1+v2, sertifikat `93f0f845…f89851` (1.0–1.1.2 bilan bir xil) | `8799a70`, 2026-11-25 05:31 |
| `dist/apk/v1.2.0/fayz-market-admin-debug.apk` | `uz.fayzmarket.admin` | 1.2.0 (vc 7) | Universal | 1 204 235 | `37ff58af11f923ffaf7fa5de0cc2710f446d2e82754f3c2efa7423554a89e6dc` | Xuddi shu | `8799a70`, 05:31 |
| `dist/desktop/fayz-market-admin-1.2.0-macos-arm64.dmg` | `uz.fayzmarket.admin` | 1.2.0 | arm64 | 121 761 024 | `3b3f8fc58b161d8a07c0f55e1a58f2d6379b0cae2208fd17f9ec339d259624d8` | ad-hoc; Developer ID va notarization yoʻq (Gatekeeper `rejected`) | `9b17653`, 05:39 |
| `dist/desktop/fayz-market-admin-1.2.0-windows-x64-setup.exe` | NSIS, `uz.fayzmarket.admin` | 1.2.0 | x64 | 122 460 787 | `ba056588bbc3d96d521fc3b2199b785d3886732d21c4710db8c81af53aecd99d` | Imzosiz | `9b17653`, 05:40 |

- Mashina oʻqiydigan metadata: `docs/v1/evidence/artifacts-1.2.0.json`. Ichida aapt2 badging, apksigner, codesign, spctl, hdiutil va PE tekshiruvlari.
- APK ichidagi web fayllar Chrome’da sinalgan bundle bilan bir xil. Windows va macOS installer’lardagi web bundle bir xil: 14 fayl, SHA-256 mos.
- Barcha distributivlar `https://fayz-market-api.ilyosbeksalayev240.workers.dev` ga ulanadi. Ortiqcha `-production` Worker’iga emas.

## 2. Oʻrnatish

**Android.**

1. APK’ni telefonga yuboring (Telegram/USB).
2. «Nomaʼlum manbalar»ga ruxsat bering.
3. Oʻrnating. Eski ilova **ustidan** yangilanadi, oʻchirish shart emas.

Ustidan yangilash emulyatorda tasdiqlangan (1.1.1 → 1.2.0, maʼlumot saqlandi).

**macOS (Apple Silicon).**

1. DMG’ni oching va ilovani Applications’ga torting.
2. Birinchi ochishda: System Settings → Privacy & Security → «Open Anyway».

**Windows.** EXE’ni ishga tushiring. SmartScreen chiqsa: «More info» → «Run anyway». Bu imzosiz installer’da kutiladigan holat. Windows’da sinalmagan.

## 3. Mosliklar

| Kombinatsiya | Natija |
|---|---|
| Yangi APK + **hozirgi production API** (deploy’dan oldin) | Ishlaydi; emulyatorda tasdiqlangan. Ilova `/storefront` boʻlmasa `/settings` ga qaytadi. Yangi brending koʻrinadi. Olib ketish va yangi toʻlov usullari server tayyor boʻlguncha **koʻrinmaydi** |
| 1.1.x ilovalar + yangi API | Ishlaydi: buyurtmalar yetkazish + naqd sifatida yaratiladi; 1.1.x admin doʻkon manzilini saqlay oladi (testlarda tasdiqlangan) |
| Eski Worker + yangi D1 sxema (0007) | Ishlaydi: API 129/129, security 11/11. Migratsiya va deploy oraligʻi ham, rollback ham xavfsiz |

## 4. Production’ga chiqarish

**Holat (2026-11-25):** egasining ruxsati bilan 1–5-qadamlar bajarildi:

- zaxira olindi;
- 0007 migratsiyasi qoʻllandi;
- deploy qilindi — Version `43b2cc54…`, faol `90b70a16…`;
- `INTEGRATIONS_MASTER_KEY` oʻrnatildi;
- read-only smoke 11/11 PASS.

Batafsil: `TEST_RESULTS.md` §6. 7-qadam ham egasining tasdigʻi bilan bajarildi: `fayz-market-api-production` oʻchirildi (D1 va R2’ga taʼsir qilmadi). Quyidagi buyruqlar maʼlumot uchun saqlanadi.

Deploy’dan oldingi holat (faqat GET bilan tekshirilgan):

- `fayz-market-api`: health 200, `/storefront` 404 — eski kod (`9ff0b7fb`).
- Ortiqcha `fayz-market-api-production`: 1.1.2 kodi, ishlatilmaydi.
- Ikkala Worker ham bitta D1 va R2’ga ulangan.

Barcha buyruqlar `apps/api` papkasidan (to‘g‘ri Worker — `[env.production]`, nomi `fayz-market-api`):

```bash
cd /Users/ilyosbek/Documents/GitHub/Fayiz-Market/apps/api
```

1. **Zaxira nusxa:**

```bash
npx wrangler d1 export fayz-market --env production --remote --output ../../dist/backups/fayz-market-before-1.2.0-$(date +%Y%m%d-%H%M).sql
```

2. **Migratsiya** — faqat 0007 qoʻshilishi kerak:

```bash
npx wrangler d1 migrations list fayz-market --env production --remote
```

```bash
npx wrangler d1 migrations apply fayz-market --env production --remote
```

3. **Tekshirib, deploy:**

```bash
npx wrangler deploy --env production --dry-run
```

```bash
npx wrangler deploy --env production
```

4. **Shifrlash kaliti** (bir marta; qiymat terminalga chiqmaydi):

```bash
openssl rand -base64 32 | npx wrangler secret put INTEGRATIONS_MASTER_KEY --env production
```

5. **Smoke test.** Deploy bajarilganini menga ayting — men read-only tekshiraman:
   - `/health` → 200;
   - `/storefront` → 200;
   - `DELETE /customer/push-token` (kirishsiz) → 401;
   - admin panelga kirish.
6. **Ilovalarni tarqatish** (1–5-qadamlardan keyin).
7. **Ortiqcha Worker** `fayz-market-api-production` — avval route va custom domain yoʻqligini dashboard’da tekshiring, soʻng alohida ruxsat bilan:

```bash
npx wrangler delete --name fayz-market-api-production
```

**Rollback.** Faqat Worker qaytariladi: `npx wrangler rollback <oldingi-versiya-id> --env production`. Migratsiya qoʻshimcha boʻlgani uchun eski Worker yangi sxemada ishlaydi (tasdiqlangan). D1’ni qaytarish kerak boʻlsa: 1-qadamdagi zaxira yoki D1 Time Travel.

## 5. dist/ tozalash (2026-11-25)

Oʻzgarishdan oldingi toʻliq roʻyxat va SHA-256: `docs/v1/evidence/dist-before-1.2.0.txt`. Hech narsa butunlay oʻchirilmadi — almashtirilgan fayllar macOS **Savatiga** (`~/.Trash/fayz-dist-1.1.2-RC-20261125-054140/`) koʻchirildi.

| Amal | Fayl | SHA-256 (prefiks) | Sabab |
|---|---|---|---|
| Savatga | `apk/v1.1.2/*.apk` | `283783f0…`, `e13968d9…` | 1.2.0 bilan almashtirildi (tekshirilgan) |
| Savatga | `desktop/fayz-market-admin-1.1.2-*.{dmg,exe}` | `16b6d37b…`, `fd68f948…` | Xuddi shu |
| Savatga | `telegram/FayzMarket-*-v1.1.2.apk` | yuqoridagi APK’lar bilan bir xil | Takror nusxa |
| Savatga | `apk/fayz-market-*-debug.apk` (ildiz) | `v1.2.0/` bilan bir xil | Build skripti qoldirgan takror nusxa |
| Savatga | `RELEASE_MANIFEST-1.1.2.md` | — | Git’da saqlanadi: `docs/v1-expansion/RELEASE_MANIFEST-1.1.2.md` |
| **Tegilmadi** | `archive/v1.1.1/` | — | Telefonlardagi oxirgi tasdiqlangan versiya; ustidan yangilash testi uchun kerak |
| **Tegilmadi** | `backups/*.sql`, `*credentials*.txt`, signing kalitlari | — | Maxfiy va zaxira fayllar; tarqatilmasin |
