# Two Wheels, One Alignment Moment

Two Wheels, One Alignment Moment is a tactile, instrument-inspired tuning experience that recreates the feel of a precision mechanical strobe tuner on mobile devices. The interface features twin concentric wheels—an outer NOTE ring that snaps in 30° segments to display the detected pitch class, and an inner CENTS ring that continuously chases the fine tuning error. When both wheels align under the 12 o'clock index, the app confirms perfect tuning with light, haptic, and audio feedback.

## Core Experience

- **Zero-touch workflow** – Launch the app and start tuning instantly. Automatic pitch detection drives the wheels without manual input.
- **Dual-wheel feedback** – Outer wheel settles on the nearest note while the inner wheel shows ±50¢ error with 5¢ detents. Alignment marks converge at the top index to signal lock.
- **Expressive feedback** – Subtle haptics, a metallic tick, index glow, and chamfer sparkle celebrate accurate tuning. Off-pitch states tint the index from red ➝ amber ➝ yellow-green.
- **Manual aids (optional)** – Swipe the outer wheel to set a target note when in manual mode, pinch the inner wheel to adjust sensitivity, and long-press the center to return to auto detection.
- **Accessibility-first** – Large high-contrast glyphs, zero color-only signaling, VoiceOver strings, and an optional frequency readout keep the tuner inclusive.

## Visual & Motion Design

- **Material language** – Brushed stainless steel rendered with anisotropic radial textures and dynamic specular arcs that respond to device tilt.
- **Micro-chamfers & depth** – 1–2 px highlights and shadows on wheel edges and subtle ambient occlusion ground the wheels against a near-black backdrop.
- **Detent storytelling** – A virtual flapper at the index vibrates as inner-wheel detent markers pass, reinforcing the mechanical illusion.
- **Responsive animation** – Outer wheel eases between notes with a critically-damped motion profile. Inner wheel springs toward the current cents value with light overshoot and micro-jitter to keep the interface feeling alive.

## Audio & Signal Processing

- **Pitch model** – Calculate MIDI note `n = 69 + 12 * log2(f / 440)`; snap to nearest note `N = round(n)` and compute cents offset `(n - N) * 100`.
- **Wheel mapping** – Outer rotation `θ = -N_mod12 * 30°`; inner rotation `θ = -cents * 3°`, giving ±150° travel for ±50¢.
- **Smoothing** – Critically-damped spring (ζ≈0.9, ω≈9–12 rad/s) applied per wheel to avoid jitter while retaining responsiveness.
- **Lock detection** – Trigger success feedback when `|cents| ≤ 2` for at least 400 ms. Optional low-frequency rumble indicates > 30¢ error.

## Technology Stack

- **React Native (iOS & Android)** with **react-native-skia** for GPU-accelerated custom rendering.
- **Native audio modules** leveraging platform audio units / AAudio via lightweight bridges for low-latency pitch capture.
- **TypeScript** shared logic for rendering math, state machines, and accessibility copy.
- **React Query / Zustand** (subject to evaluation) for lightweight state synchronization between the DSP bridge and UI layer.

## Project Structure

```
app/
├── src/
│   ├── components/      # Skia-driven wheel components and HUD widgets
│   ├── hooks/           # Audio graph lifecycle, lock logic, manual override state
│   ├── lib/             # DSP utilities, springs, constants, color ramps
│   ├── screens/         # Root tuner screen + optional settings/help views
│   └── theme/           # Shared typography, shadows, material parameters
├── ios/                 # Native iOS host, audio capture module
├── android/             # Native Android host, audio capture module
└── docs/                # Design references, deployment plans, accessibility notes
```

## Development Workflow

1. **Environment setup**
   - Install Node.js ≥ 18, Yarn or PNPM, Watchman (macOS), and Xcode / Android Studio.
   - Install React Native CLI dependencies (`cocoapods`, Android SDK/NDK).
   - Run `yarn install` (or `pnpm install`) to fetch dependencies.
2. **Run on iOS** – `cd app && npx react-native run-ios --simulator "iPhone 15"` (for device testing, open Xcode workspace and deploy to hardware).
3. **Run on Android** – `cd app && npx react-native run-android` with an emulator or connected device.
4. **Storybook/Component sandbox (optional)** – Launch a dedicated Skia preview harness for rapid iteration on wheel visuals.
5. **Testing**
   - Unit tests (`yarn test`) cover DSP utilities, lock logic, and state machines.
   - Visual regression via automated snapshots of wheel states.
   - Device shakeout on mid-tier hardware to validate 60 fps rendering and sub-10 ms audio latency.

## Roadmap Highlights

- [ ] Implement cross-platform audio capture bridge with shared DSP core.
- [ ] Build Skia-based wheel rendering primitives and lighting model.
- [ ] Add manual mode gestures, haptic hooks, and optional rumble feedback.
- [ ] Integrate accessibility improvements (VoiceOver, dynamic type adjustments).
- [ ] Polish lock animation, index bloom, and chamfer sparkle states.
- [ ] Document calibration settings, sensitivity profiles, and pro options.

## Contributing

1. Fork the repository and create a feature branch: `git checkout -b feature/amazing-idea`.
2. Run `yarn lint` and `yarn test` before committing.
3. Ensure new features include documentation updates under `docs/`.
4. Submit a pull request with screenshots or videos demonstrating visual changes.

## Licensing & Credits

- Designed and developed by the Two Wheels, One Alignment Moment team.
- Haptic and audio cues inspired by precision mechanical tuners and studio metering equipment.
- Brushed metal shader references adapted from open-source Skia examples.

