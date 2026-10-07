import { act, fireEvent, screen } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

import { CollectorMap } from '@/src/components/map/CollectorMap';
import type { CollectorMapComponentProps } from '@/src/components/map/CollectorMap.types';
import { COLLECTOR_MAP_READY_TIMEOUT_MS } from '@/src/components/map/CollectorMapLeaflet';
import { PAGE_BASE_URL } from '@/src/components/map/leaflet/webViewNavigation';
import { buildCollectorLayer } from '@/src/features/map/collectorLayer';
import type { CameraRequest, CameraTarget } from '@/src/lib/mapGeometry';
import { regionForCamera, zoomOfRegion } from '@/src/lib/mapGeometry';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import { SELF_ID, markerFixture, selfMarkerFixture } from '../support/fixtures';
import { renderWithProviders } from '../test-utils';

let mockEngine: 'native' | 'leaflet' = 'native';
jest.mock('@/src/components/map/mapEngine', () => ({ currentMapEngine: () => mockEngine }));

const animateToRegion = () =>
  (jest.requireMock('react-native-maps') as { mockAnimateToRegion: jest.Mock }).mockAnimateToRegion;
const injectJavaScript = () =>
  (jest.requireMock('react-native-webview') as { mockInjectJavaScript: jest.Mock })
    .mockInjectJavaScript;

const window = Dimensions.get('window');
const SIZE = { width: window.width, height: window.height };
const COLLECTORS = [selfMarkerFixture(), markerFixture()];
const LAYER = buildCollectorLayer(COLLECTORS, 12, 'collector2', SELF_ID);

function props(overrides: Partial<CollectorMapComponentProps> = {}): CollectorMapComponentProps {
  return {
    zones: LAYER.zones,
    clusters: LAYER.clusters,
    initialCamera: { center: { lat: 45.5, lng: -73.57 }, zoom: 11 },
    camera: null,
    onViewportChange: jest.fn(),
    onZonePress: jest.fn(),
    onClusterPress: jest.fn(),
    onEmptyPress: jest.fn(),
    accessibilityLabel: 'Map of collectors near you.',
    ...overrides,
  };
}

const render = async (overrides: Partial<CollectorMapComponentProps> = {}) => {
  const all = props(overrides);
  const result = await renderWithProviders(<CollectorMap {...all} />, {
    port: new FakeAuthPort(testUser()),
  });
  return { ...result, props: all };
};

const camera = (request: CameraTarget, seq = 1): CameraRequest =>
  ({ ...request, seq }) as CameraRequest;

