# iOS Deployment Guide

This guide covers building and distributing the iOS version of Tine.

## Quickstart

1. Install Xcode 15+, Node 20 or 22, and CocoaPods.
2. Install dependencies:

```bash
npm install
npx pod-install ios
```

3. Build a dev client (required for native module testing):

```bash
npm run ios
```

4. Build a release configuration:

```bash
npm run build:ios
```

## Notes

- Expo Go does not include the native pitch detector module.
- Update `expo.ios.bundleIdentifier`, `expo.version`, and `expo.ios.buildNumber` in `app.json` before release.
- If you use EAS Build, add and maintain `eas.json` and run `eas build --platform ios`.

## Verification checklist

- Launch on a physical device and grant microphone permission.
- Confirm pitch updates and the dial renders smoothly.
- Capture App Store screenshots.
