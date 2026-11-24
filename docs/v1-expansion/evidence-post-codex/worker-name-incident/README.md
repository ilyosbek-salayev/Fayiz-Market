# 2026-11-25: `fayz-market-api-production` — ortiqcha Worker hodisasi

**Nima bo‘ldi:** repository ildizidan `npx wrangler deploy --env production` bajarildi. Ildizdagi `wrangler.toml` (Workers Builds uchun qo‘shilgan, commit `7bc075b`) da `[env.production]` yo‘q edi, shuning uchun Wrangler nomga `-production` qo‘shib alohida Worker yaratdi: `fayz-market-api-production`, versiya `eb2fd9e9-d449-4a8c-aa74-0d64c9c9d150` (2026-11-24T22:17:58Z).

**Ta’sir (read-only tekshiruv, `probes.txt`, `fayz-market-api-production-version.txt`):**
- Yangi Worker production D1 `89f6ea76…` va R2 `fayz-market-images`ga ulangan, vars production, secret yo‘q (`/admin/bootstrap` → 403).
- Faqat o‘z workers.dev manzili; route yo‘q; repo/APK/desktop’da unga havola yo‘q → ilovalardan trafik yo‘q. Begona origin’ga CORS yo‘q.
- 1.1.2 kodida (autentifikatsiyasiz `DELETE /customer/push-token` → 401). Asosiy `fayz-market-api` o‘zgarmagan: `9ff0b7fb`, eski kod (shu so‘rov → 404).
- D1/R2 ma’lumotlari, secretlar va credential’larga tegilmadi.

**Tuzatish (repo):** ildiz `wrangler.toml` ga `name = "fayz-market-api"` bilan `[env.production]` qo‘shildi; `apps/api/deploy-config.test.ts` uchala deploy yo‘li bitta Worker nomi va bir xil bindinglarga tushishini tekshiradi (eski konfiguratsiyada 2 test yiqiladi). Dry-run: `after-fix.txt`.

**Qolgan amallar (egasi tasdig‘i bilan):** asosiy Worker’ni yangilash → smoke → `fayz-market-api-production` da route/custom domain/service binding yo‘qligini dashboard’da ko‘rish → `cd apps/api && npx wrangler delete --name fayz-market-api-production` (faqat skript va workers.dev manzili o‘chadi; D1/R2 alohida resurs).
