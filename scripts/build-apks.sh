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
  ./gradlew :customer:assembleDebug :admin:assembleDebug --no-daemon "$@"
)
cp apps/android/customer/build/outputs/apk/debug/customer-debug.apk dist/apk/fayz-market-customer-debug.apk
cp apps/android/admin/build/outputs/apk/debug/admin-debug.apk dist/apk/fayz-market-admin-debug.apk
test -s dist/apk/fayz-market-customer-debug.apk
test -s dist/apk/fayz-market-admin-debug.apk
shasum -a 256 dist/apk/*.apk
