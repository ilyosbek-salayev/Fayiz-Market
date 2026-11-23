# Bildirishnomalar

Qaror manbai — Cloudflare Worker. Hodisalar D1 `notifications` jadvaliga yoziladi; FCM sozlansa qo‘shimcha push ham yuboriladi.

| Kimga | Qachon |
|---|---|
| Admin (owner/manager) | yangi buyurtma; kuryer rad etdi; topshirildi; mijoz tasdiqladi; mijoz e’tirozi |
| Kuryer (faqat o‘ziga) | tayinlandi; boshqa kuryerga o‘tkazildi; buyurtma bekor qilindi |
| Mijoz | tasdiqlandi, kuryer qabul qildi, kuryerda, yo‘lda, yetib keldi, tasdiqlang, yetkazildi, bekor qilindi (ilovada holat o‘zgarishidan; FCM sozlansa push) |

## Yetkazish usuli va real holat

| Holat | Android APK | macOS / Windows desktop |
|---|---|---|
| Ilova ochiq | ✅ ilova ichidagi banner + tizim bildirishnomasi (kanallar «Ish jarayoni», «Buyurtmalar»), bosilsa buyurtma ochiladi | ✅ banner + OS bildirishnomasi, bosilsa buyurtma ochiladi |
| Minimallashgan / fonda | ⚠️ WebView JS ishlashda davom etsa ishlaydi; Android jarayonni to‘xtatishi mumkin — kafolat yo‘q | ✅ minimallashgan oynada ishlaydi; oyna yopilsa (macOS’da ilova Dock’da qolsa ham) polling to‘xtaydi — oynani qayta ochguncha yo‘q |
| Ilova to‘liq yopiq | ⛔ FCM kerak | ⛔ ilova ishga tushirilguncha yo‘q |
| Qurilma qayta yoqilgandan keyin | ⛔ FCM kerak | ilova ochilgach, saqlangan sessiya bilan davom etadi |

- Takror yo‘q: har qurilma oxirgi ko‘rilgan ID ni saqlaydi; birinchi ishga tushishda eski xabarlar ko‘rsatilmaydi.
- Android 13+: `targetSdk 28` bo‘lgani uchun tizim birinchi kanal yaratilganda ruxsat so‘raydi.
- Lock-screen: shaxsiy ma’lumotsiz.

## FCM (bloklangan — Firebase loyihasi kerak)

Backend tayyor: `push.ts` (service account JWT → OAuth → FCM HTTP v1, yaroqsiz tokenlarni o‘chirish, xato hisoblagich), `POST /admin/push-token`, `POST /customer/push-token`.
Kerak: Firebase loyihasi, ikkala paket uchun `google-services.json`, Android’ga Firebase Messaging client (Gradle dependency) va `FCM_SERVICE_ACCOUNT` secret. Bu bajarilmaguncha ilova yopiq holatdagi push **yo‘q** — da’vo qilinmaydi.
