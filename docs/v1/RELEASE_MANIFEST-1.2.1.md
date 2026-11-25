# dist/ — Fayz Market V1 release manifest

Joriy release candidate: **Fayz Market V1**, texnik versiya **1.2.1** (Android versionCode 8). Sana: 2026-11-25. Branch: `main`.
Hisobotlar: `docs/v1/UX_REFINEMENT_1.2.1.md`, `docs/v1/TEST_RESULTS.md` (§7), `docs/v1/RELEASE_REPORT.md`; metadata: `docs/v1/evidence/artifacts-1.2.1.json`.

| Ilova | Fayl yoʻli | Texnik versiya | Git SHA | Build vaqti | Hajm (bayt) | SHA-256 | Imzo | Sinov holati |
|---|---|---|---|---|---|---|---|---|
| Fayz Market (mijoz, Android) — **release** | `dist/apk/v1.2.1/fayz-market-customer.apk` | 1.2.1 / vc 8, `uz.fayzmarket.customer` | `625ea54` | 2026-11-25 07:37 | 1033337 | `c9967222410d1801bccc8cd07088fc0edf2ae408f4d610125b07dd3346fbd682` | v1+v2, oldingi build’lar bilan bir xil sertifikat (`93f0f845…f89851`); debuggable emas | EMULATOR: debug 1.2.0 ustidan release 11/11; V1 oqimlari (debug build) 14/14. Fizik telefon (1.2.1) **NOT TESTED** |
| Fayz Market Admin (Android) — **release** | `dist/apk/v1.2.1/fayz-market-admin.apk` | 1.2.1 / vc 8, `uz.fayzmarket.admin` | `625ea54` | 2026-11-25 07:37 | 1081011 | `bc1c58d467d7a60d799073cde7fb1e8af8a28d050cd9fe94f618ed6da6f5bf90` | Xuddi shu; debuggable emas | EMULATOR PASS (login’da server tugmasi yoʻq, production); fizik telefon (1.2.1) **NOT TESTED** |
| Fayz Market Admin (macOS) | `dist/desktop/fayz-market-admin-1.2.1-macos-arm64.dmg` | 1.2.1, arm64 | `23175e0` | 2026-11-25 07:55 | 121767111 | `6dd5c7fb827c00b28ad9be2b24f516d46d30f4ac2cf7596263ede8e83ce89b3f` | ad-hoc (Gatekeeper rejected, notarization yoʻq) | Read-only smoke 11/11, brend va login 5/5; owner login **NOT TESTED** (production’ga yozmaslik) |
| Fayz Market Admin (Windows) | `dist/desktop/fayz-market-admin-1.2.1-windows-x64-setup.exe` | 1.2.1, x64 | `23175e0` | 2026-11-25 07:55 | 122462366 | `f0d008ca46b99a68a63497bf342f1570405e251175e34ac2a7aca670523de89e` | Imzosiz | Build yaxlitligi, bundle macOS bilan bir xil; **Windows’da NOT TESTED** |

`23175e0` va `625ea54` orasidagi farq faqat test skriptlari (ilova kodi bir xil).

Server: production’da 1.2.1 — migratsiya 0008 + Worker Version `6955fdd2-e5ac-4cd7-bdc3-0a0ded818e95` (2026-11-25, egasining ruxsati bilan; read-only smoke 11/11). Telefon+kod bilan kirish SMS (Eskiz) ulangandan keyin ishlaydi.

Debug APK’lar (ishlab chiquvchi va emulyator sinovi uchun) `apps/android/*/build/outputs/apk/debug/` da; ular tarqatilmaydi.

Qolgan papkalar: `archive/v1.1.1/` (eski tasdiqlangan versiya), `backups/`, `*credentials*.txt` (maxfiy; tarqatmang). 1.2.0 fayllari macOS Savatiga koʻchirildi (`~/.Trash/fayz-dist-1.2.0-20261125-075617/`), roʻyxati `docs/v1/evidence/dist-before-1.2.1.txt`.
