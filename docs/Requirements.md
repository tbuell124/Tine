# Development Environment Requirements

This document lists the tools required to build and run Tine.

## 1. Operating system support

| Platform | Status | Notes |
| --- | --- | --- |
| macOS 13+ | Supported | Required for iOS builds. Recommended for Android builds. |
| Windows 11 | Supported with caveats | iOS builds are not possible. Use WSL2 for best experience. |
| Ubuntu 22.04 LTS | Supported | iOS builds are not possible. |

## 2. Core tooling (all platforms)

| Tool | Recommended version | Notes |
| --- | --- | --- |
| Git | 2.39+ | `git --version` |
| Node.js | 20 or 22 LTS | Expo SDK 54 compatible |
| npm | Bundled | `npm --version` |
| Yarn (optional) | Via Corepack | `corepack enable` |
| Expo CLI | Bundled | Use `npx expo <command>` |

## 3. iOS build requirements (macOS only)

- Xcode 15+
- Command Line Tools (`xcode-select --install`)
- CocoaPods 1.15+

Setup:

```bash
npm install
npx pod-install ios
```

## 4. Android build requirements

- Android Studio (Iguana or newer)
- Android SDK Platform 35
- Build-Tools 35.0.0
- JDK 17

Environment variables:

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$PATH"
```

## 5. Validate your setup

```bash
npm run start
npm run lint
npm run test
```

## 6. Notes

- Expo Go does not include the native pitch detector module.
- Web microphone access requires HTTPS or localhost.
