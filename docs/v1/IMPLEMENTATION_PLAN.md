# V1 implementation plan

1. Build shared validation, Cloudflare Worker API, D1 migration, R2 uploads, and automated route tests.
2. Build backend-connected customer interface with catalog, search, cart, checkout, order lookup, and profile, bundled in an Android APK without Expo.
3. Build responsive React admin for login, catalog, categories, orders, payments, inventory, reports, and settings.
4. Run checks and local integration verification; document actual results.
5. Attempt Android build if supported toolchain is available; prepare release and Windows packaging workflows.

Architecture: TypeScript npm workspaces; Hono Worker with D1 and R2; Vite React customer and admin interfaces; two Java Android WebView shells serving bundled interface assets from the same origin as the API. No Expo is used for the delivered Android builds. No external production infrastructure beyond Cloudflare is required. Customer order lookup uses an opaque order access token, avoiding mandatory customer accounts in V1.