describe('CollectorMap on react-native-maps (Apple Maps, Google Maps with a key)', () => {
  beforeEach(() => {
    mockEngine = 'native';
  });

  const mapView = () => screen.getByTestId('collector-map-view');
  const ready = () => fireEvent(mapView(), 'mapReady');

  it('draws each collector as a 1500 m Circle around the public point, never a pin', async () => {
    await render();
    await ready();
    const circles = screen.getAllByTestId(/^zone-/);
    expect(circles).toHaveLength(2);
    expect(circles.map((circle) => circle.props.radius)).toEqual([1500, 1500]);
    expect(screen.getByTestId('zone-collector2').props.center).toEqual({
      latitude: 45.458,
      longitude: -73.571,
    });
    // No Marker at all for collectors drawn on their own.
    expect(screen.queryByTestId('mock-map-marker')).toBeNull();
    expect(screen.queryAllByTestId(/^cluster-/)).toEqual([]);
    // The selected zone is emphasised.
    expect(screen.getByTestId('zone-collector2').props.strokeWidth).toBe(3);
    expect(screen.getByTestId('zone-maika').props.strokeWidth).toBe(1.5);
  });

  it('caps gestures at zoom 14 and never shows the device position', async () => {
    await render();
    expect(mapView().props.maxZoomLevel).toBe(14);
    expect(mapView().props.showsUserLocation).toBe(false);
    expect(mapView().props.showsMyLocationButton).toBe(false);
    expect(zoomOfRegion(mapView().props.initialRegion, SIZE.width)).toBeCloseTo(11, 5);
  });

  it('starts no closer than 14 even when asked for more', async () => {
    await render({ initialCamera: { center: { lat: 45.5, lng: -73.57 }, zoom: 18 } });
    expect(zoomOfRegion(mapView().props.initialRegion, SIZE.width)).toBeCloseTo(14, 5);
  });

  it('clamps every programmatic camera change to 14 (centre, bounds, cluster expansion)', async () => {
    const view = await render();
    await ready();
    await view.rerender(
      <CollectorMap
        {...view.props}
        camera={camera({ kind: 'center', center: { lat: 45.458, lng: -73.571 }, zoom: 17 })}
      />
    );
    expect(animateToRegion()).toHaveBeenCalledTimes(1);
    const [region] = animateToRegion().mock.calls[0] as [ReturnType<typeof regionForCamera>];
    expect(zoomOfRegion(region, SIZE.width)).toBeCloseTo(14, 5);
    expect(region).toMatchObject({ latitude: 45.458, longitude: -73.571 });

    // A cluster of collectors sharing one cell: fitted bounds stop at 14 too.
    await view.rerender(
      <CollectorMap
        {...view.props}
        camera={camera(
          { kind: 'bounds', bounds: { north: 45.459, south: 45.458, east: -73.57, west: -73.571 } },
          2
        )}
      />
    );
    expect(animateToRegion()).toHaveBeenCalledTimes(2);
    const [fitted] = animateToRegion().mock.calls[1] as [ReturnType<typeof regionForCamera>];
    expect(zoomOfRegion(fitted, SIZE.width)).toBeLessThanOrEqual(14 + 1e-9);

    // The same request again does not move the map.
    await view.rerender(
      <CollectorMap
        {...view.props}
        camera={camera({ kind: 'center', center: { lat: 45.458, lng: -73.571 }, zoom: 17 }, 2)}
      />
    );
    expect(animateToRegion()).toHaveBeenCalledTimes(2);
  });

  it('pulls the camera back when anything goes past the cap, and reports settled views', async () => {
    const view = await render();
    await ready();
    const tooClose = regionForCamera({ lat: 45.5, lng: -73.57 }, 17, SIZE, 20);
    await act(async () => await fireEvent(mapView(), 'regionChangeComplete', tooClose));
    expect(animateToRegion()).toHaveBeenCalledTimes(1);
    const [back] = animateToRegion().mock.calls[0] as [ReturnType<typeof regionForCamera>];
    expect(zoomOfRegion(back, SIZE.width)).toBeCloseTo(14, 5);
    expect(view.props.onViewportChange).not.toHaveBeenCalled();

    await act(
      async () =>
        await fireEvent(
          mapView(),
          'regionChangeComplete',
          regionForCamera({ lat: 45.5, lng: -73.57 }, 12, SIZE)
        )
    );
    expect(view.props.onViewportChange).toHaveBeenCalledWith(
      expect.objectContaining({ center: { lat: 45.5, lng: -73.57 }, zoom: expect.closeTo(12, 5) })
    );
  });

  it('opens the zone under a tap (the nearest one), and nothing outside the zones', async () => {
    const view = await render();
    await ready();
    await act(
      async () =>
        await fireEvent(mapView(), 'press', {
          nativeEvent: { coordinate: { latitude: 45.459, longitude: -73.573 } },
        })
    );
    expect(view.props.onZonePress).toHaveBeenCalledWith('collector2');
    await act(
      async () =>
        await fireEvent(mapView(), 'press', {
          nativeEvent: { coordinate: { latitude: 45.6, longitude: -73.9 } },
        })
    );
    expect(view.props.onEmptyPress).toHaveBeenCalledTimes(1);
    // A press on a cluster bubble is not a map tap.
    await act(
      async () =>
        await fireEvent(mapView(), 'press', {
          nativeEvent: {
            action: 'marker-press',
            coordinate: { latitude: 45.459, longitude: -73.573 },
          },
        })
    );
    expect(view.props.onZonePress).toHaveBeenCalledTimes(1);
  });

  it('draws clusters as count bubbles at a 3-decimal average point', async () => {
    const view = await render({
      zones: [],
      clusters: [
        {
          id: 'cluster:9:1:2',
          center: { lat: 45.512, lng: -73.581 },
          count: 12,
          bounds: { north: 45.55, south: 45.47, east: -73.5, west: -73.65 },
          label: '12 collectors here. Zoom in',
        },
      ],
    });
    const bubble = screen.getByTestId('cluster-cluster:9:1:2');
    expect(bubble.props.coordinate).toEqual({ latitude: 45.512, longitude: -73.581 });
    expect(bubble.props.accessibilityLabel).toBe('12 collectors here. Zoom in');
    expect(screen.getByText('12')).toBeOnTheScreen();
    await fireEvent.press(bubble);
    expect(view.props.onClusterPress).toHaveBeenCalledWith('cluster:9:1:2');
  });

  it('shows the loading skeleton until the map is ready', async () => {
    await render();
    expect(screen.getByTestId('collector-map-loading')).toBeOnTheScreen();
    await ready();
    expect(screen.queryByTestId('collector-map-loading')).toBeNull();
  });

  it('shows an error with "Reload map" when the map cannot render, and retries', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const maps = jest.requireMock('react-native-maps') as { default: { render?: unknown } };
    const original = maps.default;
    const Broken = () => {
      throw new Error('Map module unavailable');
    };
    (maps as { default: unknown }).default = Broken;
    try {
      await render();
      expect(screen.getByText('The map could not load')).toBeOnTheScreen();
      expect(screen.getByText('Collectors are still listed in the List view.')).toBeOnTheScreen();
      (maps as { default: unknown }).default = original;
      await fireEvent.press(screen.getByRole('button', { name: 'Reload map' }));
      expect(screen.getByTestId('collector-map-view')).toBeOnTheScreen();
    } finally {
      (maps as { default: unknown }).default = original;
      warn.mockRestore();
      error.mockRestore();
    }
  });
});

