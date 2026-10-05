import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

import MapScreen from '@/app/(tabs)/index';
import { offerTargetFor } from '@/src/features/offers/offerTargetStore';
import { regionForCamera, zoomOfRegion } from '@/src/lib/mapGeometry';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import {
  CARD_ID,
  CONVERSATION_ID,
  PRINTING_A,
  cardDetailFixture,
  conversationFixture,
  markerFixture,
  matchingItemFixture,
  meFixture,
  nearbyFixture,
  planFixture,
  previewFixture,
  privacyFixture,
  publicBinderSummaryFixture,
  PUBLIC_BINDER_ID,
  selfMarkerFixture,
} from '../support/fixtures';
import { mockApi, ok, problem, type MockRoutes } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { mockParams, mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());
jest.mock('@/src/components/map/mapEngine', () => ({ currentMapEngine: () => 'native' }));

const animateToRegion = () =>
  (jest.requireMock('react-native-maps') as { mockAnimateToRegion: jest.Mock }).mockAnimateToRegion;
const WINDOW = Dimensions.get('window');

beforeEach(() => {
  resetRouterMock();
  resetAppState();
});

function routes(extra: MockRoutes = {}): MockRoutes {
  return signedInRoutes({
    'GET /api/v1/collectors/nearby': ok(nearbyFixture()),
    'GET /api/v1/me/plan': ok(planFixture(25)),
    'GET /api/v1/collectors/{handle}/preview': ok(previewFixture()),
    'GET /api/v1/collectors/{handle}/binders': ok([publicBinderSummaryFixture()]),
    ...extra,
  });
}

const render = () => renderWithProviders(<MapScreen />, { port: new FakeAuthPort(testUser()) });
const mapView = () => screen.getByTestId('collector-map-view');
const status = () => screen.getByTestId('map-status');

async function chooseOption(select: string, value: string) {
  fireEvent.press(screen.getByTestId(select));
  fireEvent.press(await screen.findByTestId(`${select}-option-${value}`));
}

