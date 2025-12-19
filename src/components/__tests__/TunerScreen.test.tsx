import { render } from '@testing-library/react-native';
import React from 'react';

import TunerScreen from '../TunerScreen';

jest.mock('@hooks/usePitchDetection', () => ({
  usePitchDetection: jest.fn(() => ({
    available: false,
    permission: 'unknown',
    listening: false,
    pitch: { midi: null, cents: 0, noteName: null, confidence: 0, updatedAt: 0 },
    requestPermission: jest.fn(),
    openSettings: jest.fn(),
  })),
}));

describe('TunerScreen', () => {
  it('shows a fallback when the native pitch detector is unavailable', () => {
    const { getByText } = render(<TunerScreen />);

    expect(getByText('Pitch detector unavailable')).toBeOnTheScreen();
    expect(
      getByText(
        /Build or install the custom dev client to load the native pitch detector. Expo Go lacks the audio bridge needed for live tuning./,
      ),
    ).toBeOnTheScreen();
  });
});
