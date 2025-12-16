# Tine — Overview

## Repo Map (at a glance)
- `/App.tsx` — App entry, providers.
- `/src/components/` — UI surfaces (e.g., `TunerScreen`).
- `/src/state/` — Reducer/context for tuner state, settings persistence, notifications.
- `/src/hooks/` — Lifecycles for pitch detection and native module wiring.
- `/src/native/` — TurboModule contract plus DSP reference implementation.
- `/docs/` — Project documentation (this file).

## Mission (What)
- React Native + Expo tuner with dual-wheel + meter UI for iOS, Android, and web preview; focused on real-time pitch feedback.【See [README](../README.md) and [app.json](../app.json)】
- Presents a meter-style tuner screen that reads live pitch data and highlights in-tune states with color feedback.【See [`src/components/TunerScreen.tsx`](../src/components/TunerScreen.tsx)】
- Wraps the primary screen with providers for tuner state and toast-like notifications; main surface plus modal overlays rather than multi-route navigation.【See [`App.tsx`](../App.tsx)】
- Stores tuner preferences (e.g., sensitivity and lock behaviour) across sessions via AsyncStorage and hydrates them on launch; concert pitch is fixed to 440 Hz with no calibration control.【See [`src/state/TunerStateContext.tsx`](../src/state/TunerStateContext.tsx)】
- Integrates a native YIN-based pitch detector TurboModule with configurable buffer sizes and thresholds driven by app settings.【See [`src/hooks/usePitchDetection.ts`](../src/hooks/usePitchDetection.ts) and [`src/native/modules/specs/PitchDetectorNativeModule.ts`](../src/native/modules/specs/PitchDetectorNativeModule.ts)】

## Scope (Who/Context)
- Intended users: musicians needing precise instrument tuning; evidenced by note/cents readouts and a concert-pitch-fixed workflow (A4=440) with no in-app calibration.【See [`src/components/TunerScreen.tsx`](../src/components/TunerScreen.tsx)】
- Platform reach: iOS and Android with web preview; requires microphone permission and optional background audio handling per Expo config.【See [`app.json`](../app.json)】
- Constraints: Needs microphone access; no account system or remote API calls are present. Local-only data is persisted via AsyncStorage; no deliberate offline UX beyond that is implemented.【See [`src/hooks/usePitchDetection.ts`](../src/hooks/usePitchDetection.ts) and [`src/state/TunerStateContext.tsx`](../src/state/TunerStateContext.tsx)】
- Unclear items: No explicit target instrument list or latency guarantees in code; native bridge implementations for Android/iOS not shown here, so runtime performance characteristics are unproven.

## Action (Do) — Primary User Flows
### Flow: Start tuning session
- Start: Launch app renders `TunerScreen` inside providers.【See [`App.tsx`](../App.tsx)】
- Steps: `usePitchDetection` requests mic permission, starts native detector, and subscribes to pitch events; detected pitch updates state and meter UI shows deviation and note label.【See [`src/hooks/usePitchDetection.ts`](../src/hooks/usePitchDetection.ts) and [`src/components/TunerScreen.tsx`](../src/components/TunerScreen.tsx)】
- Data: Updates tuner state slices (pitch, angles, signal), with note name derived from MIDI.【See [`src/state/TunerStateContext.tsx`](../src/state/TunerStateContext.tsx)】
- Network: None; audio processed locally via native module.【See [`src/native/modules/specs/PitchDetectorNativeModule.ts`](../src/native/modules/specs/PitchDetectorNativeModule.ts)】
- Errors: Permission denied triggers notifications with actions; detector start failures show retry prompts.【See [`src/hooks/usePitchDetection.ts`](../src/hooks/usePitchDetection.ts)】

### Flow: Handle microphone permission
- Start: On first run or when permission unknown/denied, hook requests access (platform-specific).【See [`src/hooks/usePitchDetection.ts`](../src/hooks/usePitchDetection.ts)】
- Steps: iOS uses `expo-av` permissions; Android uses `PermissionsAndroid`; failures prompt notifications to open settings or retry.【See [`src/hooks/usePitchDetection.ts`](../src/hooks/usePitchDetection.ts)】
- Data: Permission state kept in hook local state; tuning paused if denied (detector not started).【See [`src/hooks/usePitchDetection.ts`](../src/hooks/usePitchDetection.ts)】
- Network: None.
- Errors: Permission denial triggers actionable notifications and prevents detector start; exceptions logged.【See [`src/hooks/usePitchDetection.ts`](../src/hooks/usePitchDetection.ts)】

