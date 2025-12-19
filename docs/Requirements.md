# Development Environment Requirements

This document consolidates every tool and library you need to install before working on Tine. Follow the platform-specific prerequisites first, then install the JavaScript dependencies listed in [`package.json`](../package.json). All commands assume you are running them from a terminal with administrator privileges when required.

---

## 1. Operating system support

| Platform                                           | Status                    | Notes                                                                                               |
| -------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------- |
| macOS 13 Ventura or later (Apple Silicon or Intel) | ✅ Fully supported        | Required for iOS builds and recommended for Android builds.                                         |
| Windows 11 (WSL2 recommended)                      | ⚠️ Supported with caveats | Use WSL2 Ubuntu for the best Expo CLI and Android emulator experience. iOS builds are not possible. |
| Ubuntu 22.04 LTS (desktop or WSL2)                 | ✅ Fully supported        | Install Android tooling manually. iOS builds are not possible.                                      |

> **Tip:** Keep your OS patched with the latest security updates. Mobile SDKs frequently require recent system libraries.

---

## 2. Core tooling (all platforms)

Install these tools in the listed order. Version numbers reflect the minimum recommended release verified with Expo SDK 54 and React Native 0.82.

| Tool                                     | Version                     | Install command / link                                                                                                                        | Verification                                       |
| ---------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Git                                      | 2.39+                       | [git-scm.com/downloads](https://git-scm.com/downloads)                                                                                        | `git --version`                                    |
| Node.js                                  | 20 LTS or 22 LTS            | Use [nvm](https://github.com/nvm-sh/nvm#installing-and-updating) then run `nvm install 22 && nvm use 22` (or `nvm install 20 && nvm use 20`). | `node --version` should output `v20.x` or `v22.x`. |
| npm                                      | Bundled with Node           | Installed automatically with Node.                                                                                                            | `npm --version` (expect 10.x with Node 20/22).     |
| Yarn (optional)                          | 1.22+ or 4.x (via Corepack) | Enable Corepack with `corepack enable` then run `corepack prepare yarn@stable --activate`.                                                    | `yarn --version`                                   |
| Expo CLI                                 | Bundled per-project         | Use `npx expo <command>` instead of global installs.                                                                                          | `npx expo --version`                               |
| Watchman (macOS only, optional on Linux) | Latest                      | `brew install watchman` or build from source.                                                                                                 | `watchman --version`                               |

When switching Node versions with `nvm`, restart the terminal or run `hash -r` so your shell finds the new binaries.

---

## 3. iOS build requirements (macOS only)

1. **Xcode 15.0 or later** – Install from the Mac App Store or [Apple Developer downloads](https://developer.apple.com/download/all/?q=Xcode). Launch once after installation to accept the license.
2. **Command Line Tools** – Run `xcode-select --install` if they were not installed with Xcode.
3. **CocoaPods 1.15+** – Install via `sudo gem install cocoapods`. Verify with `pod --version`.
4. **Ruby 3.x** – Bundled with modern macOS releases; required for CocoaPods. Manage with [rbenv](https://github.com/rbenv/rbenv) if you need isolation.
5. **iOS device provisioning** – Sign in to Xcode with an Apple ID to generate signing certificates.

After installing the tooling, set up iOS native dependencies from the project root:

```bash
npm install
npx pod-install ios
```

`pod-install` ensures native pods stay in sync with JavaScript dependencies.

---

## 4. Android build requirements

| Component               | Version                    | Installation notes                                                                                           |
| ----------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Android Studio          | Iguana (2023.2.1) or newer | Install from [developer.android.com/studio](https://developer.android.com/studio).                           |
| Android SDK Platform    | API 35 (Android 15)        | Install via the SDK Manager in Android Studio. Include Android 13/14 if you support older devices.           |
| Android SDK Build-Tools | 35.0.0                     | Install via SDK Manager.                                                                                     |
| Android NDK (optional)  | 26.x                       | Only required when adding native C/C++ modules.                                                              |
| Java Development Kit    | JDK 17 LTS                 | Install with Android Studio or via [Adoptium Temurin 17](https://adoptium.net/temurin/releases/?version=17). |

Environment variables:

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"   # macOS default; adjust for Windows/Linux
export PATH="$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$PATH"
```

On Windows, set the equivalent variables through _System Properties → Environment Variables_ and restart your terminal.

---

## 5. Project dependency installation

From the project root:

```bash
# install JavaScript dependencies
npm install

# optionally enforce a clean slate if dependencies drift
rm -rf node_modules package-lock.json
npm install

# sync native iOS pods (macOS only)
npx pod-install ios
```

If you prefer Yarn:

```bash
corepack enable
yarn install
npx pod-install ios
```

> **Skia note:** `@shopify/react-native-skia@2.3.0` requires React 19+. Keep lockfiles checked in to avoid resolver drift.

---

## 6. Validating your setup

Run the following smoke tests after installation:

```bash
npm run start         # Launch Metro bundler via Expo
npm run lint          # Verify ESLint configuration
npm run test          # Execute Jest test suite
```

To verify native builds:

- **iOS:** Open `ios/Tine.xcworkspace` in Xcode and run the app on a simulator or device.
- **Android:** From Android Studio, select _Run → Run 'app'_. Alternatively execute `npm run android` with a booted emulator.

---

## 7. Troubleshooting checklist

- Update Xcode and Android Studio before filing build issues; outdated SDKs cause most failures.
- If Metro cannot watch files on macOS, ensure Watchman is installed and restart the service: `brew services restart watchman`.
- For `EEXIST` errors with Yarn shims, remove `/usr/local/bin/yarn` and `/usr/local/bin/yarnpkg`, then re-run `corepack enable`.
- If `pod install` fails with Ruby SSL errors, update the system certificate bundle (`sudo security delete-certificate -Z <hash>` as needed) or install Ruby via rbenv.
- On Linux, install `libc6`, `libstdc++6`, and `libncurses5` packages required by the Android command-line tools.

Once these requirements are satisfied you can iterate on Tine's codebase, run Expo locally, and produce release builds using the deployment guides in [`docs/`](./).
