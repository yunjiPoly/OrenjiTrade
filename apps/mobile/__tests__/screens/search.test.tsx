import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import SearchScreen from '@/app/(tabs)/search';
import { useRecentSearchesStore } from '@/src/features/catalog/recentSearchesStore';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import { cardPage, cardSummaryFixture, SETS } from '../support/fixtures';
import { mockApi, ok, problem } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { mockParams, mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());

const FOX = cardSummaryFixture();
const OTTER = cardSummaryFixture({
  id: '00000000-0000-4000-8a00-000000000002',
  name: 'Tidal Otterling',
  slug: 'tidal-otterling',
  subtype: 'Basic',
  printingCount: 1,
});

beforeEach(() => {
  resetRouterMock();
  resetAppState();
  useRecentSearchesStore.setState({ byUser: {} });
});

function render() {
  return renderWithProviders(<SearchScreen />, { port: new FakeAuthPort(testUser()) });
}

describe('Search tab', () => {
  it('shows a skeleton, then the catalog with API pictures, and opens a card', async () => {
    mockApi(signedInRoutes({ 'GET /api/v1/cards': ok(cardPage([FOX, OTTER], 0, 1, 2)) }));
    render();
    expect(screen.getByTestId('search-loading')).toBeOnTheScreen();
    expect(await screen.findByTestId('card-result-emberfang-fox-vmax')).toBeOnTheScreen();
    expect(screen.getByTestId('search-count')).toHaveTextContent('2 cards');
    expect(screen.getByText('1 printing')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('link', { name: 'Tidal Otterling' }));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/cards/[id]',
      params: { id: OTTER.id },
    });
  });

  it('searches as the collector types and remembers the search', async () => {
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/cards': (request) =>
          ok(request.query.get('query') === 'fox' ? cardPage([FOX]) : cardPage([FOX, OTTER])),
      })
    );
    render();
    await screen.findByTestId('card-result-tidal-otterling');
    fireEvent.changeText(screen.getByTestId('search-input'), 'fox');
    await waitFor(() =>
      expect(screen.getByTestId('search-count')).toHaveTextContent('1 card for “fox”')
    );
    expect(screen.queryByTestId('card-result-tidal-otterling')).toBeNull();
    expect(api.callsTo('GET /api/v1/cards').at(-1)?.query.get('query')).toBe('fox');

    fireEvent(screen.getByTestId('search-input'), 'submitEditing');
    fireEvent.changeText(screen.getByTestId('search-input'), '');
    expect(await screen.findByTestId('recent-searches')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Search again for fox' }));
    await waitFor(() => expect(screen.getByTestId('search-count')).toHaveTextContent(/for “fox”/));
    fireEvent.changeText(screen.getByTestId('search-input'), '');
    fireEvent.press(await screen.findByRole('button', { name: 'Clear recent searches' }));
    expect(screen.queryByTestId('recent-searches')).toBeNull();
  });

  it('filters by game and by set, rarity, language and edition from the schema', async () => {
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/cards': ok(cardPage([FOX])),
        'GET /api/v1/sets': ok({ items: SETS, page: 0, size: 100, totalItems: 2, totalPages: 1 }),
      })
    );
    render();
    await screen.findByTestId('card-result-emberfang-fox-vmax');
    fireEvent.press(screen.getByTestId('search-game-pokemon'));
    await waitFor(() =>
      expect(api.callsTo('GET /api/v1/cards').at(-1)?.query.get('game')).toBe('pokemon')
    );
    fireEvent.press(screen.getByTestId('search-filters'));
    fireEvent.press(await screen.findByTestId('filter-set-SVX'));
    fireEvent.press(screen.getByTestId('filter-language-fr'));
    fireEvent.press(screen.getByTestId('filter-rarity-Ultra Rare'));
    fireEvent.press(screen.getByTestId('filter-edition-UNLIMITED'));
    await waitFor(() => {
      const query = api.callsTo('GET /api/v1/cards').at(-1)?.query;
      expect(Object.fromEntries(query ?? [])).toMatchObject({
        game: 'pokemon',
        set: 'SVX',
        language: 'fr',
        rarity: 'Ultra Rare',
        edition: 'UNLIMITED',
      });
    });
    expect(screen.getByRole('button', { name: 'Filters (4)' })).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('filters-clear'));
    // Back to the game alone (answered from the cache: that search ran before).
    expect(await screen.findByRole('button', { name: 'Filters' })).toBeOnTheScreen();
    expect(screen.getByTestId('search-game-pokemon')).toBeChecked();
  });

  it('applies a link into the tab (a set from the card detail)', async () => {
    mockParams.current = { game: 'pokemon', set: 'SVX', q: '' };
    const api = mockApi(signedInRoutes({ 'GET /api/v1/cards': ok(cardPage([FOX])) }));
    render();
    await screen.findByTestId('card-result-emberfang-fox-vmax');
    expect(api.callsTo('GET /api/v1/cards')[0]?.query.get('set')).toBe('SVX');
    expect(screen.getByRole('button', { name: 'Filters (1)' })).toBeOnTheScreen();
  });

  it('explains an empty result and clears the search', async () => {
    mockApi(
      signedInRoutes({
        'GET /api/v1/cards': (request) =>
          ok(request.query.get('query') ? cardPage([]) : cardPage([FOX])),
      })
    );
    render();
    await screen.findByTestId('card-result-emberfang-fox-vmax');
    fireEvent.changeText(screen.getByTestId('search-input'), 'zzzz');
    expect(await screen.findByText('No cards match')).toBeOnTheScreen();
    expect(screen.getByText(/Nothing matches “zzzz”/)).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('search-empty-action'));
    expect(await screen.findByTestId('card-result-emberfang-fox-vmax')).toBeOnTheScreen();
  });

  it('shows the printing code match badge', async () => {
    mockApi(signedInRoutes({ 'GET /api/v1/cards': ok(cardPage([FOX])) }));
    render();
    fireEvent.changeText(screen.getByTestId('search-input'), 'SVX-001');
    expect(await screen.findByText('Printing code match')).toBeOnTheScreen();
  });

  it('shows an error with retry, and the offline wording', async () => {
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/cards': [problem(500, 'INTERNAL_ERROR', 'boom'), ok(cardPage([FOX]))],
      })
    );
    render();
    expect(await screen.findByTestId('search-error')).toBeOnTheScreen();
    expect(screen.getByText('Cards could not load')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('search-error-retry'));
    expect(await screen.findByTestId('card-result-emberfang-fox-vmax')).toBeOnTheScreen();
    expect(api.callsTo('GET /api/v1/cards')).toHaveLength(2);
  });

  it('says when the device is offline', async () => {
    mockApi(signedInRoutes()).fetch.mockImplementation(async (input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.includes('/api/v1/cards')) {
        throw new TypeError('Network request failed');
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });
    render();
    expect(await screen.findByText('You appear to be offline')).toBeOnTheScreen();
  });
});
