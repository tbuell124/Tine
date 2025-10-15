/**
 * @format
 */

module.exports = {
  preset: 'jest-expo',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!(?:@react-native|react-native|react-native-reanimated|react-native-gesture-handler|@react-native-async-storage|@react-native-community|expo(nent)?|@expo|expo-modules|@expo/vector-icons|@shopify/react-native-skia)/)',
  ],
  moduleNameMapper: {
    '^@components/(.*)$': '<rootDir>/src/components/$1',
    '^@hooks/(.*)$': '<rootDir>/src/hooks/$1',
    '^@native/(.*)$': '<rootDir>/src/native/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@state/(.*)$': '<rootDir>/src/state/$1',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}'],
};
