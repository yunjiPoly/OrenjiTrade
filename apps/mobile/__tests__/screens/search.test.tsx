import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

import SearchScreen from '@/app/(tabs)/search';
import { useRecentSearchesStore } from '@/src/features/catalog/recentSearchesStore';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import {
  ONTARIO,
  binderCountsFixture,
  cardPage,
  cardSummaryFixture,
  collectorByNameFixture,
  placeBindersPage,
  publicBinderSummaryFixture,
  searchBinderFixture,
  wishFixture,
} from '../support/fixtures';
import { mockApi, ok, problem } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { mockParams, mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());

const ASH = cardSummaryFixture({
  id: '00000000-0000-4000-8a00-0000000000a5',
  name: 'Ash Blossom & Joyous Spring',
  slug: 'ash-blossom',
  game: 'yugioh',
});
const SNAKE = cardSummaryFixture({
  id: '00000000-0000-4000-8a00-0000000000a6',
  name: 'Snake-Eye Ash',
  slug: 'snake-eye-ash',
  game: 'yugioh',
});
const BARRENS = cardSummaryFixture({
  id: '00000000-0000-4000-8a00-0000000000a7',
  name: 'Ash Barrens',
  slug: 'ash-barrens',
  game: 'mtg',
});

beforeEach(() => {
  resetRouterMock();
  resetAppState();
  useRecentSearchesStore.setState({ byUser: {}, forgetting: {} });
});

function render() {
  return renderWithProviders(<SearchScreen />, { port: new FakeAuthPort(testUser()) });
}

/** Lays the map out (the screen measures itself before it draws the map once). */
async function layOutMap() {
  fireEvent(await screen.findByTestId('search-map'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 392, height: 640 } },
  });
  fireEvent(screen.getByTestId('search-field-frame'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 52 } },
  });
  fireEvent(screen.getByTestId('search-region-map-frame'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 576 } },
  });
}

