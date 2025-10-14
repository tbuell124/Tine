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

Prerequisites:

- Node.js ≥ 18
- Yarn 1.x **or** npm 8+
- Xcode 15+ with command line tools (macOS)
- Android Studio (latest stable) with SDK Platform 34, NDK 26, and an Android 13+ emulator image
- Watchman (macOS) for faster file watching

Clone and run:

```bash
# Install dependencies
npm install

# Start the Expo development server
npm run start
```

Follow the on-screen Expo prompts to open the app on:

- **iOS** – press `i` to launch the iOS simulator or scan the QR code in Expo Go.
- **Android** – press `a` to launch the Android emulator or use Expo Go.
- **Web** – press `w` to open the web preview (visual fidelity only; audio capture is mobile-only).

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
