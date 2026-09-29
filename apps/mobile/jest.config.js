/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testMatch: ['<rootDir>/__tests__/**/*.test.[jt]s?(x)', '<rootDir>/src/**/*.test.[jt]s?(x)'],
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/', '/.expo/'],
  // Expo / React Native packages ship untranspiled ESM and must go through babel-jest; everything
  // else in node_modules is pre-compiled. Mirrors jest-expo's list plus react-native-maps/svg.
  transformIgnorePatterns: [
    '/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|standard-navigation|react-native-maps|react-native-svg))',
    '/node_modules/react-native-reanimated/plugin/',
    '/node_modules/@react-native/babel-preset/',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@orenji/shared-types$': '<rootDir>/src/types/shared-types-fallback/index.ts',
  },
  collectCoverageFrom: ['src/**/*.{ts,tsx}', 'app/**/*.{ts,tsx}', '!src/theme/tokens.ts'],
  clearMocks: true,
};
