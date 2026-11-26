# dist/ — Fayz Market V1 release manifest

Joriy release candidate: **Fayz Market V1**, texnik versiya **1.2.2** (Android versionCode 9).

- Sana: 2026-11-26.
- Branch: `main`.
- Kod: `94ac876`.
- Hisobot: `docs/v1/REAL_DEVICE_QA_FIX_REPORT.md`; sinovlar: `docs/v1/TEST_RESULTS.md` §8.

| Ilova | Fayl yoʻli | Texnik versiya | Git SHA | Build vaqti | Hajm (bayt) | SHA-256 | Imzo | Sinov holati |
|---|---|---|---|---|---|---|---|---|
| Fayz Market (mijoz, Android) — **release** | `dist/apk/v1.2.2/fayz-market-customer.apk` | 1.2.2 / vc 9, `uz.fayzmarket.customer` | `94ac876` | 2026-11-26 20:45 | 1039773 | `7f9f45d6cc4b20767f2bfb234a585f8ebbbca52d846c250844e23881b42cec36` | Oldingi build’lar bilan bir xil sertifikat (`93f0f845…f89851`); debuggable emas | EMULATOR: oʻrnatilgan 1.2.1 ustidan release 11/11; V1 oqimlari (debug, lokal Worker) 15/15; fizik telefon **NOT TESTED** |
| Fayz Market Admin (Android) — **release** | `dist/apk/v1.2.2/fayz-market-admin.apk` | 1.2.2 / vc 9, `uz.fayzmarket.admin` | `94ac876` | 2026-11-26 20:45 | 1086822 | `3799536e76ef7d19f71db98d2a79bb6b3f1aea47a98b071205e1b041fbb4de96` | Xuddi shu; debuggable emas | EMULATOR PASS (login’da server tugmasi yoʻq, production); fizik telefon **NOT TESTED** |
| Fayz Market Admin (macOS) | `dist/desktop/fayz-market-admin-1.2.2-macos-arm64.dmg` | 1.2.2, arm64 | `94ac876` | 2026-11-26 20:47 | 121771748 | `6f61fd57d1cf7fc7250c28ab00d5909662eb68f74093975baf7c1baa0c090f23` | Ad-hoc (notarizatsiya yoʻq) | Read-only smoke 11/11; brend va login 5/5. Owner login **NOT TESTED** (production’ga yozmaslik uchun) |
| Fayz Market Admin (Windows) | `dist/desktop/fayz-market-admin-1.2.2-windows-x64-setup.exe` | 1.2.2, x64 | `94ac876` | 2026-11-26 20:47 | 122467722 | `58880657bd7c6d37f0b6821d5481a67e7fb826e7614d3915049f0aabd4f472c6` | Imzosiz | Bundle macOS bilan bir xil; **Windows’da NOT TESTED** |

## Server bilan moslik

**Production’da 1.2.2** (2026-11-26, egasining ruxsati bilan): migratsiya 0009 + Worker Version `ae2ae8d6-15bc-46c0-a9a8-591bc42b83e1`, read-only smoke 11/11. Endi `main` push xavfsiz: Git build xuddi shu kodni deploy qiladi.

> Rollback: `cd apps/api && npx wrangler rollback 31ac4af9-6b12-45ba-b711-938ce320440f --env production` — 1.2.1 kodi 0009 sxemasida 154/154 ishlashi tasdiqlangan.

## Qolgan fayllar

- **Debug APK’lar** (ishlab chiquvchi va emulyator sinovi uchun): `apps/android/*/build/outputs/apk/debug/`. Ular tarqatilmaydi.
- **Qolgan papkalar:** `archive/v1.1.1/`, `backups/`, `*credentials*.txt` (maxfiy, tarqatmang).
- **1.2.1 fayllari** macOS Savatiga koʻchirildi: `~/.Trash/fayz-dist-1.2.1-20261126-204838/`. Roʻyxat: `docs/v1/evidence/dist-before-1.2.2.txt`.
