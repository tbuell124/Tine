# Native Audio Integration Guide

This document describes the pitch detection pipeline used by Tine today.

## Contract

The TurboModule contract lives at:
- `src/native/modules/specs/PitchDetectorNativeModule.ts`

```ts
type StartOptions = { bufferSize?: number; threshold?: number; estimator?: string };
type StartResult = { sampleRate: number; bufferSize: number; threshold: number; estimator?: string; neuralReady?: boolean };

start(options): Promise<StartResult>;
stop(): Promise<boolean>;
setThreshold(threshold: number): void;
```

Pitch events carry: `isValid`, `frequency`, `midi`, `cents`, `probability`, `noteName`, and `timestamp`.

## Web implementation

The web implementation lives in:
- `src/native/modules/PitchDetector.web.ts`
- `src/native/modules/web/workletUrl.web.ts`
- `src/native/modules/web/YinWorkletProcessor.js`

It uses an AudioWorklet processor with a ScriptProcessor fallback. Both paths apply smoothing and emit pitch events to the UI. Microphone access requires HTTPS or localhost.

## Native implementation

The repository currently includes the TypeScript contract and web fallback, but it does not include the iOS/Android native bridge sources. A custom dev client is still required on device because the TurboModule must be built into the native shell.

If you reintroduce native bridges, keep the API contract and event payloads in sync with the TypeScript spec.

## Tuning parameters

- Threshold and buffer size are configured in `usePitchDetection` when starting the detector.
- The UI uses a fixed A4 = 440 Hz mapping.
