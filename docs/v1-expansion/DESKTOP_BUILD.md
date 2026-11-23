# Desktop admin (macOS va Windows)

**Texnologiya: Electron (mavjud `apps/desktop`).** Tauri o‘rniga Electron qoldirildi: ilova allaqachon Electron’da, admin UI bilan IPC ko‘prigi orqali bog‘langan; Tauri Rust toolchain va ko‘prikni qayta yozishni talab qilardi. Admin UI Android va desktop’da bir xil (`apps/admin`).

## Artefaktlar (`dist/desktop/`)

| Fayl | Platforma | Hajm | SHA-256 |
|---|---|---|---|
| `fayz-market-admin-1.1.1-macos-arm64.dmg` (v1.1.1) | macOS, Apple Silicon (arm64) | 107 789 138 bayt | `3923631d9aa93c133d3595e60f26cc07fc867df1adf4a2f79bf47af4d5b0fea9` |
| `fayz-market-admin-1.1.1-windows-x64-setup.exe` (v1.1.1) | Windows 10/11 x64 (NSIS) | 92 180 248 bayt | `6037d1721cdf21c520cc2c3dd5b0b9721a61354639cd66ca010191edc16964fb` |

Build:
```sh
node scripts/desktop-icon.mjs
VITE_API_URL=https://fayz-market-api.ilyosbeksalayev240.workers.dev npm run build -w @fayz/admin
VITE_API_URL=https://fayz-market-api.ilyosbeksalayev240.workers.dev node scripts/copy-admin.mjs
cd apps/desktop && npx electron-builder --mac dmg --arm64 && npx electron-builder --win nsis --x64
```

electron-builder `apps/desktop/release/` ga `Fayz-Market-Admin-macOS.dmg` / `Fayz-Market-Admin-Setup.exe` nomi bilan chiqaradi; `dist/desktop/` ga versiya va arxitektura ko‘rsatilgan nom bilan ko‘chiriladi (`fayz-market-admin-1.1.1-macos-arm64.dmg`, `fayz-market-admin-1.1.1-windows-x64-setup.exe`).

## Imkoniyatlar

Oyna, ikonka, «Fayz Market Admin» nomi; production API (IPC orqali, yo‘l va metod allowlist); OS bildirishnomasi (bosilsa buyurtma ochiladi); sessiya macOS Keychain / Windows DPAPI bilan shifrlangan; NSIS: o‘rnatish papkasini tanlash, Desktop va Start menyu yorliqlari, Uninstall.

## Sinov

- **macOS (shu Mac, arm64) — Verified:** `.app` ad-hoc imzosi `codesign --verify --deep --strict` dan o‘tdi, `CFBundleShortVersionString` 1.1.1, `hdiutil verify` → dmg checksum VALID, `app.asar` ichida production URL va MapLibre bundle. Paketlangan `.app` production’ga qarshi ishga tushirildi — **9/9** (`scripts/deploy-qa/desktop-smoke.mjs`): yuklanish, IPC ko‘prik, login → dashboard, OpenFreeMap xaritasi ilova ichida chizildi (`file://`, sandbox, WebGL), Keychain’da shifrlangan sessiya, qayta ochilganda tiklanish, faylda ochiq token yo‘q, logout tozalaydi. Yangi buyurtma bildirishnomasi production katalogi bo‘sh bo‘lgani uchun bu yerda yaratilmadi (lokal UI sinovida o‘tgan).
- **Windows — Partial:** `.exe` macOS’da haqiqiy NSIS build (cross-build). Tekshirilgan: installer — Nullsoft self-extracting PE; ichidagi `Fayz Market Admin.exe` — PE32+ x86-64; `app.asar` da production URL va yangi bundle. **Windows’da ishga tushirilmagan** — o‘rnatish, oyna, bildirishnoma, DPAPI sessiya Windows kompyuterda sinalishi kerak.

## Imzo va notarizatsiya

- macOS: ad-hoc imzo (Apple Developer ID yo‘q), notarizatsiya yo‘q. Birinchi ochishda: o‘ng tugma → Open, yoki System Settings → Privacy & Security → «Open Anyway». Ommaviy tarqatish uchun Apple Developer Program ($99/yil) va notarizatsiya kerak.
- Windows: kod imzosi yo‘q — SmartScreen «Unknown publisher» ogohlantiradi («More info → Run anyway»). Ishonchli tarqatish uchun code-signing sertifikat kerak.
