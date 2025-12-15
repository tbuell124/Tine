import React from 'react';
import {
  AppState,
  type AppStateStatus,
  PermissionsAndroid,
  Platform
} from 'react-native';

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

export function usePitchDetection(): PitchDetectionStatus {
  const { state, actions } = useTuner();
  const { showNotification } = useNotifications();
  const availability = isPitchDetectorModuleAvailable;
  const [permission, setPermission] = React.useState<PermissionState>(
    Platform.OS === 'android' ? 'unknown' : 'granted'
  );
  const manualModeRef = React.useRef(state.settings.manualMode);
  const runningRef = React.useRef(false);
  const detectorOptions = React.useMemo(
    () => getDetectorOptionsForSettings(state.settings),
    [state.settings]
  );

  React.useEffect(() => {
    manualModeRef.current = state.settings.manualMode;
  }, [state.settings.manualMode]);

  const requestPermission = React.useCallback(async () => {
    if (Platform.OS !== 'android') {
      setPermission('granted');
      return true;
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
      showNotification({
        message:
          'Unable to request microphone permission. Open system settings to re-enable access.',
      });
      return false;
    }
  }, [showNotification]);

  React.useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    if (permission !== 'unknown') {
      return;
    }

    const ensurePermission = async () => {
      try {
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
        });
      }
    };

    void ensurePermission();
  }, [permission, requestPermission, showNotification]);

  const stopDetector = React.useCallback(async () => {
    if (!availability || !runningRef.current) {
      return;
    }

    try {
      await PitchDetector.stop();
      logger.info('detector_stop', 'Stopped pitch detector');
    } catch (error) {
      logger.warn('detector_stop', 'Failed to stop pitch detector', { error });
    } finally {
      runningRef.current = false;
    }
  }, [availability]);

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

  React.useEffect(() => {
    if (!availability) {
      return;
    }

    const handlePitch = (event: PitchEvent) => {
      if (manualModeRef.current) {
        return;
      }

      const timestamp = event.timestamp ?? getMonotonicTime();

      if (!event.isValid) {
        actions.setPitch({
          midi: null,
          cents: 0,
          noteName: null,
          confidence: event.probability ?? 0,
          updatedAt: timestamp
        });
        actions.setAngles({ inner: 0 });
        return;
      }

      const noteName: NoteName = (event.noteName as NoteName | undefined) ??
        midiToNoteName(Math.round(event.midi));

      actions.setPitch({
        midi: event.midi,
        cents: event.cents,
        noteName,
        confidence: event.probability,
        updatedAt: timestamp
      });

      actions.setAngles({
        outer: midiToOuterDegrees(event.midi),
        inner: centsToDegrees(event.cents)
      });
    };

    const subscription = PitchDetector.addPitchListener(handlePitch);

    if (permission === 'granted') {
      void startDetector();
    }

    return () => {
      subscription.remove();
      void stopDetector();
    };
  }, [actions, availability, permission, startDetector, stopDetector]);

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
        return;
      }

      if (nextState === 'active') {
        void startDetector();
      } else if (nextState === 'background' || nextState === 'inactive') {
        void stopDetector();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [availability, permission, startDetector, stopDetector]);

  return React.useMemo(
    () => ({ available: availability, permission, requestPermission }),
    [availability, permission, requestPermission]
  );
}

export default usePitchDetection;
