# Desktop admin (macOS va Windows)

**Texnologiya: Electron (mavjud `apps/desktop`).** Tauri o‘rniga Electron qoldirildi: ilova allaqachon Electron’da, admin UI bilan IPC ko‘prigi orqali bog‘langan; Tauri Rust toolchain va ko‘prikni qayta yozishni talab qilardi. Admin UI Android va desktop’da bir xil (`apps/admin`).

## Artefaktlar (`dist/desktop/`)

| Fayl | Platforma | Hajm | SHA-256 |
|---|---|---|---|
| `Fayz-Market-Admin-macOS.dmg` | macOS, Apple Silicon (arm64) | 107 465 559 bayt | `06b823e0a7dbf09418274c84a2790ad030dab69d6bb3437799c9db30485c7404` |
| `Fayz-Market-Admin-Setup.exe` | Windows 10/11 x64 (NSIS) | 91 937 564 bayt | `017ab6f0f0ab473a30d3632a0fde46d9fba87869ee34e2ba6de9f8be40dca578` |

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

- **macOS (shu Mac, arm64):** paketlangan `.app` ishga tushirildi va CDP orqali production’ga qarshi sinaldi — 8/8 (`scripts/deploy-qa/desktop-smoke.mjs`): yuklanish, ko‘prik, login, dashboard, shifrlangan sessiya, qayta ochilganda tiklanish, faylda ochiq token yo‘q, logout tozalaydi. Yangi buyurtma bildirishnomasi productionda katalog bo‘sh bo‘lgani uchun bu yerda sinalmadi (lokal UI sinovida bildirishnoma oqimi o‘tgan).
- **Windows:** `.exe` macOS’da cross-build qilindi, PE32+ x64, ichida production URL va yangi bundle tekshirildi. **Windows’da ishga tushirilmagan** — mijozning Windows kompyuterida sinash kerak.

## Imzo va notarizatsiya

- macOS: ad-hoc imzo (Apple Developer ID yo‘q), notarizatsiya yo‘q. Birinchi ochishda: o‘ng tugma → Open, yoki System Settings → Privacy & Security → «Open Anyway». Ommaviy tarqatish uchun Apple Developer Program ($99/yil) va notarizatsiya kerak.
- Windows: kod imzosi yo‘q — SmartScreen «Unknown publisher» ogohlantiradi («More info → Run anyway»). Ishonchli tarqatish uchun code-signing sertifikat kerak.
