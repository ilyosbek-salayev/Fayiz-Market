# Xavfsizlik auditi

2026-11-24–25. Bu kod auditi va cheklangan regression tekshiruvi; to‘liq pentest yoki «zaiflik yo‘q» sertifikati emas. Production parol/secret qiymatlari qayta chiqarilmadi, almashtirilmadi. Test yozuvlari faqat alohida lokal D1/R2’da yaratildi.

## Aniqlangan va lokal tuzatilgan

| ID / prioritet | Muammo | Tuzatish | Dalil |
|---|---|---|---|
| S01 P1 | Parallel OTP so‘rovlari SELECT qilingan attempts orqali limitdan o‘tishi mumkin | `UPDATE … WHERE attempts < max … RETURNING` atomik budget | `security-regression`: 12 parallel so‘rovdan faqat 5 tekshiruv, 7 ta 429 |
| S02 P1 | Customer parolini almashtirganda boshqa sessiyalar qolardi | Joriy sessiyadan boshqa sessiyalar bir batch’da o‘chiriladi; current password attempts rate limit | Security regression: eski sessiya 401, joriy 200 |
| S03 P1 | Unknown account uchun ikki PBKDF2 hisoblash timing farqi; staff IP limit yo‘q | Bitta fixed dummy hash verification + staff per-IP limit | `audit-security.test.ts`, auth API suite |
| S04 P1 | Dev OTP faqat HTTP ekaniga tekshirilgan, tashqi HTTP host ham qabul qilinar edi | Faqat explicit development + loopback host | 8 URL holati unit test |
| S05 P1 | Android origin host-only, release menyusidan API almashtirish mumkin, Telegram sahifasida bridge qolardi | Scheme/host/port + userinfo tekshiruvi; release menu yopildi; Telegramda bridge olib tashlanadi; callback faqat bundle documentga; iframes/object/base CSP; release cleartext va backup o‘chiq | `OriginPolicy.java`, Java 9/9; APK compilation. Haqiqiy WebView exploit/recovery testi NOT TESTED |
| S06 P1 | Electron IPC sender/frame tekshiruvi yo‘q | Faqat bundled main frame + window + URL ruxsati | `bridge-policy.test.ts` 5 test |
| S07 P1 | Order va delivery holati alohida yozilib, yarim bajarilish xavfi bor | Pickup/confirm/resolve/cancel D1 batch; stale version guard; lokatsiya INSERT’da active assignment qayta tekshiriladi | API expansion lifecycle suite; crash injection/mass-load NOT TESTED |
| S08 P2 | Nofaol courier tokenlariga push ketishi, generic 400’da to‘g‘ri token o‘chishi mumkin | Active role join; faqat 404 pruning; OAuth cache identity bilan ajratildi | Provider mock va kod ko‘rigi; active-role predicate uchun live FCM NOT TESTED |
| S09 P2 | Push unregister yo‘q | Authenticated DELETE endpoints, principal scope va lifecycle adapter | `push-registration.test.ts`, security API; native SDK hali ulanmagan |
| S10 P1 | JSON/image body cheklanmasdan o‘qiladi | JSON 64 KiB, image 5 MB body middleware | Oversized body → 413 regression |
| S11 P1 | QA runner caller-supplied directory’ni `rm -rf` qilardi | Mavjud path bo‘lsa rad etiladi, faqat yangi katalog | Lokal worker runner; mavjud path sentinel testi |
| S12 P1 | Dependency critical/high advisorylari | MapLibre 6.19.0, Zod 4.6.7, Electron 45.4.1, Vitest 5.1.1, Sharp 0.35.5; lockfile qayta yaratildi | `npm-audit.json` → `npm-audit-after.json`: 14 (3 critical/4 high) → 0 ta ma’lum zaiflik |

Dependency yangilanishi eski APK/DMG/EXE ichidagi kutubxonalarni almashtirmaydi. Faqat yangi buildga taalluqli. Oraliq auditdagi 6 moderate electron-builder zanjiridagi minimatch DoS’dan kelgan. Faqat zaif >=7 <11.0.1 oraliq 11.0.1 bilan override qilindi, eski glob uchun minimatch 3/5 o‘zgarmadi; builder downgrade qilinmadi. Yakuniy audit 0, lekin bu kelajakdagi zaifliklar yo‘qligini isbotlamaydi.

Advisory manbalari: [MapLibre](https://github.com/advisories/GHSA-jrc7-96c5-q579), [Zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), [Electron](https://github.com/advisories/GHSA-jr5w-w6x2-84p9), [minimatch](https://github.com/advisories/GHSA-g3hv-75wg-m249).

## Credential va Git tarixi

`dist/production-admin-credentials.txt` diskda mavjud, mode 0600; mazmuni hisobotga olinmadi. Foydalanuvchi oldingi ochiq matn tarqalishini bildirganligi sabab **P0 release blocker**, parolning hozir ishlashi login bilan tekshirilmadi (production read-only cheklovi). `dist/backups` ichida maxfiy ma’lumotli SQL zaxiralar mavjud; installer bilan yuborilmasin.

`evidence/secret-scan.json`: reachable Git tarixidagi 374 blobda ma’lum production parolning aynan mos qiymati va xavfli credential fayl nomlari izlandi; moslik topilmadi. Bu boshqa secretlar, untracked fayllar, deleted unreachable obyektlar, GitHub logs/chat yoki tashqi nusxalarda ma’lumot yo‘qligini isbotlamaydi. Local debug keystore tarixda bor; bu release signing kaliti emas.

Rotation tartibi (faqat tasdiqdan so‘ng): owner uchun yangi unique parol → barcha eski owner sessions va push registrations revoke → bootstrap endi kerak bo‘lmasa disable/rotate → qurilmalarda qayta login → 0600 credential faylini shifrlangan secret managerga ko‘chirish → backups encryption/access/retention. Hozir hech biri production’da bajarilmadi.

## Boshqa tekshiruvlar va cheklovlar

- SQL querylar parametrli; order access token hash, staff/customer token turlari ajratilgan. IDOR va courier scope lokal API testlarida.
- R2 upload owner/manager auth ostida; MIME/magic va hajm tekshiriladi. To‘liq image decoder/re-encode Worker’da yo‘q; faqat header tekshiruvi polyglot/zararli decoder holatlarining hammasini qamramaydi. SVG upload qabul qilinmaydi.
- CORS exact configured origin; production begona Origin uchun ACAO qaytarmadi. CORS authorization o‘rnini bosmaydi.
- Staff 7 kun, customer 30 kun sessiya; alohida refresh token protokoli yo‘q. Logout online server sessiyasini o‘chiradi; offline logout server tokenini darhol revoke qila olmaydi.
- Biometrikasiz customer token localStorage’da; Android debug APK va physical access threat modeli alohida. Keychain/Keystore barcha server session xavflarini bartaraf etmaydi.
- Anonymous checkout abuse/idempotency, account enumeration, retention cleanup, audit event va biznes mutation o‘rtasidagi durable outbox yo‘qligi qolgan risklar.
- Yangi patch va yangi dependencylar production’da deploy qilinmagan; live backendga «barcha xavfsizlik tuzatishlari bor» deb aytilmaydi.