describe('Map tab', () => {
  it('starts on the own trading area and draws the collectors as 3 km zones', async () => {
    const api = mockApi(routes());
    render();
    expect(screen.getByTestId('map-loading-state')).toBeOnTheScreen();
    await waitFor(() => expect(status()).toHaveTextContent('2 collectors within 10 km'));
    // The own area is the server's: no centre leaves the device.
    const [first] = api.callsTo('GET /api/v1/collectors/nearby');
    expect(first?.query.get('lat')).toBeNull();
    expect(first?.query.get('lng')).toBeNull();
    expect(first?.query.get('radiusKm')).toBe('10');
    // The map starts on the server's (2-decimal) centre, at most at the cap.
    const start = mapView().props.initialRegion;
    expect(start).toMatchObject({ latitude: 45.5, longitude: -73.57 });
    expect(zoomOfRegion(start, WINDOW.width)).toBeLessThanOrEqual(14);
    expect(screen.getByTestId('zone-collector2').props.radius).toBe(1500);
    expect(screen.getByTestId('zone-maika').props.radius).toBe(1500);
    expect(screen.queryByTestId('mock-map-marker')).toBeNull();
    expect(screen.getByTestId('map-approximate-note')).toHaveTextContent(
      /Locations are approximate \(about 3 km\) to protect privacy/
    );
  });

  it('tells a hidden collector that others cannot find them', async () => {
    mockApi(routes());
    render();
    const notice = await screen.findByTestId('map-hidden-notice');
    expect(notice).toHaveTextContent(/You are hidden from the map/);
    fireEvent.press(within(notice).getByRole('button', { name: 'Location settings' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/settings/location');
    fireEvent.press(within(notice).getByRole('button', { name: 'Not now' }));
    expect(screen.queryByTestId('map-hidden-notice')).toBeNull();
  });

  it('does not show the hidden notice to a discoverable collector', async () => {
    mockApi(
      routes({ 'GET /api/v1/me/settings/privacy': ok(privacyFixture({ discoverable: true })) })
    );
    render();
    await waitFor(() => expect(status()).toHaveTextContent('2 collectors within 10 km'));
    expect(screen.queryByTestId('map-hidden-notice')).toBeNull();
  });

  it('browses a city when the collector has no trading area yet', async () => {
    const api = mockApi(
      routes({
        'GET /api/v1/me': ok(
          meFixture({
            onboarding: { profileComplete: true, tradingAreaSet: false, interestsSet: true },
          })
        ),
      })
    );
    render();
    await waitFor(() => expect(api.callsTo('GET /api/v1/collectors/nearby')).toHaveLength(1));
    const [first] = api.callsTo('GET /api/v1/collectors/nearby');
    expect(first?.query.get('lat')).toBe('45.5');
    expect(first?.query.get('lng')).toBe('-73.57');
    expect(await screen.findByTestId('map-area-prompt')).toHaveTextContent(/Montréal/);
    await chooseOption('map-city', 'quebec');
    await waitFor(() => {
      const last = api.callsTo('GET /api/v1/collectors/nearby').at(-1);
      expect(last?.query.get('lat')).toBe('46.81');
      expect(last?.query.get('lng')).toBe('-71.21');
    });
    const [region] = animateToRegion().mock.calls.at(-1) as [{ latitude: number }];
    expect(region.latitude).toBe(46.813);
    fireEvent.press(screen.getByTestId('map-set-area'));
    expect(mockRouter.push).toHaveBeenCalledWith('/settings/location');
  });

  it('falls back to a city when the API says there is no trading area after all', async () => {
    const api = mockApi(
      routes({
        'GET /api/v1/collectors/nearby': (request) =>
          request.query.get('lat')
            ? ok(nearbyFixture())
            : problem(400, 'VALIDATION_FAILED', 'No trading area'),
      })
    );
    render();
    expect(await screen.findByTestId('map-area-prompt')).toBeOnTheScreen();
    expect(api.callsTo('GET /api/v1/collectors/nearby').at(-1)?.query.get('lat')).toBe('45.5');
  });

  it('shows the empty state when nobody is in range', async () => {
    mockApi(routes({ 'GET /api/v1/collectors/nearby': ok(nearbyFixture([])) }));
    render();
    const empty = await screen.findByTestId('map-empty');
    expect(empty).toHaveTextContent(/No collectors within 10 km yet/);
    expect(screen.queryAllByTestId(/^zone-/)).toEqual([]);
  });

  it('shows an error with retry when collectors cannot load', async () => {
    const api = mockApi(
      routes({
        'GET /api/v1/collectors/nearby': [
          problem(500, 'INTERNAL_ERROR', 'Boom'),
          ok(nearbyFixture()),
        ],
      })
    );
    render();
    const error = await screen.findByTestId('map-error', {}, { timeout: 10_000 });
    expect(error).toHaveTextContent(/Collectors could not load/);
    fireEvent.press(within(error).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(status()).toHaveTextContent('2 collectors within 10 km'));
    expect(api.callsTo('GET /api/v1/collectors/nearby')).toHaveLength(2);
  });

  it('is offline tolerant: a failed refresh keeps the last answer on the map', async () => {
    const api = mockApi(routes());
    render();
    await waitFor(() => expect(status()).toHaveTextContent('2 collectors within 10 km'));
    api.use({ 'GET /api/v1/collectors/nearby': problem(0, 'NETWORK_ERROR', 'offline') });
    // A pan far away needs a new answer (debounced).
    act(() =>
      fireEvent(
        mapView(),
        'regionChangeComplete',
        regionForCamera({ lat: 46.81, lng: -71.21 }, 11, WINDOW)
      )
    );
    expect(await screen.findByTestId('map-refresh-error', {}, { timeout: 10_000 })).toBeTruthy();
    expect(screen.getByTestId('zone-collector2')).toBeOnTheScreen();
    expect(api.callsTo('GET /api/v1/collectors/nearby').at(-1)?.query.get('lat')).toBe('46.81');
  });

  it('re-queries with the game, intent and distance filters, and clears them', async () => {
    const api = mockApi(routes());
    render();
    await waitFor(() => expect(status()).toHaveTextContent('2 collectors within 10 km'));
    await chooseOption('map-filter-game', 'yugioh');
    await waitFor(() =>
      expect(api.callsTo('GET /api/v1/collectors/nearby').at(-1)?.query.get('game')).toBe('yugioh')
    );
    await chooseOption('map-filter-intent', 'SALE');
    await waitFor(() =>
      expect(api.callsTo('GET /api/v1/collectors/nearby').at(-1)?.query.get('availability')).toBe(
        'SALE'
      )
    );
    await chooseOption('map-filter-radius', '5');
    await waitFor(() =>
      expect(api.callsTo('GET /api/v1/collectors/nearby').at(-1)?.query.get('radiusKm')).toBe('5')
    );
    // Distances above the plan cap (25 km) are not offered.
    fireEvent.press(screen.getByTestId('map-filter-radius'));
    expect(screen.queryByTestId('map-filter-radius-option-50')).toBeNull();
    fireEvent.press(await screen.findByTestId('map-filter-radius-option-25'));
    fireEvent.press(await screen.findByRole('button', { name: 'Clear filters (3)' }));
    // Back to the first answer (cached: same query as the very first call).
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Game: All games' })).toBeOnTheScreen()
    );
    expect(screen.getByRole('button', { name: 'Intent: Any intent' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Within: 10 km' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /Clear filters/ })).toBeNull();
    expect(status()).toHaveTextContent('2 collectors within 10 km');
  });

  it('continues at the plan cap when the radius is beyond it (429 LIMIT_REACHED)', async () => {
    const api = mockApi(
      routes({
        'GET /api/v1/me/plan': ok(planFixture(50)),
        'GET /api/v1/collectors/nearby': (request) =>
          Number(request.query.get('radiusKm')) > 5
            ? problem(429, 'LIMIT_REACHED', 'Limit', { limitKey: 'map.radius.max_km', limit: 5 })
            : ok(nearbyFixture(undefined, { radiusKm: 5 })),
      })
    );
    render();
    expect(await screen.findByTestId('map-limit-notice')).toHaveTextContent(
      /Your plan shows collectors up to 5 km away\./
    );
    expect(api.callsTo('GET /api/v1/collectors/nearby').at(-1)?.query.get('radiusKm')).toBe('5');
  });
});

describe('Map tab: who has this card near me', () => {
  it('filters the map by the card of a card detail, then shows every collector again', async () => {
    mockParams.current = { card: CARD_ID };
    const holder = markerFixture({
      matchingItems: [matchingItemFixture({ cardId: CARD_ID, printingId: PRINTING_A })],
    });
    const api = mockApi(
      routes({
        'GET /api/v1/cards/{id}': ok(cardDetailFixture()),
        'GET /api/v1/collectors/nearby': (request) =>
          ok(request.query.get('hasCardId') ? nearbyFixture([holder]) : nearbyFixture()),
      })
    );
    render();
    await waitFor(() =>
      expect(screen.getByTestId('map-holders')).toHaveTextContent(
        /Who has Emberfang Fox VMAX near you/
      )
    );
    await waitFor(() =>
      expect(status()).toHaveTextContent('1 collector with this card within 10 km')
    );
    expect(api.callsTo('GET /api/v1/collectors/nearby')[0]?.query.get('hasCardId')).toBe(CARD_ID);

    // The list shows their listings of the card; the preview lists them with an API picture.
    fireEvent.press(screen.getByRole('button', { name: 'List' }));
    expect(await screen.findByTestId('collector-row-collector2-listings')).toHaveTextContent(
      /1 listing of this card · from/
    );
    fireEvent.press(screen.getByTestId('collector-row-collector2'));
    expect(await screen.findByTestId('preview-matching-items')).toBeOnTheScreen();
    // A listing that accepts offers: "Make an offer" closes the sheet and opens the offer form.
    const listing = matchingItemFixture();
    fireEvent.press(await screen.findByTestId(`preview-offer-${listing.itemId}`));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/offers/new',
      params: { item: listing.itemId },
    });
    expect(offerTargetFor(listing.itemId)).toMatchObject({
      cardName: 'Lantern Fox Spirit',
      askingPrice: 12.5,
      seller: { handle: 'collector2', placeLabel: 'Verdun, Montréal' },
    });
    fireEvent.press(screen.getByTestId('collector-row-collector2'));
    await screen.findByTestId('preview-matching-items');
    fireEvent.press(screen.getByTestId('collector-preview-backdrop'));

    fireEvent.press(screen.getByTestId('map-holders-clear'));
    expect(mockRouter.setParams).toHaveBeenCalledWith({ card: '', printing: '' });
    await waitFor(() => expect(screen.queryByTestId('map-holders')).not.toBeOnTheScreen());
    await waitFor(() =>
      expect(api.callsTo('GET /api/v1/collectors/nearby').at(-1)?.query.get('hasCardId')).toBeNull()
    );
  });
});

describe('Map tab: collector preview', () => {
  async function openFromList(handle = 'collector2') {
    await waitFor(() => expect(status()).toHaveTextContent('2 collectors within 10 km'));
    const toList = screen.queryByRole('button', { name: 'List' });
    if (toList) {
      fireEvent.press(toList);
    }
    fireEvent.press(await screen.findByTestId(`collector-row-${handle}`));
  }

  it('opens from a tap in a zone with the web preview card information', async () => {
    const api = mockApi(routes());
    render();
    await waitFor(() => expect(status()).toHaveTextContent('2 collectors within 10 km'));
    act(() =>
      fireEvent(mapView(), 'press', {
        nativeEvent: { coordinate: { latitude: 45.459, longitude: -73.573 } },
      })
    );
    expect(await screen.findByTestId('collector-preview-loading')).toHaveTextContent(/Noé Verdun/);
    expect(await screen.findByTestId('preview-name')).toHaveTextContent('Noé Verdun');
    expect(screen.getByTestId('preview-place')).toHaveTextContent('Verdun, Montréal');
    expect(screen.getByTestId('preview-approximate')).toHaveTextContent(
      /Locations are approximate \(about 3 km\)/
    );
    expect(screen.getByTestId('preview-distance')).toHaveTextContent('1–5 km away');
    expect(screen.getByTestId('preview-rating')).toHaveTextContent('4.8 (12 ratings)');
    expect(screen.getByTestId('preview-active')).toHaveTextContent('Active this week');
    expect(screen.getByTestId('preview-listings')).toHaveTextContent('1 public binder · 14 cards');
    expect(screen.getByTestId('preview-tags')).toHaveTextContent('Local pickup');
    expect(screen.getByLabelText('Online now')).toBeOnTheScreen();
    // The viewer's own area is the server's: no centre is sent with the preview.
    expect(api.callsTo('GET /api/v1/collectors/{handle}/preview')[0]?.query.get('lat')).toBeNull();
    // The zone of the previewed collector is emphasised.
    expect(screen.getByTestId('zone-collector2').props.strokeWidth).toBe(3);
  });

  it('opens the profile and the first public binder', async () => {
    mockApi(routes());
    render();
    await openFromList();
    fireEvent.press(await screen.findByTestId('preview-view-profile'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/collectors/[id]',
      params: { id: 'collector2' },
    });
    await openFromList();
    const binder = await screen.findByTestId('preview-view-binder');
    await waitFor(() => expect(binder).not.toBeDisabled());
    fireEvent.press(binder);
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/binders/[id]',
      params: { id: PUBLIC_BINDER_ID },
    });
  });

  it('reports the collector from the preview', async () => {
    mockApi(routes());
    render();
    await openFromList();
    fireEvent.press(await screen.findByTestId('preview-report'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/report',
      params: {
        userId: previewFixture().id,
        name: 'Noé Verdun',
        handle: 'collector2',
        source: 'PROFILE',
      },
    });
  });

  it('starts or opens the conversation with "Message"', async () => {
    const api = mockApi(routes({ 'POST /api/v1/conversations': ok(conversationFixture(), 201) }));
    render();
    await openFromList();
    fireEvent.press(await screen.findByRole('button', { name: 'Message' }));
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/messages/[id]',
        params: { id: CONVERSATION_ID },
      })
    );
    expect(api.callsTo('POST /api/v1/conversations')[0]?.body).toEqual({
      recipientId: '00000000-0000-4000-8000-0000000000b1',
    });
  });

  it('explains a refused conversation', async () => {
    mockApi(
      routes({
        'POST /api/v1/conversations': problem(403, 'MESSAGING_BLOCKED', 'Messaging is blocked'),
      })
    );
    render();
    await openFromList();
    fireEvent.press(await screen.findByRole('button', { name: 'Message' }));
    expect(await screen.findByTestId('snackbar')).toHaveTextContent(/Messaging unavailable/);
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('respects the messaging permission: no Message for collectors who refuse it', async () => {
    mockApi(
      routes({
        'GET /api/v1/collectors/{handle}/preview': ok(previewFixture({ canMessage: false })),
      })
    );
    render();
    await openFromList();
    expect(await screen.findByTestId('preview-message')).toBeDisabled();
    expect(screen.getByTestId('preview-message-reason')).toHaveTextContent(
      'Noé Verdun does not accept messages from you.'
    );
  });

  it('says when messaging is unavailable because of a block', async () => {
    mockApi(
      routes({
        'GET /api/v1/collectors/{handle}/preview': ok(
          previewFixture({ canMessage: false, isBlocked: true })
        ),
      })
    );
    render();
    await openFromList();
    expect(await screen.findByTestId('preview-message-reason')).toHaveTextContent(
      /because of a block/
    );
  });

  it('shows the own preview without Message', async () => {
    mockApi(
      routes({
        'GET /api/v1/collectors/{handle}/preview': ok(
          previewFixture({
            id: '00000000-0000-4000-8000-0000000000a1',
            handle: 'maika',
            displayName: 'Maïka Test',
          })
        ),
      })
    );
    render();
    await openFromList('maika');
    expect(await screen.findByTestId('preview-distance')).toHaveTextContent('Your public position');
    expect(screen.queryByTestId('preview-message')).toBeNull();
    expect(screen.queryByTestId('preview-report')).toBeNull();
  });

  it('shows "not available" for a collector who left the map, and an error with retry', async () => {
    mockApi(
      routes({
        'GET /api/v1/collectors/{handle}/preview': problem(404, 'NOT_FOUND', 'Not found'),
      })
    );
    render();
    await openFromList();
    expect(await screen.findByTestId('collector-preview-not-found')).toHaveTextContent(
      /no longer on the map/
    );
  });

  it('retries a preview that failed', async () => {
    mockApi(
      routes({
        'GET /api/v1/collectors/{handle}/preview': [
          problem(500, 'INTERNAL_ERROR', 'Boom'),
          ok(previewFixture()),
        ],
      })
    );
    render();
    await openFromList();
    expect(await screen.findByTestId('collector-preview-error')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('preview-name')).toHaveTextContent('Noé Verdun');
  });

  it('"Show on map" brings the zone into view, never past the cap', async () => {
    mockApi(routes());
    render();
    await openFromList();
    fireEvent.press(await screen.findByTestId('preview-show-on-map'));
    await waitFor(() => expect(animateToRegion()).toHaveBeenCalled());
    const [region] = animateToRegion().mock.calls.at(-1) as [ReturnType<typeof regionForCamera>];
    expect(region).toMatchObject({ latitude: 45.458, longitude: -73.571 });
    expect(zoomOfRegion(region, WINDOW.width)).toBeLessThanOrEqual(14);
  });

  it('lists collectors nearest first with bucketed distances only', async () => {
    mockApi(routes());
    render();
    await waitFor(() => expect(status()).toHaveTextContent('2 collectors within 10 km'));
    fireEvent.press(screen.getByRole('button', { name: 'List' }));
    const own = await screen.findByTestId('collector-row-maika');
    expect(own).toHaveTextContent(/You \(Maïka Test\)/);
    expect(own).toHaveTextContent(/Your public position/);
    expect(screen.getByTestId('collector-row-collector2')).toHaveTextContent(/1–5 km away/);
    expect(screen.queryByText(/45\.\d|73\.\d/)).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Map' }));
    expect(screen.getByTestId('collector-map-view')).toBeOnTheScreen();
  });
});

// Keep the fixtures referenced (lint): the viewer's own marker is part of the default answer.
void selfMarkerFixture;
