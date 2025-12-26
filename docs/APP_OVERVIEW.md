# Tine Overview

## Repo map

- `App.tsx` - App entry point and root container.
- `src/components/` - UI components (main screen in `TunerScreen.tsx`).
- `src/hooks/` - Pitch detection lifecycle and permissions.
- `src/native/` - TurboModule contract and web fallback code.
- `docs/` - Requirements and deployment guides.

## Mission

Tine is a single-screen tuner that shows a rotating note ring and a fixed fine-tune reference. It reads microphone input, derives pitch, and presents a clear in-tune indicator with color feedback.

## Primary flow

1. App renders `TunerScreen`.
2. `usePitchDetection` requests mic permission and starts the pitch detector.
3. The UI updates note labels, ring rotation, and fine-tune needle based on pitch events.

## Platform behavior

- iOS/Android: Uses the native pitch detector TurboModule. Requires a custom dev client (`expo run:*`).
- Web: Uses an AudioWorklet with a ScriptProcessor fallback. Requires mic permission and a secure origin.

## Key files

- `src/components/TunerScreen.tsx` - Dial UI and animation.
- `src/hooks/usePitchDetection.ts` - Permissions and detector lifecycle.
- `src/native/modules/specs/PitchDetectorNativeModule.ts` - Native module contract.
- `src/native/modules/PitchDetector.web.ts` - Web implementation.

## Configuration

- `app.json` - bundle IDs, permissions, and Expo settings.
- `package.json` - scripts and dependency versions.

## Notes

- Expo Go does not include the native pitch detector module.
- No remote API calls are used; audio is processed locally.
