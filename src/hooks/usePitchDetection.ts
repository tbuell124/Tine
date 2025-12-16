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

export function usePitchDetection(): PitchDetectionStatus {
  const { state, actions } = useTuner();
  const { showNotification } = useNotifications();
  const availability = isPitchDetectorModuleAvailable;
  const [permission, setPermission] = React.useState<PermissionState>('unknown');
  const manualModeRef = React.useRef(state.settings.manualMode);
  const runningRef = React.useRef(false);
  const permissionAlertRef = React.useRef(false);
  const restartTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const detectorOptions = React.useMemo(
    () => getDetectorOptionsForSettings(state.settings),
    [state.settings]
  );

  React.useEffect(() => {
    manualModeRef.current = state.settings.manualMode;
  }, [state.settings.manualMode]);

  const openSystemSettings = React.useCallback(async () => {
    try {
      await Linking.openSettings();
    } catch (error) {
      logger.warn('permission', 'Failed to open system settings', { error });
    }
  }, []);

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
