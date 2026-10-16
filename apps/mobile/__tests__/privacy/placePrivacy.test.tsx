import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import SearchScreen from '@/app/(tabs)/search';
import CardScreen from '@/app/cards/[id]';
import CollectorScreen from '@/app/collectors/[id]';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import {
  CARD_ID,
  binderCountsFixture,
  cardDetailFixture,
  cardHolderFixture,
  cardHoldersPage,
  collectorByNameFixture,
  collectorFixture,
  conversationFixture,
  locationFixture,
  markerFixture,
  matchingItemFixture,
  meFixture,
  messagePage,
  placeBindersPage,
  publicBinderSummaryFixture,
  publicItemFixture,
  publicItemsPage,
  ratingsPageFixture,
  referencesPageFixture,
  searchBinderFixture,
  unifiedSearchFixture,
  wishFixture,
  wishlistAvailabilityFixture,
} from '../support/fixtures';
import { mockApi, ok, type MockRequest } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { mockParams, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());

/**
 * Privacy contract of the app's places (ADR 0017): collectors declare a country, a state or
 * province and an optional city. No answer the app uses, no request it sends and nothing it shows
 * holds a coordinate, a radius or a distance; another collector's place is their state or
 * province; a city only appears on its owner's profile. Mirrors the web E2E PrivacyScanner and
 * the API's GeoPrivacyContractTest.
 */

const COORDINATE_OR_DISTANCE_KEY =
  /^(lat|lng|lon|latitude|longitude|point|publicPoint|homePoint|home_point|tradingArea|trading_area|center|centre|radius|radiusKm|radius_km|distance|distanceBucket|distance_bucket|distanceMeters|distance_m|gridCell|grid_cell)$/i;

/** Every coordinate-like or distance-like key in a value (paths for the failure message). */
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
    if (COORDINATE_OR_DISTANCE_KEY.test(key)) {
      out.push(`${childPath}: coordinate or distance field`);
    }
    out.push(...findings(child, childPath, seen));
  }
  return out;
}

/** Query keys and values of a request that would describe a position or a distance. */
function requestFindings(request: MockRequest): string[] {
  const out: string[] = [];
  request.query.forEach((value, key) => {
    if (COORDINATE_OR_DISTANCE_KEY.test(key)) {
      out.push(`${request.method} ${request.path}?${key}=${value}`);
    }
  });
  return [...out, ...findings(request.body, `${request.method} ${request.path} body`)];
}

/** Distance wording on screen ("2 km", "1–5 km away", "nearby", "approximate area"). */
const DISTANCE_TEXT = /(\d\s?(km|mi|m)\b|\baway\b|\bnearby\b|near you|approximate area)/i;

const FIXTURES: Record<string, unknown> = {
  me: meFixture(),
  myLocation: locationFixture(),
  marker: markerFixture({ matchingItems: [matchingItemFixture()] }),
  profile: collectorFixture(),
  holders: cardHoldersPage([cardHolderFixture()]),
  search: unifiedSearchFixture({ collectors: [markerFixture()], binders: [searchBinderFixture()] }),
  wish: wishFixture(),
  binders: [publicBinderSummaryFixture()],
  binderCounts: binderCountsFixture(),
  placeBinders: placeBindersPage([searchBinderFixture()]),
  publicItems: publicItemsPage([publicItemFixture()]),
  ratings: ratingsPageFixture(),
  references: referencesPageFixture(),
  conversation: conversationFixture(),
  messages: messagePage(),
  collectorsByName: [collectorByNameFixture()],
  wishlistAvailability: wishlistAvailabilityFixture(['w1']),
};

beforeEach(() => {
  resetRouterMock();
  resetAppState();
});

