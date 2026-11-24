# Claude natijalari va Codex tekshiruvi

2026-11-24–25. VERIFIED faqat ko‘rsatilgan muhitga tegishli; emulyator fizik telefon o‘rniga olinmaydi.

| Oldingi da’vo | Mustaqil holat | Dalil / cheklov |
|---|---|---|
| Production API ishlaydi | VERIFIED | `evidence/production-get.txt`: GET-only 11/11 |
| D1 ulangan | VERIFIED, chegaralangan | Katalog/settings GET va `cloudflare-migrations.txt`: pending migration yo‘q |
| R2 ulangan va ishlaydi | PARTIAL | Binding kodda; lokal R2 integration o‘tdi. Remote bucket yozish/o‘qish oqimi qayta bajarilmadi |
| Production 74/74 | NOT TESTED | `api-verify.mjs` product/order/user yaratadi; read-only cheklovi sabab production’da qayta ishga tushirilmadi |
| UI 48/48 | PARTIAL | Hozirgi kengaytirilgan skript 54 tekshiruvli; real yangi natija TEST_RESULTS’da, eski son ko‘chirilmadi |
| V1 UI 39/39 | VERIFIED (lokal browser) | Asl assertions saqlandi; missing-order bilan 42 tekshiruvga kengaydi |
| Backend expansion | VERIFIED (lokal) | Joriy `expansion-verify.mjs` 129 tekshiruv; alohida test logi |
| Android APK yaratilgan | VERIFIED (artefakt) | Eski SHA-256 manifestga mos; package/version/cert tekshiruvi |
| Emulyator native testlar o‘tgan | NOT TESTED (joriy audit) | Oldingi hujjat bor, joriy `adb devices -l` bo‘sh; yangi runtime isboti yo‘q |
| macOS DMG | PARTIAL | Eski DMG checksum VALID, arm64 `.app` va ad-hoc codesign; yangi natijalar release hisobotida |
| Windows EXE | PARTIAL | Eski NSIS/PE mavjud, xesh mos; Windows qurilmasi yo‘q |
| Telegram orqali 1.1.1 yuborishga tayyor | PARTIAL | Nusxalar bor va xeshlari mos; Telegramga yuborish/fizik QA bu auditda bajarilmadi |
| Worker va repository aynan mos | PARTIAL | Deployment `9ff0b7fb…` tasdiqlandi; remote source download/byte comparison bajarilmadi. Yangi patch production’da yo‘q |
| Branch push qilingan, default eski | VERIFIED | `remote-refs.txt`: default `feat/v1-complete`=`8e58d04`; remote premium=`2dd4f66`; local=`91c1416` |
| FCM/real providerlar tugallanmagan | VERIFIED | Secret list’da faqat BOOTSTRAP_SECRET; auth/config uch usulni disabled ko‘rsatdi |

Claude yakuniy hisobotining o‘zi ham real telefon, Windows, tashqi hisoblar, signing va background GPS cheklovlarini tan olgan. Ularni keyingi release’da yopilmagan holda to‘liq tayyor deb hisoblash mumkin emas.

## Codex da’volarining qayta tekshiruvi (Claude, 2026-11-25)

| Codex da’vosi | Natija |
|---|---|
| API 129/129, integration 38/38, V1 UI 43/43, extended UI 54/54, security 11/11, mock 35/35 | Qayta ishga tushirildi — barchasi aynan shu sonlar bilan PASS |
| npm audit 0 | Tasdiqlandi |
| MapLibre worker/Vite asset tuzatildi | Chrome UI’da PASS; **qo‘shimcha:** APK WebView (emulyator) va paketlangan macOS ilovada ham worker yuklanadi va xarita chiziladi |
| macOS read-only smoke 8/8 (keyin 10/10) | Yangi DMG bilan 11/11 (ilova bundle’i worker’ga ishorasi qo‘shildi) |
| Windows x64 installer | Build integrity tasdiqlandi; real Windows’da hali NOT TESTED |
| Yakuniy distributivlar/SHA-256 tugallanmagan | Yakunlandi: commit’dan qayta qurildi, `RELEASE_MANIFEST-1.1.2.md` |
| Codex aniqlamagan: Cloudflare Workers Build xatosi | Topildi va tuzatildi (ildiz `wrangler.toml`) |
| Codex aniqlamagan: lockfile’dan keyin Android QA `ws` importi buzilgan | Tuzatildi |
