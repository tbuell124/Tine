# Tine Tuner

Tine is a React Native + Expo tuner that targets iOS, Android, and web. It uses a native pitch detector on device builds and a Web Audio fallback in the browser. The UI is a single-screen dial with a fixed fine-tune needle and rotating note/tick ring.

Status: active development. Use the deployment guides in `docs/` when preparing builds for distribution.

## Table of contents

1. Project overview
2. Prerequisites
3. Clone the repository
4. Install dependencies
5. Run the app locally
6. Project structure
7. Quality checks
8. Deployment guides
9. Troubleshooting

## Project overview

- Single-screen tuner UI in `src/components/TunerScreen.tsx`.
- Pitch detection hook in `src/hooks/usePitchDetection.ts`.
- Native module contract in `src/native/modules/specs/PitchDetectorNativeModule.ts`.
- Web fallback uses AudioWorklet with a ScriptProcessor fallback.
- Expo Go does not include the native module; use a custom dev client for native testing.

## Prerequisites

- Node.js 20 or 22 LTS
- npm (bundled with Node) or Yarn via Corepack
- Xcode 15+ (macOS, for iOS builds)
- Android Studio + SDK (for Android builds)

See `docs/Requirements.md` for the full checklist.

## Clone the repository

```bash
git clone https://github.com/tylerbuell/Tine.git
cd Tine
```

## Install dependencies

```bash
npm install
npx pod-install ios
```

## Run the app locally

```bash
npm run start
```

Targets:
- iOS: `npm run ios` (custom dev client)
- Android: `npm run android` (custom dev client)
- Web: `npm run web`

## Project structure

```
.
+- android/                 # Native Android host project
+- assets/                  # App icons, splash art
+- docs/                    # Requirements + deployment guides
+- ios/                     # Native iOS host project
+- src/                     # TypeScript source
+- App.tsx                  # App entry point
+- app.json                 # Expo configuration
+- package.json             # Scripts and dependencies
```

## Quality checks

```bash
npm run lint
npm run test
npm run format:check
```

## Deployment guides

- `docs/iOS Deployment Guide.md`
- `docs/Android Deployment Guide.md`
- `docs/Web Deployment Guide.md`

## Troubleshooting

- Expo Go does not support the native pitch detector module. Use `npm run ios` or `npm run android` to build a dev client.
- Browser mic access requires a secure origin (HTTPS) or localhost.
- If Metro gets stuck on port 8081, stop other Metro processes and restart `npm run start`.
