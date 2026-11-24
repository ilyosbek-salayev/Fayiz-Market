# Yetishmayotgan ishlar va ustuvorlik

| Prioritet | Ish | Holat | Tugash mezoni |
|---|---|---|---|
| P0 | Oshkor bo‘lgan production owner credential rotation | BLOCKED: foydalanuvchi tasdig‘i | Yangi parol xavfsiz kanal, barcha eski sessiyalar bekor, bootstrap secret lifecycle ko‘rigi; qiymat bu hujjatda yo‘q |
| P0 | Patch’ni production’ga chiqarish | BLOCKED: deploy tasdig‘i | Testdan o‘tgan aniq commit, DB backup, deploy, GET smoke; hozirgi Worker tuzatishlarni o‘z ichiga olmaydi |
| P1 | Haqiqiy SMS/email/Telegram onboarding | BLOCKED: hisob/credential | Test telefon/email bilan real kod yetishi, replay/expiry/rate limit va redirect sinovi |
| P1 | Android yopiq holatdagi FCM | PARTIAL | Backend sender + registration/DELETE + klient adapter kodi tayyor; FirebaseMessagingService, google-services konfiguratsiya, native token adapter va fizik sinov tugallanmagan |
| P1 | Fon rejimida kuryer GPS | NOT TESTED / implementatsiya yetishmaydi | Quyidagi foreground service dizayni + fizik OEM testlari |
| P1 | Haqiqiy Android regressiyasi | BLOCKED: qurilma | 20 customer check, admin kamera/galereya, biometrika, permissions, offline, upgrade va session saqlanishi |
| P1 | Windows o‘rnatish/ishlash/update/uninstall | BLOCKED: Windows | NSIS install, shortcut, login/API, picker/notification va uninstall |
| P1 | Aynan joriy release native/desktop smoke | NOT TESTED bo‘lgan joylar bor | Artefakt→source mapping + runtime QA yakuni |
| P2 | APK release signing va Play talablari | BLOCKED: distribution qarori/kalit | targetSdk yangilash, Android 13+ notification permission UX, release key custody. Debug key bilan Play release qilinmaydi |
| P2 | Apple Developer ID/notarization, Windows signing | BLOCKED: hisob/sertifikat | Imzolangan/notarized installer va OS trust tekshiruvi |
| P2 | Dependency upkeep | VERIFIED (joriy audit) / doimiy vazifa | Minimatch scoped override bilan yakuniy audit 0. Keyingi release oldidan audit takrorlanadi |
| P2 | Checkout retry idempotency | MISSING | Tarmoq uzilgan paytda server order yaratib ulgurgan bo‘lsa qayta bosishda duplicate order bo‘lmasligi; persistent idempotency contract/migration kerak |
| P2 | Monitoring, backup restore drill, retention | MISSING / NOT TESTED | Alert owner, restore mashqi, OTP/session/audit saqlash muddati, recovery runbook |
| P2 | Account enumeration | PARTIAL | Register PHONE_TAKEN/EMAIL_TAKEN javoblari mavjud; per-IP limit bor. Biznes UX bilan umumiy javobga o‘tish qarori kerak |
| P3 | README V1.0 va workspace package versionlari | PARTIAL | Runtime label endi root 1.1.2 metadata; package ichki contract versiyalari alohida |

## Rozilikli Android foreground location service dizayni

Hozir yangi xizmat yoqilmadi. Delivery qabul qilinganda aniq «Yetkazish davomida lokatsiyani ulashish» roziligi, nima uchun va qachon to‘xtashi tushuntiriladi. Xizmat faqat ko‘rinib turgan activity’dan, foydalanuvchi bosgandan va location permission berilgandan keyin boshlanadi. `foregroundServiceType="location"`, `FOREGROUND_SERVICE` va tegishli target uchun `FOREGROUND_SERVICE_LOCATION`; coarse/fine ruxsatlar. Ongoing notification’da ulashish holati va «To‘xtatish» amali; Android 13+ notification ruxsatini alohida boshqarish.

Delivery handover/cancel/reassign/logout, server 401/403/409 yoki ruxsat bekor qilinishida service to‘xtaydi, navbat va credential tozalanadi. Permission yo‘qolsa qayta-qayta yashirin ishga tushmaydi. Process restart’da foydalanuvchi roziligini chetlab o‘tadigan auto-start yo‘q. Backend har bir nuqta uchun active assignment’ni tekshiradi. Offline nuqtalar cheklangan va vaqt tamg‘ali; eski nuqtani «live» ko‘rsatmaslik. OEM battery saver, ekran o‘chiq, approximate location, revoke va force-stop fizik sinovlari shart. Background permission faqat alohida isbotlangan ehtiyoj va platforma siyosati bilan; odatiy visible-start foreground service uchun o‘z-o‘zidan so‘ralmaydi.

[Rasmiy service talablari](https://developer.android.com/develop/background-work/services/fgs/service-types), [background start cheklovlari](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start).
