import React from 'react';
import { AppState, type AppStateStatus, Linking, PermissionsAndroid, Platform } from 'react-native';
import { Audio } from 'expo-av';

import { midiToNoteName } from '@utils/music';
import { getMonotonicTime } from '@utils/clock';
import * as PitchDetector from '@native/modules/PitchDetector';
import {
  isPitchDetectorModuleAvailable,
  type PitchEvent
} from '@native/modules/specs/PitchDetectorNativeModule';

export type PermissionState = 'unknown' | 'granted' | 'denied';

export interface PitchState {
  midi: number | null;
  cents: number;
  noteName: string | null;
  confidence: number;
  updatedAt: number;
}

export interface PitchDetectionStatus {
  available: boolean;
  pitch: PitchState;
  permission: PermissionState;
  requestPermission: () => Promise<boolean>;
  openSettings: () => Promise<void>;
}

const DEFAULT_PITCH: PitchState = {
  midi: null,
  cents: 0,
  noteName: null,
  confidence: 0,
  updatedAt: 0
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

  const detectorRunningRef = React.useRef(false);
  const subscriptionRef = React.useRef<{ remove: () => void } | null>(null);

  const openSettings = React.useCallback(async () => {
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
    }
  }, []);

  const handlePitch = React.useCallback((event: PitchEvent) => {
    const updatedAt = event.timestamp ?? getMonotonicTime();

    if (!event.isValid) {
      setPitch((current) => ({ ...current, midi: null, cents: 0, noteName: null, confidence: 0, updatedAt }));
      return;
    }

    const fallbackNoteName = Number.isFinite(event.midi) ? midiToNoteName(Math.round(event.midi)) : null;

    setPitch({
      midi: Number.isFinite(event.midi) ? event.midi : null,
      cents: Number.isFinite(event.cents) ? event.cents : 0,
      noteName: event.noteName ?? fallbackNoteName,
      confidence: clampConfidence(event.probability),
      updatedAt
    });
  }, []);

  const startDetector = React.useCallback(async () => {
    if (!availability || permission !== 'granted' || detectorRunningRef.current) {
      return;
    }

    try {
      await PitchDetector.start({ threshold: 0.15, bufferSize: 1024 });
      subscriptionRef.current = PitchDetector.addPitchListener(handlePitch);
      detectorRunningRef.current = true;
    } catch (error) {
      console.warn('Failed to start pitch detector', error);
      detectorRunningRef.current = false;
    }
  }, [availability, handlePitch, permission]);

  const requestPermission = React.useCallback(async () => {
    if (Platform.OS === 'ios') {
      try {
        const { status, granted } = await Audio.requestPermissionsAsync();
        const isGranted = status === 'granted' || granted;
        setPermission(isGranted ? 'granted' : 'denied');
        return isGranted;
      } catch (error) {
        console.warn('Microphone permission request failed on iOS', error);
        setPermission('denied');
        return false;
      }
    }

    try {
      const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
        title: 'Allow Tine to use the microphone',
        message: 'Tine needs microphone access to analyse your instrument in real time.',
        buttonPositive: 'Allow',
        buttonNegative: 'Deny'
      });
      const granted = result === PermissionsAndroid.RESULTS.GRANTED;
      setPermission(granted ? 'granted' : 'denied');
      return granted;
    } catch (error) {
      console.warn('Microphone permission request failed on Android', error);
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
          const { status, granted } = await Audio.getPermissionsAsync();
          if (status === 'granted' || granted) {
            setPermission('granted');
            return;
          }

          const result = await requestPermission();
          setPermission(result ? 'granted' : 'denied');
          return;
        }

        const hasPermission = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
        if (hasPermission) {
          setPermission('granted');
          return;
        }

        const granted = await requestPermission();
        setPermission(granted ? 'granted' : 'denied');
      } catch (error) {
        console.warn('Unable to verify microphone permission', error);
        setPermission('denied');
      }
    };

    void ensurePermission();
  }, [permission, requestPermission]);

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
    return () => subscription.remove();
  }, [availability, permission, startDetector, stopDetector]);

  React.useEffect(() => {
    if (!availability) {
      return;
    }

    if (permission === 'granted') {
      void startDetector();
    } else {
      void stopDetector();
    }
  }, [availability, permission, startDetector, stopDetector]);

  React.useEffect(
    () => () => {
      void stopDetector();
      PitchDetector.removeAllListeners();
    },
    [stopDetector]
  );

  return React.useMemo(
    () => ({ available: availability, pitch, permission, requestPermission, openSettings }),
    [availability, openSettings, permission, pitch, requestPermission]
  );
}

export default usePitchDetection;
