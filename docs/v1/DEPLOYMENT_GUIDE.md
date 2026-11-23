# Cloudflare deployment guide

No production resource has been created or modified. Follow these steps only after explicit deployment approval and access are available.

1. Create a Cloudflare D1 database named `fayz-market` and an R2 bucket named `fayz-market-images`.
2. Replace `REPLACE_WITH_D1_DATABASE_ID` in `apps/api/wrangler.toml` with the actual D1 database ID. Set `APP_ORIGIN` to the exact admin HTTPS origin and `PUBLIC_BASE_URL` to the Worker HTTPS origin. Use separate development and production resources.
3. Set `BOOTSTRAP_SECRET` with `npx wrangler secret put BOOTSTRAP_SECRET` from `apps/api`. Use a long random value and keep it outside Git.
4. Run `npx wrangler d1 migrations apply fayz-market --remote` from `apps/api`. Review the migration output before applying it to a live database.
5. Deploy the API with `npx wrangler deploy` from `apps/api`.
6. Bootstrap the first owner once with `POST /admin/bootstrap`, header `X-Bootstrap-Secret`, and JSON `{ "email": "owner@example.com", "password": "a strong unique password" }`. The route refuses a second bootstrap. Do not put real credentials in source or shell history.
7. Build admin with `VITE_API_URL=https://YOUR_WORKER_URL npm run build:admin`. Deploy `apps/admin/dist` to Cloudflare Pages. Confirm its origin matches `APP_ORIGIN`.
8. Build both Android APKs with `npm run build:apks -- -PfayzApiUrl=https://YOUR_WORKER_URL`. The current Android project is a debug testing build; configure a current target SDK, release signing, and HTTPS-only network policy before preparing a store release. Install and test on a physical device before release signing.

Security notes: Worker admin routes use hashed, expiring bearer sessions and owner/manager roles. Customer order lookup requires an opaque order token stored on the customer's device. Login attempts are limited per email. CORS allows only the configured admin origin; bundled Android WebViews load under the API origin, so their requests are same-origin. R2 uploads require admin authentication, limit files to 5 MB, and verify JPEG/PNG/WebP signatures. D1 triggers enforce stock, payment, and order state invariants.

Operational steps before launch: configure a custom HTTPS domain, set contact and delivery information, create categories/products and real photos, verify backup/restore for D1 and R2, monitor Worker logs, and test a complete real-device order. Manual payment records represent staff-entered received funds; no payment gateway is integrated.
