import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Dimensions } from 'react-native';
import type { ReactTestInstance } from 'react-test-renderer';

import MapScreen from '@/app/(tabs)/index';
import CollectorScreen from '@/app/collectors/[id]';
import { regionForCamera } from '@/src/lib/mapGeometry';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import {
  collectorFixture,
  conversationFixture,
  markerFixture,
  matchingItemFixture,
  messagePage,
  nearbyFixture,
  planFixture,
  previewFixture,
  publicBinderSummaryFixture,
  publicItemFixture,
  publicItemsPage,
  ratingsPageFixture,
  referencesPageFixture,
  selfMarkerFixture,
} from '../support/fixtures';
import { mockApi, ok, type MockRoutes } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { mockParams, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());
let mockEngine: 'native' | 'leaflet' = 'native';
jest.mock('@/src/components/map/mapEngine', () => ({ currentMapEngine: () => mockEngine }));

/**
 * Privacy contract of the mobile map (ADR 0004): no answer the map and profile screens use, and
 * nothing they hand to a map engine, holds a coordinate with more than 3 decimals or a private
 * location field. Mirrors the web E2E PrivacyScanner and the API's GeoPrivacyContractTest.
 */

const COORDINATE_KEY = /^(lat|lng|latitude|longitude)$/i;
const FORBIDDEN_KEY =
  /^(homePoint|home_point|exactLocation|exact_location|tradingArea|trading_area|distanceMeters|distance_m)$/i;

function decimalsOf(value: number): number {
  const text = String(value);
  if (text.includes('e')) {
    return Number.POSITIVE_INFINITY;
  }
  return text.includes('.') ? (text.split('.')[1]?.length ?? 0) : 0;
}

/** Every precise coordinate or private field in a value (paths for the failure message). */
function findings(value: unknown, path = '$', seen = new Set<unknown>()): string[] {
  if (value === null || typeof value !== 'object' || seen.has(value)) {
    return [];
  }
  seen.add(value);
  const out: string[] = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (typeof child === 'function') {
      continue;
    }
    const childPath = `${path}.${key}`;
    if (FORBIDDEN_KEY.test(key)) {
      out.push(`${childPath}: private field`);
    }
    if (COORDINATE_KEY.test(key) && typeof child === 'number' && decimalsOf(child) > 3) {
      out.push(`${childPath}: ${child} has more than 3 decimals`);
    }
    if (key !== 'children' && key !== 'style') {
      out.push(...findings(child, childPath, seen));
    }
  }
  return out;
}

const PRECISE = 45.501_234;
const WINDOW = Dimensions.get('window');

/** A crowd of collectors whose averages have many decimals (cluster centres must be rounded). */
function crowd(count: number) {
  return Array.from({ length: count }, (_, index) =>
    markerFixture({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      handle: `c${index}`,
      displayName: `Collector ${index}`,
      publicPoint: {
        lat: Math.round((45.48 + (index % 9) * 0.007) * 1000) / 1000,
        lng: Math.round((-73.61 + Math.floor(index / 9) * 0.011) * 1000) / 1000,
      },
    })
  );
}

const FIXTURES: Record<string, unknown> = {
  nearby: nearbyFixture([
    selfMarkerFixture(),
    markerFixture({ matchingItems: [matchingItemFixture()] }),
    ...crowd(80),
  ]),
  preview: previewFixture(),
  profile: collectorFixture(),
  binders: [publicBinderSummaryFixture()],
  publicItems: publicItemsPage([publicItemFixture()]),
  ratings: ratingsPageFixture(),
  references: referencesPageFixture(),
  conversation: conversationFixture(),
  messages: messagePage(),
};

beforeEach(() => {
  resetRouterMock();
  resetAppState();
  mockEngine = 'native';
});