describe('place privacy contract (ADR 0017)', () => {
  it('the scanner itself catches coordinates, radii and distances', () => {
    expect(findings({ publicPoint: { lat: 45.5, lng: -73.5 } })).toEqual([
      '$.publicPoint: coordinate or distance field',
      '$.publicPoint.lat: coordinate or distance field',
      '$.publicPoint.lng: coordinate or distance field',
    ]);
    expect(findings({ wish: { radiusKm: 10 } })).toHaveLength(1);
    expect(findings({ collector: { distanceBucket: 'KM_1_5' } })).toHaveLength(1);
    expect(findings({ place: { label: 'Quebec, Canada' } })).toEqual([]);
    expect(DISTANCE_TEXT.test('Verdun · 1–5 km away')).toBe(true);
    expect(DISTANCE_TEXT.test('Quebec, Canada')).toBe(false);
  });

  it.each(Object.entries(FIXTURES))('the %s answer has places only', (_, fixture) => {
    expect(findings(fixture)).toEqual([]);
  });

  it("Search's map asks for binder counts by region, draws borders it ships, and never a position", async () => {
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/regions/{region}/binder-counts': ok(FIXTURES.binderCounts),
      })
    );
    renderWithProviders(<SearchScreen />, { port: new FakeAuthPort(testUser()) });
    fireEvent(await screen.findByTestId('search-map'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 392, height: 640 } },
    });
    fireEvent(screen.getByTestId('search-field-frame'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 52 } },
    });
    const frame = screen.getByTestId('search-region-map-frame');
    fireEvent(frame, 'layout', {
      nativeEvent: {
        layout: { x: 0, y: 0, width: 360, height: StyleSheet.flatten(frame.props.style).height },
      },
    });
    // The map is a drawing of states and provinces: no collector, no marker, no pin on it.
    expect(await screen.findByTestId('map-shape-CA-QC')).toBeOnTheScreen();
    expect(screen.queryByTestId(/marker|pin|collector-/)).toBeNull();
    // The state card of the collector's own province: its counts, never a position.
    expect(await screen.findByTestId('search-state-card')).toBeOnTheScreen();
    expect(screen.getByTestId('search-state-name')).toHaveTextContent('Quebec');
    // What it asked the API: the account, the regions and the counts of one region, by code.
    expect(api.calls.filter((call) => /nearby|preview|geocod|tile/.test(call.path))).toEqual([]);
    expect(api.calls.flatMap(requestFindings)).toEqual([]);
    expect(
      api.calls.filter((call) => call.path.startsWith('/api/v1/regions')).map((call) => call.path)
    ).toEqual(expect.arrayContaining(['/api/v1/regions/americas-north/binder-counts']));
    expect(screen.getByTestId('search-map-privacy')).toHaveTextContent(/never uses your GPS/);
    expect(screen.queryByText(DISTANCE_TEXT)).toBeNull();
  });

  it("Search › Binders names the owner's state or province, never a city or a distance", async () => {
    mockParams.current = { segment: 'binders' };
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/regions/{region}/binders': ok(FIXTURES.placeBinders),
      })
    );
    renderWithProviders(<SearchScreen />, { port: new FakeAuthPort(testUser()) });
    expect(await screen.findByText(/collector2 · Ontario/)).toBeOnTheScreen();
    expect(screen.queryByText(DISTANCE_TEXT)).toBeNull();
    expect(screen.queryByText(/Toronto|Montréal/)).toBeNull();
    const asked = api.callsTo('GET /api/v1/regions/{region}/binders');
    expect(asked.map((call) => call.path)).toContain('/api/v1/regions/americas-north/binders');
    expect(api.calls.flatMap(requestFindings)).toEqual([]);
  });

  it('collectors while a card is typed ask by region and show a state, never a city', async () => {
    mockParams.current = { q: 'collector' };
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/search/collectors': ok(FIXTURES.collectorsByName),
      })
    );
    renderWithProviders(<SearchScreen />, { port: new FakeAuthPort(testUser()) });
    expect(await screen.findByTestId('search-collector-collector2')).toHaveTextContent(/Ontario/);
    for (const call of api.callsTo('GET /api/v1/search/collectors')) {
      expect(call.query.get('region')).toBe('americas-north');
    }
    expect(api.calls.flatMap(requestFindings)).toEqual([]);
    expect(screen.queryByText(DISTANCE_TEXT)).toBeNull();
    expect(screen.queryByText(/Toronto|Montréal/)).toBeNull();
  });

  it('who has this card asks by region and groups by state, never a distance', async () => {
    mockParams.current = { id: CARD_ID };
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/cards/{id}': ok(cardDetailFixture()),
        'GET /api/v1/search/card-holders': ok(FIXTURES.holders),
        'GET /api/v1/search/deck-cores': ok([]),
      })
    );
    renderWithProviders(<CardScreen />, { port: new FakeAuthPort(testUser()) });
    expect(await screen.findByTestId('holders-group-CA-ON')).toHaveTextContent('Ontario');
    const asked = api.callsTo('GET /api/v1/search/card-holders');
    expect(asked.length).toBeGreaterThan(0);
    for (const call of asked) {
      expect(call.query.get('region')).toBe('americas-north');
      expect(call.query.get('sort')).toBe('province');
    }
    expect(api.calls.flatMap(requestFindings)).toEqual([]);
    expect(screen.queryByText(DISTANCE_TEXT)).toBeNull();
    // Another collector's city never reaches the app outside their profile.
    expect(screen.queryByText(/Montréal/)).toBeNull();
  });

  it('a profile shows the state and, when its owner shows it, the city', async () => {
    mockParams.current = { id: 'maika' };
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/collectors/{handle}/binders': ok(FIXTURES.binders),
        'GET /api/v1/collectors/{handle}/inventory': ok(FIXTURES.publicItems),
        'GET /api/v1/collectors/{handle}/ratings': ok(FIXTURES.ratings),
        'GET /api/v1/collectors/{handle}/references': ok(FIXTURES.references),
        'GET /api/v1/collectors/{handle}': ok(FIXTURES.profile),
      })
    );
    renderWithProviders(<CollectorScreen />, { port: new FakeAuthPort(testUser()) });
    await waitFor(() =>
      expect(screen.getByTestId('collector-location')).toHaveTextContent('Montréal, Quebec, Canada')
    );
    expect(screen.queryByText(DISTANCE_TEXT)).toBeNull();
    expect(screen.queryByText(/\d{2}\.\d{3,}/)).toBeNull();
    expect(api.calls.flatMap(requestFindings)).toEqual([]);
  });
});
