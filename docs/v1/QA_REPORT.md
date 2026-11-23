# QA hisoboti — 2026-11-22

## Oʻtgan tekshiruvlar

- `npm run typecheck`: API, admin va yangi mijoz interfeysi TypeScript tekshiruvlari.
- `npm test`: shared package 3/3 Vitest testi.
- Android uchun Vite build: mijoz va admin muvaffaqiyatli.
- Gradle `:customer:assembleDebug :admin:assembleDebug`: ikkala debug APK yaratildi; APK ichidagi HTML, JavaScript, CSS va DEX fayllari, ZIP yaxlitligi, paket identifikatori va debug imzosi tekshirildi.
- Toʻrtta D1 migratsiya yangi lokal bazaga qoʻllandi.
- Worker integratsiyasi: 38/38 tekshiruv oʻtdi. Login, rollar, katalog, R2 rasm, qidiruv, buyurtma, qoldiq, status, toʻlov, hisobot va logout qamrab olindi.
- Alohida telefon sinovi bazasida admin login → 3 mahsulot katalogi → savat summasi → buyurtma → mijoz tokeni orqali olish → admin roʻyxati → statusni oʻzgartirish → mijozda yangi status → toʻlov hisoboti API darajasida oʻtdi.
- `adb devices -l`: qurilmalar roʻyxati boʻsh.

## Tekshirilmagan ishlar

- Ikkala APKning haqiqiy Android telefonda oʻrnatilishi va ekranlarining ishlashi.
- Telefon Wi-Fi orqali Macdagi Workerga ulanishi, WebView checkout va admin login interaksiyasi.
- Admin ilovasida Android fayl tanlagichi bilan rasm yuklash.
- Turli ekranlar, klaviatura, aylantirish va Android versiyalari.
- Windows `.exe`, release AAB, production Cloudflare va Google Play.

## Qolgan xatarlar

- Debug APKlar lokal `http://` Workerga ulanadi. Mac va Worker ishlamasa API ishlamaydi; production uchun HTTPS va yangilangan target SDK kerak.
- Uchta sinov mahsuloti haqiqiy savdo katalogi emas.
- `npm install` auditida 13 ta dependency ogohlantirishi bor; release oldidan tekshirish kerak.

Testdagi toʻlov qaydi faqat lokal bazada. Real pul qabul qilingani bildirilmaydi.
