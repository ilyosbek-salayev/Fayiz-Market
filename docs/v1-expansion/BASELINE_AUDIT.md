# Boshlang‘ich audit (kengaytirishdan oldin, 2026-11-22)

## Git

- Branch: `feat/v1-premium-ui`. HEAD: `d17c0c6` (premium UI). Deploy ishi commit qilinmagan edi — avval `30b935f` sifatida saqlandi.
- `CLAUDE.md`, `AGENTS.md` yo‘q. O‘qilgan hisobotlar: `docs/ui-redesign/*`, `docs/deployment/*`, `docs/v1/*`.

## Haqiqiy texnologiya

| Qism | Texnologiya |
|---|---|
| Mijoz va admin ilovasi | React 19 + Vite, **Java WebView** APK (`apps/android/{customer,admin}`), UI `<API>/__app/*` dan same-origin |
| Desktop admin | Electron 36 (`apps/desktop`), API chaqiruvlari main process orqali (IPC) |
| Backend | Cloudflare Worker (Hono), D1, R2 |
| Expo | yo‘q (`apps/mobile` — ishlatilmaydigan eski papka) |

## Cloudflare (tekshirilgan)

- `wrangler whoami`: ilyosbeksalayev240@gmail.com, akkaunt `8c9b943e…4482ca` (yagona).
- Worker `fayz-market-api` ishlaydi (`/health` 200). D1 `fayz-market` (0001–0004). Ma’lumot: 1 owner, 0 mahsulot/buyurtma.
- **R2: foydalanuvchi faollashtirgan** — `fayz-market-images` bucket yaratildi, `IMAGES` binding ulandi, yuklash productionda tasdiqlandi (74/74).

## Sxema va rollar (kengaytirishdan oldin)

- `admins.role CHECK IN ('owner','manager')` — kuryer roli yo‘q.
- `orders.status CHECK IN ('new','confirmed','preparing','shipped','delivered','cancelled')`, D1 trigger faqat bir qadamli o‘tishga ruxsat beradi.
- Mijoz akkaunti yo‘q (mehmon buyurtma + qurilmadagi buyurtma tokeni). Sharh, kuryer, joylashuv, bildirishnoma yo‘q.

## Android imzo

- Ikkala APK `CN=Android Debug`, SHA-256 `93f0f845…f89851` = `~/.android/debug.keystore`. Paketlar `uz.fayzmarket.customer`, `uz.fayzmarket.admin`, versionCode 2.

## Bazaviy testlar

- `npm test` 7/7, typecheck o‘tdi, production API 74/74, UI regress (V1) — 39 tekshiruv.

## Bog‘liqlik xaritasi

```
R2 (faol) ──► kamera/galereya yuklash
0005 migratsiya ──► mijoz akkauntlari ──► sharh egasi, kross-qurilma buyurtmalar
               └──► kuryer roli ──► tayinlash ──► kuryer holatlari ──► kuzatuv ──► mijoz tasdig‘i ──► sharh/baho
Google Maps kaliti (tashqi) ──► interaktiv xarita (kalitsiz: GPS + koordinata + Google Maps havolasi)
Google Routes kaliti (tashqi) ──► masofa/ETA (kalitsiz: navigatsiya havolasi)
Eskiz SMS (tashqi) ──► telefon OTP ro‘yxatdan o‘tish/parol tiklash
Telegram bot (tashqi) ──► Telegram login
Firebase (tashqi) ──► ilova yopiq bo‘lganda push
Android qobig‘i v1.1.0 ──► geolokatsiya, kamera, bildirishnoma, biometrika
```
