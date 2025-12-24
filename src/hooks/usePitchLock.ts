import { mixHexColors } from '@utils/color';
import { triggerSuccessLock } from '@utils/haptics';
import React from 'react';

import { resolveTuningState, tuningStateToColor, tuningTheme, type TuningState } from '../theme';

const RELEASE_THRESHOLD_MULTIPLIER = 1.75;
const MICRO_JITTER_INTERVAL_MS = 80;
const MIN_LOCK_THRESHOLD = 0.5;
const MIN_RELEASE_DELTA = 0.5;
const MIN_LOCK_DURATION_MS = 120;

export interface UsePitchLockOptions {
  /** Current cents deviation reported by the tuner. */
  cents: number;
  /** MIDI number of the detected pitch. `null` indicates no reliable lock. */
  midi: number | null;
  /** +/- cents window required before we enter the locked state. */
  thresholdCents: number;
  /** Milliseconds the pitch must remain within the window to register a lock. */
  dwellTimeMs: number;
}

export interface UsePitchLockState {
  /** Whether the tuner is currently considered locked. */
  locked: boolean;
  /** Current tuning status derived from cents deviation. */
  status: TuningState;
  /** Accent colour applied to the index overlay glow and rim. */
  accentColor: string;
}

const isFiniteCents = (value: number): boolean => Number.isFinite(value);

/**
 * Tracks whether the tuner should be considered "locked" by observing the cents
 * value over time. When the signal stays within a user-configurable window for
 * the specified dwell period we treat it as a lock, trigger a success haptic,
 * and swap the indicator tint to an emerald finish. Unlocking introduces a
 * small hysteresis to prevent rapid flicker.
 */
export const usePitchLock = ({
  cents,
  midi,
  thresholdCents,
  dwellTimeMs,
}: UsePitchLockOptions): UsePitchLockState => {
  const [locked, setLocked] = React.useState(false);
  const [microJitter, setMicroJitter] = React.useState(0);

  const lockStartRef = React.useRef<number | null>(null);
  const previousMidiRef = React.useRef<number | null>(midi);
  const lastLockStateRef = React.useRef(false);

  const lockThreshold = React.useMemo(() => {
    if (!Number.isFinite(thresholdCents)) {
      return MIN_LOCK_THRESHOLD;
    }
    return Math.max(MIN_LOCK_THRESHOLD, thresholdCents);
  }, [thresholdCents]);

  const dwellDuration = React.useMemo(() => {
    if (!Number.isFinite(dwellTimeMs)) {
      return MIN_LOCK_DURATION_MS;
    }

    return Math.max(MIN_LOCK_DURATION_MS, dwellTimeMs);
  }, [dwellTimeMs]);

  const releaseThreshold = React.useMemo(() => {
    const release = lockThreshold * RELEASE_THRESHOLD_MULTIPLIER;
    return Math.max(lockThreshold + MIN_RELEASE_DELTA, release);
  }, [lockThreshold]);

  // Evaluate the current lock window whenever cents or midi change.
  React.useEffect(() => {
    const now = Date.now();
    const hasPitch = midi !== null;
    const withinLockWindow = hasPitch && isFiniteCents(cents) && Math.abs(cents) <= lockThreshold;

    if (withinLockWindow) {
      lockStartRef.current ??= now;

      if (!locked && now - lockStartRef.current >= dwellDuration) {
        setLocked(true);
      }
      return;
    }

    // Outside the tight lock window so reset the timer.
    lockStartRef.current = null;

    if (locked && (!hasPitch || !isFiniteCents(cents) || Math.abs(cents) >= releaseThreshold)) {
      setLocked(false);
    }
  }, [cents, dwellDuration, lockThreshold, locked, midi, releaseThreshold]);

  // Unlock immediately if the detected MIDI pitch changes.
  React.useEffect(() => {
    const previousMidi = previousMidiRef.current;
    previousMidiRef.current = midi;

    if (previousMidi !== null && midi !== null && previousMidi !== midi && locked) {
      lockStartRef.current = null;
      setLocked(false);
    }
  }, [midi, locked]);

  // Trigger the success haptic precisely when we enter the locked state.
  React.useEffect(() => {
    const wasLocked = lastLockStateRef.current;
    if (locked && !wasLocked) {
      lastLockStateRef.current = true;
      triggerSuccessLock().catch(() => {});
      return;
    }

    if (!locked && wasLocked) {
      lastLockStateRef.current = false;
      setMicroJitter(0);
    }
  }, [locked]);

  // Animate subtle tint variations while locked so the UI feels alive.
  React.useEffect(() => {
    if (!locked) {
      setMicroJitter(0);
      return;
    }

    let frame = 0;
    let isMounted = true;
    let startTimestamp: number | null = null;
    let lastUpdate = 0;

    const tick = (timestamp: number) => {
      if (!isMounted) {
        return;
      }

      startTimestamp ??= timestamp;

      if (timestamp - lastUpdate >= MICRO_JITTER_INTERVAL_MS) {
        const elapsed = (timestamp - startTimestamp) / 1000;
        const waveA = Math.sin(elapsed * 4.2);
        const waveB = Math.sin(elapsed * 2.1 + 1.4);
        const normalised = (waveA + waveB + 2) / 4; // Range [0,1]
        setMicroJitter(normalised);
        lastUpdate = timestamp;
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);

    return () => {
      isMounted = false;
      if (frame) {
        cancelAnimationFrame(frame);
      }
    };
  }, [locked]);

  const status = React.useMemo(() => {
    const resolvedCents = midi === null || !Number.isFinite(cents) ? null : cents;
    return resolveTuningState(resolvedCents, locked);
  }, [cents, locked, midi]);

  const accentColor = React.useMemo(() => {
    if (status === 'locked') {
      const shimmer = mixHexColors(
        tuningTheme.tuningStates.locked.dark,
        tuningTheme.tuningStates.locked.light,
        0.35 + microJitter * 0.45,
      );
      return mixHexColors(tuningTheme.tuningStates.locked.base, shimmer, 0.65);
    }

    return tuningStateToColor(status);
  }, [microJitter, status]);

  return { locked, status, accentColor };
};

export default usePitchLock;
