/* eslint-env jest */
import '@testing-library/react-native/matchers';

// --- Native module mocks -----------------------------------------------------------------------

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('@react-native-community/netinfo', () =>
  require('@react-native-community/netinfo/jest/netinfo-mock.js')
);

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => '00000000-0000-4000-8000-000000000000'),
}));

jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MockMapView = React.forwardRef(
    (props: Record<string, unknown>, ref: React.Ref<unknown>) =>
      React.createElement(View, { ...props, ref, testID: props.testID ?? 'mock-map-view' })
  );
  MockMapView.displayName = 'MockMapView';
  const MockMarker = (props: Record<string, unknown>) => React.createElement(View, props);
  return {
    __esModule: true,
    default: MockMapView,
    Marker: MockMarker,
    PROVIDER_DEFAULT: undefined,
    PROVIDER_GOOGLE: 'google',
  };
});

// `react-native-safe-area-context` provides a jest mock with zero insets.
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock'));

// --- Quiet known-noisy warnings ------------------------------------------------------------------

const originalError = console.error;
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    const first = typeof args[0] === 'string' ? args[0] : '';
    if (first.includes('not wrapped in act(')) {
      return;
    }
    originalError(...args);
  };
});
afterAll(() => {
  console.error = originalError;
});
