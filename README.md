# Tine – Dual-Wheel Reactive Tuner

Tine is a React Native + Expo application that delivers the tactile feel of a strobe tuner with GPU-accelerated wheels and a low-latency audio pipeline. The project targets both iOS and Android using a single TypeScript codebase with platform-native audio bridges.

> **Status:** Active development. The UI is functional and the DSP stack is under construction. Use the deployment guides in [`docs/`](./docs) when preparing builds for distribution.

---

## Table of contents

1. [Project overview](#project-overview)
2. [Quick start (minimal tuner)](#quick-start-minimal-tuner)
3. [Prerequisites](#prerequisites)
4. [Clone the repository](#clone-the-repository)
5. [Install dependencies](#install-dependencies)
6. [Run the app locally](#run-the-app-locally)
7. [Project structure](#project-structure)
8. [Quality checks](#quality-checks)
9. [Deployment guides](#deployment-guides)
10. [Troubleshooting](#troubleshooting)
11. [Contributing](#contributing)
12. [License](#license)

---

## Project overview

- **Dual-wheel feedback** – Outer NOTE wheel jumps across the 12 pitch classes while the inner CENTS wheel sweeps ±50¢ in 5¢ detents, providing coarse and fine error cues at a glance.
- **Lock celebration** – When the wheels align, Tine triggers subtle haptics, a metallic tick, and an emissive glow animation to reward accuracy.
- **Skia-powered visuals** – [`@shopify/react-native-skia`](https://shopify.github.io/react-native-skia/) renders the wheels, metallic textures, and tilt-driven lighting in real time.
- **Accessibility-first UI** – VoiceOver labels, high-contrast glyphs, and optional numeric readouts keep the tuner inclusive.
- **Evolving DSP core** – Native audio bridges (Swift/Kotlin) feed TypeScript-based YIN + MPM pitch detection with adaptive smoothing.

## Quick start (minimal tuner)

The default app entry renders a simplified `TunerScreen` with a single horizontal meter and oversized note label so you can validate microphone permissions and detector wiring without the full dual-wheel treatment.【F:App.tsx†L5-L23】【F:src/components/TunerScreen.tsx†L14-L82】

1. Install dependencies with npm or Yarn (see below) and run `npm run start`.
2. Open the Expo dev client on iOS/Android or a simulator; the meter should begin tracking as soon as mic permission is granted.
3. Optional features you can layer on:
   - Sensitivity presets that trade buffer size vs. stability (`low-latency`, `balanced`, `stable`) are defined in `TunerStateContext` if you want a different default profile.【F:src/state/TunerStateContext.tsx†L12-L40】【F:src/state/TunerStateContext.tsx†L264-L277】
   - Notification overlays already ship with the screen to surface permission or detector issues; keep them mounted if you need inline prompts.【F:App.tsx†L10-L23】【F:src/components/MicPermissionScreen.tsx†L1-L112】
   - The dual-wheel Skia visuals described above remain available for future builds once the DSP stack is re-enabled.

### Adjust calibration and detection thresholds

- **Reference pitch (A4):** The YIN detector maps frequency to MIDI using a 440 Hz anchor. To change the concert pitch (e.g., to 442 Hz), update the divisor in `midiFromFrequency` within both the TypeScript and C++ YIN references, then rebuild the native clients.【F:src/native/dsp/YinPitchDetector.ts†L216-L233】【F:src/native/dsp/YinPitchDetector.cpp†L156-L170】
- **Detector probability threshold:** Each sensitivity preset sets the pitch detector’s probability gate that is forwarded to `PitchDetector.setThreshold`. Raise it for stricter locking or lower it for quicker responsiveness by editing `probabilityThreshold` in `SENSITIVITY_PRESETS`; values are clamped between 0.05–0.35 before being applied.【F:src/state/TunerStateContext.tsx†L12-L40】【F:src/state/TunerStateContext.tsx†L264-L279】

## Prerequisites

Follow this checklist before cloning the project. macOS steps are listed first because iOS builds require a Mac.

> Looking for a single place to confirm every system dependency? Review the consolidated [Requirements guide](./docs/Requirements.md) before installing tooling.

### macOS tooling

| Tool | Minimum version | Install command / link | Notes |
| --- | --- | --- | --- |
| Xcode | 15.0 | [Mac App Store](https://apps.apple.com/us/app/xcode/id497799835) or [Apple Developer downloads](https://developer.apple.com/download/all/?q=Xcode) | Launch once after installation to accept the license. |
| CocoaPods | 1.15 | `sudo gem install cocoapods` | Required for iOS native dependencies. |
| Watchman | Latest | `brew install watchman` | Improves file watching performance. |

> **App Store blocked?** Sign in to [developer.apple.com/download/all](https://developer.apple.com/download/all/?q=Xcode) and download the `.xip` installer directly. Mount the archive, drag Xcode into `/Applications`, then launch it once to finish setup.

### Cross-platform tooling

| Tool | Recommended version | Install instructions |
| --- | --- | --- |
| Node.js | 20 LTS or 22 LTS | Use [nvm](https://github.com/nvm-sh/nvm#installing-and-updating) and run `nvm install 20 && nvm use 20` (or `nvm install 22 && nvm use 22`). Expo SDK 54 officially supports the current LTS releases. |
| npm | Bundled with Node | No separate installation required. |
| Yarn (optional) | 1.22+ or 4.x (via Corepack) | Enable Corepack with `corepack enable`. Avoid `npm install --global yarn` if `/usr/local/bin/yarn` already exists. |
| Git | 2.39+ | `git --version` should report a version. Install via [git-scm.com](https://git-scm.com/downloads) if needed. |
| Expo CLI | Bundled | Use `npx expo <command>`; no global install required. |

If you previously attempted a global Yarn install and saw `EEXIST: file already exists /usr/local/bin/yarnpkg`, remove the conflicting shim (`sudo rm /usr/local/bin/yarn /usr/local/bin/yarnpkg`) or prefer Corepack.

## Clone the repository

Run the following command from any directory on your Mac (or other development machine):

```bash
git clone https://github.com/tylerbuell/Tine.git
cd Tine
```

If you use SSH keys with GitHub, substitute the HTTPS URL with `git@github.com:tylerbuell/Tine.git`.

## Install dependencies

Tine now targets Expo SDK 54 with React Native 0.82 and React 19. Install JavaScript dependencies using npm (recommended) or Yarn.

### Using npm

```bash
# Ensure you are using Node 20 or 22 LTS
node --version
npm install
npx pod-install ios
```

### Using Yarn 4 (via Corepack)

```bash
corepack enable
yarn install
npx pod-install ios
```

If the install fails with a 403 from the npm registry inside a restricted network, fetch packages from an allowed mirror or retry on a network with npm access. Skia 2.x requires React 19+, so ensure the updated peer dependencies resolve cleanly before retrying.

> **Tip:** Delete `node_modules` and `package-lock.json` (or `yarn.lock`) before retrying if the resolver becomes stuck.

## Run the app locally

```bash
# Start the Expo development server (Metro bundler)
npm run start
```

Expo opens a developer tools tab in your browser. Keep the terminal running and choose a target:

- Press `i` to launch the iOS simulator (macOS only).
- Press `a` to launch the default Android emulator.
- Scan the QR code with Expo Go on a physical device (App Store / Play Store).
- Press `w` for a web preview (mic input limited).

Live reload is enabled by default. Update files in `src/` and watch changes refresh automatically.

## Project structure

```
.
├── android/            # Native Android host project and audio bridge scaffolding
├── assets/             # App icons, splash art, and marketing imagery
├── docs/               # Platform deployment guides (iOS and Android)
├── ios/                # Native iOS host project and audio bridge scaffolding
├── src/                # TypeScript source (components, hooks, screens, theming)
├── App.tsx             # Entry point for Expo Router
├── app.json            # Expo configuration (name, slug, bundle IDs)
├── package.json        # Dependencies and npm scripts
└── README.md           # You are here
```

Key source directories:

- `src/components/` – Skia wheels, indicators, and HUD elements.
- `src/hooks/` – Audio session lifecycle, tilt detection, lock heuristics.
- `src/lib/` – DSP utilities, smoothing constants, frequency helpers.
- `src/screens/` – Primary tuner interface and future auxiliary screens.
- `src/theme/` – Typography, color ramps, and spacing tokens.

## Quality checks

Run these commands before committing code:

```bash
npm run lint         # ESLint rules (Expo + React Native)
npm run test         # Jest + Testing Library
npm run format:check # Prettier formatting verification
```

Type safety is enforced through TypeScript; add `npm run typecheck` if you enable the script.

## Deployment guides

Detailed, step-by-step release playbooks live in:

- [`docs/iOS Deployment Guide.md`](./docs/iOS%20Deployment%20Guide.md)
- [`docs/Android Deployment Guide.md`](./docs/Android%20Deployment%20Guide.md)

Each guide covers credential setup, build tooling, store submissions, and post-release monitoring.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| **Peer dependency conflicts after updating** | Run `npm install --legacy-peer-deps` only as a last resort. Prefer resolving conflicts by aligning versions with Expo SDK 54 compatibility tables. |
| **`ConfigError: Cannot determine the project's Expo SDK version because the module expo is not installed`** | Ensure `npm install` succeeds. This error is usually triggered when npm cannot reach the registry; fix connectivity and reinstall. |
| **`expo-cli` Node compatibility warning** | Use the local CLI (`npx expo ...`) with Node 20 or 22. Remove any legacy global `expo-cli` installations that expect Node 16. |
| **Yarn global install `EEXIST` errors** | Yarn was previously installed. Remove `/usr/local/bin/yarn*` or use Homebrew/Corepack instead of `npm install --global yarn`. |
| **App Store blocks Xcode downloads** | Download the `.xip` installer from the Apple Developer website, or sign out/in of the App Store, clear the App Store cache (`open -a App\ Store --args -reset`), and retry. |
| **Need to reset Xcode without full reinstall** | Delete Derived Data (`rm -rf ~/Library/Developer/Xcode/DerivedData`), clear simulators (`xcrun simctl delete unavailable`), reset command-line tools (`sudo xcode-select --reset`), and optionally remove cached downloads (`rm -rf ~/Library/Caches/com.apple.dt.Xcode`). |
| **Android build fails on Apple Silicon** | Install arm64 Android SDK/NDK packages via Android Studio and ensure Rosetta is installed if Gradle plugins require x86 binaries (`softwareupdate --install-rosetta`). |
| **Metro bundler stuck on port 8081** | Kill other Metro instances (`lsof -n -i4TCP:8081`) and restart `npm run start`. |

## Contributing

1. Fork the repository and create a topic branch: `git checkout -b feature/<short-description>`.
2. Write clear, well-documented code with inline comments where logic is complex.
3. Run the quality checks listed above.
4. Update this README or the deployment guides if behavior changes.
5. Open a pull request with screenshots or videos showcasing UI changes and any latency metrics for DSP updates.

## License

Released under the MIT License. See [LICENSE](./LICENSE) for details.
