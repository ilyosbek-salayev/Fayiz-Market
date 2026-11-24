# Release readiness — 1.1.2 nomzodi

**Tijoriy topshirish: NO-GO.** Lokal tuzatishlar/buildlar mavjud; production patch deploy, oshkor owner credential rotation, real integratsiyalar va fizik platforma QA tugallanmagan. Eski 1.1.1 fayllari yangi tuzatishlar bor deb qayta nomlanmadi yoki o‘chirilmadi.

## Git va source

Local `feat/v1-premium-ui` HEAD `91c1416`; GitHub remote premium `2dd4f66`; default `feat/v1-complete`=`8e58d04`. Premium local default’dan 20 commit oldinda, remote premium’dan 1 commit oldinda. `evidence/remote-refs.txt` tarmoqdan tekshirildi. Audit o‘zgarishlari commit/push qilinmagan. Branch delete, force push va merge bajarilmadi.

Tavsiya: audit patchlarini `codex/release-readiness-1.1.2` kabi branchga review uchun ajratish, 1.1.1 baseline bilan PR diff, bitta release source commit/tag va manifest. Default branchni o‘zgartirish/merge faqat egasi tasdig‘idan so‘ng. Hozir 1.1.2 buildlar `91c1416 + uncommitted audit changes`; yangi release commit SHA yo‘q. Source holati fayllar xeshi bilan dalilda saqlanadi; bu tag o‘rnini bosmaydi.

## Platformalar

| Platforma | Build/artefakt | Runtime va cheklov |
|---|---|---|
| Android Customer/Admin | 1.1.2, versionCode 6; package ID saqlandi, debug imzo bir xil | NOT TESTED: fizik/native launch, biometric/camera/GPS/notification va in-place upgrade. targetSdk 28, release/Play tayyor emas |
| macOS | arm64, Electron 45.4.1 nomzod; ad-hoc signing | Read-only smoke; owner login va to‘liq operatsion oqim production’da bajarilmadi. Developer ID/notarization yo‘q |
| Windows | x64 NSIS, Electron 45.4.1 nomzod | Build tekshiruvi; Windows runtime/shortcut/picker/notification/uninstall/update NOT TESTED; signing yo‘q |
| Cloudflare | Hozir production `9ff0b7fb…`, existing D1 0001–0006 | GET 11/11; yangi patch/dependencylar deploy qilinmagan; byte-level remote source equality tasdiqlanmagan |

## Artefaktlar

Hajm/SHA-256/package/architecture/source/test holati: `evidence/artifacts.json`, yangi nomzod manifesti `dist/RELEASE_MANIFEST-1.1.2.md`. Eski 1.1.1 hashlar `dist/RELEASE_MANIFEST.md` bilan solishtirildi. Android’da native `.so` yo‘q: Java/WebView universal APK; OS WebView arxitekturasi qurilmaga bog‘liq. Windows installer stub PE32 bo‘lishi ichidagi x64 dasturga zid emas.

Package ID: `uz.fayzmarket.customer`, `uz.fayzmarket.admin`. Eski va yangi debug certificate SHA-256 `93f0f84579729ab0348d6910253a85281326811b66c7ad98f788e0a5c2f89851`; bu texnik update compatibility, real update testining o‘rnini bosmaydi. Ilovani uninstall qilmay ustidan update qilish kerak; release kalit almashtirilsa eski debug install ustidan update bo‘lmaydi.

## Release gate

1. Aniq patch commit va artifact/source mappingni yakunlash, review.
2. Credential rotation va barcha eski sessiyalar revoke uchun tasdiq.
3. Haqiqiy OTP/Telegram/FCM uchun konfiguratsiya va acceptance test.
4. Fizik Android va Windows checklist; Android runtime permission/upgrade, macOS operatsion smoke.
5. Do‘konning guest/registered checkout, background GPS/push talablari bo‘yicha aniq xizmat darajasi.
6. Backup/restore, monitoring, support owner va rollback rejasi.
7. Alohida deploy/push tasdig‘i; production’da faqat shundan keyin patchni qo‘llash va read-only smoke.

## Post-Codex yangilanish (Claude, 2026-11-25)

- **Git:** Codex o‘zgarishlari o‘zgartirilmasdan `main` branchga commit qilindi (`1d66a73`). `main` = `feat/v1-premium-ui` (u `feat/v1-complete` va `feat/v1-native-apks`ni to‘liq o‘z ichiga oladi) + audit + Cloudflare tuzatishi + QA/hujjatlar. Push/merge qilinmadi; boshqa branchlar o‘chirilmadi.
- **Cloudflare Workers Build xatosi tuzatildi:** ildizda `wrangler.toml` yo‘qligi sabab `npx wrangler deploy` “workspace root” xatosi bilan yiqilardi. Ildiz konfiguratsiyasi `[env.production]` bilan bir xil, drift testi bor. Diqqat: build ulangan branch’ga push production’ga avtomatik deploy qiladi.
- **Artefaktlar endi aniq commit’ga bog‘langan:** APK `b03fb5c`, desktop `7ce81cf`. Manifest: `docs/v1-expansion/RELEASE_MANIFEST-1.1.2.md`.
- **Runtime:** Android emulyatorda upgrade/xarita/native QA PASS, macOS read-only smoke PASS. Fizik telefon va Windows hali NOT TESTED.
- **Yakuniy baho:** texnik **release candidate** tayyor; mijozga tijoriy topshirish uchun hali **NO-GO** (credential rotation, production’ga patch deploy, fizik qurilma/Windows QA, real provayderlar). Batafsil: `docs/v1-expansion/POST_CODEX_FINAL_REPORT.md`.
