import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { Platform, AppState } from 'react-native';

import type { PitchEvent } from '@native/modules/specs/PitchDetectorNativeModule';

import TunerScreen from '@components/TunerScreen';

type PermissionState = {
  status: 'granted' | 'denied';
  granted: boolean;
  canAskAgain: boolean;
};

jest.mock('expo-av', () => {
  const permissionState = {
    status: 'granted',
    granted: true,
    canAskAgain: true,
  };

  const listener = jest.fn((_handler) => ({ remove: jest.fn() }));

  const getPermissionsAsync = jest.fn(() => Promise.resolve({ ...permissionState }));
  const requestPermissionsAsync = jest.fn(() => Promise.resolve({ ...permissionState }));

  return {
    Audio: {
      getPermissionsAsync,
      requestPermissionsAsync,
      setAudioModeAsync: jest.fn(() => Promise.resolve()),
      INTERRUPTION_MODE_IOS_DO_NOT_MIX: 'do_not_mix_ios',
      INTERRUPTION_MODE_ANDROID_DO_NOT_MIX: 'do_not_mix_android',
      addAudioInterruptionListener: listener,
      setAudioSessionInterruptionListener: listener,
      addAudioRouteChangeListener: listener,
      addAudioRoutesChangeListener: listener,
      addAudioDeviceChangeListener: listener,
    },
    __setPermissionState: (next: PermissionState) => {
      permissionState.status = next.status;
      permissionState.granted = next.granted;
      permissionState.canAskAgain = next.canAskAgain;
    },
    __getPermissionsMock: getPermissionsAsync,
    __requestPermissionsMock: requestPermissionsAsync,
  };
});

jest.mock('@native/modules/specs/PitchDetectorNativeModule', () => ({
  isPitchDetectorModuleAvailable: true,
}));

const pitchListeners: Array<(event: PitchEvent) => void> = [];

jest.mock('@native/modules/PitchDetector', () => ({
  start: jest.fn(() => Promise.resolve({ threshold: 0.12, bufferSize: 1024, sampleRate: 48000 })),
  stop: jest.fn(() => Promise.resolve(true)),
  setThreshold: jest.fn(),
  addPitchListener: jest.fn((handler: (event: PitchEvent) => void) => {
    pitchListeners.push(handler);
    return {
      remove: () => {
        const index = pitchListeners.indexOf(handler);
        if (index >= 0) {
          pitchListeners.splice(index, 1);
        }
      },
    };
  }),
  removeAllListeners: jest.fn(),
}));

describe('usePitchDetection integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pitchListeners.splice(0, pitchListeners.length);
    const { __setPermissionState, __getPermissionsMock, __requestPermissionsMock } =
      jest.requireMock('expo-av');

    __setPermissionState({ status: 'granted', granted: true, canAskAgain: true });
    __getPermissionsMock.mockClear();
    __requestPermissionsMock.mockClear();

    (Platform as any).OS = 'ios';
    (AppState as any).addEventListener = jest.fn(() => ({ remove: jest.fn() }));
  });

  it('surfaces the permission screen when microphone access is denied', async () => {
    const { __setPermissionState } = jest.requireMock('expo-av');
    __setPermissionState({ status: 'denied', granted: false, canAskAgain: false });

    const { findByText } = render(<TunerScreen />);

    expect(await findByText('Microphone access needed')).toBeOnTheScreen();
    expect(await findByText('Open Settings')).toBeOnTheScreen();
  });

  it('starts the detector when permission is granted', async () => {
    const detector = jest.requireMock('@native/modules/PitchDetector');
    const { __getPermissionsMock } = jest.requireMock('expo-av');

    const { queryByText } = render(<TunerScreen />);

    await waitFor(() => expect(detector.start).toHaveBeenCalled());
    expect(queryByText('Microphone access needed')).toBeNull();
    expect(__getPermissionsMock).toHaveBeenCalled();
  });

  it('updates the tuner display in response to pitch events', async () => {
    render(<TunerScreen />);

    await waitFor(() => expect(pitchListeners.length).toBeGreaterThan(0));

    const payload: PitchEvent = {
      isValid: true,
      probability: 0.92,
      midi: 64,
      cents: 2,
      noteName: 'E4',
      frequency: 329.63,
      timestamp: 1000,
    };

    await act(async () => {
      pitchListeners[0](payload);
      pitchListeners[0]({ ...payload, timestamp: 1300 });
    });

    await waitFor(() => expect(screen.getByText('E')).toBeOnTheScreen());
  });
});
