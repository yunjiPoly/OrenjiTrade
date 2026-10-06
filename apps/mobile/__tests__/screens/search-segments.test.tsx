import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import SearchScreen from '@/app/(tabs)/search';
import { useRecentSearchesStore } from '@/src/features/catalog/recentSearchesStore';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import {
  PUBLIC_BINDER_ID,
  cardPage,
  cardSummaryFixture,
  markerFixture,
  meFixture,
  searchBinderFixture,
  unifiedSearchFixture,
} from '../support/fixtures';
import { mockApi, ok, problem } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { mockParams, mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());

beforeEach(() => {
  resetRouterMock();
  resetAppState();
  useRecentSearchesStore.setState({ byUser: {} });
});

function render() {
  return renderWithProviders(<SearchScreen />, { port: new FakeAuthPort(testUser()) });
}

const CARDS = signedInRoutes({ 'GET /api/v1/cards': ok(cardPage([cardSummaryFixture()])) });

describe('Search tab segments (the web /search tabs)', () => {
  it('finds collectors by name or handle with their approximate place and distance bucket', async () => {
    const api = mockApi({
      ...CARDS,
      'GET /api/v1/search': (request) =>
        ok(
          unifiedSearchFixture({
            query: request.query.get('q') ?? '',
            collectors: request.query.get('q') === 'noé' ? [markerFixture()] : [],
          })
        ),
    });
    render();
    fireEvent.press(screen.getByTestId('search-segment-collectors'));
    expect(await screen.findByTestId('search-collectors-invite')).toBeOnTheScreen();
    expect(api.callsTo('GET /api/v1/search')).toHaveLength(0);

    fireEvent.changeText(screen.getByTestId('search-collectors-input'), 'noé');
    const row = await screen.findByTestId('collector-result-collector2');
    expect(row).toHaveTextContent(/Noé Verdun/);
    expect(row).toHaveTextContent(/@collector2 · Verdun, Montréal · 1–5 km away/);
    expect(row).toHaveTextContent(/4\.8 \(12 ratings\) · 1 public binder · 14 cards/);
    expect(screen.getByTestId('search-collectors-count')).toHaveTextContent(
      /1 collector for “noé” · Locations are approximate \(about 3 km\)/
    );
    // The own trading area: no centre is sent; only the collectors section is asked for.
    const query = api.callsTo('GET /api/v1/search').at(-1)?.query;
    expect(query?.get('lat')).toBeNull();
    expect(query?.getAll('types')).toEqual(['collectors']);
    // Coordinates are never written out.
    expect(screen.queryByText(/45\.4|73\.5/)).toBeNull();

    fireEvent.press(row);
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/collectors/[id]',
      params: { id: 'collector2' },
    });
    // The search is remembered for the Collectors segment only.
    expect(useRecentSearchesStore.getState().byUser['uid-maika/collectors']).toEqual(['noé']);
    expect(useRecentSearchesStore.getState().byUser['uid-maika']).toBeUndefined();
  });

  it('searches around the launch city without a trading area, and explains no match', async () => {
    const api = mockApi({
      ...CARDS,
      'GET /api/v1/me': ok(
        meFixture({
          onboarding: { profileComplete: true, interestsSet: true, tradingAreaSet: false },
        })
      ),
      'GET /api/v1/search': ok(unifiedSearchFixture({ query: 'zzz' })),
    });
    render();
    fireEvent.press(screen.getByTestId('search-segment-collectors'));
    fireEvent.changeText(await screen.findByTestId('search-collectors-input'), 'zzz');
    expect(await screen.findByText('No collectors match')).toBeOnTheScreen();
    expect(
      screen.getByText('Collectors appear when they are on the map and allow name search.')
    ).toBeOnTheScreen();
    const query = api.callsTo('GET /api/v1/search').at(-1)?.query;
    expect(query?.get('lat')).toBe('45.502');
    expect(query?.get('lng')).toBe('-73.567');
  });

  it('finds public binders by name with their owner, and opens the public view', async () => {
    mockApi({
      ...CARDS,
      'GET /api/v1/search': ok(
        unifiedSearchFixture({ query: 'magic', binders: [searchBinderFixture()] })
      ),
    });
    render();
    fireEvent.press(screen.getByTestId('search-segment-binders'));
    fireEvent.changeText(await screen.findByTestId('search-binders-input'), 'magic');
    const row = await screen.findByTestId(`binder-result-${PUBLIC_BINDER_ID}`);
    expect(row).toHaveTextContent(/Magic trades/);
    expect(row).toHaveTextContent(/Trade binder · 14 cards · Magic: The Gathering/);
    expect(row).toHaveTextContent(/Noé Verdun · Verdun, Montréal · 1–5 km away/);
    expect(screen.getByTestId('search-binders-count')).toHaveTextContent(
      '1 public binder for “magic”'
    );
    fireEvent.press(row);
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/binders/[id]',
      params: { id: PUBLIC_BINDER_ID, view: 'public' },
    });
  });

  it('shows the recent searches of a segment and searches again from one', async () => {
    useRecentSearchesStore.setState({ byUser: { 'uid-maika/binders': ['deck'] } });
    const api = mockApi({
      ...CARDS,
      'GET /api/v1/search': ok(unifiedSearchFixture({ query: 'deck' })),
    });
    render();
    fireEvent.press(screen.getByTestId('search-segment-binders'));
    fireEvent.press(await screen.findByRole('button', { name: 'Search again for deck' }));
    await waitFor(() =>
      expect(api.callsTo('GET /api/v1/search').at(-1)?.query.get('q')).toBe('deck')
    );
    expect(await screen.findByText('No public binders match')).toBeOnTheScreen();
  });

  it('shows an error with retry', async () => {
    const api = mockApi({
      ...CARDS,
      'GET /api/v1/search': [
        problem(503, 'SERVICE_UNAVAILABLE', 'down'),
        ok(unifiedSearchFixture({ query: 'noé', collectors: [markerFixture()] })),
      ],
    });
    render();
    fireEvent.press(screen.getByTestId('search-segment-collectors'));
    fireEvent.changeText(await screen.findByTestId('search-collectors-input'), 'noé');
    expect(await screen.findByTestId('search-collectors-error')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('search-collectors-error-retry'));
    expect(await screen.findByTestId('collector-result-collector2')).toBeOnTheScreen();
    expect(api.callsTo('GET /api/v1/search')).toHaveLength(2);
  });

  it('opens a segment from a link (?tab=) and keeps the cards segment as before', async () => {
    mockParams.current = { tab: 'binders' };
    mockApi({ ...CARDS, 'GET /api/v1/search': ok(unifiedSearchFixture()) });
    render();
    expect(await screen.findByTestId('search-binders-invite')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('search-segment-cards'));
    expect(await screen.findByTestId('card-result-emberfang-fox-vmax')).toBeOnTheScreen();
  });
});
