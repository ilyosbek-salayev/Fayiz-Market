# Arxitektura

Mavjud arxitektura saqlandi: **React + Vite UI → Java WebView APK / Electron → Cloudflare Worker → D1 + R2**. Yangi ilova yaratilmadi; kuryer admin ilovasining ichida.

## Backend modullari (`apps/api/src`)

| Fayl | Vazifa |
|---|---|
| `index.ts` | asl V1 marshrutlari (kontrakt saqlangan) + yangi modullarni ulash, kuryer cheklovi |
| `lib.ts` | umumiy yordamchilar: xatolar, JSON (noto‘g‘ri JSON → 400), D1 rate-limit, audit, `order_events` |
| `customers.ts` | OTP, ro‘yxatdan o‘tish, parol login/tiklash, Telegram, bog‘lash, sessiyalar, `/customer/orders` |
| `delivery.ts` | tayinlash, kuryer amallari, joylashuv, kuzatuv, tasdiq/e’tiroz/hal qilish, sharhlar |
| `staff.ts` | xodimlar, parol, bildirishnoma lentasi, sharh moderatsiyasi, audit, integratsiyalar |
| `lifecycle.ts` | holat jadvali (sof funksiyalar, unit test) |
| `telegram.ts`, `otp.ts`, `push.ts`, `password.ts` | Telegram HMAC, OTP + Eskiz, FCM v1, PBKDF2 |

## Ma’lumotlar (migratsiya `0005_expansion.sql`)

Qo‘shimcha: `customers`, `customer_sessions`, `otp_codes`, `rate_limits`, `telegram_auth_replays`, `deliveries`, `delivery_locations` (faqat oxirgi nuqta), `order_events`, `audit_log`, `notifications`, `push_tokens`, `product_reviews`, `courier_ratings`; `orders` ga `customer_id`, `delivery_lat/lng`, `delivery_details`.
`admins` jadvali `courier` rolini qo‘shish uchun 1:1 qayta qurildi (ID, parol hashlari, sessiyalar saqlandi; production va telefon-test nusxasida sinaldi, `foreign_key_check` toza).

## Holatlar

`orders.status` o‘zgarmadi (o‘rnatilgan ilovalar uchun). Kuryer bosqichlari `deliveries.status` da; API ikkalasidan **`stage`** hisoblaydi:

| Topshiriqdagi holat | Fayz Market |
|---|---|
| PENDING | `new` → stage `pending` |
| CONFIRMED | `confirmed`/`preparing` → `confirmed` |
| ASSIGNED / COURIER_ACCEPTED | delivery `assigned` / `accepted` |
| PICKED_UP / ON_THE_WAY / ARRIVED | delivery `picked_up` / `on_the_way` / `arrived` (order `shipped`) |
| DELIVERED_PENDING_CONFIRMATION | delivery `handed_over` |
| DELIVERED | mijoz tasdig‘i (`confirmed`) yoki audit bilan admin hal qilishi (`resolved`) → order `delivered` |
| CANCELLED | `cancelled` |

## Klientlar

- Umumiy: `packages/ui/src/{native.ts, maps.tsx, stages.ts, expansion.css}`.
- Mijoz: `apps/customer/src/account.tsx` (auth, joylashuv, kuzatuv, tasdiq, sharh) + `main.tsx`.
- Admin: `apps/admin/src/expansion.tsx` (yetkazish bloki, xodimlar, integratsiyalar, sharhlar, rasm, bildirishnoma), `courier.tsx`.
- Android: yagona `apps/android/shared/java` (MainActivity, Biometrics, CaptureProvider).
- Desktop: `apps/desktop/main.cjs` (IPC API, Notification, safeStorage).

## Real vaqt

Cloudflare-mos eng sodda yechim: **polling** (kuryer joylashuvi ≥15 s yoki ≥30 m da yuboriladi; mijoz kuzatuvi 10 s; admin/kuryer lentasi 20 s; mijoz holatlari 30 s). Yangi real-time DB qo‘shilmadi. Kelajakda kerak bo‘lsa Durable Objects + WebSocket.