### Lifecycle (stop conditions and interruptions)
- Detector start: initiated after microphone permission is granted in `usePitchDetection` when the app renders the primary screen.
- Detector stop: called when dependencies change (e.g., cleanup on effect unmount) or when manual mode disables detector-driven updates in the hook logic.
- Backgrounding: No explicit background handlers in code; assume detector stops when hook unmounts or app is terminated/paused by platform.
- Permission denial/regrant: Permission denial short-circuits detector start; re-running the flow (e.g., returning from settings) re-invokes permission check and start attempt.
- Audio interruptions: No explicit handling for route changes/calls found; behavior relies on underlying platform defaults.

## Parts (UI / Components)
### Screens / Routes
- **TunerScreen** (`src/components/TunerScreen.tsx`): Primary interface showing meter, note label, and color-coded in-tune feedback; initializes pitch detection hook and surfaces notifications.

### Key Components
- **NotificationSurface** (provider-backed): Displays queued notifications from `NotificationContext` actions (hook implementations not shown in this snippet).
- **NotificationProvider / TunerProvider**: Context providers for notifications and tuner state wrapping the app root.

### Design / UX Notes (from code)
- Dark theme background (`#020617`) with high-contrast indicator colors for in-tune vs out-of-tune states.
- Accessibility affordances include `accessibilityRole` labels on buttons and overlays where present.
- Gesture support via `react-native-gesture-handler` and animations via Reanimated for smooth indicator movement.

## Technical Overview
### Stack
- Framework: Expo + React Native (new architecture enabled per Expo config) targeting iOS, Android, and web preview.【See [`app.json`](../app.json) and [`README`](../README.md)】
- Language: TypeScript for app code; native DSP bridge includes TypeScript spec plus C++ YIN implementation used for tests/reference.【See [`src/native/dsp/YinPitchDetector.ts`](../src/native/dsp/YinPitchDetector.ts) and [`src/native/modules/specs/PitchDetectorNativeModule.ts`](../src/native/modules/specs/PitchDetectorNativeModule.ts)】
- Key libraries: `expo-av` for audio permissions; `react-native-gesture-handler`, `react-native-reanimated`, `@shopify/react-native-skia` (per README); AsyncStorage for persistence.【See [`src/hooks/usePitchDetection.ts`](../src/hooks/usePitchDetection.ts), [`README`](../README.md), and [`src/state/TunerStateContext.tsx`](../src/state/TunerStateContext.tsx)】
- Build tooling: npm scripts via Expo (`npm run start`, `npm run ios/android/web`); pod-install for iOS dependencies.【See [`README`](../README.md)】

### Architecture
- Single primary screen with modal overlays; providers in `App.tsx` wrap the UI. Tuner logic is centralized in `TunerStateContext` reducer/actions and consumed via hooks (`useTuner`).
- Pitch detection hook manages lifecycle: permissions, start/stop of native module, and dispatching pitch/angle updates to context, decoupling UI from native layer.
- Settings persist/hydrate via AsyncStorage; detector options derived from sensitivity presets to control native buffer size/thresholds. A4 calibration is fixed at 440 Hz with no UI toggle.
- Notification system uses context to queue/dismiss toasts with optional actions, enabling non-blocking UX for errors/permissions.

#### Architecture diagram (text)
```
App.tsx
  └─ Providers
      ├─ NotificationProvider (queue + surface)
      └─ TunerProvider (state reducer + persistence)
          └─ TunerScreen (meter + note readout)
              └─ usePitchDetection (permissions + native module lifecycle)
```

### State Model (shapes defined in code)
| State slice | Fields | Source (API/local) | Where defined |
| --- | --- | --- | --- |
| PitchState | midi, cents, noteName, confidence, updatedAt | Native pitch detector events -> context | [`src/state/TunerStateContext.tsx`](../src/state/TunerStateContext.tsx) |
| AngleState | outer, inner dial degrees | Derived from pitch or gestures | [`src/state/TunerStateContext.tsx`](../src/state/TunerStateContext.tsx) |
| TunerSettings | sensitivityRange/profile, lockThreshold, lockDwellTime, manualMode | AsyncStorage persistence; A4 fixed at 440 Hz with no exposed UI | [`src/state/TunerStateContext.tsx`](../src/state/TunerStateContext.tsx) |
| SignalState | phase, lastChange, freezeUntil, lastHeardAt | Derived from pitch activity/dropouts | [`src/state/TunerStateContext.tsx`](../src/state/TunerStateContext.tsx) |
| PitchEvent | isValid, frequency, midi, cents, probability, noteName, timestamp | Native TurboModule event payload | [`src/native/modules/specs/PitchDetectorNativeModule.ts`](../src/native/modules/specs/PitchDetectorNativeModule.ts) |

