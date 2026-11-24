# O‘zgartirilgan fayllar

Audit o‘zgarishlari local working tree’da; commit/push yo‘q. `.DS_Store` foydalanuvchining avvalgi o‘zgarishi bo‘lib, audit tomonidan tahrirlanmadi.

| Fayl/guruh | Sabab | Tekshirish |
|---|---|---|
| `apps/customer/src/main.tsx`, `order-history.ts`, `order-history.test.ts` | Partial history failure isolation, tokenlarni saqlash, session almashganda eski response’ni qo‘llamaslik; unavailable row label; metadata version | 4 unit + browser missing-order/version regressiyasi |
| `apps/{admin,customer}/vite.config.ts`, root `package.json`, Android Gradle, desktop package | 1.1.2 / Android vc6; runtime version root metadata’dan | Typecheck, web/native/desktop build, browser version check |
| `apps/api/src/customers.ts` | Atomik OTP attempts, password-change session revocation/rate limit, Zod4 record API, push unregister | 129 expansion + security integration |
| `apps/api/src/index.ts` | Body limit, admin IP limit, dummy password verify, cancel batch | API/integration/security tests |
| `apps/api/src/lib.ts`, `password.ts`, `audit-security.test.ts` | Loopback-only development; fixed dummy hash | 9 yangi unit test |
| `apps/api/src/delivery.ts` | Pickup/confirm/resolve/cancel consistency, optimistic version, active location insert, terminal GPS cleanup | Expansion lifecycle, tracking, authorization regressiyasi |
| `apps/api/src/push.ts`, `staff.ts` | Active courier recipients, token-error handling, account-aware OAuth cache, scoped DELETE token | Mock provider suite va security integration; real FCM NOT TESTED |
| `packages/ui/src/push-registration.ts`, `.test.ts` | Kelajakdagi native FCM adapter uchun serial registration/refresh/logout cleanup contract | 3 unit test; faol UI/native SDK’ga ulanmagan |
| `packages/ui/src/maps.tsx` | MapLibre 6 worker’ini Vite asset URL bilan ulash | 54 UI: render, attribution, GPS, pin, tracking; desktop map smoke |
| Android `MainActivity.java`, `OriginPolicy.java`, main/debug manifestlar | Exact origin, release menu gate, external document bridge removal/callback guard, frame CSP, cleartext/backup policy | Java 9/9 + APK compile/sign/package; physical WebView runtime NOT TESTED |
| `apps/desktop/main.cjs`, `bridge-policy.cjs`, `.test.ts` | Top-level trusted IPC sender/frame/URL | 5 unit + packaged desktop read-only smoke |
| App/root/shared package.json va `package-lock.json` | Patched MapLibre/Zod/Electron/Vitest/Sharp, React types hoisting, vulnerable minimatch scoped override; reproducible install graph | npm audit 0, typecheck/unit, platform builds |
| `scripts/deploy-qa/local-worker.sh` | Existing directory’ni o‘chirmaslik; inspector port isolation | Sentinel test va fresh DB suites |
| `scripts/ui-qa/regress.mjs` | 39 eski assertion ustiga 3 history va 1 version check | Yakuniy 43 checks |
| `scripts/ui-qa/expansion-ui.mjs` | Map failure diagnostikasi; assertions saqlandi | 54 original checks |
| `scripts/codex-audit/*` | GET-only production smoke, local suite runner, security regression, native origin, desktop read-only va path safety | Tegishli evidence fayllari |
| `.gitignore` | Alohida desktop candidate build outputlarini Git’dan chiqarish | Git status/diff check |
| README, `docs/codex-audit/*` | Mustaqil audit, blockers, dalillar va handoff | Havolalar va statuslar yakuniy loglar bilan solishtirildi |

Yangi production migration yo‘q. Cloudflare deploy, secrets rotation, remote D1/R2 mutation, GitHub push/merge va branch deletion bajarilmadi. Buildlar `dist/apk/v1.1.2` va yangi versioned desktop nomlarida; eski 1.1.1 distributivlar saqlandi.

Aniq source fayl xeshlari va uncommitted patch identifikatori `evidence/source-state.json`da. Yangi binarilarga tegishli SHA-256 va test statuslari `dist/RELEASE_MANIFEST-1.1.2.md`da.
