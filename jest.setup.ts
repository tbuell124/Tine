import '@testing-library/jest-native/extend-expect';

declare global {
  // eslint-disable-next-line no-var
  var __reanimatedWorkletInit: () => void;
}

jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.call = () => {};
  return Reanimated;
});

global.__reanimatedWorkletInit = jest.fn();

jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper');

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
