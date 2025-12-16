# iOS Deployment Guide

This document is a comprehensive, end-to-end playbook for shipping the iOS version of **Tine** to TestFlight and the App Store. Follow each section sequentially the first time through, then use the checklists for future releases.

---

## 0. Quickstart (first successful build)

1. Install Xcode 15, Node 20 or 22, and CocoaPods 1.15+ (see [prerequisites](#1-prerequisites-checklist)).
2. Clone the repo and install dependencies (`npm install` and `npx pod-install ios`).
3. Sign in to Expo (`npx expo login`).
4. Populate `app.json` with the correct bundle identifier, version, and build number.
5. Run automated checks: `npm run lint`, `npm run test`, and `npm run format:check`.
6. Trigger an internal TestFlight build with EAS: `eas build --platform ios --profile preview`.
7. Submit the finished build to App Store Connect: `eas submit --platform ios --latest`.
8. After processing, invite testers in TestFlight and verify on a physical device.

Return to the detailed sections below for deeper explanations or troubleshooting.

---

## 1. Prerequisites checklist

| Requirement | Details | Verification |
| --- | --- | --- |
| Apple Developer Program | Paid membership ($99/year) using the Apple ID that will upload builds. | Visit [App Store Connect](https://appstoreconnect.apple.com) – ensure you can access the dashboard. |
| macOS | macOS 13.6 Ventura or newer. Xcode 15 requires at least macOS 13.5. | `sw_vers` |
| Xcode | Version 15.x installed in `/Applications`. | Launch Xcode → **Xcode ▸ About Xcode** |
| Command Line Tools | Installed via Xcode preferences. | `xcode-select -p` |
| Node.js | 20 LTS or 22 LTS. | `node --version` |
| npm / Yarn | npm 10+ (bundled) or Yarn 4 via Corepack. | `npm --version` or `yarn --version` |
| CocoaPods | 1.15+. | `pod --version` |
| Expo account | Free Expo account for EAS services. | `npx expo login` |

### If the App Store refuses to install Xcode

1. Sign out of the App Store (menu bar **Store ▸ Sign Out**).
2. Quit App Store, then clear its cache: `open -a "App Store" --args -reset`.
3. Reopen and attempt to download again. If it still fails, download the `.xip` installer from [Apple Developer downloads](https://developer.apple.com/download/all/?q=Xcode), then drag Xcode into `/Applications`.
4. Launch Xcode, accept the license, and install any additional components when prompted.

### Reset Xcode components without a full reinstall

```bash
# Remove Derived Data (build caches)
rm -rf ~/Library/Developer/Xcode/DerivedData

# Delete unavailable simulators
xcrun simctl delete unavailable

# Reset command-line tools
sudo xcode-select --reset

# Remove cached downloads (optional)
rm -rf ~/Library/Caches/com.apple.dt.Xcode
```

Restart Xcode after running the commands. Reopen your simulator list to regenerate defaults.

---

## 2. Configure the project

1. **Clone the repository** (if you have not already):
   ```bash
   git clone https://github.com/tylerbuell/Tine.git
   cd Tine
   ```
2. **Use a supported Node LTS (20 or 22)**:
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
   npx pod-install ios
   ```
   If installation fails because the npm registry is blocked, switch to a network with registry access or configure an internal mirror. Skia 2.x requires React 19+, which is already declared in `package.json`.
4. **Sign in to Expo** (required for EAS Build):
   ```bash
   npx expo login
   ```
5. **Review Expo configuration** in `app.json`:
   - `expo.name` – App name shown on the home screen.
   - `expo.slug` – Unique identifier for Expo services.
   - `expo.ios.bundleIdentifier` – Reverse-DNS ID (e.g., `com.tylerbuell.tine`). Must match the App ID in App Store Connect.
   - `expo.version` – User-facing version (e.g., `1.0.0`).
   - `expo.runtimeVersion` – Align with release cycle if using OTA updates.
   Update values as needed and commit changes.
6. **Set build numbers**:
   - `expo.ios.buildNumber` controls the CFBundleVersion. Increment per release (e.g., `1`, `2`, ...).
   - Keep a changelog mapping build numbers to release notes.
7. **Update icons and splash** in `assets/`. Provide 1024×1024 icon and 1242×2436 splash at minimum.

---

## 3. Decide on your build workflow

Tine supports two iOS build strategies:

### Option A – Expo Application Services (recommended)

- Minimal local configuration.
- Expo manages signing certificates and builds on their infrastructure.
- Requires an Expo account linked to Apple Developer credentials.

### Option B – Local Xcode archive

- Full control of signing and archive artifacts.
- Required for custom native modules not supported by EAS.
- Requires you to maintain provisioning profiles manually.

The sections below document both options.

---

## 4. Build with Expo Application Services (EAS)

1. **Install EAS CLI** (once):
   ```bash
   npm install --global eas-cli
   ```
2. **Create `eas.json`** if it does not exist:
   ```json
   {
     "cli": {
       "version": ">= 4.0.0"
     },
     "build": {
       "preview": {
         "distribution": "internal",
         "ios": {
           "buildConfiguration": "Debug"
         }
       },
       "production": {
         "distribution": "app-store",
         "ios": {
           "buildConfiguration": "Release"
         }
       }
     }
   }
   ```
3. **Configure credentials**:
   ```bash
   eas build:configure
   ```
   - Sign in with your Expo account.
   - Allow Expo to manage certificates automatically (recommended). Provide your Apple Developer credentials when prompted.
4. **Trigger a build**:
   ```bash
   # Internal testing build (TestFlight)
   eas build --platform ios --profile preview

   # App Store-ready build
   eas build --platform ios --profile production
   ```
5. **Download the artifact** once the build completes. Use the URL printed in the terminal or `eas build:list` to copy it.
6. **Submit to App Store Connect**:
   ```bash
   eas submit --platform ios --latest
   ```
   Provide App Store Connect credentials and complete the questionnaire (export compliance, encryption, etc.).

> **Note:** Expo EAS requires an Apple Developer account with App Manager or Admin role to create certificates and upload builds.

---

## 5. Build locally with Xcode

1. **Prebuild the native project** (if you plan to customize native code):
   ```bash
   npx expo prebuild --clean
   ```
   This generates `ios/` with native Xcode project files.
2. **Install CocoaPods dependencies**:
   ```bash
   cd ios
   pod install
   cd ..
   ```
3. **Open the workspace**:
   ```bash
   open ios/Tine.xcworkspace
   ```
4. **Configure signing** in Xcode:
   - Select the **Tine** project in the navigator.
   - Under **Targets ▸ Tine ▸ Signing & Capabilities** choose your team.
   - Ensure the bundle identifier matches `expo.ios.bundleIdentifier`.
   - Set the provisioning profile (automatic recommended).
5. **Archive the app**:
   - Select **Any iOS Device (arm64)** as the destination.
   - Choose **Product ▸ Archive**.
   - After the build, the Organizer window opens.
6. **Distribute**:
   - Select the archive.
   - Click **Distribute App**.
   - Choose **App Store Connect** → **Upload**.
   - Follow prompts for signing, bitcode (disable), and encryption questions.
7. **Monitor processing** in App Store Connect under **My Apps ▸ Tine ▸ TestFlight**. Builds typically process within 15–30 minutes.

---

## 6. Quality assurance

| Stage | Commands / Actions |
| --- | --- |
| Automated checks | `npm run lint`, `npm run test`, `npm run format:check` |
| Simulator smoke test | `npx expo run:ios` → Launch on multiple simulators (iPhone SE, 14 Pro, etc.). |
| Device testing | Install via TestFlight or `eas build --profile preview` and ensure audio capture works with minimal latency. |
| Accessibility | Verify VoiceOver labels, large text support, and sufficient contrast. |
| Performance | Use **Instruments ▸ Time Profiler** while tuning to confirm the render loop and audio threads stay below 16 ms/frame. |

Capture screenshots (6.7" and 6.1") and a short App Preview video while testing.

---

## 7. App Store Connect submission checklist

1. **Prepare metadata**:
   - App name, subtitle, description, keywords, support URL, marketing URL.
   - Privacy policy URL (describe on-device audio processing and no data collection).
2. **Upload screenshots** (5.5", 6.5", and 6.7" required). Include lock-state animation.
3. **Fill out App Privacy** questionnaire (microphone data processed on-device, not collected).
4. **Update pricing and availability**.
5. **Create the build record** by selecting the processed build under **App Store ▸ iOS App** → **Build**.
6. **Enter release notes** referencing tuning accuracy improvements, bug fixes, etc.
7. **Submit for review** or schedule a phased release.
8. **Monitor review feedback**. Address metadata or binary issues promptly.

---

## 8. Post-release monitoring

| Task | Tool |
| --- | --- |
| Crash monitoring | Xcode Organizer → **Crashes**, or integrate Sentry/Firebase Crashlytics via native modules. |
| Analytics | Expo Updates analytics, Segment, or custom solutions (ensure privacy compliance). |
| User feedback | App Store reviews, in-app prompts, or TestFlight feedback. |
| Performance audits | Collect latency metrics from testers, track frame times using Instruments. |

Plan hotfix releases by incrementing `expo.version` (marketing version) and `expo.ios.buildNumber`.

---

## 9. Troubleshooting reference

| Issue | Resolution |
| --- | --- |
| `@shopify/react-native-skia` version not found | Use `npm view @shopify/react-native-skia versions` to find a published release, then run `npx expo install @shopify/react-native-skia@<version>` before `npm install`. |
| `ConfigError: Cannot determine the project's Expo SDK version` | Occurs when `expo` is missing due to failed install. Resolve dependency issues, then rerun `npm install`. |
| Legacy `expo-cli` warning about Node 17+ | Always use `npx expo <command>` with Node 20 LTS. Avoid the deprecated global `expo-cli`. |
| Codesign failures in Xcode | Delete derived data, ensure the correct team is selected, and verify certificates in **Keychain Access**. Revoke and recreate certificates in App Store Connect if necessary. |
| Build stuck processing in App Store Connect | Confirm version/build numbers incremented, check Apple’s System Status, and ensure the archive was uploaded without bitcode. |
| TestFlight install fails | Remove old builds from the device, install via TestFlight link, and ensure the device runs iOS 15+. |

---

## 10. Release timeline template

| Day | Task |
| --- | --- |
| -7 | Finalize feature scope, cut a release branch (`release/<version>`). |
| -5 | Run automated checks, update changelog, bump version/build numbers. |
| -4 | QA on devices, capture screenshots/video. |
| -3 | Trigger EAS production build. |
| -2 | Submit to App Review. |
| 0 | Release approved build, monitor metrics. |
| +1 | Collect feedback, plan patch if needed. |

Maintain this cadence to ensure predictable release cycles.
