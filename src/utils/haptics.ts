/**
 * Cross-platform haptics helper tailored for tuner interactions.
 *
 * The implementation relies on Expo's haptics module which wraps
 * `UIImpactFeedbackGenerator` / `UINotificationFeedbackGenerator` on iOS and
 * `VibrationEffect` on Android. Using the module gives us a stable, tested
 * bridge while still matching the native primitives requested for each
 * platform.
 */

import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/** Size of each detent in cents. Used by the UI when crossing tick marks. */
export const DETENT_STEP_CENTS = 5;

/** Threshold for triggering a warning rumble when the note is far out of tune. */
export const OUT_OF_TUNE_THRESHOLD_CENTS = 30;

/** Minimum interval between successive rumble events (ms). */
const RUMBLE_THROTTLE_MS = 650;

let cachedSupport: boolean | null = null;
let lastRumbleTimestamp = 0;

/**
 * Ensures we only attempt to trigger haptics on hardware that supports it.
 * The result is cached based on platform and the presence of the Haptics API.
 */
async function isHapticsSupported(): Promise<boolean> {
  if (cachedSupport != null) {
    return cachedSupport;
  }

  const hasAPI =
    typeof Haptics.impactAsync === 'function' &&
    typeof Haptics.notificationAsync === 'function' &&
    Platform.OS !== 'web';

  cachedSupport = hasAPI;
  return cachedSupport;
}

/**
 * Triggers a light impact for the 5 cents detent ticks. Maps to
 * `UIImpactFeedbackGenerator` with the light style on iOS and a subtle
 * `VibrationEffect` pulse on Android.
 */
export async function triggerLightDetent(): Promise<void> {
  if (!(await isHapticsSupported())) {
    return;
  }

  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

/**
 * Fires when the tuner locks on pitch. Delegates to
 * `UINotificationFeedbackGenerator` (success type) on iOS and the equivalent
 * positive notification vibration on Android.
 */
export async function triggerSuccessLock(): Promise<void> {
  if (!(await isHapticsSupported())) {
    return;
  }

  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

/**
 * Emits a short rumble when the tuner drifts more than +/-30 cents. Uses a heavy
 * impact on iOS (Taptic Engine) and a strong `VibrationEffect` on Android.
 * Repeated calls are throttled to avoid overwhelming the player.
 */
export async function maybeTriggerOutOfTuneRumble(centsOffset: number): Promise<void> {
  if (Math.abs(centsOffset) < OUT_OF_TUNE_THRESHOLD_CENTS) {
    return;
  }

  const now = Date.now();
  if (now - lastRumbleTimestamp < RUMBLE_THROTTLE_MS) {
    return;
  }

  if (!(await isHapticsSupported())) {
    return;
  }

  lastRumbleTimestamp = now;

  if (Platform.OS === 'ios') {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  } else if (Platform.OS === 'android') {
    // On Android the Expo wrapper drives VibrationEffect under the hood.
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  }
}

/**
 * Utility to reset throttling state - primarily useful in tests.
 */
export function resetHapticsThrottle(): void {
  lastRumbleTimestamp = 0;
}
