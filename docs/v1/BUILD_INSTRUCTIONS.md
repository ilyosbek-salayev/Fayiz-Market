# Fayz Market: Android telefon sinovi

## Tayyor APKlar

- Mijoz: `dist/apk/fayz-market-customer-debug.apk`
- Admin: `dist/apk/fayz-market-admin-debug.apk`

Ikkalasi alohida Android paket (`uz.fayzmarket.customer`, `uz.fayzmarket.admin`). Interfeyslar APK ichida; katalog, login va buyurtmalar uchun API ulanishi kerak. Expo faol buildda ishlatilmaydi. Bu debug APKlar lokal sinov uchun, Google Play release emas.

## Lokal API

Mac va telefon bir Wi-Fi tarmogʻida boʻlsin. Mac IP manzilini `ipconfig getifaddr en0` bilan oling. Hozirgi APKlar `192.168.1.106:8787` manziliga sozlangan. IP oʻzgarsa ilovadagi **API manzili** tugmasi bilan `http://YANGI_IP:8787` ni kiriting.

Macdagi terminalni sinov davomida ochiq qoldiring:

```sh
cd apps/api
npx wrangler dev --local --ip 0.0.0.0 --port 8787 --persist-to .local-phone-db --var PUBLIC_BASE_URL:http://YANGI_IP:8787
```

`apps/api/.dev.vars` ichida `BOOTSTRAP_SECRET` boʻlishi kerak. Lokal D1/R2 maʼlumotlari `apps/api/.local-phone-db/` da, sinov admin email/paroli `dist/phone-test-credentials.txt` da. Ikkalasi Gitga kiritilmaydi. Mac yoki Worker oʻchirilsa, telefon APIga ulanmaydi. Mac firewall 8787 portiga ruxsat berishi kerak.

APKlarni telefonga yuborib alohida oʻrnating yoki USB debugging bilan:

```sh
adb install -r dist/apk/fayz-market-customer-debug.apk
adb install -r dist/apk/fayz-market-admin-debug.apk
```

Sinash tartibi: adminda login → mahsulot narxi yoki qoldigʻini oʻzgartirish → mijoz ilovasida **Yangilash** → mahsulotni savatga qoʻshish → ism, `+998` telefon va manzil bilan buyurtma berish → adminda buyurtmani tasdiqlash → mijozda **Buyurtmalar → Yangilash**. Toʻlov tugmasi faqat qoʻlda qabul qilingan summani qayd etadi; sinov toʻlovlari lokal bazada qoladi.

## Qayta build

Node.js 22+, JDK 17, Android SDK platform 35, build tools 34/35 va platform tools kerak. Bu mashinada JDK `~/.fayz-toolchain/jdk/Contents/Home`, SDK `~/.fayz-toolchain/android-sdk` da (`/private/tmp` qayta yoqilganda o‘chib ketgani uchun ko‘chirildi).

```sh
npm ci
JAVA_HOME=/path/to/jdk17 ANDROID_HOME=/path/to/android-sdk npm run build:apks -- -PfayzApiUrl=http://YOUR_LAN_IP:8787
shasum -a 256 dist/apk/*.apk
```

Build skripti ikkala interfeysni TypeScript/Vite orqali yigʻadi, APK assets ichiga joylaydi, Gradle bilan ikkita debug APK yaratadi va SHA-256 chiqaradi.

Haqiqiy telefon bu ish muhitiga ulanmagan. Fizik qurilma UX, Wi-Fi, Android WebView, fayl tanlash va klaviatura xatti-harakati hali tekshirilmagan. Release signing, AAB, Windows `.exe`, Cloudflare production va Google Play bajarilmadi.
