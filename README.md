# Fayz Market

Accessories store customer app, responsive administration, and Cloudflare Worker API.

- `apps/api`: Worker, D1 migrations, R2 image storage
- `apps/customer`: backend-connected customer interface bundled in the Android customer APK
- `apps/android`: two Java Android WebView shells, customer and admin; no Expo in the active build
- `apps/admin`: React responsive administration
- `packages/shared`: common API contracts and validation
- `docs/v1`: audit, operation and release status

See [build instructions](docs/v1/BUILD_INSTRUCTIONS.md) and [deployment guide](docs/v1/DEPLOYMENT_GUIDE.md).

Current independent audit and release gates: [Codex audit](docs/codex-audit/PROJECT_AUDIT.md), [test results](docs/codex-audit/TEST_RESULTS.md), [release readiness](docs/codex-audit/RELEASE_READINESS.md). Version metadata is defined in the root package.json; existing 1.1.1 installers remain historical artifacts.
