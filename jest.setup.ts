import '@testing-library/jest-native/extend-expect';

declare global {
  var __reanimatedWorkletInit: () => void;
}

try {
  jest.mock('react-native-reanimated', () => {
    const Reanimated = require('react-native-reanimated/mock');
    Reanimated.default.call = () => {};
    return Reanimated;
  });
} catch {
  jest.mock(
    'react-native-reanimated',
    () => ({
      default: { call: () => {} },
    }),
    { virtual: true },
  );
}

global.__reanimatedWorkletInit = jest.fn();

try {
  jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper');
} catch {
  jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper', () => ({}), {
    virtual: true,
  });
}

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('expo-audio', () => ({
  getRecordingPermissionsAsync: jest.fn(async () => ({
    status: 'granted',
    granted: true,
  })),
  requestRecordingPermissionsAsync: jest.fn(async () => ({
    status: 'granted',
    granted: true,
  })),
}));
