# dist/ — Fayz Market V1 release manifest

Joriy release candidate: **Fayz Market V1**, texnik versiya **1.2.0** (Android versionCode 7). Sana: 2026-11-25. Branch: `main`.
Toʻliq hisobot: `docs/v1/RELEASE_REPORT.md`; sinovlar: `docs/v1/TEST_RESULTS.md`; metadata: `docs/v1/evidence/artifacts-1.2.0.json`.

| Ilova | Fayl yoʻli | Texnik versiya | Git SHA | Build vaqti | Hajm (bayt) | SHA-256 | Imzo | Sinov holati |
|---|---|---|---|---|---|---|---|---|
| Fayz Market (mijoz, Android) | `dist/apk/v1.2.0/fayz-market-customer-debug.apk` | 1.2.0 / vc 7, `uz.fayzmarket.customer` | `8799a70` | 2026-11-25 05:31 | 1145734 | `59462ea7690eddc3e98b7447b4afcfa695990485165987f2666692fb8d03e7a9` | Android Debug v1+v2 (`93f0f845…f89851`) | EMULATOR PASS (yangilash 12/12, V1 oqimlari 12/12); fizik telefon **NOT TESTED** |
| Fayz Market Admin (Android) | `dist/apk/v1.2.0/fayz-market-admin-debug.apk` | 1.2.0 / vc 7, `uz.fayzmarket.admin` | `8799a70` | 2026-11-25 05:31 | 1204235 | `37ff58af11f923ffaf7fa5de0cc2710f446d2e82754f3c2efa7423554a89e6dc` | Android Debug v1+v2 (`93f0f845…f89851`) | EMULATOR PASS; fizik telefon **NOT TESTED** |
| Fayz Market Admin (macOS) | `dist/desktop/fayz-market-admin-1.2.0-macos-arm64.dmg` | 1.2.0, arm64 | `9b17653` | 2026-11-25 05:39 | 121761024 | `3b3f8fc58b161d8a07c0f55e1a58f2d6379b0cae2208fd17f9ec339d259624d8` | ad-hoc (Gatekeeper rejected, notarization yoʻq) | Read-only smoke 11/11, brend 4/4; owner login **NOT TESTED** (production’ga yozmaslik) |
| Fayz Market Admin (Windows) | `dist/desktop/fayz-market-admin-1.2.0-windows-x64-setup.exe` | 1.2.0, x64 | `9b17653` | 2026-11-25 05:40 | 122460787 | `ba056588bbc3d96d521fc3b2199b785d3886732d21c4710db8c81af53aecd99d` | Imzosiz | Build yaxlitligi va bundle macOS bilan bir xil; **Windows’da NOT TESTED** |

Server: 0007 migratsiya + Worker deploy + `INTEGRATIONS_MASTER_KEY` 2026-11-25 da bajarildi (Version `43b2cc54…`, faol `90b70a16…`; read-only smoke 11/11). Distributivlarni tarqatish mumkin.

Qolgan papkalar:
- `archive/v1.1.1/` — telefonlarda boʻlgan oxirgi tasdiqlangan versiya (ustidan yangilash testi uchun).
- `backups/`, `*credentials*.txt` — maxfiy; tarqatmang.
- 1.1.2 RC fayllari macOS Savatiga koʻchirildi (`~/.Trash/fayz-dist-1.1.2-RC-20261125-054140/`), roʻyxati `docs/v1/evidence/dist-before-1.2.0.txt`.
