import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import MapScreen from '@/app/(tabs)/index';
import CollectorScreen from '@/app/collectors/[id]';
import HoldersScreen from '@/app/holders';
import PlaceBindersScreen from '@/app/regions/[region]/[code]';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import {
  CARD_ID,
  binderCountsFixture,
  cardDetailFixture,
  cardHolderFixture,
  cardHoldersPage,
  collectorFixture,
  conversationFixture,
  locationFixture,
  markerFixture,
  matchingItemFixture,
  meFixture,
  messagePage,
  offerPartyFixture,
  placeBindersPage,
  publicBinderSummaryFixture,
  publicItemFixture,
  publicItemsPage,
  ratingsPageFixture,
  referencesPageFixture,
  searchBinderFixture,
  unifiedSearchFixture,
  wishFixture,
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
  party: offerPartyFixture(),
  binders: [publicBinderSummaryFixture()],
  binderCounts: binderCountsFixture(),
  placeBinders: placeBindersPage([searchBinderFixture()]),
  publicItems: publicItemsPage([publicItemFixture()]),
  ratings: ratingsPageFixture(),
  references: referencesPageFixture(),
  conversation: conversationFixture(),
  messages: messagePage(),
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

  it('the Map tab asks for binder counts by region, draws borders it ships, and never a position', async () => {
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/regions/{region}/binder-counts': ok(FIXTURES.binderCounts),
      })
    );
    renderWithProviders(<MapScreen />, { port: new FakeAuthPort(testUser()) });
    expect(await screen.findByText('3 public binders in Americas (North)')).toBeOnTheScreen();
    fireEvent(screen.getByTestId('map-scroll'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 392, height: 669 } },
    });
    fireEvent(screen.getByTestId('region-map-frame'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 388 } },
    });
    // The map is a drawing of states and provinces: no collector, no marker, no pin on it.
    expect(await screen.findByTestId('map-shape-CA-QC')).toBeOnTheScreen();
    expect(screen.queryByTestId('collector-map-view')).toBeNull();
    expect(screen.queryByTestId(/marker|pin|collector-/)).toBeNull();
    // What it asked the API: the account, the regions and the counts of one region, by code.
    expect(api.calls.filter((call) => /nearby|preview|geocod|tile/.test(call.path))).toEqual([]);
    expect(api.calls.flatMap(requestFindings)).toEqual([]);
    expect(
      api.calls.filter((call) => call.path.startsWith('/api/v1/regions')).map((call) => call.path)
    ).toEqual(expect.arrayContaining(['/api/v1/regions/americas-north/binder-counts']));
    expect(screen.getByTestId('map-privacy-note')).toHaveTextContent(/never uses your GPS/);
    expect(screen.queryByText(DISTANCE_TEXT)).toBeNull();
  });

  it("the binders of a state name the owner's state or province and country, never a city or a distance", async () => {
    mockParams.current = { region: 'americas-north', code: 'CA-ON' };
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/regions/{region}/binder-counts': ok(FIXTURES.binderCounts),
        'GET /api/v1/regions/{region}/subdivisions/{code}/binders': ok(FIXTURES.placeBinders),
      })
    );
    renderWithProviders(<PlaceBindersScreen />, { port: new FakeAuthPort(testUser()) });
    expect(await screen.findByText(/Noé Verdun/)).toBeOnTheScreen();
    expect(screen.getAllByText('Ontario, Canada').length).toBeGreaterThan(0);
    expect(screen.queryByText(DISTANCE_TEXT)).toBeNull();
    expect(screen.queryByText(/Toronto|Montréal/)).toBeNull();
    expect(api.calls.flatMap(requestFindings)).toEqual([]);
  });

  it('card holders ask by region and show states, never a distance', async () => {
    mockParams.current = { card: CARD_ID };
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/cards/{id}': ok(cardDetailFixture()),
        'GET /api/v1/search/card-holders': ok(FIXTURES.holders),
      })
    );
    renderWithProviders(<HoldersScreen />, { port: new FakeAuthPort(testUser()) });
    expect(await screen.findByText(/Ontario, Canada/)).toBeOnTheScreen();
    const asked = api.callsTo('GET /api/v1/search/card-holders');
    expect(asked.length).toBeGreaterThan(0);
    for (const call of asked) {
      expect(call.query.get('region')).toBe('americas-north');
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
