import { screen, waitFor } from '@testing-library/react-native';

import MapScreen from '@/app/(tabs)/index';
import CollectorScreen from '@/app/collectors/[id]';
import HoldersScreen from '@/app/holders';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import {
  CARD_ID,
  cardDetailFixture,
  cardHolderFixture,
  cardHoldersPage,
  collectorFixture,
  conversationFixture,
  locationFixture,
  markerFixture,
  matchFixture,
  matchingItemFixture,
  meFixture,
  messagePage,
  offerPartyFixture,
  publicBinderSummaryFixture,
  publicItemFixture,
  publicItemsPage,
  ratingsPageFixture,
  referencesPageFixture,
  searchBinderFixture,
  unifiedSearchFixture,
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
  match: matchFixture(),
  party: offerPartyFixture(),
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

  it('the Map tab draws no map and asks for no collector position', async () => {
    const api = mockApi(signedInRoutes());
    renderWithProviders(<MapScreen />, { port: new FakeAuthPort(testUser()) });
    expect(await screen.findByTestId('map-placeholder')).toBeOnTheScreen();
    expect(screen.queryByTestId('collector-map-view')).toBeNull();
    expect(api.calls.filter((call) => /nearby|preview/.test(call.path))).toEqual([]);
    expect(api.calls.flatMap(requestFindings)).toEqual([]);
    expect(screen.getByTestId('map-privacy-note')).toHaveTextContent(/never uses your GPS/);
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
