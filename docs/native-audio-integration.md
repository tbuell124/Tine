# Native Audio Integration Guide

This guide describes the cross-platform audio capture and pitch-processing pipeline backing the `PitchDetector` native module. Both platforms now deliver contiguous `float32` frames into a lock-free circular buffer that the shared C++ YIN detector consumes before emitting `onPitchData` events to JavaScript.

## Contract recap

The TypeScript spec in `src/native/modules/specs/PitchDetectorNativeModule.ts` defines the TurboModule/bridged API:

```ts
type StartOptions = { bufferSize?: number; threshold?: number };
type StartResult = { sampleRate: number; bufferSize: number; threshold: number };

start(options): Promise<StartResult>;
stop(): Promise<boolean>;
setThreshold(threshold: number): void;
```

Events fire under the `onPitchData` name and carry `PitchEvent` payloads (`isValid`, `frequency`, `midi`, `cents`, `probability`, `noteName`). The JS client expects the module to emit data once `start` resolves and to reject `start` when the native bridge is missing.

## Shared DSP primitives

* The native layer compiles `native/cpp/YinPitchDetector.{hpp,cpp}` and `native/cpp/FloatRingBuffer.hpp`. They provide the YIN algorithm and a single-producer/single-consumer ring buffer sized to `bufferSize * 4` frames.
* `PitchResult` mirrors the TypeScript payload (`isValid`, `frequency`, `midi`, `cents`, `probability`, `noteName`) so the JS payload stays consistent across platforms.

## iOS implementation (AVAudioEngine)

1. `ios/Tine/PitchDetectorModule.mm` subclasses `RCTEventEmitter`. `RCT_EXPORT_MODULE(PitchDetector)` matches the JavaScript name.
2. `start` configures `AVAudioSession` with `.playAndRecord`, `.measurement`, a preferred sample rate of 48 kHz, and a 256-frame IO buffer before activating. It primes `AVAudioEngine`, installs an input tap that writes frames into `FloatRingBuffer`, and spins a `DispatchSourceTimer` on a background queue to drain `_bufferSize` frames into the YIN detector. Results are marshalled back to the main queue and emitted via `sendEventWithName("onPitchData", payload)`.
3. `stop` removes the tap, cancels the drain timer, stops the engine, and deactivates the session with `NotifyOthersOnDeactivation` to play nicely with other audio apps. Explicitly deactivate the session when idle to reduce battery drain instead of letting it linger in `Active`.
4. `setThreshold` updates the detector threshold at runtime without restarting the stream.
5. Overflow conditions and session errors are logged with `[PitchDetector]` prefixes to surface diagnostics in Xcode.

## Android implementation (Oboe)

1. `android/app/src/main/cpp/PitchDetectorEngine.{hpp,cpp}` manages an `AAudio` input stream configured for `PerformanceMode::LowLatency`, `SharingMode::Exclusive`, mono `PCM_FLOAT`, and a preferred 48 kHz sample rate. The data callback writes frames into the shared `FloatRingBuffer`, while a worker thread drains `bufferSize` frames for the YIN detector.
2. `PitchDetectorBridge.cpp` exposes JNI entry points (`nativeStart`, `nativeStop`, `nativeSetThreshold`, `nativeSetListener`). Results from the detector attach to the JVM on-demand and call back into the Kotlin listener with `(ZDDDDLjava/lang/String;)V` payloads.
3. `android/app/src/main/java/com/anonymous/tine/audio/PitchDetectorModule.kt` loads the `pitchdetector` shared library, wires the JNI surface into the React Native event emitter, and exposes `start`, `stop`, `setThreshold`, `addListener`, and `removeListeners` to JavaScript. `PitchDetectorPackage` registers the module with `MainApplication`.
4. `CMakeLists.txt` under `android/app/src/main/cpp` builds `libpitchdetector.so`, linking against `aaudio` and `log`. Gradle’s `externalNativeBuild` block points to this script.

## Buffer queue and lifecycle expectations

* Keep the C++ `FloatRingBuffer` lock-free and preallocated; never allocate in the audio callback. When the platform delivers larger buffers than requested, enqueue without copies by indexing into the ring rather than reshaping the data.
* Drain the queue on a background thread at `bufferSize` multiples to avoid starvation and minimise latency spikes. If the consumer lags, drop frames rather than blocking the producer.
* On iOS, call `setActive(false, .notifyOthersOnDeactivation)` once the detector stops so the audio session releases hardware and power draw returns to baseline. On Android, close the `AAudioStream` promptly and relinquish the wake lock, if held.
* Clear `NativeEventEmitter` listeners in `componentWillUnmount`/hook cleanups to avoid leaking references when the JS layer unmounts.

## Cross-platform event schema

Use the shared `PitchResult` struct to format events:

```cpp
struct PitchResult {
  bool isValid;
  float frequency;
  float midi;
  float cents;
  float probability;
  std::array<char, 4> noteName; // null-terminated
};
```

Convert `noteName` to a Swift/Kotlin string before emitting. Use `YinPitchDetector::noteNameFromMidi` to keep note spelling consistent with the UI.

## Testing & diagnostics

* The JS hook already exposes a detector banner when the module is unavailable; run `npm run start` on a device and watch for `[PitchDetector]` logs to confirm sample-rate negotiation.
* Consider adding automated sine-wave tests (XCTest / Instrumentation) to guard the YIN implementation when adjusting buffer sizes or thresholds.
* A lightweight dev command that invokes `PitchDetector.start` and prints the resolved sample rate makes it easy to verify hardware quirks during QA.

## Rollout checklist

1. Ensure Xcode has the microphone entitlement enabled (via Expo config) and Android manifests request `RECORD_AUDIO` (already committed).
2. Validate on hardware (iOS + Android) with `npm run start` to confirm events flow and the UI exits manual mode automatically when live frames arrive.
3. Monitor logs for `[PitchDetector]` warnings; they highlight buffer overruns, session restarts, or `AAudio` errors that may require tuning.

Following this blueprint drops in the native audio connectors aligned with the existing JS contract while keeping the DSP in a shared, tested C++ core.