### API / Integrations
- Native pitch detector TurboModule (`PitchDetector`) exposing `start`, `stop`, `setThreshold`, and pitch event emitter; requires custom dev client (not Expo Go).【See [`src/native/modules/specs/PitchDetectorNativeModule.ts`](../src/native/modules/specs/PitchDetectorNativeModule.ts) and [`src/native/modules/PitchDetector.ts`](../src/native/modules/PitchDetector.ts)】
- No remote HTTP APIs present. Audio permissions handled via `expo-av`/`PermissionsAndroid` with optional Settings deep link for denial recovery.【See [`src/hooks/usePitchDetection.ts`](../src/hooks/usePitchDetection.ts)】
- Auth: None observed.

### Configuration / Environments
- Expo config (`app.json`) sets bundle identifiers, microphone usage description, background audio mode (iOS), and enables new architecture/Proguard on Android.
- Environment variables: None referenced in code; detector thresholds/buffer sizes derived from settings rather than env.
- Local dev setup via README install steps; requires pod-install for iOS native deps.

### Native module dev workflow
- Expo Go is insufficient because the pitch detector is a TurboModule; run on a custom dev client via `npm run ios` / `npm run android` or `expo run:*` so the native module is bundled.
- Native code resides under `android/` and `ios/` (generated shells) plus TypeScript specs under `src/native/modules/`; DSP reference code lives in `src/native/dsp/`.
- Troubleshooting: Linking issues surface as `LINKING_ERROR` in console logs; new-architecture flags are enabled in `app.json`, so ensure pods/gradle sync succeed after dependency changes.

## How to Run (Developer Quickstart)
- Install dependencies with Node 20/22 using npm or Yarn; run `npx pod-install ios` for native pods.
- Start development server: `npm run start` (Metro via Expo); use `i`/`a`/`w` shortcuts for simulators/web.
- For native module testing, run `npm run ios` / `npm run android` (or `expo run:*`) to build a dev client that includes the TurboModule.
- Quality checks: `npm run lint`, `npm run test`, `npm run format:check`.
- Logs surface in Metro terminal; native module linking errors emit console warnings (`LINKING_ERROR`).

## Known Gaps / TODOs (Based on Repo Evidence)
- DSP stack noted as "under construction"; native detector implementations for iOS/Android not shown here, limiting insight into latency/accuracy.
- No explicit tests for UI flows; existing tests focus on DSP mirror (`src/native/dsp/__tests__` not reviewed). Potential risk of regression without coverage.
- Web support likely limited by microphone/browser constraints; code paths mention limited mic input but no fallback UI.
- Error handling for manual mode and signal dropouts is partial (notifications focus on permission/persistence errors).

## Glossary
- **Lock dwell**: Minimum time the pitch must remain within threshold before considered locked; configured in settings.
- **Lock threshold**: Cent deviation tolerance for an "in-tune" state.
- **Sensitivity profile/range**: Settings that influence detector buffer size/threshold behavior.
- **Manual mode**: UI-driven pitch selection that pauses detector-driven updates.

## Performance Notes
- Designed for real-time feedback using native audio + TurboModule, but no measured end-to-end latency numbers are present in the repo.
- Adaptive smoothing/lock logic exists in state reducer and hook but is not benchmarked in code comments or tests.

## Evidence Index
- App entry/providers: [`App.tsx`](../App.tsx)
- Tuner meter UI: [`src/components/TunerScreen.tsx`](../src/components/TunerScreen.tsx)
- Tuner state and settings persistence: [`src/state/TunerStateContext.tsx`](../src/state/TunerStateContext.tsx)
- Pitch detection lifecycle & permissions: [`src/hooks/usePitchDetection.ts`](../src/hooks/usePitchDetection.ts)
- Native pitch detector contract: [`src/native/modules/specs/PitchDetectorNativeModule.ts`](../src/native/modules/specs/PitchDetectorNativeModule.ts)
- Platform configuration & permissions: [`app.json`](../app.json)
- Install/run commands: [`README.md`](../README.md)
