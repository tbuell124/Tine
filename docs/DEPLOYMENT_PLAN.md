# Deployment Plan – Two Wheels, One Alignment Moment

This document captures the end-to-end process for delivering the tuner to the Apple App Store and Google Play Store. It assumes a React Native + Skia implementation with native audio bridges, and it prioritizes low-latency audio performance on physical devices.

## 1. Environments & Tooling

| Layer | Purpose | Tooling |
| --- | --- | --- |
| Source control | Collaboration & CI triggers | GitHub (main branch protected, PR reviews required) |
| CI/CD | Automated builds, testing, artifact signing | GitHub Actions + Fastlane |
| Distribution | Beta & production delivery | TestFlight (iOS), Google Play Console (Android) |
| Analytics & crash reporting | Post-release insights | Sentry, Firebase Crashlytics |
| Feature flags | Remote configuration | LaunchDarkly (optional) |

## 2. Branching & Release Cadence

- **Main branch** – Always releasable. Locked behind reviews and status checks (lint, unit tests, type checks, build verifications).
- **Release branches** – Named `release/<version>` and cut from `main` at code freeze. Hotfixes branch from the release branch and merge back into `main` and `release`.
- **Versioning** – Semantic versioning `MAJOR.MINOR.PATCH`. Align iOS `CFBundleShortVersionString` and Android `versionName` / `versionCode`.
- **Cadence** – Start with a 4-week release cycle; shorten as confidence grows.

## 3. Continuous Integration

GitHub Actions pipeline runs on every pull request:

1. **Install dependencies** – Cache `node_modules`, CocoaPods, and Gradle artifacts for faster runs.
2. **Static checks** – `yarn lint`, `yarn test`, TypeScript type checks (`tsc --noEmit`).
3. **Unit tests** – Jest for JS/TS logic; Swift/Kotlin unit tests for audio bridges.
4. **Build verification** – `xcodebuild` for a Release-configuration simulator build; `./gradlew assembleRelease` for Android (unsigned).
5. **Artifact upload** – On tagged builds (`v*`), produce signed IPA/AAB via Fastlane lanes and attach as workflow artifacts.

## 4. Secrets Management

- Use GitHub Actions secrets for API keys, signing certificates, and store credentials.
- Store Apple App Store Connect API key (p8) and key ID, team ID.
- Store Google Play JSON service account key for Play API.
- Encrypt signing certificates (iOS `.p12`, Android keystore) with strong passphrases; store passphrases in GitHub secrets.

## 5. Build & Signing Automation (Fastlane)

Create platform-specific lanes under `fastlane/`.

### iOS (`fastlane/Fastfile`)

- `lane :build` – Installs pods, increments build number, runs tests, and produces a signed IPA using Xcode 15.x.
- `lane :beta` – Calls `build`, then `pilot` to upload to TestFlight with release notes.
- `lane :release` – Uses `deliver` to submit metadata, screenshots, and binary to App Store review.
- Signing managed via Xcode automatic signing or `match` (preferred) with a private git repo holding certificates.

### Android (`fastlane/Fastfile`)

- `lane :build` – Runs `./gradlew bundleRelease` with the release keystore.
- `lane :beta` – Uploads the AAB to an internal testing track using `supply` with changelog entries.
- `lane :release` – Promotes from beta track to production after staged rollout approval.

## 6. Beta Testing Workflow

1. **Internal QA** – Install development builds via Xcode/Android Studio on a set of reference devices (iPhone SE, iPhone 15 Pro, Pixel 6, budget Android).
2. **Closed beta** – Publish to TestFlight (up to 10k testers) and Google Play Closed Testing track. Gather feedback on UI fidelity, latency, and stability.
3. **Instrumentation** – Enable in-app logging toggled by a debug menu accessible via triple-tap on the background (excluded from production builds).
4. **Feedback Loop** – Aggregate bug reports and analytics in Linear/Jira. Block releases until critical issues are resolved.

## 7. Release Checklist

- [ ] Update app version and build numbers.
- [ ] Finalize changelog and release notes emphasizing new features or fixes.
- [ ] Run full CI pipeline on the release branch.
- [ ] Generate store screenshots (device frames showing wheel alignment, lock state, manual override) and preview videos.
- [ ] Confirm privacy policy URL and support links are current.
- [ ] Validate accessibility (VoiceOver, TalkBack) passes smoke tests.
- [ ] Ensure haptics degrade gracefully on devices lacking Taptic Engine/advanced vibration hardware.

## 8. Store Submission Requirements

### iOS

- **App Store metadata** – Title, subtitle, description, keywords, support URL, marketing URL, screenshots (6.7" & 6.1"), optional preview video.
- **App privacy** – Declare microphone usage for pitch detection; explain data handling and lack of tracking.
- **Sign-in with Apple** – Not required (no account system).
- **Export compliance** – Self-classify as non-encryption or exempt (audio processing only).

### Android

- **Google Play listing** – Full description, short description, icon (512×512), feature graphic (1024×500), screenshots (phones and 7"/10" tablets).
- **Content rating** – Complete questionnaire (should yield Everyone rating).
- **Data safety** – Declare microphone usage and explain on-device processing; no data sharing.
- **Device catalog** – Target API level ≥ 34, support both arm64-v8a and x86_64 for emulators.

## 9. Monitoring & Post-Release

- Enable Sentry + Crashlytics to capture crashes and performance metrics.
- Log tuning lock events, average cents error, and session lengths (anonymized, aggregated) to understand engagement.
- Set up uptime pings for any backend services (if future remote features added).
- Schedule weekly triage of crash spikes and user feedback.

## 10. Rollback Strategy

- **iOS** – Remove the build from sale in App Store Connect; re-submit the previous stable build if necessary.
- **Android** – Use Google Play staged rollout controls or roll back to a prior release in production track.
- Maintain capability to push hotfix builds via release branches and expedited review requests (documented in Fastlane lanes).

## 11. Device Lab & Performance Validation

- Maintain a small fleet of physical devices covering: iPhone SE (2nd gen), iPhone 13 mini, iPhone 15 Pro, Pixel 4a, Pixel 6, Samsung Galaxy A52.
- Validate 60 fps rendering, < 10 ms audio latency, and consistent haptic timing across hardware.
- Use the deployment pipelines to generate profiling builds with FPS overlays and audio latency diagnostics before each major release.

## 12. Documentation & Knowledge Sharing

- Update `README.md` and `docs/` with any changes to tooling, onboarding, or release steps.
- Record deployment walk-through videos for the team wiki.
- Host post-release retrospectives to capture lessons learned and refine this plan.

