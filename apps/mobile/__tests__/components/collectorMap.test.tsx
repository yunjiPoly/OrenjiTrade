import { act, fireEvent, screen } from '@testing-library/react-native';

import { CollectorMap } from '@/src/components/map/CollectorMap';
import {
  BROWSE_MAP_READY_TIMEOUT_MS,
  COLLECTOR_MAP_MAX_ZOOM,
} from '@/src/components/map/LeafletBrowseMap';
import { PAGE_BASE_URL } from '@/src/components/map/leaflet/webViewNavigation';
import { useAppStore } from '@/src/store/useAppStore';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import { renderWithProviders } from '../test-utils';

/** The Map tab where Google Maps cannot draw (Expo Go on Android): Leaflet in a WebView. */
jest.mock('@/src/components/map/mapEngine', () => ({ currentMapEngine: () => 'leaflet' }));

const webView = () => screen.getByTestId('collector-map');
const send = (message: unknown) =>
  act(() => {
    fireEvent(webView(), 'message', { nativeEvent: { data: JSON.stringify(message) } });
  });
const config = () => {
  const html = (webView().props.source as { html: string }).html;
  const match = /window\.__orenjiConfig=(\{.*\});<\/script>/.exec(html);
  return JSON.parse(match?.[1] ?? '{}') as {
    focus: { lat: number; lng: number; radiusKm: number };
    pickable: boolean;
    maxZoom: number;
  };
};

beforeEach(() => {
  useAppStore.getState().reset();
});

describe('Map tab on the Leaflet engine', () => {
  it('browses OpenStreetMap from Montréal, capped at zoom 14, without picking', () => {
    renderWithProviders(<CollectorMap />, { port: new FakeAuthPort(testUser()) });
    expect(webView().props.source.baseUrl).toBe(PAGE_BASE_URL);
    expect(webView().props.geolocationEnabled).toBe(false);
    expect(config()).toMatchObject({
      focus: { lat: 45.5017, lng: -73.5673 },
      pickable: false,
      maxZoom: COLLECTOR_MAP_MAX_ZOOM,
    });
    expect(screen.getByText('Collectors appear here in Phase 4')).toBeOnTheScreen();
  });

  it('remembers the browsed viewport and starts there next time', () => {
    const first = renderWithProviders(<CollectorMap />, { port: new FakeAuthPort(testUser()) });
    send({ type: 'ready' });
    send({ type: 'viewport', lat: 46.8, lng: -71.2 });
    expect(useAppStore.getState().lastMapRegion).toMatchObject({
      latitude: 46.8,
      longitude: -71.2,
    });
    first.unmount();
    renderWithProviders(<CollectorMap />, { port: new FakeAuthPort(testUser()) });
    expect(config().focus).toMatchObject({ lat: 46.8, lng: -71.2 });
  });

  it('shows the placeholder when the page cannot load', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    renderWithProviders(<CollectorMap />, { port: new FakeAuthPort(testUser()) });
    send({ type: 'error', reason: 'leaflet' });
    expect(screen.getByTestId('map-placeholder')).toBeOnTheScreen();
    expect(screen.queryByTestId('collector-map')).toBeNull();
    warn.mockRestore();
  });

  it('shows the placeholder when the page never becomes ready', () => {
    jest.useFakeTimers();
    try {
      renderWithProviders(<CollectorMap />, { port: new FakeAuthPort(testUser()) });
      act(() => {
        jest.advanceTimersByTime(BROWSE_MAP_READY_TIMEOUT_MS + 1);
      });
      expect(screen.getByTestId('map-placeholder')).toBeOnTheScreen();
    } finally {
      jest.useRealTimers();
    }
  });
});
