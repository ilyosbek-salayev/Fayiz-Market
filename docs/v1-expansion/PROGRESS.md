# V1 kengaytirish — progress (keyingi sessiya shu fayldan davom etadi)

Branch: `feat/v1-premium-ui` · Push qilinmagan · Expo va GitHub Actions yo‘q.

## Bajarilgan

| Faza | Holat | Dalil |
|---|---|---|
| 0. Stabilizatsiya | ✅ | `30b935f` deploy commit; R2 bucket `fayz-market-images` yaratildi va ulandi; production API 74/74 (R2 yuklash bilan) |
| 1. Identifikatsiya va rollar (backend) | ✅ | `97acbfa`; 0005 migratsiya productionda; lokal oqim testi 129/129; unit 20/20 |
| 4. Kuryer operatsiyalari (backend) | ✅ | o‘sha commit: tayinlash, versiyalar, kuryer amallari, joylashuv, tasdiq, e’tiroz, hal qilish |
| 5. Bildirishnomalar (backend) | ✅ | `notifications` lentasi + FCM v1 yuboruvchi (FCM secret yo‘q — bloklangan) |
| 6. Sharhlar (backend) | ✅ | faqat `delivered`dan keyin, takrorlanmaydi, moderatsiya |
| 7. Integratsiyalar (backend) | ✅ | `/admin/integrations` — secretlar faqat “bor/yo‘q” |
| Umumiy frontend modullari | ✅ (commitsiz) | `packages/ui/src/{native.ts,maps.tsx,stages.ts,expansion.css}`, yangi ikonkalar |
| Mijoz ekranlari komponentlari | ✅ (commitsiz) | `apps/customer/src/account.tsx` |

## Navbatda (tartib bilan)

1. `apps/customer/src/main.tsx`ga ulash: sessiya, AuthSheet, Telegram qaytishi, biometrik qulf, checkout joylashuvi, buyurtma kuzatuvi, tasdiq, sharhlar, holat bildirishnomalari.
2. Admin ilova: kuryer paneli (rol `courier`), buyurtma xaritasi + tayinlash, xodimlar, sharhlar, integratsiyalar, kamera/galereya yuklash, bildirishnoma polling.
3. Android qobig‘i (umumiy `apps/android/shared`): geolokatsiya, kamera (FileProvider), bildirishnomalar, BiometricPrompt + Keystore, tel:/navigatsiya, Telegram OAuth, versionCode 3.
4. Electron desktop: safeStorage sessiya, bildirishnomalar, macOS `.dmg` va Windows `.exe` build.
5. QA: lokal UI regress, production deploy, APK build, hujjatlar (`docs/v1-expansion/*`).

## Bloklangan (tashqi sozlama kerak)

- SMS (Eskiz.uz hisobi + secretlar), Telegram bot token + `/setdomain`, Google Maps browser kaliti (billing tasdig‘i), Google Routes kaliti, Firebase (google-services.json + service account) — kod tayyor, jonli ishlash hisob ma’lumotlarini kutadi.
- Haqiqiy telefon va Windows kompyuterida sinov.

## Muhim eslatmalar

- Lokal QA Worker: `scripts/deploy-qa/local-worker.sh <dir>` (port 8788, dev OTP faqat shu yerda), keyin `node scripts/deploy-qa/expansion-verify.mjs`.
- Production tozalash: `scripts/deploy-qa/cleanup-qa.sh <r2-kalitlar>` (avval D1 eksport qiladi).
- Foydalanuvchining eski `:8787` lokal serveri 0005 migratsiyasiz ishlaydi; kerak bo‘lsa: `npx wrangler d1 migrations apply fayz-market --local --persist-to .local-phone-db`.
