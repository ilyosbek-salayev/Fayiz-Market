# Fayz Market V1.0

Accessories store customer app, responsive administration, and Cloudflare Worker API.

- `apps/api`: Worker, D1 migrations, R2 image storage
- `apps/customer`: backend-connected customer interface bundled in the Android customer APK
- `apps/android`: two Java Android WebView shells, customer and admin; no Expo in the active build
- `apps/admin`: React responsive administration
- `packages/shared`: common API contracts and validation
- `docs/v1`: audit, operation and release status

See [build instructions](docs/v1/BUILD_INSTRUCTIONS.md) and [deployment guide](docs/v1/DEPLOYMENT_GUIDE.md).
