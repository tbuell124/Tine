import React from 'react';
import {
  AppState,
  type AppStateStatus,
  Linking,
  PermissionsAndroid,
  Platform
} from 'react-native';
import { Audio } from 'expo-av';

import { getDetectorOptionsForSettings, useTuner } from '@state/TunerStateContext';
import {
  centsToDegrees,
  midiToNoteName,
  NOTE_STEP_DEG,
  type NoteName
} from '@utils/music';
import { getMonotonicTime } from '@utils/clock';
import { logger } from '@utils/logger';
import * as PitchDetector from '@native/modules/PitchDetector';
import {
  isPitchDetectorModuleAvailable,
  type PitchEvent
} from '@native/modules/specs/PitchDetectorNativeModule';
import { useNotifications } from '@state/NotificationContext';

export type PermissionState = 'unknown' | 'granted' | 'denied';

export interface PitchDetectionStatus {
  available: boolean;
  permission: PermissionState;
  requestPermission: () => Promise<boolean>;
  openSettings: () => Promise<void>;
}

const normaliseDegrees = (angle: number): number => {
  if (!Number.isFinite(angle)) {
    return 0;
  }

  let result = angle % 360;
  if (result > 180) {
    result -= 360;
  } else if (result < -180) {
    result += 360;
  }

  return result;
};

const midiToOuterDegrees = (midi: number): number => {
  if (!Number.isFinite(midi)) {
    return 0;
  }

  const rounded = Math.round(midi);
  const noteIndex = ((rounded % 12) + 12) % 12;
  const degrees = noteIndex * NOTE_STEP_DEG;
  return normaliseDegrees(degrees);
};

const clampConfidence = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }

  if (value <= 0) {
    return 0;
  }

  if (value >= 1) {
    return 1;
  }

  return Number(value.toFixed(4));
};

const NOTE_CHANGE_HYSTERESIS_MS = 220;
const HOLD_LAST_STABLE_MS = 520;
const ADAPTIVE_WINDOW_MS = 8000;
const ADAPTIVE_MIN_FRAMES = 5;
const ADAPTIVE_STABLE_CONFIDENCE = 0.45;
const ADAPTIVE_GATE_MIN = 0.07;
const ADAPTIVE_GATE_MAX = 0.35;

type AdaptiveProfileId = 'low' | 'mid' | 'high';

type AdaptiveProfileConfig = {
  id: AdaptiveProfileId;
  maxCenterMidi: number;
  /** Proportion of the previous stable frame retained while smoothing. */
  smoothingMix: number;
  /** Offset applied to the detector probability gate. */
  gateOffset: number;
};

type AdaptiveRuntimeProfile = AdaptiveProfileConfig & {
  gate: number;
  centerMidi: number;
  spread: number;
};

type StableFrame = { midi: number; confidence: number; timestamp: number };

const ADAPTIVE_PROFILES: AdaptiveProfileConfig[] = [
  {
    id: 'low',
    maxCenterMidi: 52,
    smoothingMix: 0.48,
    gateOffset: -0.025,
  },
  {
    id: 'mid',
    maxCenterMidi: 64,
    smoothingMix: 0.32,
    gateOffset: 0,
  },
  {
    id: 'high',
    maxCenterMidi: Number.POSITIVE_INFINITY,
    smoothingMix: 0.18,
    gateOffset: 0.02,
  },
];

const clampGate = (threshold: number | undefined): number => {
  if (!Number.isFinite(threshold)) {
    return ADAPTIVE_GATE_MIN;
  }

  return Math.min(ADAPTIVE_GATE_MAX, Math.max(ADAPTIVE_GATE_MIN, Number(threshold)));
};

const smoothValue = (previous: number, next: number, mix: number): number => {
  const weight = Math.min(0.95, Math.max(0, mix));
  return previous * weight + next * (1 - weight);
};

