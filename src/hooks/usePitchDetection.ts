import * as PitchDetector from '@native/modules/PitchDetector';
import {
  isPitchDetectorModuleAvailable,
  type PitchEvent,
} from '@native/modules/specs/PitchDetectorNativeModule';
import { getMonotonicTime } from '@utils/clock';
import { centsBetweenFrequencies, closestNoteToFrequency, midiToNoteName } from '@utils/music';
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import React from 'react';
import { AppState, type AppStateStatus, Linking, PermissionsAndroid, Platform } from 'react-native';

export type PermissionState = 'unknown' | 'granted' | 'denied';

export interface PitchState {
  midi: number | null;
  cents: number;
  noteName: string | null;
  frequency: number | null;
  confidence: number;
  updatedAt: number;
}

export interface PitchDetectionStatus {
  available: boolean;
  pitch: PitchState;
  permission: PermissionState;
  listening: boolean;
  requestPermission: () => Promise<boolean>;
  openSettings: () => Promise<void>;
}

const DEFAULT_PITCH: PitchState = {
  midi: null,
  cents: 0,
  noteName: null,
  frequency: null,
  confidence: 0,
  updatedAt: 0,
};

const clampConfidence = (value: number | undefined): number => {
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

export function usePitchDetection(): PitchDetectionStatus {
  const availability = isPitchDetectorModuleAvailable;
  const [permission, setPermission] = React.useState<PermissionState>('unknown');
  const [pitch, setPitch] = React.useState<PitchState>(DEFAULT_PITCH);
  const [listening, setListening] = React.useState(false);

  const detectorRunningRef = React.useRef(false);
  const subscriptionRef = React.useRef<{ remove: () => void } | null>(null);
  const smoothedConfidenceRef = React.useRef(0);
  const lastUiDispatchRef = React.useRef(0);
  const anchorFreqRef = React.useRef<number | null>(null);
  const anchorStartedAtRef = React.useRef<number | null>(null);
  const freqMedianRef = React.useRef<number[]>([]);
  const MIN_UI_INTERVAL_MS = 16;
  const MIN_FREQ = 20;
  const MAX_FREQ = 20000;
  const ANCHOR_WINDOW_MS = 120;
  const ANCHOR_MAX_DRIFT_CENTS = 80;

  const openSettings = React.useCallback(async () => {
    if (Platform.OS === 'web') {
      console.warn('Opening browser settings is not supported from the tuner UI.');
      return;
    }

    try {
      await Linking.openSettings();
    } catch (error) {
      console.warn('Unable to open system settings', error);
    }
  }, []);

  const stopDetector = React.useCallback(async () => {
    if (subscriptionRef.current) {
      subscriptionRef.current.remove();
      subscriptionRef.current = null;
    }

    if (!detectorRunningRef.current) {
      return;
    }

    try {
      await PitchDetector.stop();
    } catch (error) {
      console.warn('Failed to stop pitch detector', error);
    } finally {
      detectorRunningRef.current = false;
      setListening(false);
    }
  }, []);

  const handlePitch = React.useCallback((event: PitchEvent) => {
    const updatedAt = event.timestamp ?? getMonotonicTime();
    const sinceLastUi = updatedAt - lastUiDispatchRef.current;

    if (!event.isValid) {
      smoothedConfidenceRef.current = 0;
      anchorFreqRef.current = null;
      anchorStartedAtRef.current = null;
      freqMedianRef.current = [];
      setPitch((current) => ({
        ...current,
        midi: null,
        cents: 0,
        noteName: null,
        frequency: null,
        confidence: 0,
        updatedAt,
      }));
      return;
    }

    const rawConfidence = clampConfidence(event.probability);
    const smoothAlpha = 0.15;
    const smoothedConfidence =
      smoothedConfidenceRef.current + (rawConfidence - smoothedConfidenceRef.current) * smoothAlpha;
    smoothedConfidenceRef.current = smoothedConfidence;

    // Reject frames with weak periodicity or out-of-range frequency (guitar-optimised window).
    const hasFrequency = Number.isFinite(event.frequency) && event.frequency > 0;
    if (!hasFrequency || (event.frequency ?? 0) < MIN_FREQ || (event.frequency ?? 0) > MAX_FREQ) {
      return;
    }

    const frequency = event.frequency ?? 0;

    if (sinceLastUi < MIN_UI_INTERVAL_MS) {
      return;
    }

    // Onset anchor: lock near the first strong reading for a short window to avoid octave jumps.
    if (anchorFreqRef.current === null) {
      anchorFreqRef.current = frequency;
      anchorStartedAtRef.current = updatedAt;
    } else if (
      anchorStartedAtRef.current !== null &&
      updatedAt - anchorStartedAtRef.current <= ANCHOR_WINDOW_MS
    ) {
      const drift = Math.abs(centsBetweenFrequencies(anchorFreqRef.current, frequency));
      if (drift > ANCHOR_MAX_DRIFT_CENTS) {
        // Ignore implausible jumps during the anchor window.
        return;
      }
    } else {
      anchorFreqRef.current = null;
      anchorStartedAtRef.current = null;
    }

    // Short-term median smoothing over the last few frames to suppress jitter.
    freqMedianRef.current = [...freqMedianRef.current.slice(-4), frequency];
    const sorted = [...freqMedianRef.current].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const medianFreq = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

    if (sinceLastUi < MIN_UI_INTERVAL_MS) {
      return;
    }
    lastUiDispatchRef.current = updatedAt;

    // Gate extremely low confidence to reduce jitter.
    if (smoothedConfidence < 0.05) {
      setPitch((current) => ({
        ...current,
        midi: null,
        cents: 0,
        noteName: null,
        frequency: null,
        confidence: smoothedConfidence,
        updatedAt,
      }));
      return;
    }

    const derivedFrequency = Number.isFinite(medianFreq) && medianFreq > 0 ? medianFreq : null;
    const derivedNote = derivedFrequency ? closestNoteToFrequency(derivedFrequency) : null;
    const fallbackNoteName = Number.isFinite(event.midi)
      ? midiToNoteName(Math.round(event.midi))
      : null;

    setPitch({
      midi: derivedNote ? derivedNote.midi : Number.isFinite(event.midi) ? event.midi : null,
      cents: derivedNote ? derivedNote.cents : Number.isFinite(event.cents) ? event.cents : 0,
      noteName: derivedNote ? derivedNote.noteName : (event.noteName ?? fallbackNoteName),
      frequency: derivedFrequency,
      confidence: smoothedConfidence,
      updatedAt,
    });
  }, []);

  const startDetector = React.useCallback(async () => {
    if (!availability || permission !== 'granted' || detectorRunningRef.current) {
      return;
    }

    const preferredEstimator: PitchDetector.StartOptions['estimator'] = 'yin';
    const preferredSampleRate = Platform.OS === 'android' ? 48000 : 44100;
    const preferredBufferSize = 4096;
    const preferredThreshold = Platform.OS === 'web' ? 0.1 : 0.08;
    try {
      await PitchDetector.start({
        threshold: preferredThreshold,
        bufferSize: preferredBufferSize,
        sampleRate: preferredSampleRate,
        estimator: preferredEstimator,
      });
      subscriptionRef.current = PitchDetector.addPitchListener(handlePitch);
      detectorRunningRef.current = true;
      setListening(true);
    } catch (error) {
      console.warn('Failed to start pitch detector', error);
      detectorRunningRef.current = false;
      setListening(false);
    }
  }, [availability, handlePitch, permission]);

  const requestPermission = React.useCallback(async () => {
    if (Platform.OS === 'ios') {
      try {
        const { status, granted } = await requestRecordingPermissionsAsync();
        const isGranted = status === 'granted' || granted;
        setPermission(isGranted ? 'granted' : 'denied');
        return isGranted;
      } catch (error) {
        console.warn('Microphone permission request failed on iOS', error);
        setPermission('denied');
        return false;
      }
    }

    if (Platform.OS === 'android') {
      try {
        const result = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: 'Allow Tine to use the microphone',
            message: 'Tine needs microphone access to analyse your instrument in real time.',
            buttonPositive: 'Allow',
            buttonNegative: 'Deny',
          },
        );
        const granted = result === PermissionsAndroid.RESULTS.GRANTED;
        setPermission(granted ? 'granted' : 'denied');
        return granted;
      } catch (error) {
        console.warn('Microphone permission request failed on Android', error);
        setPermission('denied');
        return false;
      }
    }

    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setPermission('denied');
        return false;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      stream.getTracks().forEach((track) => {
        track.stop();
      });
      setPermission('granted');
      return true;
    } catch (error) {
      console.warn('Microphone permission request failed on web', error);
      setPermission('denied');
      return false;
    }
  }, []);

  React.useEffect(() => {
    const ensurePermission = async () => {
      if (permission !== 'unknown') {
        return;
      }

      try {
        if (Platform.OS === 'ios') {
          const { status, granted } = await getRecordingPermissionsAsync();
          if (status === 'granted' || granted) {
            setPermission('granted');
            return;
          }

          if (status === 'denied') {
            setPermission('denied');
            return;
          }

          setPermission('unknown');
          return;
        }

        if (Platform.OS === 'android') {
          const hasPermission = await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          );
          if (hasPermission) {
            setPermission('granted');
            return;
          }

          setPermission('unknown');
          return;
        }

        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
          setPermission('denied');
          return;
        }

        const webPermission = await (async (): Promise<PermissionState> => {
          if (typeof navigator === 'undefined' || !('permissions' in navigator)) {
            return 'unknown';
          }

          try {
            const result = await (
              navigator as Navigator & { permissions: { query: any } }
            ).permissions.query({
              // PermissionName is available in lib.dom but we fall back to string to avoid TS lib drift.
              name: 'microphone' as PermissionName,
            });

            if (result.state === 'granted') {
              return 'granted';
            }

            if (result.state === 'denied') {
              return 'denied';
            }

            return 'unknown';
          } catch (error) {
            console.warn('Unable to query browser microphone permission', error);
            return 'unknown';
          }
        })();

        setPermission(webPermission);
      } catch (error) {
        console.warn('Unable to verify microphone permission', error);
        setPermission('denied');
      }
    };

    ensurePermission().catch(() => {});
  }, [permission]);

  React.useEffect(() => {
    if (!availability) {
      return undefined;
    }

    const handleAppStateChange = async (nextState: AppStateStatus) => {
      if (permission !== 'granted') {
        return;
      }

      if (nextState === 'active') {
        await startDetector();
      } else {
        await stopDetector();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [availability, permission, startDetector, stopDetector]);

  React.useEffect(() => {
    if (!availability) {
      return;
    }

    if (permission === 'granted') {
      startDetector().catch(() => {});
    } else {
      stopDetector().catch(() => {});
    }
  }, [availability, permission, startDetector, stopDetector]);

  React.useEffect(
    () => () => {
      stopDetector().catch(() => {});
      PitchDetector.removeAllListeners();
    },
    [stopDetector],
  );

  return React.useMemo(
    () => ({
      available: availability,
      pitch,
      permission,
      listening,
      requestPermission,
      openSettings,
    }),
    [availability, listening, openSettings, permission, pitch, requestPermission],
  );
}

export default usePitchDetection;