describe('map privacy contract', () => {
  it('the scanner itself catches precise coordinates and private fields', () => {
    expect(findings({ publicPoint: { lat: PRECISE, lng: -73.5 } })).toEqual([
      `$.publicPoint.lat: ${PRECISE} has more than 3 decimals`,
    ]);
    expect(findings({ homePoint: { lat: 45.5, lng: -73.5 } })).toEqual([
      '$.homePoint: private field',
    ]);
    expect(findings({ center: { latitude: 45.5001, longitude: 1 } })).toHaveLength(1);
  });

  it.each(Object.entries(FIXTURES))('the %s fixture has public points only', (_, fixture) => {
    expect(findings(fixture)).toEqual([]);
  });

  function mapRoutes(extra: MockRoutes = {}): MockRoutes {
    return signedInRoutes({
      'GET /api/v1/collectors/nearby': ok(FIXTURES.nearby),
      'GET /api/v1/me/plan': ok(planFixture(25)),
      'GET /api/v1/collectors/{handle}/preview': ok(FIXTURES.preview),
      'GET /api/v1/collectors/{handle}/binders': ok(FIXTURES.binders),
      ...extra,
    });
  }

  /** Props of every element rendered by the map engines (MapView, Circle, Marker). */
  function mapProps(): unknown[] {
    const nodes = screen.UNSAFE_root.findAll(
      (node: ReactTestInstance) =>
        typeof node.props.testID === 'string' &&
        /^(collector-map-view|collector-area-view|zone-|cluster-)/.test(node.props.testID)
    );
    return nodes.map((node) => node.props);
  }

  it('hands react-native-maps 3-decimal points only (zones, clusters, regions)', async () => {
    const api = mockApi(mapRoutes());
    renderWithProviders(<MapScreen />, { port: new FakeAuthPort(testUser()) });
    await waitFor(() => expect(screen.getAllByTestId(/^zone-/).length).toBeGreaterThan(0));
    // Pan with a raw, very precise native region: nothing precise flows back into the map, and
    // the next query sends 2 decimals.
    const raw = regionForCamera({ lat: 45.523_456_7, lng: -73.581_234_5 }, 9, WINDOW, 20);
    act(() =>
      fireEvent(screen.getByTestId('collector-map-view'), 'regionChangeComplete', {
        ...raw,
        latitude: 45.523_456_7,
        longitude: -73.581_234_5,
      })
    );
    await waitFor(() => expect(screen.queryAllByTestId(/^cluster-/).length).toBeGreaterThan(0));
    fireEvent.press(screen.getAllByTestId(/^cluster-/)[0]!);
    const maps = jest.requireMock('react-native-maps') as { mockAnimateToRegion: jest.Mock };
    await waitFor(() => expect(maps.mockAnimateToRegion).toHaveBeenCalled());

    expect(findings(mapProps())).toEqual([]);
    expect(findings(maps.mockAnimateToRegion.mock.calls)).toEqual([]);
    for (const call of api.callsTo('GET /api/v1/collectors/nearby')) {
      for (const key of ['lat', 'lng']) {
        const value = call.query.get(key);
        if (value !== null) {
          expect(decimalsOf(Number(value))).toBeLessThanOrEqual(2);
        }
      }
    }
    // Nothing on screen spells out a coordinate.
    expect(screen.queryByText(/\d{2}\.\d{3,}/)).toBeNull();
  });

  it('hands the Leaflet page 3-decimal points only', async () => {
    mockEngine = 'leaflet';
    const webview = jest.requireMock('react-native-webview') as { mockInjectJavaScript: jest.Mock };
    mockApi(mapRoutes());
    renderWithProviders(<MapScreen />, { port: new FakeAuthPort(testUser()) });
    const page = await screen.findByTestId('collector-map');
    act(() => {
      fireEvent(page, 'message', { nativeEvent: { data: JSON.stringify({ type: 'ready' }) } });
    });
    await waitFor(() => expect(webview.mockInjectJavaScript).toHaveBeenCalled());
    const html = (page.props.source as { html: string }).html;
    const config = JSON.parse(/window\.__orenjiConfig=(\{.*\});<\/script>/.exec(html)?.[1] ?? '{}');
    expect(findings(config)).toEqual([]);
    for (const [script] of webview.mockInjectJavaScript.mock.calls as [string][]) {
      const json = script.slice(script.indexOf('(') + 1, script.lastIndexOf(');true;'));
      expect(findings(JSON.parse(json))).toEqual([]);
    }
  });

  it('draws the profile area from the public point only', async () => {
    mockParams.current = { id: 'maika' };
    mockApi(
      signedInRoutes({
        'GET /api/v1/collectors/{handle}/binders': ok(FIXTURES.binders),
        'GET /api/v1/collectors/{handle}/inventory': ok(FIXTURES.publicItems),
        'GET /api/v1/collectors/{handle}/ratings': ok(FIXTURES.ratings),
        'GET /api/v1/collectors/{handle}/references': ok(FIXTURES.references),
        'GET /api/v1/collectors/{handle}': ok(FIXTURES.profile),
      })
    );
    renderWithProviders(<CollectorScreen />, { port: new FakeAuthPort(testUser()) });
    await screen.findByTestId('zone-area');
    expect(findings(mapProps())).toEqual([]);
    expect(screen.queryByText(/\d{2}\.\d{3,}/)).toBeNull();
  });
});
