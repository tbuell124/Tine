# Audio Stack Migration Plan

## Overview
Expo's managed wrappers made Phase 1 prototyping extremely fast, but they also insert
extra buffering layers that directly add latency to the microphone capture path. As we
enter the pitch-detection milestones we need deterministic, single-hop access to the
hardware audio units. This plan documents the migration away from Expo AV and related
wrappers toward platform-native engines that we control end to end.

## Goals
- Hit the < 10 ms capture-to-analysis latency budget defined in the product requirements.
- Avoid audio drop-outs by eliminating double buffering and dynamic allocations during
  steady-state processing.
- Keep the JavaScript/TypeScript surface area identical so that the tuning UI does not
  need to change when the native pipeline is swapped in.

## Decisions
1. **iOS microphone capture moves to `AVAudioEngine`.**
   - Build a dedicated Swift module that configures an input node + manual render block.
   - Force the hardware I/O buffer size to 128 frames (or the smallest value allowed on
device) and set the sample rate to 48 kHz to match the DSP algorithms.
   - Stream audio buffers into a lock-free ring buffer exposed through a TurboModule so
     the JavaScript pitch detector can read frames without blocking the audio thread.
2. **Android microphone capture is handled by Oboe.**
   - Implement a lightweight C++ layer (via JNI) that opens a low-latency input stream
     with `PerformanceMode::LowLatency` and `SharingMode::Exclusive` when hardware allows.
   - Mirror the iOS ring buffer API surface to keep the TypeScript bindings identical.
3. **Expo AV is removed from the dependency tree.** We will lean on Expo's router and
   build tooling but the audio bridge is now fully native. Development builds will rely
   on `expo prebuild` + custom dev clients instead of Expo Go.
4. **Sensor data also migrates to native bridges.** Expo Sensors remain temporarily while
the orientation visualisations are fine-tuned, but CoreMotion (iOS) and Android Sensor
Manager shims will replace them before the latency hardening milestone so we can control
threading and sample frequencies explicitly.

## Migration Steps
1. **Create the native modules.**
   - iOS: `ios/TineAudioEngine.swift` exposes start/stop, buffer dequeue, and an event
     emitter for diagnostics.
   - Android: `android/app/src/main/java/.../OboeAudioEngine.kt` proxies into C++ for the
     realtime path and posts frames through a shared memory buffer.
2. **Add TypeScript bindings.** Extend `src/native/modules/specs/PitchDetectorNativeModule.ts`
   with the ring buffer contract (allocate, read, release) and update the generated
   NativeModule spec.
3. **Replace Expo AV usage.** Remove any `expo-av` imports, update dependency manifests,
   and ensure Metro aliases the new TurboModule entry points.
4. **Build custom dev clients.** Configure `eas.json` profiles that produce iOS `.ipa`
   and Android `.apk` dev clients embedding the new modules. Document the workflow in
   the README so the team stops relying on Expo Go.
5. **Bench latency.** Instrument both native engines with high-resolution timestamps to
   log capture-to-detection latency. Add these metrics to `docs/performance-monitoring.md`.

## Impact on Developers
- **Setup changes:** Running `expo prebuild` (or `npx expo run:ios` / `run:android`) is
  now required whenever the native audio code changes. The README quick-start will gain
  a "Custom Dev Client" section describing the flow.
- **Testing:** Jest continues to cover JavaScript logic. Add platform unit tests for the
  new native audio components and schedule hardware smoke tests before every release.
- **Timeline:** Migration work is budgeted as part of the Phase 2 audio milestone and
  must complete before DSP accuracy work begins, otherwise latency will invalidate the
  tuning heuristics.

## Open Questions
- Should we expose harmonic analysis hooks (FFT buffers) directly from the native layer
  to reduce JS-side processing cost?
- Can we share parts of the Oboe integration with future Android features (e.g. backing
  track playback) without compromising the recorder's exclusive mode?
- What telemetry granularity is required to distinguish device-specific latency issues
  in production, and how do we surface that in privacy-preserving ways?
