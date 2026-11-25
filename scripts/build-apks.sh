#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
VITE_ANDROID_BUILD=1 npm run build -w @fayz/customer
VITE_ANDROID_BUILD=1 npm run build -w @fayz/admin
# Fresh asset folders: stale hashed chunks from earlier builds must not ship inside the APK.
rm -rf apps/android/customer/src/main/assets apps/android/admin/src/main/assets
mkdir -p apps/android/customer/src/main/assets apps/android/admin/src/main/assets dist/apk
cp -R apps/customer/dist/. apps/android/customer/src/main/assets/
cp -R apps/admin/dist/. apps/android/admin/src/main/assets/
(
  cd apps/android
  ./gradlew :customer:assembleDebug :admin:assembleDebug :customer:assembleRelease :admin:assembleRelease --no-daemon "$@"
)
# Shop / customer distribution = release (production API only, no developer settings).
# Debug builds stay in apps/android/*/build/outputs/apk/debug/ for developers and emulator QA (WebView inspectable).
VERSION=$(node -p "require('./package.json').version")
mkdir -p "dist/apk/v$VERSION"
cp apps/android/customer/build/outputs/apk/release/customer-release.apk "dist/apk/v$VERSION/fayz-market-customer.apk"
cp apps/android/admin/build/outputs/apk/release/admin-release.apk "dist/apk/v$VERSION/fayz-market-admin.apk"
test -s "dist/apk/v$VERSION/fayz-market-customer.apk"
test -s "dist/apk/v$VERSION/fayz-market-admin.apk"
shasum -a 256 "dist/apk/v$VERSION"/*.apk
