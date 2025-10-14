# Two Wheels, One Alignment Moment

Two Wheels, One Alignment Moment is a precision tuner crafted for React Native + Expo with GPU-accelerated visuals and low-latency audio capture. Inspired by mechanical strobe tuners, the interface presents twin concentric wheels that settle into alignment when the played pitch is perfectly in tune. The project combines custom Skia rendering, expressive haptics, and a pragmatic DSP core to deliver a tactile tuning experience on modern iOS and Android devices.

> **Status:** Active development. The main branch houses a functional prototype of the tuning wheel UI. Audio input and advanced DSP logic are under active implementation.

---

## Table of contents

1. [Features](#features)
2. [Quick start](#quick-start)
3. [Project structure](#project-structure)
4. [Development workflow](#development-workflow)
5. [Testing](#testing)
6. [Deployment overview](#deployment-overview)
7. [Troubleshooting](#troubleshooting)
8. [Contributing](#contributing)
9. [License](#license)

---

## Features

- **Dual-wheel feedback** – Outer NOTE wheel snaps across 12 pitch classes while the inner CENTS wheel sweeps ±50¢ with 5¢ detents, giving an immediate sense of coarse and fine pitch error.
- **Expressive lock state** – When both wheels align at the 12 o'clock index, the UI triggers subtle haptics, a metallic tick, and a glow animation to celebrate accurate tuning.
- **Accessibility-first design** – High-contrast glyphs, large tap targets, and VoiceOver-ready labels keep the tuner inclusive. Optional numeric readouts provide frequency clarity.
- **Skia-powered visuals** – `@shopify/react-native-skia` drives brushed metal materials, micro-chamfers, and responsive lighting that reacts to device tilt.
- **Extensible audio stack** – Native bridges (Swift/Kotlin) expose low-latency microphone input to the TypeScript layer for YIN-based pitch detection, smoothing, and lock heuristics.

## Quick start

The steps below assume you have never set up a React Native or Expo project before. If you already have a working environment you can skim for the commands in **bold**.

### 1. Install the required tools

1. **Install Node.js 18 or newer** from [nodejs.org](https://nodejs.org/) (the “LTS” installer is fine). Accept the defaults and restart your terminal when prompted.
2. **Install Git** if it is not already available (`git --version` should print a version number). Use [git-scm.com](https://git-scm.com/downloads) for macOS/Windows installers.
3. **Install a package manager**. npm ships with Node, but many developers prefer Yarn. Either is fine; this guide uses npm.
4. **macOS only:** install [Watchman](https://facebook.github.io/watchman/docs/install) (`brew install watchman`) to improve file-watching performance.
5. **iOS builds:** install Xcode 15 or newer from the Mac App Store and launch it once to accept the license.
6. **Android builds:** install Android Studio (latest stable). During the first launch select the Android SDK Platform 34, Android SDK Build-Tools 34, and NDK 26. Enable the “Android Virtual Device” component if you plan to use an emulator.

### 2. Clone the project and install dependencies

```bash
git clone https://github.com/<your-org>/two-wheels-one-alignment-moment.git
cd two-wheels-one-alignment-moment

# Install JavaScript dependencies (creates node_modules/)
npm install
```

> **Troubleshooting:** If `npm install` fails with a permissions error, retry the command in a new terminal window or consult the [npm permissions guide](https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally).

### 3. Start the Expo development server

```bash
# Launch Expo and Metro bundler in interactive mode
npm run start
```

Expo will open a browser window showing a QR code and a command menu. Leave this terminal running while you develop.

### 4. Open the app on your preferred platform

- **iOS simulator (macOS only):** Press `i` in the terminal window running Expo. The iOS simulator will boot and install the app automatically.
- **Physical iPhone:** Install the **Expo Go** app from the App Store, sign in with a free Expo account, then scan the QR code displayed in the browser.
- **Android emulator:** Press `a` to launch the default emulator (make sure one is configured in Android Studio first).
- **Physical Android phone:** Install **Expo Go** from the Play Store, sign in, and either scan the QR code or type the development server URL shown in the browser.
- **Web preview:** Press `w` to open a browser-based preview. Rendering works, but microphone capture is limited to mobile devices.

Once the app loads you can edit files in `src/` and the changes will hot-reload automatically.

## Project structure

```
app/
├── src/
│   ├── components/      # Skia wheel, indicators, and HUD widgets
│   ├── hooks/           # Audio lifecycle, lock logic, gesture overrides
│   ├── lib/             # DSP utilities, smoothing constants, color ramps
│   ├── screens/         # Root tuner screen and auxiliary views
│   └── theme/           # Typography, spacing, and material parameters
├── ios/                 # Native iOS host and audio bridge
├── android/             # Native Android host and audio bridge
├── assets/              # Icons, splash screens, and illustrative artwork
└── docs/                # Deployment plan, design references, accessibility notes
```

> **Note:** Binary assets (`icon.png`, `adaptive-icon.png`, `splash.png`, `favicon.png`) are required by Expo but excluded from source control. Supply your own artwork before creating release builds.

## Architecture decisions

- [Audio Stack Migration Plan](./docs/audio-stack-migration.md) – documents the removal of Expo AV/Sensors in favour of native `AVAudioEngine` (iOS) and Oboe (Android) bridges so the tuner can meet its < 10 ms latency target without the additional buffering introduced by managed wrappers.

## Development workflow

1. **Install dependencies** – Run `npm install` (or `yarn install`) after cloning or whenever dependencies change.
2. **Run Metro** – Start the bundler with `npm run start` and attach your target device/emulator.
3. **Iterate on UI** – Edit files inside `app/src`. React Native Fast Refresh reflects changes instantly.
4. **Skia sandboxing (optional)** – Create isolated component previews using Expo's `@shopify/react-native-skia` playground or Storybook (see `docs/` for setup notes).
5. **Native modules** – Modify `ios/` or `android/` when working on audio bridges. Ensure you rebuild the native project after changing Swift/Kotlin code.

## Testing

- **Unit tests** – `npm run test` executes Jest-based tests covering DSP utilities, smoothing curves, and view-model logic.
- **Linting** – `npm run lint` enforces the Expo/React Native lint ruleset.
- **Type safety** – `npm run typecheck` runs `tsc --noEmit` to verify TypeScript types.
- **Visual regression (optional)** – Integrate [`@shopify/react-native-skia` snapshot testing](https://shopify.github.io/react-native-skia/docs/guides/testing/) to validate rendering changes.

## Deployment overview

### Beginner-friendly release checklist

If this is your first time shipping an Expo/React Native application, walk through the checklist below. Each step links out to the relevant Expo or platform documentation for deeper dives.

1. **Create the necessary developer accounts.**
   - Apple: join the [Apple Developer Program](https://developer.apple.com/programs/) with an Apple ID ($99/year).
   - Google: create a [Google Play Console](https://play.google.com/console/about/) developer account ($25 one-time).
2. **Install the Expo CLI globally** for release tooling: `npm install --global expo-cli`.
3. **Sign in to Expo** in your terminal: `expo login`. Free accounts are sufficient for test builds.
4. **Configure the app metadata** in `app.json` (name, slug, bundle identifiers). The defaults work for local testing; update them before submitting to stores.
5. **Generate native builds** using Expo Application Services (recommended for beginners):
   - iOS: `npx expo build:ios --type archive` (prompts you to create or upload signing certificates).
   - Android: `npx expo build:android --type app-bundle`.
   Expo hosts the signed artifacts and provides download links when the build finishes.
6. **Test the resulting builds** on physical devices before submitting. Install the `.ipa` via TestFlight and the `.aab` via the Play Console internal testing track.
7. **Prepare store listing assets** (screenshots, descriptions, privacy statements). Use the in-app lock animation and tuning wheel screens for visuals.
8. **Submit for review** following the platform-specific steps below. Keep track of review feedback in your team’s project tracker.

The rest of this section provides additional detail for experienced teams or anyone migrating to custom CI/CD.

High-level guidance for shipping to the Apple App Store and Google Play Store:

### iOS (App Store)

1. Configure bundle identifiers, signing, and provisioning in Xcode (or via `eas.json` if migrating to EAS Build).
2. Build a release IPA using Fastlane or Expo Application Services with production credentials.
3. Upload to TestFlight for QA. Gather lock-state accuracy, latency, and accessibility feedback.
4. Prepare App Store metadata (title, subtitle, description, keywords), privacy answers (microphone usage only), screenshots (6.7" + 6.1"), and an optional preview video.
5. Submit for App Review and monitor status via App Store Connect. After approval, schedule or release immediately.

### Android (Google Play)

1. Set the applicationId, versionCode, and release keystore inside `android/`.
2. Generate a signed Android App Bundle (`./gradlew bundleRelease`) via Fastlane or EAS Build.
3. Upload the AAB to the Google Play Console (internal or closed testing track first).
4. Complete Play listing details (descriptions, icons, feature graphic, screenshots for phones/tablets) and the Data Safety questionnaire (microphone data processed on-device, no sharing).
5. Promote the build to production with a staged rollout and monitor Crashlytics/Play Vitals.

See [`docs/DEPLOYMENT_PLAN.md`](./docs/DEPLOYMENT_PLAN.md) for a detailed CI/CD blueprint covering branching, Fastlane lanes, secrets management, beta workflows, and rollback strategies.

## Troubleshooting

| Symptom | Possible Fix |
| --- | --- |
| Metro bundler fails with `EADDRINUSE` | Stop other Expo/Metro instances (`lsof -n -i4TCP:8081`) and restart `npm run start`. |
| iOS simulator lacks microphone input | Use a physical device; the simulator does not pipe real mic audio into the app. |
| Android build fails on M1/M2 Macs | Ensure Android SDK/NDK are installed for arm64 and run `sudo softwareupdate --install-rosetta` if Gradle requires x86 tooling. |
| Skia canvas renders black | Verify the Skia package is configured and restart the bundler after clearing cache (`npm run start -- --clear`). |

## Contributing

1. Fork the repository and create a topic branch: `git checkout -b feature/<short-description>`.
2. Implement your changes with tests and docs.
3. Run `npm run lint`, `npm run test`, and `npm run typecheck` to verify code quality.
4. Update relevant documentation (README, `docs/`, in-app help) for new features.
5. Submit a pull request with screenshots or videos highlighting visual/audio changes. Include latency metrics for DSP updates when possible.

## License

Copyright © Two Wheels, One Alignment Moment contributors. Released under the MIT License. See [LICENSE](./LICENSE) for details.
