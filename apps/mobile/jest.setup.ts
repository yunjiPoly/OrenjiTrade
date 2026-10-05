/* eslint-env jest */
import { configure } from '@testing-library/react-native';
import '@testing-library/react-native/matchers';

// findBy*/waitFor wait up to 10 s (default 1 s): multi-step screen tests stay deterministic when
// the machine is busy (parallel workers, an Android emulator running next to them).
configure({ asyncUtilTimeout: 10_000 });

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

// The map renders Views carrying their props; the camera calls are jest mocks shared by every
// instance (`require('react-native-maps').mockAnimateToRegion`), cleared before each test.
jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');
  const mockAnimateToRegion = jest.fn();
  const MockMapView = React.forwardRef(
    (props: Record<string, unknown>, ref: React.Ref<unknown>) => {
      React.useImperativeHandle(ref, () => ({ animateToRegion: mockAnimateToRegion }));
      return React.createElement(View, { ...props, testID: props.testID ?? 'mock-map-view' });
    }
  );
  MockMapView.displayName = 'MockMapView';
  const MockMarker = (props: Record<string, unknown>) =>
    React.createElement(View, { ...props, testID: props.testID ?? 'mock-map-marker' });
  const MockCircle = (props: Record<string, unknown>) =>
    React.createElement(View, { ...props, testID: props.testID ?? 'mock-map-circle' });
  return {
    __esModule: true,
    default: MockMapView,
    Marker: MockMarker,
    Circle: MockCircle,
    PROVIDER_DEFAULT: undefined,
    PROVIDER_GOOGLE: 'google',
    mockAnimateToRegion,
  };
});

// The WebView renders a View carrying its props; `injectJavaScript` is a jest mock shared by every
// instance (`require('react-native-webview').mockInjectJavaScript`), reset before each test.
jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  const mockInjectJavaScript = jest.fn();
  const WebView = React.forwardRef((props: Record<string, unknown>, ref: React.Ref<unknown>) => {
    React.useImperativeHandle(ref, () => ({ injectJavaScript: mockInjectJavaScript }));
    return React.createElement(View, props);
  });
  WebView.displayName = 'MockWebView';
  return { __esModule: true, default: WebView, WebView, mockInjectJavaScript };
});

// `react-native-safe-area-context` provides a jest mock (default export) with zero insets.
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default
);

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
