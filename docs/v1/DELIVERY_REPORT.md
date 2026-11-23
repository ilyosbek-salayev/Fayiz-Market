# APK yetkazish holati — 2026-11-22

Boʻsh klondan qayta qurilgan Worker API, D1/R2 va React admin saqlandi. Foydalanuvchi talabi boʻyicha faol Android build Expo ishlatmaydi: `apps/android` ichidagi ikki Java WebView ilovasi mijoz va admin interfeyslarini APK ichiga joylaydi.

`dist/apk/fayz-market-customer-debug.apk` va `dist/apk/fayz-market-admin-debug.apk` yaratildi. Lokal API integratsiyasi 38/38, shared testlar 3/3, ikki interfeys buildi va telefon sinovi bazasida buyurtma oqimi API testi oʻtdi. Vaqtinchalik lokal admin login `dist/phone-test-credentials.txt` da; Gitga kiritilmaydi.

Fizik Android telefon ADB orqali ulanmagan. APKlarning qurilmadagi UX va tarmoq xatti-harakati tasdiqlanmagan. Cloudflare production, Google Play, release signing va Windows `.exe` bajarilmadi. Bu debug sinov yetkazmasi; tijorat V1.0 yakuniy qabuli uchun haqiqiy qurilma QA kerak. Qadamlar `BUILD_INSTRUCTIONS.md` da.
