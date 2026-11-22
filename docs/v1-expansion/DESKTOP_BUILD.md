# Desktop admin (macOS va Windows)

**Texnologiya: Electron (mavjud `apps/desktop`).** Tauri o‘rniga Electron qoldirildi: ilova allaqachon Electron’da, admin UI bilan IPC ko‘prigi orqali bog‘langan; Tauri Rust toolchain va ko‘prikni qayta yozishni talab qilardi. Admin UI Android va desktop’da bir xil (`apps/admin`).

## Artefaktlar (`dist/desktop/`)

| Fayl | Platforma | Hajm | SHA-256 |
|---|---|---|---|
| `Fayz-Market-Admin-macOS.dmg` (v1.1.1) | macOS, Apple Silicon (arm64) | 107 789 050 bayt | `43fb79e0007fdcc90d2bd2c7a86071ea8bb3568071d28dcb01e76c8334d3c72b` |
| `Fayz-Market-Admin-Setup.exe` (v1.1.1) | Windows 10/11 x64 (NSIS) | 92 180 112 bayt | `16076e540a62d804a41d6b90458cad55239e5c630491153d1b35fbf907594d68` |

Build:
```sh
node scripts/desktop-icon.mjs
VITE_API_URL=https://fayz-market-api.ilyosbeksalayev240.workers.dev npm run build -w @fayz/admin
VITE_API_URL=https://fayz-market-api.ilyosbeksalayev240.workers.dev node scripts/copy-admin.mjs
cd apps/desktop && npx electron-builder --mac dmg --arm64 && npx electron-builder --win nsis --x64
```

## Imkoniyatlar

Oyna, ikonka, «Fayz Market Admin» nomi; production API (IPC orqali, yo‘l va metod allowlist); OS bildirishnomasi (bosilsa buyurtma ochiladi); sessiya macOS Keychain / Windows DPAPI bilan shifrlangan; NSIS: o‘rnatish papkasini tanlash, Desktop va Start menyu yorliqlari, Uninstall.

## Sinov

- **macOS (shu Mac, arm64) — Verified:** `.app` ad-hoc imzosi `codesign --verify --deep --strict` dan o‘tdi, `CFBundleShortVersionString` 1.1.1, `hdiutil verify` → dmg checksum VALID, `app.asar` ichida production URL va MapLibre bundle. Paketlangan `.app` production’ga qarshi ishga tushirildi — **9/9** (`scripts/deploy-qa/desktop-smoke.mjs`): yuklanish, IPC ko‘prik, login → dashboard, OpenFreeMap xaritasi ilova ichida chizildi (`file://`, sandbox, WebGL), Keychain’da shifrlangan sessiya, qayta ochilganda tiklanish, faylda ochiq token yo‘q, logout tozalaydi. Yangi buyurtma bildirishnomasi production katalogi bo‘sh bo‘lgani uchun bu yerda yaratilmadi (lokal UI sinovida o‘tgan).
- **Windows — Partial:** `.exe` macOS’da haqiqiy NSIS build (cross-build). Tekshirilgan: installer — Nullsoft self-extracting PE; ichidagi `Fayz Market Admin.exe` — PE32+ x86-64; `app.asar` da production URL va yangi bundle. **Windows’da ishga tushirilmagan** — o‘rnatish, oyna, bildirishnoma, DPAPI sessiya Windows kompyuterda sinalishi kerak.

## Imzo va notarizatsiya

- macOS: ad-hoc imzo (Apple Developer ID yo‘q), notarizatsiya yo‘q. Birinchi ochishda: o‘ng tugma → Open, yoki System Settings → Privacy & Security → «Open Anyway». Ommaviy tarqatish uchun Apple Developer Program ($99/yil) va notarizatsiya kerak.
- Windows: kod imzosi yo‘q — SmartScreen «Unknown publisher» ogohlantiradi («More info → Run anyway»). Ishonchli tarqatish uchun code-signing sertifikat kerak.
