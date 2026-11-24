# Mijozdan kerak bo‘ladigan ma’lumotlar

Secretlarni chat, Git yoki APK ichiga qo‘ymang. Credentialni xizmatning secret manageri/Cloudflare secret inputi orqali, cheklangan huquq bilan kiriting. Quyidagi hisoblar auditda yaratilmadi, pullik xizmat yoqilmadi.

| Xizmat | Talab qilinadigan narsa | Qayerdan / ulash | Xarajat |
|---|---|---|---|
| SMS (Eskiz) | SMS_PROVIDER=eskiz, ESKIZ_EMAIL, ESKIZ_PASSWORD, ESKIZ_FROM | Eskiz kabineti, sender va OTP shablon tasdig‘i; biznes hisob uchun provayder so‘ragan hujjatlar | SMS hajmi va amaldagi tarif; narx uydirilmadi |
| Email (Resend) | EMAIL_PROVIDER=resend, RESEND_API_KEY, EMAIL_FROM | Resend sending-only API key; o‘z domeni, DNS SPF/DKIM/DMARC mas’uli | Domen va provayder tarifi; limitni xizmat kabinetida tasdiqlash |
| Telegram | TELEGRAM_BOT_TOKEN, public telegram_bot_username | BotFather bot egasi, /setdomain real worker/custom domain; haqiqiy redirect test | API hisobida odatiy login bepul; botga egalik zarur |
| FCM | FCM_SERVICE_ACCOUNT server JSON; har ikki package uchun google-services.json | Firebase loyiha egasi; uz.fayzmarket.customer va uz.fayzmarket.admin; FCM HTTP v1 permission | FCM, boshqa Firebase xizmatlari yoqilmaydi; billingni hisobda tekshirish |
| OpenFreeMap | Kalit talab qilinmaydi | Attribution va provider availability monitoring | Public hosting bepul; SLA tekshirilmagan |
| Google Maps/Routes ixtiyoriy | restricted browser key, GOOGLE_ROUTES_KEY server key | Google Cloud billing, API va referrer restrictions, quotas | Faqat alohida rozilik bilan; majburiy emas |
| Cloudflare | Account owner, deploy/D1/R2 scope, backup siyosati | Hozir Worker/D1/R2 bor. Secret qo‘shish va deploy alohida tasdiqdan so‘ng | Workers/D1/R2 account quota/usage bo‘yicha |
| Android | Fizik Android telefonlar, distribution qarori, release key custody | USB debugging yoki qo‘lda QA; eski 1.1.1 ustidan update | Play hisob/signing/MDM ehtiyoji distributionga bog‘liq |
| Desktop | Windows x64 qurilma, Apple Developer ID va Windows sertifikat (agar trust release kerak bo‘lsa) | Signing egasi va notarization ruxsati | Sertifikat/hisob amaldagi tarifi |
| Operatsiya | Store manzili, kuryerlar, kontakt, yetkazish/qaytarish shartlari, privacy policy, retention, support owner | Do‘kon mas’uli tasdiqlaydi | Biznes/hujjat xarajatlari alohida |

## FCM uchun tayyor kod va qolgan ulash

Backend `apps/api/src/push.ts` OAuth/FCM v1 yuboradi. `POST /admin/push-token`, `POST /customer/push-token`, yangi authenticated `DELETE` endpointlari bor. `packages/ui/src/push-registration.ts` token o‘zgarganda unregister/register, signout’da server cleanup va native revoke ketma-ketligini beradi; unit testlar mavjud. Bu modul hali faol UI lifecycle’iga yoki native SDK’ga ulanmagan — **production FCM tayyor emas**.

Haqiqiy Firebase konfiguratsiya bilan Android modulga Firebase Messaging dependency va `FirebaseMessagingService` qo‘shiladi. `onNewToken` login mavjud paytda authenticated register’ni chaqiradi; login yo‘q bo‘lsa keyingi login’da sync. Logout oldidan adapter stop va SDK deleteToken; offline revoke qayta urinishi kerak. Service foreground data message’dan umumiy notification chiqaradi; background notification tap `orderId`ni MainActivityga beradi. Cold start’da UI tayyor bo‘lgandan keyin order ochiladi, auth qayta tekshiriladi. Guest order tokenlari push payloadga yozilmaydi; guest push binding alohida access contract talab qiladi.

Android 13+ POST_NOTIFICATIONS runtime UX, token refresh, boshqa accountga o‘tish, logout offline, permission denial, ilova killed va reboot testlari fizik qurilmada bajariladi. [Firebase rasmiy Android yo‘riqnomasi](https://firebase.google.com/docs/cloud-messaging/android/get-started).

## Tasdiq talab qiladigan yakuniy amallar

Production owner rotation (oldin oshkor bo‘lgan), secretlarni o‘rnatish, deploy, remote migration/resource yoki billing, GitHub push/merge. Ushbu audit hech birini bajarmadi. Tayyor commit va release matritsasini ko‘rib chiqib alohida tasdiqlash lozim.

## Cloudflare Git build (2026-11-25)

Dashboard → Workers & Pages → `fayz-market-api` → Settings → Build: production branch’ni `main` qiling (hozir build `feat/v1-premium-ui`dan qo‘lda ishga tushirilgan). Bu branch’ga har bir push production’ga deploy qiladi — branch himoyasi tavsiya etiladi. Root directory `/` va deploy command `npx wrangler deploy` o‘zgartirilmasin (repo shunga moslangan).
