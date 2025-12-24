/* eslint-disable import/order */
import type { PitchEvent } from '@native/modules/specs/PitchDetectorNativeModule';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import TunerScreen from '@components/TunerScreen';
import React from 'react';
import { AppState, Platform } from 'react-native';

type PermissionState = {
  status: 'granted' | 'denied';
  granted: boolean;
  canAskAgain: boolean;
};

jest.mock('expo-audio', () => {
  const permissionState = {
    status: 'granted',
    granted: true,
    canAskAgain: true,
  };

  const getRecordingPermissionsAsync = jest.fn(() => Promise.resolve({ ...permissionState }));
  const requestRecordingPermissionsAsync = jest.fn(() => Promise.resolve({ ...permissionState }));

  return {
    getRecordingPermissionsAsync,
    requestRecordingPermissionsAsync,
    __setPermissionState: (next: PermissionState) => {
      permissionState.status = next.status;
      permissionState.granted = next.granted;
      permissionState.canAskAgain = next.canAskAgain;
    },
    __getPermissionsMock: getRecordingPermissionsAsync,
    __requestPermissionsMock: requestRecordingPermissionsAsync,
  };
});

jest.mock('@native/modules/specs/PitchDetectorNativeModule', () => ({
  isPitchDetectorModuleAvailable: true,
}));

const pitchListeners: ((event: PitchEvent) => void)[] = [];

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
      jest.requireMock('expo-audio');

    __setPermissionState({ status: 'granted', granted: true, canAskAgain: true });
    __getPermissionsMock.mockClear();
    __requestPermissionsMock.mockClear();

    (Platform as any).OS = 'ios';
    (AppState as any).addEventListener = jest.fn(() => ({ remove: jest.fn() }));
  });

  it('surfaces the permission screen when microphone access is denied', async () => {
    const { __setPermissionState } = jest.requireMock('expo-audio');
    __setPermissionState({ status: 'denied', granted: false, canAskAgain: false });

    const { findByText } = render(<TunerScreen />);

    expect(await findByText('Microphone access needed')).toBeOnTheScreen();
    expect(await findByText('Open Settings')).toBeOnTheScreen();
  });

  it('explains the need for microphone access before requesting permission', async () => {
    const { __setPermissionState, __requestPermissionsMock } = jest.requireMock('expo-audio');

    __setPermissionState({ status: 'undetermined', granted: false, canAskAgain: true });

    const { findByText } = render(<TunerScreen />);

    const promptTitle = await findByText('Allow microphone for live tuning');
    expect(promptTitle).toBeOnTheScreen();

    await act(async () => {
      __setPermissionState({ status: 'granted', granted: true, canAskAgain: true });
      fireEvent.press(await findByText('Enable microphone access'));
    });

    await waitFor(() => {
      expect(__requestPermissionsMock).toHaveBeenCalled();
    });
  });

  it('starts the detector when permission is granted', async () => {
    const detector = jest.requireMock('@native/modules/PitchDetector');
    const { __getPermissionsMock } = jest.requireMock('expo-audio');

    const { queryByText } = render(<TunerScreen />);

    await waitFor(() => {
      expect(detector.start).toHaveBeenCalled();
    });
    expect(queryByText('Microphone access needed')).toBeNull();
    expect(__getPermissionsMock).toHaveBeenCalled();
  });

  it('updates the tuner display in response to pitch events', async () => {
    jest.useFakeTimers();
    const perfNow =
      globalThis.performance && typeof globalThis.performance.now === 'function'
        ? jest.spyOn(globalThis.performance, 'now').mockImplementation(() => Date.now())
        : null;
    try {
      render(<TunerScreen />);

      await act(async () => {
        await Promise.resolve();
      });

      expect(pitchListeners.length).toBeGreaterThan(0);

      const payload: PitchEvent = {
        isValid: true,
        probability: 0.92,
        midi: 64,
        cents: 2,
        noteName: 'E4',
        frequency: 329.63,
      };

      for (let i = 0; i < 8; i += 1) {
        await act(async () => {
          pitchListeners[0]({ ...payload, probability: 1 });
          jest.advanceTimersByTime(20);
        });
      }

      for (let i = 0; i < 4; i += 1) {
        await act(async () => {
          jest.advanceTimersByTime(300);
          pitchListeners[0]({ ...payload, probability: 1 });
          jest.advanceTimersByTime(20);
        });
      }

      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByTestId('center-note')).toHaveTextContent('E');
    } finally {
      perfNow?.mockRestore();
      jest.useRealTimers();
    }
  });
});