describe('Search: the map (screen 11)', () => {
  it('shows the title, the bell, the segments with the number of wishes, the field and the map', async () => {
    mockApi(
      signedInRoutes({
        'GET /api/v1/wishlist': ok([wishFixture(), wishFixture({ id: 'w2' })]),
        'GET /api/v1/regions/{region}/binder-counts': ok(binderCountsFixture()),
      })
    );
    render();
    expect(screen.getByTestId('search-title')).toHaveTextContent('Search');
    expect(await screen.findByTestId('notification-bell-search')).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Cards' })).toBeSelected();
    expect(await screen.findByRole('tab', { name: 'Wishlist, 2' })).toBeOnTheScreen();
    expect(
      screen.getByRole('search', { name: 'Card name or code, like LOB-EN001' })
    ).toBeOnTheScreen();
    // No Filters button on Search, and no count of cards or holders.
    expect(screen.queryByText(/Filters/)).toBeNull();
    await layOutMap();
    expect(await screen.findByTestId('map-shape-CA-QC')).toBeOnTheScreen();
    expect(screen.getByLabelText('Show my province')).toBeOnTheScreen();
    expect(screen.getByLabelText('Zoom in')).toBeOnTheScreen();
    expect(
      screen.getByTestId('search-map-legend', { includeHiddenElements: true })
    ).toHaveTextContent(/Public binders/);
  });

  it("opens on the collector's province with its card, and See binders filters Binders to it", async () => {
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/regions/{region}/binder-counts': ok(
          binderCountsFixture({
            subdivisions: [
              { code: 'CA-QC', binderCount: 12, deckCoreCount: 5 },
              { code: 'CA-ON', binderCount: 1, deckCoreCount: 0 },
            ],
          })
        ),
        'GET /api/v1/regions/{region}/subdivisions/{code}/binders': ok(
          placeBindersPage([searchBinderFixture()])
        ),
      })
    );
    render();
    await layOutMap();
    const card = await screen.findByTestId('search-state-card');
    expect(within(card).getByTestId('search-state-name')).toHaveTextContent('Quebec');
    expect(within(card).getByTestId('search-state-sub')).toHaveTextContent(
      'Canada · your province'
    );
    expect(await within(card).findByTestId('search-state-stats-CA-QC')).toHaveTextContent(
      '7 binders · 5 deck cores'
    );
    fireEvent.press(within(card).getByRole('button', { name: 'See binders' }));
    expect(await screen.findByTestId('search-binders')).toBeOnTheScreen();
    expect(screen.getByTestId('binders-state-chip')).toHaveTextContent(/Quebec/);
    await waitFor(() =>
      expect(api.callsTo('GET /api/v1/regions/{region}/subdivisions/{code}/binders')).toHaveLength(
        1
      )
    );
    const asked = api.callsTo('GET /api/v1/regions/{region}/subdivisions/{code}/binders')[0];
    expect(asked?.path).toBe('/api/v1/regions/americas-north/subdivisions/CA-QC/binders');
    expect(asked?.query.get('deckCore')).toBe('false');
  });

  it('a state without binders says so, has no See binders, and the card closes', async () => {
    mockApi(
      signedInRoutes({
        'GET /api/v1/regions/{region}/binder-counts': ok(
          binderCountsFixture({ subdivisions: [{ code: 'CA-ON', binderCount: 1 }] })
        ),
      })
    );
    render();
    await layOutMap();
    expect(await screen.findByTestId('search-state-stats-CA-QC')).toHaveTextContent(
      'No public binders here yet'
    );
    expect(screen.queryByRole('button', { name: 'See binders' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByTestId('search-state-card')).toBeNull();
  });

  it('a link opens the map on its state (the old Map tab links)', async () => {
    mockParams.current = { subdivision: 'CA-ON' };
    mockApi(
      signedInRoutes({
        'GET /api/v1/regions/{region}/binder-counts': ok(binderCountsFixture()),
      })
    );
    render();
    await layOutMap();
    expect(await screen.findByTestId('search-state-name')).toHaveTextContent('Ontario');
    expect(screen.getByTestId('search-state-sub')).toHaveTextContent(/^Canada$/);
    expect(mockRouter.setParams).toHaveBeenCalled();
  });

  it('explains when the counts could not load, with Try again', async () => {
    mockApi(
      signedInRoutes({
        'GET /api/v1/regions/{region}/binder-counts': problem(503, 'UNAVAILABLE', 'Down'),
      })
    );
    render();
    expect(await screen.findByTestId('search-map-counts-error')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
  });
});

describe('Search: typing a card (screen 12)', () => {
  function typingRoutes(extra = {}) {
    return signedInRoutes({
      'GET /api/v1/cards': (request) => {
        const q = request.query.get('query');
        const game = request.query.get('game');
        if (q === 'zzzz') {
          return ok(cardPage([]));
        }
        const all = [ASH, SNAKE, BARRENS];
        return ok(cardPage(game ? all.filter((card) => card.game === game) : all));
      },
      'GET /api/v1/search/collectors': ok([]),
      ...extra,
    });
  }

  it('opens from the field with the recent searches, the Clear and the privacy line', async () => {
    useRecentSearchesStore.setState({
      byUser: { 'uid-maika': ['Ash Blossom', 'LAVD-EN008'] },
      forgetting: {},
    });
    mockApi(typingRoutes());
    render();
    fireEvent.press(await screen.findByRole('search', { name: /Card name or code/ }));
    expect(await screen.findByTestId('search-typing')).toBeOnTheScreen();
    expect(screen.getByTestId('search-input')).toHaveProp('autoFocus', true);
    expect(screen.getByText('Recent searches')).toBeOnTheScreen();
    expect(screen.getByTestId('recent-searches-privacy')).toHaveTextContent(
      'Only you see your searches. You can turn this off in Settings › Privacy.'
    );
    fireEvent.press(screen.getByRole('button', { name: 'Clear recent searches' }));
    expect(screen.queryByText('Recent searches')).toBeNull();
    // Cancel goes back to the map.
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByTestId('search-map')).toBeOnTheScreen();
  });

  it('shows the cards as the collector types, the typed part highlighted, the game chips filter', async () => {
    const api = mockApi(typingRoutes());
    render();
    fireEvent.press(await screen.findByRole('search', { name: /Card name or code/ }));
    fireEvent.changeText(screen.getByTestId('search-input'), 'ash bl');
    const ash = await screen.findByTestId(`search-result-${ASH.id}`);
    expect(within(ash).getByText('Ash Bl')).toBeOnTheScreen();
    expect(ash).toHaveTextContent(/Yu-Gi-Oh!/);
    // The name and the game, nothing else: no printings count, no type line.
    expect(screen.queryByText(/printing/)).toBeNull();
    expect(screen.getByTestId(`search-result-${BARRENS.id}`)).toHaveTextContent(/Magic/);
    expect(api.callsTo('GET /api/v1/cards').at(-1)?.query.get('query')).toBe('ash bl');

    fireEvent.press(screen.getByRole('radio', { name: 'Yu-Gi-Oh!' }));
    await waitFor(() =>
      expect(api.callsTo('GET /api/v1/cards').at(-1)?.query.get('game')).toBe('yugioh')
    );
    await waitFor(() => expect(screen.queryByTestId(`search-result-${BARRENS.id}`)).toBeNull());

    fireEvent.press(screen.getByTestId(`search-result-${ASH.id}`));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/cards/[id]',
      params: { id: ASH.id },
    });
    // The search is remembered on this phone.
    expect(useRecentSearchesStore.getState().byUser['uid-maika']).toEqual(['ash bl']);
  });

  it('lists at most three matching collectors under the cards, each opening their profile', async () => {
    const api = mockApi(
      typingRoutes({
        'GET /api/v1/search/collectors': ok([
          collectorByNameFixture(),
          collectorByNameFixture({ id: 'c3', handle: 'ash_trader', place: ONTARIO }),
        ]),
      })
    );
    render();
    fireEvent.press(await screen.findByRole('search', { name: /Card name or code/ }));
    fireEvent.changeText(screen.getByTestId('search-input'), 'ash');
    const section = await screen.findByTestId('search-collectors');
    expect(within(section).getByText('Collectors')).toBeOnTheScreen();
    expect(screen.getByTestId('search-collector-ash_trader')).toHaveTextContent(/Ontario/);
    const asked = api.callsTo('GET /api/v1/search/collectors').at(-1);
    expect(asked?.query.get('q')).toBe('ash');
    expect(asked?.query.get('limit')).toBe('3');
    expect(asked?.query.get('region')).toBe('americas-north');
    fireEvent.press(screen.getByTestId('search-collector-ash_trader'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/collectors/[id]',
      params: { id: 'ash_trader' },
    });
  });

  it('says when no card matches, with the hint', async () => {
    mockApi(typingRoutes());
    render();
    fireEvent.press(await screen.findByRole('search', { name: /Card name or code/ }));
    fireEvent.changeText(screen.getByTestId('search-input'), 'zzzz');
    expect(await screen.findByTestId('search-no-match')).toHaveTextContent(
      'No card matches “zzzz”Try fewer letters, or the code printed on the card, like LAVD-EN008.'
    );
  });

  it('remembers nothing while "Remember my searches" is off', async () => {
    useRecentSearchesStore.getState().setRemembering('uid-maika', false);
    mockApi(typingRoutes());
    render();
    fireEvent.press(await screen.findByRole('search', { name: /Card name or code/ }));
    expect(screen.queryByTestId('recent-searches')).toBeNull();
    fireEvent.changeText(screen.getByTestId('search-input'), 'ash');
    fireEvent.press(await screen.findByTestId(`search-result-${ASH.id}`));
    expect(useRecentSearchesStore.getState().byUser['uid-maika']).toBeUndefined();
  });

  it('opens the card search from a link with its text (the set links of before)', async () => {
    mockParams.current = { q: 'snake' };
    const api = mockApi(typingRoutes());
    render();
    expect(await screen.findByTestId('search-typing')).toBeOnTheScreen();
    expect(screen.getByTestId('search-input')).toHaveProp('value', 'snake');
    await waitFor(() =>
      expect(api.callsTo('GET /api/v1/cards').at(-1)?.query.get('query')).toBe('snake')
    );
  });

  it('shows an error with Try again', async () => {
    mockApi(
      signedInRoutes({
        'GET /api/v1/cards': problem(500, 'INTERNAL_ERROR', 'Down'),
        'GET /api/v1/search/collectors': ok([]),
      })
    );
    render();
    fireEvent.press(await screen.findByRole('search', { name: /Card name or code/ }));
    fireEvent.changeText(screen.getByTestId('search-input'), 'ash');
    expect(await screen.findByTestId('search-error')).toBeOnTheScreen();
  });
});

