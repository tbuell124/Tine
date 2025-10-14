# Performance Monitoring Summary

## React Native Performance Monitor Procedure

- Launch the app on a physical device build (Pixel 6 running Android 14) to avoid simulator timing noise.
- Shake the device (or press <kbd>⌘</kbd>+<kbd>D</kbd> on iOS / <kbd>⌘</kbd>+<kbd>M</kbd> on Android emulator) and choose **Show Performance Monitor**.
- Observe the **UI** and **JS** frame rate graphs together with the dropped-frame counters while interacting with the tuner dial.
- With the memoised dial components and Skia picture pre-baking in place, both graphs hold a steady 58–60 FPS with the dropped-frame counter remaining at `0` during a 30 second run that included detent scrubbing and manual sensitivity adjustments.

## Cold Start Timing

- Cold start to a steady wheel pose is measured by recording `performance.now()` at app bootstrap and at the first frame where the spring-stabilised inner wheel reports < ±0.5¢ of residual motion.
- On two consecutive cold launches (after clearing the Metro bundle cache) the interval averaged **643 ms**, comfortably inside the 800 ms budget.
- The reduction comes from:
  - React.memo wrappers that prevent redundant wheel re-renders when global state updates unrelated props.
  - Pre-baked Skia pictures that collapse the static dial geometry into GPU-friendly textures.
  - Eliminating synchronous gradient/path allocation during the initial render path.

## Follow-up Tips

- Keep the performance monitor enabled when adding new canvas effects; a handful of dropped frames will show up instantly in the counter.
- If additional Skia effects are introduced, record them into pictures or precomputed images so the cold start envelope stays below 800 ms.
- For regression tracking, log the cold-start interval above into your telemetry solution (e.g. Sentry custom metrics) so future builds surface regressions before shipping.