export function usePitchDetection(): PitchDetectionStatus {
  const { state, actions } = useTuner();
  const { showNotification } = useNotifications();
  const availability = isPitchDetectorModuleAvailable;
  const [permission, setPermission] = React.useState<PermissionState>('unknown');
  const manualModeRef = React.useRef(state.settings.manualMode);
  const detectorOptions = React.useMemo(
    () => getDetectorOptionsForSettings(state.settings),
    [state.settings]
  );
  const confidenceGateRef = React.useRef(detectorOptions.threshold);
  const stablePitchRef = React.useRef({
    midi: state.pitch.midi,
    cents: state.pitch.cents,
    noteName: state.pitch.noteName,
    confidence: state.pitch.confidence,
    updatedAt: state.pitch.updatedAt,
  });
  const candidateRef = React.useRef<{
    midi: number;
    noteName: NoteName;
    cents: number;
    confidence: number;
    startedAt: number;
  } | null>(null);
  const fadeFrameRef = React.useRef<number | null>(null);
  const fadeStartRef = React.useRef<number | null>(null);
  const fadeBaselineRef = React.useRef(0);
  const runningRef = React.useRef(false);
  const permissionAlertRef = React.useRef(false);
  const restartTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const adaptiveHistoryRef = React.useRef<StableFrame[]>([]);
  const adaptiveProfileRef = React.useRef<AdaptiveRuntimeProfile>({
    ...ADAPTIVE_PROFILES[1],
    gate: clampGate(detectorOptions.threshold),
    centerMidi: state.pitch.midi ?? 69,
    spread: 0,
  });

  React.useEffect(() => {
    manualModeRef.current = state.settings.manualMode;
  }, [state.settings.manualMode]);

  React.useEffect(() => {
    const clampedGate = clampGate(detectorOptions.threshold);
    confidenceGateRef.current = clampedGate;
    adaptiveProfileRef.current = { ...adaptiveProfileRef.current, gate: clampedGate };

    if (availability) {
      PitchDetector.setThreshold(clampedGate);
    }
  }, [availability, detectorOptions.threshold]);

  React.useEffect(() => {
    stablePitchRef.current = {
      midi: state.pitch.midi,
      cents: state.pitch.cents,
      noteName: state.pitch.noteName,
      confidence: state.pitch.confidence,
      updatedAt: state.pitch.updatedAt,
    };
  }, [state.pitch]);

  const openSystemSettings = React.useCallback(async () => {
    try {
      await Linking.openSettings();
    } catch (error) {
      logger.warn('permission', 'Failed to open system settings', { error });
    }
  }, []);

  const clearFade = React.useCallback(() => {
    if (fadeFrameRef.current !== null) {
      cancelAnimationFrame(fadeFrameRef.current);
      fadeFrameRef.current = null;
    }
    fadeStartRef.current = null;
  }, []);

  const deactivateAudioSession = React.useCallback(async () => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: false,
        interruptionModeIOS: Audio.INTERRUPTION_MODE_IOS_DO_NOT_MIX,
        interruptionModeAndroid: Audio.INTERRUPTION_MODE_ANDROID_DO_NOT_MIX,
        shouldDuckAndroid: false,
        staysActiveInBackground: false,
        playThroughEarpieceAndroid: false,
      });
    } catch (error) {
      logger.warn('audio', 'Failed to deactivate audio session', { error });
    }
  }, []);

  const updateAdaptiveProfile = React.useCallback(
    (midi: number, confidence: number, timestamp: number) => {
      if (!Number.isFinite(midi) || confidence < ADAPTIVE_STABLE_CONFIDENCE) {
        return;
      }

      const history = adaptiveHistoryRef.current;
      history.push({ midi, confidence, timestamp });
      const windowStart = timestamp - ADAPTIVE_WINDOW_MS;
      while (history.length > 0 && history[0].timestamp < windowStart) {
        history.shift();
      }

      if (history.length < ADAPTIVE_MIN_FRAMES) {
        return;
      }

      const sortedMidis = [...history]
        .sort((a, b) => a.midi - b.midi)
        .map((frame) => frame.midi);
      const centerMidi = sortedMidis[Math.floor(sortedMidis.length / 2)];
      const minMidi = sortedMidis[0];
      const maxMidi = sortedMidis[sortedMidis.length - 1];
      const spread = maxMidi - minMidi;

      const resolvedProfile =
        ADAPTIVE_PROFILES.find((profile) => centerMidi <= profile.maxCenterMidi) ??
        ADAPTIVE_PROFILES[ADAPTIVE_PROFILES.length - 1];

      const baseGate = clampGate(detectorOptions.threshold);
      const nextGate = clampGate(baseGate + resolvedProfile.gateOffset);

      const previous = adaptiveProfileRef.current;
      const smoothingChanged =
        Math.abs(previous.smoothingMix - resolvedProfile.smoothingMix) > 0.001;
      const gateChanged = Math.abs(previous.gate - nextGate) > 0.001;
      const centerChanged =
        Math.abs(previous.centerMidi - centerMidi) > 0.49 || previous.spread !== spread;

      if (!smoothingChanged && !gateChanged && !centerChanged) {
        return;
      }

      adaptiveProfileRef.current = {
        ...resolvedProfile,
        gate: nextGate,
        centerMidi,
        spread,
      };
      confidenceGateRef.current = nextGate;

      if (availability) {
        PitchDetector.setThreshold(nextGate);
      }

      logger.info('adaptive_profile', 'Updated detector auto-range', {
        profile: resolvedProfile.id,
        centerMidi: Number(centerMidi.toFixed(2)),
        spread: Number(spread.toFixed(2)),
        gate: nextGate,
      });
    },
    [availability, detectorOptions.threshold],
  );

  const applyAdaptiveSmoothing = React.useCallback(
    (payload: {
      midi: number | null;
      cents: number;
      confidence: number;
    }): { midi: number | null; cents: number; confidence: number } => {
      const baseline = stablePitchRef.current;
      const profile = adaptiveProfileRef.current;

      if (payload.midi === null || baseline.midi === null) {
        return payload;
      }

      const sameRounded = Math.round(payload.midi) === Math.round(baseline.midi);
      if (!sameRounded) {
        return payload;
      }

      const mix = profile.smoothingMix;
      const midi = smoothValue(baseline.midi, payload.midi, mix);
      const cents = smoothValue(baseline.cents, payload.cents, mix);
      const confidence = clampConfidence(
        smoothValue(baseline.confidence ?? 0, payload.confidence ?? 0, mix),
      );

      return { midi, cents, confidence };
    },
    [],
  );

  const commitPitch = React.useCallback(
    (payload: Partial<{
      midi: number | null;
      cents: number;
      noteName: NoteName | null;
      confidence: number;
      updatedAt: number;
    }>) => {
      const baseline = stablePitchRef.current;
      const next = {
        midi: payload.midi ?? baseline.midi,
        cents: payload.cents ?? baseline.cents,
        noteName: payload.noteName ?? baseline.noteName,
        confidence: clampConfidence(payload.confidence ?? baseline.confidence ?? 0),
        updatedAt: payload.updatedAt ?? getMonotonicTime(),
      };

      stablePitchRef.current = next;

      actions.setPitch(next);

      if (next.midi !== null) {
        actions.setAngles({
          outer: midiToOuterDegrees(next.midi),
          inner: centsToDegrees(next.cents),
        });
      } else {
        actions.setAngles({ inner: 0 });
      }
    },
    [actions],
  );

  const startHoldFade = React.useCallback(
    (startTime?: number) => {
      clearFade();
      candidateRef.current = null;

      const baselineConfidence = clampConfidence(stablePitchRef.current.confidence ?? 0);
      fadeStartRef.current = startTime ?? getMonotonicTime();
      fadeBaselineRef.current = baselineConfidence;

      if (baselineConfidence <= 0) {
        commitPitch({
          midi: null,
          cents: 0,
          noteName: null,
          confidence: 0,
        });
        return;
      }

      const tick = () => {
        if (fadeStartRef.current === null) {
          return;
        }

        const elapsed = getMonotonicTime() - fadeStartRef.current;
        const progress = Math.min(elapsed / HOLD_LAST_STABLE_MS, 1);
        const nextConfidence = fadeBaselineRef.current * (1 - progress);

        commitPitch({ confidence: nextConfidence });

        if (progress >= 1) {
          commitPitch({
            midi: null,
            cents: 0,
            noteName: null,
            confidence: 0,
          });
          clearFade();
          return;
        }

        fadeFrameRef.current = requestAnimationFrame(tick);
      };

      fadeFrameRef.current = requestAnimationFrame(tick);
    },
    [clearFade, commitPitch],
  );

  const clearPendingRestart = React.useCallback(() => {
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
  }, []);

  React.useEffect(() => {
    const configureAudioSession = async () => {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          interruptionModeIOS: Audio.INTERRUPTION_MODE_IOS_DO_NOT_MIX,
          interruptionModeAndroid: Audio.INTERRUPTION_MODE_ANDROID_DO_NOT_MIX,
          shouldDuckAndroid: false,
          staysActiveInBackground: false,
          playThroughEarpieceAndroid: false
        });
      } catch (error) {
        logger.warn('audio', 'Failed to configure audio session', { error });
      }
    };

    void configureAudioSession();

    return () => {
      clearPendingRestart();
    };
  }, [clearPendingRestart]);

  const requestPermission = React.useCallback(async () => {
    if (Platform.OS === 'ios') {
      try {
        const { status, granted, canAskAgain } = await Audio.requestPermissionsAsync();
        const isGranted = status === 'granted' || granted;
        setPermission(isGranted ? 'granted' : 'denied');

        if (!isGranted) {
          permissionAlertRef.current = true;
          showNotification({
            message:
              'Microphone permission is required for pitch detection. Enable access to continue tuning.',
            actionLabel: canAskAgain ? 'Grant Access' : 'Open Settings',
            onAction: canAskAgain ? () => void requestPermission() : () => void openSystemSettings()
          });
        }

        return isGranted;
      } catch (error) {
        logger.warn('permission', 'Microphone permission request failed on iOS', { error });
        setPermission('denied');
        permissionAlertRef.current = true;
        showNotification({
          message:
            'Unable to request microphone permission. Use the Settings button to enable access.',
          actionLabel: 'Open Settings',
          onAction: () => void openSystemSettings()
        });
        return false;
      }
    }

    try {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: 'Allow Tine to use the microphone',
          message: 'Tine needs microphone access to analyse your instrument in real time.',
          buttonPositive: 'Allow',
          buttonNegative: 'Deny'
        }
      );
      const granted = result === PermissionsAndroid.RESULTS.GRANTED;
      setPermission(granted ? 'granted' : 'denied');
      if (!granted) {
        permissionAlertRef.current = true;
        showNotification({
          message:
            'Microphone permission is required for pitch detection. Please allow access and try again.',
          actionLabel: 'Retry',
          onAction: () => {
            void requestPermission();
          }
        });
      }
      return granted;
    } catch (error) {
      logger.warn('permission', 'Microphone permission request failed', { error });
      setPermission('denied');
      permissionAlertRef.current = true;
      showNotification({
        message:
          'Unable to request microphone permission. Open system settings to re-enable access.',
      });
      return false;
    }
  }, [openSystemSettings, showNotification]);

  React.useEffect(() => {
    if (permission !== 'unknown') {
      return;
    }

    const ensurePermission = async () => {
      try {
        if (Platform.OS === 'ios') {
          const { status, granted } = await Audio.getPermissionsAsync();
          if (status === 'granted' || granted) {
            setPermission('granted');
            return;
          }

          const result = await requestPermission();
          if (!result) {
            setPermission('denied');
          }
          return;
        }

        const hasPermission = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
        );
        if (hasPermission) {
          setPermission('granted');
          return;
        }

        const granted = await requestPermission();
        if (!granted) {
          setPermission('denied');
        }
      } catch (error) {
        logger.warn('permission', 'Unable to verify microphone permission', { error });
        setPermission('denied');
        showNotification({
          message: 'Microphone permission check failed. Please enable access in system settings.',
          actionLabel: 'Open Settings',
          onAction: () => void openSystemSettings()
        });
      }
    };

    void ensurePermission();
  }, [openSystemSettings, permission, requestPermission, showNotification]);

  React.useEffect(() => {
    if (permission !== 'denied') {
      if (permission === 'granted') {
        permissionAlertRef.current = false;
      }
      return;
    }

    if (!permissionAlertRef.current) {
      permissionAlertRef.current = true;
      showNotification({
        message:
          'Microphone access is disabled. Use the Settings button to re-enable audio detection.',
        actionLabel: 'Open Settings',
        onAction: () => void openSystemSettings()
      });
    }
  }, [openSystemSettings, permission, showNotification]);

  const stopDetector = React.useCallback(async () => {
    if (!availability || !runningRef.current) {
      await deactivateAudioSession();
      return;
    }

    try {
      await PitchDetector.stop();
      logger.info('detector_stop', 'Stopped pitch detector');
    } catch (error) {
      logger.warn('detector_stop', 'Failed to stop pitch detector', { error });
    } finally {
      runningRef.current = false;
      await deactivateAudioSession();
    }
  }, [availability, deactivateAudioSession]);

  const startDetector = React.useCallback(async () => {
    if (!availability || permission !== 'granted' || runningRef.current) {
      return;
    }

    try {
      await PitchDetector.start(detectorOptions);
      logger.info('detector_start', 'Started pitch detector', detectorOptions);
      runningRef.current = true;
    } catch (error) {
      logger.error('detector_start', 'Failed to start pitch detector', { error, detectorOptions });
      const message = error instanceof Error ? error.message : String(error);
      if (/denied|permission/i.test(message)) {
        setPermission((prev) => (prev === 'granted' ? 'denied' : prev));
        showNotification({
          message: 'Pitch detector could not start because microphone access was revoked. Please re-enable permission.',
          actionLabel: 'Retry',
          onAction: () => {
            void requestPermission();
          }
        });
        return;
      }

      showNotification({
        message: 'Pitch detector failed to start. Try restarting detection or checking audio permissions.',
        actionLabel: 'Retry',
        onAction: () => {
          void startDetector();
        }
      });
    }
  }, [availability, permission, detectorOptions, requestPermission, showNotification]);

  const scheduleRestart = React.useCallback(() => {
    if (permission !== 'granted') {
      return;
    }

    clearPendingRestart();
    restartTimeoutRef.current = setTimeout(() => {
      restartTimeoutRef.current = null;
      void startDetector();
    }, 400);
  }, [clearPendingRestart, permission, startDetector]);

  React.useEffect(() => {
    if (!availability) {
      return;
    }

    const handlePitch = (event: PitchEvent) => {
      if (manualModeRef.current) {
        return;
      }

      const timestamp = event.timestamp ?? getMonotonicTime();
      clearFade();

      const confidence = clampConfidence(event.probability ?? 0);
      const confidenceGate = confidenceGateRef.current ?? detectorOptions.threshold ?? 0.12;

      if (!event.isValid || confidence < confidenceGate) {
        startHoldFade(timestamp);
        return;
      }

      const resolvedMidi = event.midi;
      const roundedMidi = Math.round(resolvedMidi);
      const stableMidi =
        stablePitchRef.current.midi === null
          ? null
          : Math.round(stablePitchRef.current.midi);
      const noteName: NoteName = (event.noteName as NoteName | undefined) ??
        midiToNoteName(roundedMidi);

      const smoothed = applyAdaptiveSmoothing({
        midi: resolvedMidi,
        cents: event.cents,
        confidence,
      });

      if (stableMidi === null || stableMidi === roundedMidi) {
        candidateRef.current = null;
        commitPitch({
          midi: smoothed.midi,
          cents: smoothed.cents,
          noteName,
          confidence: smoothed.confidence,
          updatedAt: timestamp,
        });
        updateAdaptiveProfile(resolvedMidi, confidence, timestamp);
        return;
      }

      const existingCandidate = candidateRef.current;
      if (existingCandidate && Math.round(existingCandidate.midi) === roundedMidi) {
        candidateRef.current = {
          ...existingCandidate,
          cents: event.cents,
          confidence,
        };

        if (timestamp - existingCandidate.startedAt >= NOTE_CHANGE_HYSTERESIS_MS) {
          const commitPayload = applyAdaptiveSmoothing({
            midi: resolvedMidi,
            cents: event.cents,
            confidence,
          });
          commitPitch({
            midi: commitPayload.midi,
            cents: commitPayload.cents,
            noteName,
            confidence: commitPayload.confidence,
            updatedAt: timestamp,
          });
          updateAdaptiveProfile(resolvedMidi, confidence, timestamp);
          candidateRef.current = null;
        }
        return;
      }

      candidateRef.current = {
        midi: resolvedMidi,
        cents: event.cents,
        confidence,
        noteName,
        startedAt: timestamp,
      };
    };

    const subscription = PitchDetector.addPitchListener(handlePitch);

    if (permission === 'granted') {
      void startDetector();
    }

    return () => {
      subscription.remove();
      PitchDetector.removeAllListeners();
      void stopDetector();
    };
  }, [
    availability,
    applyAdaptiveSmoothing,
    clearFade,
    commitPitch,
    detectorOptions.threshold,
    permission,
    startDetector,
    startHoldFade,
    stopDetector,
    updateAdaptiveProfile,
  ]);

  React.useEffect(() => {
    if (!availability) {
      return;
    }

    const audioModule = Audio as unknown as Record<string, any>;

    const handleInterruption = (event: any) => {
      const rawType = event?.type ?? event?.interruptionType ?? event?.interruption ?? event?.state;
      const normalised = typeof rawType === 'string' ? rawType.toLowerCase() : rawType;
      const isBegin =
        normalised === 'began' ||
        normalised === 'begin' ||
        normalised === 'start' ||
        normalised === 'started' ||
        normalised === 'duck' ||
        event?.active === false ||
        event?.isActive === false;
      const isEnd =
        normalised === 'ended' ||
        normalised === 'end' ||
        normalised === 'resume' ||
        normalised === 'unduck' ||
        event?.active === true ||
        event?.isActive === true;
      const handled = isBegin || isEnd;

      if (isBegin || !isEnd) {
        clearPendingRestart();
        void stopDetector();
      }

      if ((isEnd || !handled) && permission === 'granted') {
        scheduleRestart();
      }
    };

    const handleRouteChange = () => {
      if (permission !== 'granted') {
        return;
      }

      clearPendingRestart();
      void stopDetector();
      scheduleRestart();
    };

    const attachListener = (
      methodNames: string[],
      handler: (event: unknown) => void,
    ): (() => void) | undefined => {
      for (const name of methodNames) {
        const candidate = audioModule?.[name];
        if (typeof candidate === 'function') {
          const subscription = candidate(handler);
          return () => {
            if (typeof subscription === 'function') {
              subscription();
              return;
            }

            if (subscription?.remove) {
              subscription.remove();
            }
          };
        }
      }

      return undefined;
    };

    const removeInterruption = attachListener(
      ['addAudioInterruptionListener', 'setAudioSessionInterruptionListener'],
      handleInterruption,
    );
    const removeRouteChange = attachListener(
      ['addAudioRouteChangeListener', 'addAudioRoutesChangeListener', 'addAudioDeviceChangeListener'],
      handleRouteChange,
    );

    return () => {
      removeInterruption?.();
      removeRouteChange?.();
    };
  }, [availability, clearPendingRestart, permission, scheduleRestart, stopDetector]);

  React.useEffect(() => () => clearPendingRestart(), [clearPendingRestart]);

  React.useEffect(() => () => clearFade(), [clearFade]);

  React.useEffect(
    () => () => {
      PitchDetector.removeAllListeners();
      void deactivateAudioSession();
    },
    [deactivateAudioSession],
  );

  React.useEffect(() => {
    if (!availability) {
      return;
    }

    if (permission !== 'granted') {
      void stopDetector();
      return;
    }

    void startDetector();
  }, [availability, permission, startDetector, stopDetector]);

  React.useEffect(() => {
    if (!availability) {
      return;
    }

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (permission !== 'granted') {
        clearPendingRestart();
        return;
      }

      if (nextState === 'active') {
        scheduleRestart();
      } else if (nextState === 'background' || nextState === 'inactive') {
        clearPendingRestart();
        void stopDetector();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      clearPendingRestart();
      subscription.remove();
    };
  }, [availability, clearPendingRestart, permission, scheduleRestart, startDetector, stopDetector]);

  return React.useMemo(
    () => ({ available: availability, permission, requestPermission, openSettings: openSystemSettings }),
    [availability, openSystemSettings, permission, requestPermission]
  );
}

export default usePitchDetection;
