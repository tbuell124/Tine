import React from 'react';
import { render, act, waitFor } from '@testing-library/react-native';

jest.mock('@shopify/react-native-skia');
jest.mock('@hooks/useSpecularHighlight', () => ({
  useSpecularHighlight: () => ({
    localAngle: 0,
    worldAngle: 0,
    width: 0.12,
    intensity: 0.6,
    tiltStrength: 0.3,
  }),
}));
jest.mock('@hooks/usePitchLock', () => ({
  usePitchLock: () => ({
    locked: false,
    status: 'near',
    accentColor: '#fff',
  }),
}));
jest.mock('react-native-gesture-handler');

import { __TEST__ as gestureTest } from 'react-native-gesture-handler';
import { TunerProvider } from '@state/TunerStateContext';
import { TunerFace } from '../TunerFace';

describe('TunerFace interactions', () => {
  beforeEach(() => {
    gestureTest.reset();
  });

  it('enables manual mode when the outer wheel pan begins', async () => {
    const screen = render(
      <TunerProvider>
        <TunerFace />
      </TunerProvider>,
    );

    expect(screen.queryByText(/Manual/)).toBeNull();

    const [outerGesture] = gestureTest.gestures;
    expect(outerGesture).toBeDefined();

    await act(async () => {
      outerGesture.handlers.onBegin?.({ x: 160, y: 0 });
    });

    await waitFor(() => {
      expect(screen.getByText(/Manual/)).toBeTruthy();
    });
  });
});
