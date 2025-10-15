# Android Deployment Guide

This guide walks through preparing, building, and shipping the Android version of **Tine** to internal testers and the Google Play Store. Follow the setup sections on your first pass, then rely on the checklists for future releases.

---

## 1. Prerequisites checklist

| Requirement | Details | Verification |
| --- | --- | --- |
| Google Play Console | Active developer account ($25 one-time). | Access [play.google.com/console](https://play.google.com/console) with the publishing Google account. |
| macOS or Windows | Android Studio Hedgehog or newer installed. | `android-studio --version` (macOS) or check **About Android Studio**. |
| Node.js | 20 LTS or 22 LTS. | `node --version` |
| npm / Yarn | npm 10+ (bundled) or Yarn 4 via Corepack. | `npm --version` or `yarn --version` |
| Java | OpenJDK 17 (bundled with Android Studio). | `java -version` |
| Android SDK | Platforms 34 & 35, Build-Tools 35.0.0, Platform-Tools latest. | Android Studio ▸ **Settings ▸ Appearance & Behavior ▸ System Settings ▸ Android SDK** |
| Android NDK | r26c (required for native audio modules). | Android Studio SDK Manager → **SDK Tools** (check “Show Package Details”). |
| Expo account | Needed for EAS Build (optional). | `npx expo login` |

### Environment setup tips

- Use Android Studio’s **Device Manager** to create at least one emulator (Pixel 6, API 34) for smoke tests.
- On Apple Silicon, install both ARM and Intel system images if you rely on x86-based emulators and enable Rosetta (`softwareupdate --install-rosetta`).
- If `npm install` fails due to registry access issues, connect to an unfiltered network or configure an internal npm proxy. React 19 and Skia 2.x dependencies are already aligned in `package.json`.

---

## 2. Configure the project

1. **Clone the repository** (if needed):
   ```bash
   git clone https://github.com/tylerbuell/Tine.git
   cd Tine
   ```
2. **Select a supported Node LTS (20 or 22)**:
   ```bash
   nvm install 20
   nvm use 20
   # or
   nvm install 22
   nvm use 22
   ```
3. **Install dependencies**:
   ```bash
   npm install
   ```
4. **Review Expo configuration** (`app.json`):
   - `expo.android.package` – Reverse-DNS identifier (e.g., `com.tylerbuell.tine`). Must match Google Play package name.
   - `expo.version` – Marketing version (e.g., `1.0.0`).
   - `expo.android.versionCode` – Incrementing integer per release (Google Play requires strictly increasing numbers).
   - `expo.runtimeVersion` – Optional OTA version pinning.
5. **Update assets** in `assets/` (adaptive icon layers, splash artwork).
6. **Sign in to Expo** if using EAS Build:
   ```bash
   npx expo login
   ```

---

## 3. Choose a build strategy

| Strategy | When to use | Pros | Cons |
| --- | --- | --- | --- |
| **Expo Application Services (EAS)** | Standard Expo workflow, minimal native customization. | Managed signing, reproducible builds, integrates with OTA updates. | Requires Expo subscription for high concurrency, relies on cloud builds. |
| **Local Gradle build** | You need custom native modules or offline builds. | Full control, integrates with existing CI/CD. | Must manage keystores, Gradle, and environment manually. |

Both approaches are documented below.

---

## 4. Build with Expo Application Services (EAS)

1. **Install EAS CLI** (once):
   ```bash
   npm install --global eas-cli
   ```
2. **Create or update `eas.json`**:
   ```json
   {
     "cli": {
       "version": ">= 4.0.0"
     },
     "build": {
       "preview": {
         "distribution": "internal",
         "android": {
           "buildType": "apk"
         }
       },
       "production": {
         "distribution": "store",
         "android": {
           "buildType": "app-bundle"
         }
       }
     }
   }
   ```
3. **Configure credentials**:
   ```bash
   eas build:configure
   ```
   - Allow Expo to manage the Android keystore or provide your own (`.jks`).
   - Keep a secure copy of the generated keystore, keystore password, key alias, and key password. Store them in a secrets manager.
4. **Kick off a build**:
   ```bash
   # Internal testers (APK sideload)
   eas build --platform android --profile preview

   # Play Store submission (AAB)
   eas build --platform android --profile production
   ```
5. **Distribute the artifact**:
   - APK: share directly with testers or upload to Google Play Internal Testing.
   - AAB: upload via Play Console → **Testing** → **Internal testing** or **Production**.
6. **Submit via CLI (optional)**:
   ```bash
   eas submit --platform android --latest
   ```
   Provide your Google Play service account JSON key when prompted.

---

## 5. Build locally with Gradle

1. **Prebuild native projects**:
   ```bash
   npx expo prebuild --clean
   ```
2. **Open Android Studio**:
   ```bash
   open android
   ```
3. **Sync Gradle** and allow it to download dependencies.
4. **Set signing config**:
   - Place your `keystore.jks` under `android/app/` (git-ignored).
   - Create or update `android/gradle.properties` with:
     ```properties
     MYAPP_UPLOAD_STORE_FILE=keystore.jks
     MYAPP_UPLOAD_KEY_ALIAS=tine
     MYAPP_UPLOAD_STORE_PASSWORD=********
     MYAPP_UPLOAD_KEY_PASSWORD=********
     ```
   - Edit `android/app/build.gradle` (inside `android { defaultConfig { ... } }`):
     ```groovy
     signingConfigs {
         release {
             storeFile file(System.getenv("MYAPP_UPLOAD_STORE_FILE") ?: project.findProperty("MYAPP_UPLOAD_STORE_FILE"))
             storePassword System.getenv("MYAPP_UPLOAD_STORE_PASSWORD") ?: project.findProperty("MYAPP_UPLOAD_STORE_PASSWORD")
             keyAlias System.getenv("MYAPP_UPLOAD_KEY_ALIAS") ?: project.findProperty("MYAPP_UPLOAD_KEY_ALIAS")
             keyPassword System.getenv("MYAPP_UPLOAD_KEY_PASSWORD") ?: project.findProperty("MYAPP_UPLOAD_KEY_PASSWORD")
         }
     }

     buildTypes {
         release {
             signingConfig signingConfigs.release
             minifyEnabled false
             shrinkResources false
             proguardFiles getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro"
         }
     }
     ```
5. **Assemble artifacts**:
   ```bash
   cd android
   ./gradlew assembleRelease   # Generates APK at app/build/outputs/apk/release/
   ./gradlew bundleRelease     # Generates AAB at app/build/outputs/bundle/release/
   cd ..
   ```
6. **Verify** the output using `apksigner verify --print-certs app-release.apk` or upload to Play Console Internal Testing.

---

## 6. Quality assurance

| Stage | Actions |
| --- | --- |
| Automated checks | `npm run lint`, `npm run test`, `npm run format:check`. |
| Emulator testing | `npx expo run:android` → select Pixel emulator. Test tuning UI, orientation, resume-from-background. |
| Device testing | Install APK via `adb install` on Pixel or Samsung hardware. Confirm microphone permissions and low latency. |
| Performance | Use **Android Studio ▸ Profiler** to monitor CPU/GPU usage during sustained tuning. |
| Accessibility | Enable TalkBack, large fonts, and contrast checkers. |

Capture screenshots for 6.7" (required) and other sizes if you target tablets.

---

## 7. Google Play Console submission checklist

1. **Prepare release notes** summarizing changes, tuning improvements, or bug fixes.
2. **Upload assets**:
   - Screenshots (minimum 1080×1920, 2–8 images).
   - Feature graphic (1024×500).
   - App icon (512×512) and high-res icon (1024×1024 if not already provided).
3. **Fill out store listing** (description, short description, categorization, contact info).
4. **Complete Data Safety** form (declare on-device processing of microphone data, no data sharing).
5. **Set content rating** questionnaire responses (audio tools, low risk).
6. **Create an internal test release**:
   - Go to **Testing ▸ Internal testing**.
   - Create a track, upload the AAB, add testers (email list or Google Groups), publish.
7. **Promote to production**:
   - Review Pre-launch reports.
   - Resolve policy warnings if any.
   - Roll out to production with a staged percentage (e.g., 10%) and monitor metrics.

---

## 8. Post-release monitoring

| Task | Tool |
| --- | --- |
| Crash reporting | Firebase Crashlytics, Sentry, or Google Play Vitals. |
| ANR tracking | Play Console → **Android vitals** → **ANRs & Crashes**. |
| Performance metrics | Frame pacing, startup time from Play Console. |
| User feedback | Read reviews, respond where appropriate, or collect in-app surveys. |
| OTA updates | If using Expo Updates, set release channels and publish `expo publish` with matching runtime versions. |

Plan hotfixes by incrementing `expo.android.versionCode` and `expo.version`, then rebuilding.

---

## 9. Troubleshooting reference

| Issue | Resolution |
| --- | --- |
| `@shopify/react-native-skia` version not found | `npm view @shopify/react-native-skia versions` to find a published version, install via `npx expo install @shopify/react-native-skia@<version>`, then rerun `npm install`. |
| `ConfigError: Cannot determine the project's Expo SDK version` | This indicates `expo` failed to install. Resolve dependency installation errors and retry. |
| Gradle `Could not determine java version` | Ensure Java 17 is used. Set `export JAVA_HOME=$(/usr/libexec/java_home -v 17)` on macOS or configure Android Studio to use Embedded JDK. |
| Emulator microphone not working | Use physical device testing; many emulators do not pipe real microphone audio. |
| `No matching client found for package name` during Firebase setup | Confirm the package name in `google-services.json` matches `expo.android.package`. |
| Play Console rejects build due to version code | Increment `expo.android.versionCode` and rebuild. Version codes must strictly increase. |
| App bundle size warnings | Enable resource shrinking (`shrinkResources true`) and review assets for large audio files. |

---

## 10. Release timeline template

| Day | Task |
| --- | --- |
| -7 | Create `release/<version>` branch, freeze new feature merges. |
| -5 | Update changelog, bump `expo.android.versionCode` and `expo.version`. |
| -4 | Run automated checks, QA on emulator + physical devices. |
| -3 | Trigger EAS production build (AAB). |
| -2 | Upload to Play Console Internal testing, gather feedback. |
| -1 | Fix blocking issues, prepare store listing updates. |
| 0 | Roll out staged production release, monitor vitals. |
| +1 | Respond to feedback, plan follow-up patch if needed. |

Following this cadence keeps Android releases predictable and reduces regression risk.