describe('Search › Binders (screen 14)', () => {
  const CORE = publicBinderSummaryFixture({
    id: 'core-1',
    name: 'Yubel core',
    sellsAsCore: true,
    askingPriceText: '$95',
    previewImages: [],
    owner: {
      id: 'o1',
      handle: 'duelist.jp',
      displayName: 'Duelist',
      avatarUrl: null,
      place: ONTARIO,
    },
  });

  it('lists the whole region with "Pick on the map", binders or deck cores, and searches text', async () => {
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/regions/{region}/binders': (request) =>
          ok(
            placeBindersPage(
              request.query.get('deckCore') === 'true'
                ? [CORE]
                : request.query.get('q') === 'nothing'
                  ? []
                  : [searchBinderFixture()]
            )
          ),
      })
    );
    mockParams.current = { segment: 'binders' };
    render();
    expect(await screen.findByTestId('search-binders')).toBeOnTheScreen();
    expect(screen.getByRole('link', { name: 'Pick on the map' })).toBeOnTheScreen();
    expect(await screen.findByText(/collector2 · Ontario · 14 cards/)).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId('binders-kind-cores'));
    const core = await screen.findByTestId('binder-search-row-core-1');
    expect(core).toHaveTextContent(/Yubel core/);
    expect(core).toHaveTextContent(/duelist\.jp · Ontario/);
    expect(screen.getByTestId('binder-search-price-core-1')).toHaveTextContent('$95');
    fireEvent.press(core);
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/binders/[id]',
      params: { id: 'core-1', view: 'public' },
    });

    fireEvent.press(screen.getByTestId('binders-kind-binders'));
    fireEvent.changeText(screen.getByTestId('binders-input'), 'nothing');
    expect(await screen.findByTestId('binders-empty')).toHaveTextContent(
      'Nothing matches. Try a deck name, a card name or a collector.'
    );
    expect(api.callsTo('GET /api/v1/regions/{region}/binders').at(-1)?.query.get('q')).toBe(
      'nothing'
    );
    fireEvent.press(screen.getByRole('link', { name: 'Pick on the map' }));
    expect(await screen.findByTestId('search-map')).toBeOnTheScreen();
  });

  it("puts a deck core's price under its name at large text sizes, beside it otherwise", async () => {
    mockApi(
      signedInRoutes({
        'GET /api/v1/regions/{region}/binders': ok(placeBindersPage([CORE])),
      })
    );
    const window = Dimensions.get('window');
    const textSize = (fontScale: number) =>
      act(() => {
        Dimensions.set({
          window: { ...window, fontScale },
          screen: { ...window, fontScale },
        });
      });
    mockParams.current = { segment: 'binders' };
    try {
      textSize(1);
      const first = render();
      await screen.findByTestId('binder-search-price-core-1');
      expect(screen.getByTestId('binder-search-row-core-1')).toHaveStyle({ flexDirection: 'row' });
      expect(screen.getByTestId('binder-search-price-core-1')).toHaveStyle({ textAlign: 'right' });
      first.unmount();
      // The largest size: beside the price the name broke in the middle of a word.
      textSize(3.1);
      render();
      await screen.findByTestId('binder-search-price-core-1');
      expect(screen.getByTestId('binder-search-row-core-1')).toHaveStyle({
        flexDirection: 'column',
      });
      expect(screen.getByTestId('binder-search-price-core-1')).not.toHaveStyle({
        textAlign: 'right',
      });
    } finally {
      textSize(window.fontScale);
    }
  });

  it('says when a state has no binders or no deck cores, and the chip goes back to the region', async () => {
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/regions/{region}/subdivisions/{code}/binders': ok(placeBindersPage([])),
        'GET /api/v1/regions/{region}/binders': ok(placeBindersPage([])),
      })
    );
    mockParams.current = { segment: 'binders', state: 'CA-ON' };
    render();
    expect(await screen.findByTestId('binders-empty')).toHaveTextContent(
      'No public binders here yet.'
    );
    fireEvent.press(screen.getByTestId('binders-kind-cores'));
    expect(await screen.findByText('No deck cores for sale here yet.')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Showing Ontario. Show the whole region' }));
    await waitFor(() =>
      expect(api.callsTo('GET /api/v1/regions/{region}/binders')).not.toEqual([])
    );
    expect(screen.queryByTestId('binders-state-chip')).toBeNull();
  });
});
