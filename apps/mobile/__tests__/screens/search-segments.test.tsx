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
  it('finds collectors by name or handle with their state or province, never a distance', async () => {
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
    expect(row).toHaveTextContent(/@collector2 · Ontario, Canada/);
    expect(row).toHaveTextContent(/4\.8 \(12 ratings\) · 1 public binder · 14 cards/);
    expect(screen.getByTestId('search-collectors-count')).toHaveTextContent(
      '1 collector for “noé”'
    );
    // The home region scopes the search (ADR 0017); only the collectors section is asked for.
    const query = api.callsTo('GET /api/v1/search').at(-1)?.query;
    expect(query?.get('region')).toBe('americas-north');
    expect(query?.get('lat')).toBeNull();
    expect(query?.getAll('types')).toEqual(['collectors']);
    expect(screen.queryByText(/km/)).toBeNull();

    fireEvent.press(row);
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/collectors/[id]',
      params: { id: 'collector2' },
    });
    // The search is remembered for the Collectors segment only.
    expect(useRecentSearchesStore.getState().byUser['uid-maika/collectors']).toEqual(['noé']);
    expect(useRecentSearchesStore.getState().byUser['uid-maika']).toBeUndefined();
  });

  it('searches the default region without a location, and explains no match', async () => {
    const api = mockApi({
      ...CARDS,
      'GET /api/v1/me': ok(
        meFixture({
          homeRegion: undefined,
          onboarding: { profileComplete: true, interestsSet: true, locationSet: false },
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
    expect(query?.get('region')).toBe('americas-north');
    expect(query?.has('lat')).toBe(false);
    expect(query?.has('lng')).toBe(false);
  });

  it("searches the region the switcher shows, and says which one when it is not the collector's own", async () => {
    const api = mockApi({
      ...CARDS,
      'GET /api/v1/me': ok(meFixture({ homeRegion: 'americas-north' })),
      'GET /api/v1/search': (request) =>
        ok(
          unifiedSearchFixture({
            query: request.query.get('q') ?? '',
            region: request.query.get('region') ?? '',
            collectors: request.query.get('region') === 'europe' ? [] : [markerFixture()],
          })
        ),
    });
    render();
    // The switcher sits on top of the tab, whatever the segment.
    expect(
      await screen.findByRole('button', { name: 'Region: Americas (North)' })
    ).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('search-segment-collectors'));
    expect(await screen.findByText('Who trades in your region?')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByTestId('search-collectors-input'), 'noé');
    expect(await screen.findByTestId('collector-result-collector2')).toBeOnTheScreen();
    expect(api.callsTo('GET /api/v1/search').at(-1)?.query.get('region')).toBe('americas-north');

    // Another region: the same search is asked again there, at once.
    fireEvent.press(screen.getByTestId('search-region'));
    fireEvent.press(screen.getByTestId('search-region-option-europe'));
    expect(await screen.findByText('No collectors match')).toBeOnTheScreen();
    const query = api.callsTo('GET /api/v1/search').at(-1)?.query;
    expect(query?.get('region')).toBe('europe');
    expect(query?.get('q')).toBe('noé');
    expect(screen.getByRole('button', { name: 'Region: Europe' })).toBeOnTheScreen();
    expect(screen.getByTestId('search-region-away')).toHaveTextContent(/Not your region/);

    // The invitation names the region being browsed.
    fireEvent.changeText(screen.getByTestId('search-collectors-input'), '');
    expect(await screen.findByText('Who trades in Europe?')).toBeOnTheScreen();
    expect(screen.getByText('Search a collector of Europe by name or handle.')).toBeOnTheScreen();
    // The invitation has the height of what is left of the tab: without one it collapsed on iOS
    // and only its icon showed, over the field.
    expect(screen.getByTestId('search-collectors-idle')).toHaveStyle({ flex: 1 });

    // Back home in one press.
    fireEvent.press(screen.getByRole('button', { name: 'Back to Americas (North)' }));
    expect(await screen.findByText('Who trades in your region?')).toBeOnTheScreen();
    expect(screen.queryByTestId('search-region-away')).toBeNull();
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
    expect(row).toHaveTextContent(/Noé Verdun · Ontario, Canada/);
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
