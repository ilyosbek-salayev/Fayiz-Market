# Build and install

## Requirements

- Node.js 22+, npm
- Java 17, Android SDK platform 35, build tools 35.0.0, platform tools
- Android device with USB debugging, or emulator

## Local API and admin

```sh
npm ci
cd apps/api
npx wrangler d1 migrations apply fayz-market --local
# Create .dev.vars with BOOTSTRAP_SECRET (never commit this file).
npx wrangler dev --local --ip 0.0.0.0 --port 8787
```

In another terminal:

```sh
npm run dev:admin
```

The admin UI uses `VITE_API_URL` at build time. For a phone on the same Wi-Fi, use the Mac's LAN address for `EXPO_PUBLIC_API_URL` and run Wrangler with `--ip 0.0.0.0`. The test app must reach that address on port 8787. `10.0.2.2` works only for an Android emulator.

## Android debug APK

```sh
cd apps/mobile
EXPO_PUBLIC_API_URL=http://YOUR_LAN_IP:8787 npx expo export --platform android
cd android
EXPO_PUBLIC_API_URL=http://YOUR_LAN_IP:8787 JAVA_HOME=/path/to/jdk17 ANDROID_HOME=/path/to/android-sdk ./gradlew assembleDebug
```

Generated file: `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`. Verify with `ls -lh` and `shasum -a 256` before delivery. Install with `adb install -r app-debug.apk` or transfer the APK to the phone. Debug builds allow local HTTP; production must use HTTPS.

## Release APK and AAB preparation

Set `EXPO_PUBLIC_API_URL` to the deployed HTTPS Worker URL. Generate and privately store an Android release keystore. Place the following values in your private Gradle properties, outside Git:

```properties
FAYZ_RELEASE_STORE_FILE=/absolute/path/to/release.keystore
FAYZ_RELEASE_STORE_PASSWORD=...
FAYZ_RELEASE_KEY_ALIAS=...
FAYZ_RELEASE_KEY_PASSWORD=...
```

Then use `./gradlew assembleRelease` for a signed APK or `./gradlew bundleRelease` for a Play-ready AAB. The build rejects release tasks if these properties are absent; the debug key is never used for release signing. Verify the resulting artifact and test it before publication. Google Play publishing requires separate approval.

## Windows admin packaging

Set repository variable `FAYZ_API_URL` to the deployed HTTPS API URL, then manually run the GitHub Actions workflow **Build Windows admin**. It builds the React admin and packages `apps/desktop/release/*.exe`. The current macOS machine cannot validate a Windows `.exe`; Windows QA is required before use.