describe('CollectorMap on Leaflet in a WebView (Expo Go, no Google key)', () => {
  beforeEach(() => {
    mockEngine = 'leaflet';
  });

  const webView = () => screen.getByTestId('collector-map');
  const send = (message: unknown) =>
    fireEvent(webView(), 'message', { nativeEvent: { data: JSON.stringify(message) } });
  const config = () => {
    const html = (webView().props.source as { html: string }).html;
    const match = /window\.__orenjiConfig=(\{.*\});<\/script>/.exec(html);
    return JSON.parse(match?.[1] ?? '{}') as {
      start: { center: { lat: number; lng: number }; zoom: number };
      maxZoom: number;
      interactive: boolean;
    };
  };
  const injected = () => injectJavaScript().mock.calls.map(([script]) => script as string);
  const payload = (script: string, fn: string) =>
    JSON.parse(
      script.slice(script.indexOf(`${fn}(`) + fn.length + 1, script.lastIndexOf(');true;'))
    );

  it('loads the OpenStreetMap page capped at 14, starting no closer than 14', async () => {
    await render({ initialCamera: { center: { lat: 45.5, lng: -73.57 }, zoom: 18 } });
    expect(webView().props.source.baseUrl).toBe(PAGE_BASE_URL);
    expect(webView().props.geolocationEnabled).toBe(false);
    expect(webView().props.domStorageEnabled).toBe(false);
    expect(config()).toMatchObject({
      start: { center: { lat: 45.5, lng: -73.57 }, zoom: 14 },
      maxZoom: 14,
      interactive: true,
    });
    const html = (webView().props.source as { html: string }).html;
    // The page draws collectors with L.circle only; L.marker is only for count bubbles.
    expect(html).toContain('L.circle([zone.lat, zone.lng]');
    expect(html).toContain("map.on('zoomend'");
    expect(html).not.toContain('navigator.geolocation');
  });

  it('hands the page 1500 m zones and no pins once it is ready', async () => {
    await render();
    expect(injected()).toEqual([]);
    await send({ type: 'ready' });
    const layer = payload(injected().at(-1) ?? '', 'window.__orenji.layer');
    expect(layer).toEqual({
      zones: [
        { id: 'maika', lat: 45.503, lng: -73.569, radius: 1500, selected: false, self: true },
        { id: 'collector2', lat: 45.458, lng: -73.571, radius: 1500, selected: true, self: false },
      ],
      clusters: [],
    });
    expect(screen.queryByTestId('collector-map-loading')).toBeNull();
  });

  it('clamps camera requests to 14 before they reach the page', async () => {
    const view = await render();
    await send({ type: 'ready' });
    await view.rerender(
      <CollectorMap
        {...view.props}
        camera={camera({ kind: 'center', center: { lat: 45.458, lng: -73.571 }, zoom: 19 })}
      />
    );
    const target = payload(injected().at(-1) ?? '', 'window.__orenji.view');
    expect(target).toEqual({ kind: 'center', center: { lat: 45.458, lng: -73.571 }, zoom: 14 });
  });

  it('applies a camera request made before the page was ready', async () => {
    const view = await render();
    await view.rerender(
      <CollectorMap
        {...view.props}
        camera={camera({ kind: 'center', center: { lat: 45.458, lng: -73.571 }, zoom: 13 })}
      />
    );
    expect(injected()).toEqual([]);
    await send({ type: 'ready' });
    expect(injected().some((script) => script.includes('window.__orenji.view('))).toBe(true);
  });

  it('turns page messages into zone taps, cluster presses and viewports', async () => {
    const view = await render();
    await send({ type: 'ready' });
    await send({ type: 'tap', lat: 45.4595, lng: -73.5725, zoom: 12 });
    expect(view.props.onZonePress).toHaveBeenCalledWith('collector2');
    await send({ type: 'tap', lat: 45.7, lng: -73.9, zoom: 12 });
    expect(view.props.onEmptyPress).toHaveBeenCalledTimes(1);
    await send({ type: 'cluster', id: 'cluster:9:1:2' });
    expect(view.props.onClusterPress).toHaveBeenCalledWith('cluster:9:1:2');
    await send({
      type: 'viewport',
      lat: 45.5,
      lng: -73.57,
      zoom: 12,
      north: 45.55,
      south: 45.45,
      east: -73.5,
      west: -73.64,
    });
    expect(view.props.onViewportChange).toHaveBeenCalledWith({
      center: { lat: 45.5, lng: -73.57 },
      zoom: 12,
      bounds: { north: 45.55, south: 45.45, east: -73.5, west: -73.64 },
    });
    // Malformed messages are ignored.
    await send({ type: 'tap', lat: 'x' });
    await send({ type: 'viewport', lat: 200, lng: 0 });
    expect(view.props.onZonePress).toHaveBeenCalledTimes(1);
    expect(view.props.onViewportChange).toHaveBeenCalledTimes(1);
  });

  it('shows the error state when Leaflet cannot load, and reloads the page', async () => {
    await render();
    await send({ type: 'error', reason: 'leaflet' });
    expect(screen.getByText('The map could not load')).toBeOnTheScreen();
    expect(screen.queryByTestId('collector-map')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Reload map' }));
    expect(screen.getByTestId('collector-map')).toBeOnTheScreen();
  });

  it('shows the error state when the page never becomes ready', async () => {
    jest.useFakeTimers();
    try {
      await render();
      await act(() => {
        jest.advanceTimersByTime(COLLECTOR_MAP_READY_TIMEOUT_MS + 1);
      });
      expect(screen.getByTestId('collector-map-error')).toBeOnTheScreen();
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps a map that only shows still (no taps reported)', async () => {
    const view = await render({ interactive: false });
    expect(config().interactive).toBe(false);
    await send({ type: 'ready' });
    // The page sends no taps then; one arriving anyway is ignored.
    await send({ type: 'tap', lat: 45.4595, lng: -73.5725, zoom: 12 });
    expect(view.props.onZonePress).not.toHaveBeenCalled();
    expect(view.props.onEmptyPress).not.toHaveBeenCalled();
  });
});
