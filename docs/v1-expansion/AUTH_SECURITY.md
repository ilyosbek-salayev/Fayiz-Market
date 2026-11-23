# Autentifikatsiya va xavfsizlik

## Mijoz

| Usul | Qanday ishlaydi |
|---|---|
| Telefon + SMS | `POST /auth/otp` → 6 xonali tasodifiy kod, faqat tuzli SHA-256 saqlanadi, 5 daqiqa, 5 urinish, bir martalik. Limit: IP 20/soat, raqam 5/soat va 60 s. Provayder sozlanmagan bo‘lsa — **503**, soxta “yuborildi” yo‘q |
| Email + kod | `POST /auth/email/otp` (register / login / reset / link) → xuddi SMS kabi 6 xonali, tuzli hash, 5 daqiqa, 5 urinish, 60 s qayta yuborish, email 5/soat, IP 20/soat. Parolsiz kirish (`/auth/email/login`) faqat tasdiqlangan email uchun; noma’lum email uchun javob muvaffaqiyatdek, lekin xat yuborilmaydi. Ro‘yxatdan o‘tishda parol ixtiyoriy. Provayder (Resend) sozlanmagan → **503** `EMAIL_NOT_CONFIGURED` |
| Lokal test kodi | Faqat `ENVIRONMENT=development` **va** `http://` URL **va** `OTP_DEV_ECHO=1` (izolyatsiyalangan Worker). Production’da kod javobda hech qachon qaytmaydi (unit test + production tekshiruvi). Batafsil: [TEST_MODES](TEST_MODES.md) |
| Parol | PBKDF2-SHA256 100 000 (Workers maksimumi), 32 bayt salt; telefon **yoki tasdiqlangan email** bilan kirish; limit identifikator 5/15 daq, IP 30/15 daq |
| Parol tiklash | SMS yoki email kod bilan; barcha qurilmalardagi sessiyalar yopiladi. Noma’lum raqam uchun javob bir xil (raqamni oshkor qilmaydi) |
| Telegram | Rasmiy `oauth.telegram.org` redirect. Server `HMAC_SHA256(SHA256(bot_token), data_check_string)` ni tekshiradi, 10 daqiqadan eski / kelajak sanali rad etiladi, har bir imzolangan payload **bir marta** (replay jadvali) |
| Bog‘lash | Telegram akkaunti telefonni faqat SMS kod bilan qo‘shadi; band raqam/Telegram boshqa akkauntga bog‘lanmaydi (dublikat yo‘q). Telegram telefon raqamini bermaydi deb hisoblanadi |
| Sessiya | 30 kun, `Authorization: Customer <token>` (admin `Bearer` va buyurtma `Order` tokenlaridan alohida) |
| Biometrika | Android 9+ BiometricPrompt + Keystore AES-GCM (`setUserAuthenticationRequired`, yangi barmoq izi qo‘shilsa kalit bekor). Barmoq izi ma’lumoti ilovaga kelmaydi; u faqat shifrlangan sessiyani ochadi, backend avtorizatsiyasi o‘zgarmaydi. Zaxira: parol |

## Xodimlar

- Rollar: `owner` = SUPER_ADMIN, `manager` = ADMIN, `courier` = COURIER. Rol faqat serverda (`admins.role`) — klient tanlovi yo‘q.
- Kuryer `/admin/*` dan faqat `me, logout, password, notifications, push-token` ga kira oladi; `/courier/*` faqat kuryerga.
- O‘chirilgan xodim kira olmaydi, sessiyalari darhol bekor. Oxirgi super admin o‘chirilmaydi/pasaytirilmaydi, o‘zini bloklay olmaydi.
- Parol: o‘zi (joriy parol bilan, limit 5/15 daq) yoki super admin tiklaydi (sessiyalar yopiladi, audit). Email orqali tiklash yo‘q (email provayder yo‘q).
- Mobil: biometrik qulf; desktop: sessiya macOS Keychain / Windows DPAPI bilan shifrlangan (`safeStorage`), logout o‘chiradi.

## Ma’lumot maxfiyligi

- Kuryer faqat o‘z yetkazishini ko‘radi; telefon/manzil/koordinata faqat faol bosqichda, yakundan keyin yashiriladi.
- Mijoz faqat o‘z buyurtmasini kuzatadi (token yoki akkaunt); kuryer joylashuvi faqat `picked_up…arrived` da, eskirgani “jonli” deb ko‘rsatilmaydi (120 s).
- Joylashuv tarixi saqlanmaydi: har buyurtmaga faqat oxirgi nuqta, yetkazish tugaganda o‘chiriladi.
- Staff bildirishnomasida shaxsiy ma’lumot yo‘q (raqam, dona, summa); Android lock-screen’da “Yangi bildirishnoma”.
- Audit: tayinlash, hal qilish, xodim o‘zgarishi, parol tiklash, integratsiya o‘zgarishi/testi, sharh moderatsiyasi.
- Secretlar faqat Cloudflare secret; `/admin/integrations` faqat “bor/yo‘q” qaytaradi (test bilan tasdiqlangan), loglarga yozilmaydi.
