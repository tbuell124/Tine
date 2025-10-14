import React from 'react';
import { Text } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';

import { TunerProvider, useTuner, __testing } from '../TunerStateContext';

describe('tunerReducer', () => {
  const { tunerReducer, initialState } = __testing;

  it('maps MIDI payloads to note names when noteName is omitted', () => {
    const baseState = {
      ...initialState,
      pitch: { ...initialState.pitch, noteName: null },
    };

    const next = tunerReducer(baseState, {
      type: 'SET_PITCH',
      payload: { midi: 64 },
    });

    expect(next.pitch.noteName).toBe('E4');
  });

  it('clamps lock configuration updates into supported ranges', () => {
    const next = tunerReducer(initialState, {
      type: 'UPDATE_SETTINGS',
      payload: { lockThreshold: 12, lockDwellTime: -5 },
    });

    expect(next.settings.lockThreshold).toBeLessThanOrEqual(8);
    expect(next.settings.lockThreshold).toBeGreaterThanOrEqual(1);
    expect(next.settings.lockDwellTime).toBeGreaterThanOrEqual(0.2);
    expect(next.settings.lockDwellTime).toBeLessThanOrEqual(1.5);
  });
});

describe('TunerProvider persistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('persists sanitised settings after hydration completes', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(
      JSON.stringify({
        a4Calibration: 438,
        sensitivityRange: 25,
        lockThreshold: 3.2,
        lockDwellTime: 0.9,
      }),
    );

    const PersistTester: React.FC = () => {
      const { state, actions } = useTuner();

      React.useEffect(() => {
        if (state.settings.a4Calibration === 438) {
          actions.updateSettings({ manualMode: true, lockThreshold: 2.5 });
        }
      }, [actions, state.settings.a4Calibration]);

      return <Text testID="mode">{state.settings.manualMode ? 'manual' : 'auto'}</Text>;
    };

    render(
      <TunerProvider>
        <PersistTester />
      </TunerProvider>,
    );

    await waitFor(() =>
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        'tine:tunerSettings',
        expect.any(String),
      ),
    );

    const lastCall = (AsyncStorage.setItem as jest.Mock).mock.calls.at(-1);
    expect(lastCall).toBeDefined();
    const [, payload] = lastCall!;
    expect(JSON.parse(payload)).toEqual({
      a4Calibration: 438,
      sensitivityRange: 25,
      lockThreshold: 2.5,
      lockDwellTime: 0.9,
    });
  });
});
