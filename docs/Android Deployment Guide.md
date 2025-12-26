# Android Deployment Guide

This guide covers building and distributing the Android version of Tine.

## Quickstart

1. Install Android Studio, SDK 35, and JDK 17.
2. Install dependencies:

```bash
npm install
```

3. Build a dev client (required for native module testing):

```bash
npm run android
```

4. Build a release configuration:

```bash
npm run build:android
```

## Notes

- Expo Go does not include the native pitch detector module.
- Update `expo.android.package`, `expo.android.versionCode`, and `expo.version` in `app.json` before release.
- If you use EAS Build, add and maintain `eas.json` and run `eas build --platform android`.

## Verification checklist

- Test on a physical device; emulators often lack real mic input.
- Confirm pitch updates and the dial renders smoothly.
