import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { Dimensions, Pressable, StyleSheet } from 'react-native';

import { useBlockUser, useUnblockUser } from '@/src/api/hooks/blocks';
import type { FeedPost } from '@/src/api/types';
import { useBrowsingGameStore } from '@/src/features/games/browsingGame';
import { GET_STARTED_STORAGE_PREFIX } from '@/src/features/home/getStarted';
import { HomeScreen } from '@/src/features/home/HomeScreen';
import { peekPendingDraft } from '@/src/features/messages/pendingDraft';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import {
  CARD_ID,
  CONVERSATION_ID,
  FEED_CORE_ID,
  FEED_SELLER_ID,
  ONTARIO,
  conversationFixture,
  feedPageFixture,
  feedPostFixture,
  feedPreviewFixture,
  inventoryPage,
  locationFixture,
  wishFixture,
} from '../support/fixtures';
import {
  mockApi,
  noContent,
  ok,
  problem,
  type MockRequest,
  type MockRoutes,
} from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { mockRouter, mockScrollToTopRefs, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

/**
 * Home's focus: `useFocusEffect` is a no-op in the shared stand-in; here each mounted screen's
 * latest effect is kept, and `refocus()` runs them, as Home coming back into view does.
 */
const mockFocusEffects = new Set<{ current: () => unknown }>();
jest.mock('expo-router', () => ({
  ...require('../support/router').expoRouterMock(),
  useFocusEffect: (effect: () => unknown) => {
    const React = require('react');
    const latest = React.useRef(effect);
    latest.current = effect;
    React.useEffect(() => {
      mockFocusEffects.add(latest);
      return () => {
        mockFocusEffects.delete(latest);
      };
    }, []);
  },
}));

function refocus(): void {
  act(() => {
    for (const effect of mockFocusEffects) {
      effect.current();
    }
  });
}

/**
 * Home (stage R7; owner prompt of 2026-10-19, sections 1 to 4 and 7; mockup v50 screens 10, 10b
 * and 10c): the top row and the field, the posts of each kind and where they lead, the chips with
 * their empty states and the end, the quiet region with Get started, the errors.
 */

const UID = 'uid-maika';
/** The phone's clock in these tests: Wednesday 2026-10-21, 15:30 local time (only Date is fake). */
const NOW = new Date(2026, 9, 21, 15, 30);
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60_000).toISOString();

const TWELVE = feedPostFixture({ at: minutesAgo(5) });
const WISH = feedPostFixture({
  kind: 'WANTED',
  at: minutesAgo(60),
  collector: {
    id: '00000000-0000-4000-8000-0000000000d2',
    handle: 'theo.duels',
    displayName: 'Theo',
  },
  place: ONTARIO,
});
const CORE = feedPostFixture({ kind: 'DECK_CORE', at: minutesAgo(180) });
const SINGLE = feedPostFixture({
  at: minutesAgo(360),
  newCards: {
    total: 1,
    previews: [
      feedPreviewFixture(9, {
        name: 'Infinite Impermanence',
        printingCode: 'RA01-EN075',
        rarity: 'Platinum Secret Rare',
        askingPriceText: '$24.00',
      }),
    ],
  },
});
const THREE = feedPostFixture({
  at: daysAgo(3),
  newCards: { total: 3, previews: [1, 2, 3].map((n) => feedPreviewFixture(n + 20)) },
});
const OLD_CORE = feedPostFixture({
  kind: 'DECK_CORE',
  at: daysAgo(12),
  deckCore: {
    binderId: '00000000-0000-4000-8b00-0000000000f2',
    name: 'Snake-Eye core',
    askingPriceText: 'Trade only',
    photoUrl: null,
    photoCount: 0,
    previewImages: ['/api/v1/public/card-images/k1', '/api/v1/public/card-images/k2'],
    noteFirstLine: 'Looking for Fiendsmith pieces in trade. All NM.',
  },
});
const ALL_POSTS = [TWELVE, WISH, CORE, SINGLE, THREE, OLD_CORE];

/** A feed answering each chip with the posts of its kind. */
function feedOf(posts: FeedPost[], overrides: Record<string, unknown> = {}) {
  return (request: MockRequest) => {
    const kind = request.query.get('kind') ?? 'ALL';
    const keep = posts.filter(
      (post) =>
        kind === 'ALL' ||
        (kind === 'NEW_CARDS' && post.kind === 'NEW_CARDS') ||
        (kind === 'WANTED' && post.kind === 'WANTED') ||
        (kind === 'DECK_CORES' && post.kind === 'DECK_CORE')
    );
    return ok(
      feedPageFixture(keep, {
        kind: kind as never,
        gameHasPosts: posts.length > 0,
        regionHasPosts: posts.length > 0,
        ...overrides,
      })
    );
  };
}

/** A collector who finished Get started: a location on the map, a public card, a wish. */
function doneRoutes(extra: MockRoutes = {}): MockRoutes {
  return signedInRoutes({
    'GET /api/v1/me/location': ok(locationFixture({ discoverable: true })),
    'GET /api/v1/wishlist': ok([wishFixture()]),
    ...extra,
  });
}

const WINDOW = Dimensions.get('window');
beforeAll(() => {
  jest.useFakeTimers({
    now: NOW,
    doNotFake: [
      'hrtime',
      'nextTick',
      'performance',
      'queueMicrotask',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'requestIdleCallback',
      'cancelIdleCallback',
      'setImmediate',
      'clearImmediate',
      'setInterval',
      'clearInterval',
      'setTimeout',
      'clearTimeout',
    ],
  });
});

beforeEach(async () => {
  jest.setSystemTime(NOW);
  Dimensions.set({ window: { ...WINDOW, fontScale: 1 }, screen: { ...WINDOW, fontScale: 1 } });
  resetRouterMock();
  resetAppState();
  await AsyncStorage.clear();
  useBrowsingGameStore.setState({ picked: { [UID]: 'yugioh' }, stored: { [UID]: 'yugioh' } });
});

afterAll(() => {
  jest.useRealTimers();
  Dimensions.set({ window: WINDOW, screen: WINDOW });
});

function render() {
  return renderWithProviders(<HomeScreen />, { port: new FakeAuthPort(testUser()) });
}

/** Blocks or unblocks a collector as a profile, a chat or the community does (`useBlockUser`). */
function BlockProbe({ id }: { id: string }) {
  const block = useBlockUser();
  const unblock = useUnblockUser();
  return (
    <>
      <Pressable testID="probe-block" onPress={() => void block.mutateAsync({ id })} />
      <Pressable testID="probe-unblock" onPress={() => void unblock.mutateAsync({ id })} />
    </>
  );
}

describe('Home: the top of the page (screen 10)', () => {
  it('shows the region and game pills with the bell, and the field opens Search typing', async () => {
    mockApi(doneRoutes({ 'GET /api/v1/feed': feedOf(ALL_POSTS) }));
    render();
    expect(await screen.findByTestId('home-region')).toHaveProp(
      'accessibilityLabel',
      expect.stringMatching(/Americas \(North\)/)
    );
    expect(await screen.findByLabelText('Game: Yu-Gi-Oh!. Change game')).toBeOnTheScreen();
    expect(await screen.findByTestId('notification-bell-home')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('home-search-field'));
    expect(mockRouter.navigate).toHaveBeenCalledWith({
      pathname: '/search',
      params: { typing: '1' },
    });
    // Tapping the Home tab on Home scrolls the list back to the top.
    expect(mockScrollToTopRefs).toHaveLength(1);
  });

  it('asks the feed for the browsed region and game', async () => {
    const api = mockApi(doneRoutes({ 'GET /api/v1/feed': feedOf(ALL_POSTS) }));
    render();
    await screen.findByTestId(`home-post-${TWELVE.id}`);
    const request = api.callsTo('GET /api/v1/feed')[0]!;
    expect(request.query.get('region')).toBe('americas-north');
    expect(request.query.get('game')).toBe('yugioh');
    expect(request.query.get('kind')).toBe('ALL');
    expect(request.query.get('cursor')).toBeNull();
  });
});

describe('Home: the posts (screen 10b)', () => {
  it('groups the posts by time and says each header as one line', async () => {
    mockApi(doneRoutes({ 'GET /api/v1/feed': feedOf(ALL_POSTS) }));
    render();
    expect(await screen.findByTestId('home-section-today')).toHaveTextContent('TODAY');
    expect(screen.getByTestId('home-section-week')).toHaveTextContent('EARLIER THIS WEEK');
    expect(screen.getByTestId('home-section-month')).toHaveTextContent('EARLIER THIS MONTH');
    expect(screen.getByTestId(`home-post-${TWELVE.id}-header`)).toHaveProp(
      'accessibilityLabel',
      'maya_k listed 12 cards, 5 min, Quebec'
    );
    expect(screen.getByTestId(`home-post-${WISH.id}-header`)).toHaveProp(
      'accessibilityLabel',
      'theo.duels wants a card, 1 h, Ontario'
    );
    expect(screen.getByTestId(`home-post-${CORE.id}-header`)).toHaveProp(
      'accessibilityLabel',
      'maya_k is selling a deck core, 3 h, Quebec'
    );
    fireEvent.press(screen.getByTestId(`home-post-${WISH.id}-header`));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/collectors/[id]',
      params: { id: 'theo.duels' },
    });
    // Nothing sponsored, nothing to buy (ADR 0019).
    expect(screen.queryByText(/Sponsored|Premium|Upgrade/)).toBeNull();
  });

  it('shows 12 cards as a grid with "+9" that opens the collector’s cards', async () => {
    mockApi(doneRoutes({ 'GET /api/v1/feed': feedOf(ALL_POSTS) }));
    render();
    const grid = await screen.findByTestId(`home-post-${TWELVE.id}-grid`);
    const first = TWELVE.newCards!.previews[0]!;
    expect(within(grid).getByTestId(`home-tile-${first.itemId}`)).toHaveProp(
      'accessibilityLabel',
      'Feed Card 1, $1.50'
    );
    expect(within(grid).getByTestId(`home-tile-${first.itemId}-price`)).toHaveTextContent('$1.50');
    const more = within(grid).getByTestId(`home-post-${TWELVE.id}-more`);
    expect(more).toHaveTextContent('+9more');
    expect(more).toHaveProp('accessibilityLabel', '9 more cards from this collector');
    fireEvent.press(more);
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/collectors/[id]/cards',
      params: { id: 'maya_k' },
    });
    fireEvent.press(within(grid).getByTestId(`home-tile-${first.itemId}`));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/cards/[id]',
      params: { id: first.cardId, printing: first.printingId },
    });
    // A group of 3 leaves the fourth column empty, without "+n".
    const three = screen.getByTestId(`home-post-${THREE.id}-grid`);
    expect(within(three).queryByTestId(`home-post-${THREE.id}-more`)).toBeNull();
  });

  it('shows one card as a row whose Message pins that card in the chat', async () => {
    const api = mockApi(
      doneRoutes({
        'GET /api/v1/feed': feedOf(ALL_POSTS),
        'POST /api/v1/conversations': ok(conversationFixture()),
      })
    );
    render();
    const row = await screen.findByTestId(`home-post-${SINGLE.id}-single`);
    expect(row).toHaveTextContent(/Infinite Impermanence/);
    expect(row).toHaveTextContent(/RA01-EN075 · Platinum Secret Rare/);
    expect(row).toHaveTextContent(/\$24\.00/);
    const message = screen.getByTestId(`home-post-${SINGLE.id}-message`);
    expect(message).toHaveProp('accessibilityLabel', 'Message maya_k about Infinite Impermanence');
    fireEvent.press(message);
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/messages/[id]',
        params: { id: CONVERSATION_ID },
      })
    );
    expect(api.callsTo('POST /api/v1/conversations')[0]?.body).toEqual({
      recipientId: FEED_SELLER_ID,
      subjectItemId: SINGLE.newCards!.previews[0]!.itemId,
    });
  });

  it('shows a wish with its terms and "I have it", which opens the chat with the text', async () => {
    const api = mockApi(
      doneRoutes({
        'GET /api/v1/feed': feedOf(ALL_POSTS),
        'GET /api/v1/inventory/items': ok(inventoryPage([])),
        'POST /api/v1/conversations': ok(conversationFixture()),
      })
    );
    render();
    const wish = await screen.findByTestId(`home-post-${WISH.id}-wish`);
    expect(wish).toHaveTextContent(/Ash Blossom & Joyous Spring/);
    expect(wish).toHaveTextContent(/Any printing · NM only · 85% TCG/);
    const have = screen.getByTestId(`home-post-${WISH.id}-have`);
    expect(have).toHaveTextContent('I have it');
    expect(have).toHaveProp(
      'accessibilityLabel',
      'I have Ash Blossom & Joyous Spring. Message theo.duels'
    );
    fireEvent.press(have);
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/messages/[id]',
        params: { id: CONVERSATION_ID },
      })
    );
    // R6's flow: the chat is opened as "Message" opens it, nothing sent before tap.
    expect(api.callsTo('POST /api/v1/conversations')[0]?.body).toEqual({
      recipientId: WISH.collector.id,
    });
    expect(api.callsTo('GET /api/v1/inventory/items').at(-1)?.query.get('cardId')).toBe(CARD_ID);
    expect(peekPendingDraft(CONVERSATION_ID)?.text).toBe(
      'I have Ash Blossom & Joyous Spring for your wishlist. Interested?'
    );
  });

  it('shows a deck core with its photo, tag, photos, price and note, and opens it', async () => {
    mockApi(doneRoutes({ 'GET /api/v1/feed': feedOf(ALL_POSTS) }));
    render();
    const core = await screen.findByTestId(`home-post-${CORE.id}-core`);
    expect(core).toHaveTextContent(/Deck core/);
    expect(screen.getByTestId(`home-post-${CORE.id}-photos`)).toHaveTextContent(/4 photos$/);
    expect(core).toHaveTextContent(/Yubel core/);
    expect(core).toHaveTextContent(/\$95/);
    expect(core).toHaveTextContent(/14 cards, NM, in sleeves\. Ships tracked\./);
    fireEvent.press(core);
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/binders/[id]',
      params: { id: FEED_CORE_ID },
    });
    // Without photos: no photo count, the key cards in the band, "Trade only".
    const old = screen.getByTestId(`home-post-${OLD_CORE.id}-core`);
    expect(old).toHaveTextContent(/Trade only/);
    expect(screen.queryByTestId(`home-post-${OLD_CORE.id}-photos`)).toBeNull();
  });
});

describe('Home: the chips and the end', () => {
  it('reloads with kind= and ends with the text of the chip', async () => {
    const api = mockApi(doneRoutes({ 'GET /api/v1/feed': feedOf(ALL_POSTS) }));
    render();
    expect(await screen.findByTestId('home-end-text')).toHaveTextContent(
      'That’s everything new for Yu-Gi-Oh! in Americas (North) from the last 30 days.'
    );
    expect(screen.getByTestId('home-chip-ALL')).toBeSelected();
    expect(screen.getByTestId('home-chip-WANTED')).not.toBeSelected();
    // The chips pin under the status bar once scrolled past (the list's second row).
    expect(screen.getByTestId('home-list')).toHaveProp('stickyHeaderIndices', [1]);

    fireEvent.press(screen.getByTestId('home-chip-WANTED'));
    expect(await screen.findByTestId(`home-post-${WISH.id}`)).toBeOnTheScreen();
    await waitFor(() => expect(screen.queryByTestId(`home-post-${TWELVE.id}`)).toBeNull());
    expect(api.callsTo('GET /api/v1/feed').at(-1)?.query.get('kind')).toBe('WANTED');
    expect(screen.getByTestId('home-chip-WANTED')).toBeSelected();
    expect(screen.getByTestId('home-end-text')).toHaveTextContent(
      'That’s every wish for Yu-Gi-Oh! in Americas (North) from the last 30 days.'
    );
    fireEvent.press(screen.getByTestId('home-chip-NEW_CARDS'));
    expect(await screen.findByTestId('home-end-text')).toHaveTextContent(/every new card/);
    fireEvent.press(screen.getByTestId('home-chip-DECK_CORES'));
    await waitFor(() =>
      expect(screen.getByTestId('home-end-text')).toHaveTextContent(/every deck core/)
    );
    // The end opens Search on its map.
    fireEvent.press(screen.getByTestId('home-end-map'));
    expect(mockRouter.navigate).toHaveBeenCalledWith({
      pathname: '/search',
      params: { segment: 'cards' },
    });
  });

  it('says when a chip has nothing, with "Show all" back to All', async () => {
    mockApi(doneRoutes({ 'GET /api/v1/feed': feedOf([TWELVE, SINGLE]) }));
    render();
    await screen.findByTestId(`home-post-${TWELVE.id}`);
    fireEvent.press(screen.getByTestId('home-chip-WANTED'));
    expect(await screen.findByTestId('home-chip-empty')).toHaveTextContent(
      /No wishes in Americas \(North\) in the last 30 days\./
    );
    expect(screen.queryByTestId('home-end')).toBeNull();
    fireEvent.press(screen.getByTestId('home-chip-DECK_CORES'));
    expect(
      await screen.findByText('No deck cores in Americas (North) in the last 30 days.')
    ).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('home-chip-empty-all'));
    expect(await screen.findByTestId(`home-post-${TWELVE.id}`)).toBeOnTheScreen();
    expect(screen.getByTestId('home-chip-ALL')).toBeSelected();
  });

  it('loads the next page at the end, and offers "Try again" when it fails', async () => {
    const api = mockApi(
      doneRoutes({
        'GET /api/v1/feed': (request: MockRequest) =>
          request.query.get('cursor')
            ? problem(500, 'INTERNAL_ERROR', 'Something went wrong')
            : ok(feedPageFixture([TWELVE, WISH], { nextCursor: 'page-2' })),
      })
    );
    render();
    await screen.findByTestId(`home-post-${TWELVE.id}`);
    // Not the end yet: more pages exist.
    expect(screen.queryByTestId('home-end')).toBeNull();
    fireEvent(screen.getByTestId('home-list'), 'onEndReached');
    expect(await screen.findByTestId('home-more-error')).toHaveTextContent(/Couldn't load more/);
    expect(api.callsTo('GET /api/v1/feed').at(-1)?.query.get('cursor')).toBe('page-2');
    api.use({
      'GET /api/v1/feed': ok(feedPageFixture([CORE])),
    });
    fireEvent.press(screen.getByTestId('home-more-retry'));
    expect(await screen.findByTestId(`home-post-${CORE.id}`)).toBeOnTheScreen();
    expect(await screen.findByTestId('home-end')).toBeOnTheScreen();
  });
});

describe('Home: day one in a quiet region (screen 10c)', () => {
  it('shows Get started and the quiet box, without chips or section titles', async () => {
    mockApi(
      signedInRoutes({
        'GET /api/v1/feed': ok(feedPageFixture([])),
        'GET /api/v1/me/location': ok(locationFixture({ discoverable: true })),
        'GET /api/v1/inventory/items': ok(inventoryPage([])),
        'GET /api/v1/wishlist': ok([]),
      })
    );
    render();
    expect(await screen.findByTestId('home-quiet')).toHaveTextContent(
      /Nothing new in Americas \(North\) yet/
    );
    expect(screen.getByTestId('home-quiet')).toHaveTextContent(
      /Be the first: the cards you make public show up here for collectors in your region\./
    );
    expect(screen.queryByTestId('home-chips')).toBeNull();
    expect(screen.queryByTestId('home-section-today')).toBeNull();
    const card = await screen.findByTestId('home-get-started');
    expect(card).toHaveTextContent(/Get started/);
    expect(card).toHaveTextContent(/Do these once to sell and find cards in your region\./);
    expect(screen.getByTestId('home-get-started-progress')).toHaveProp('accessibilityValue', {
      min: 0,
      max: 3,
      now: 1,
      text: '1 of 3 done',
    });
    expect(screen.getByTestId('home-step-province-done')).toHaveTextContent(/Quebec, Canada/);
    expect(screen.getByTestId('home-step-card-todo')).toHaveTextContent(
      /Add a card and set it to Public/
    );
    expect(screen.getByTestId('home-step-wish-todo')).toHaveTextContent(
      /We'll tell you when someone lists it/
    );
    // While Get started shows, the box has no button of its own.
    expect(screen.queryByTestId('home-quiet-add')).toBeNull();
    fireEvent.press(screen.getByTestId('home-step-card-action'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/items/new',
      params: { from: 'home' },
    });
    fireEvent.press(screen.getByTestId('home-step-wish-action'));
    expect(mockRouter.navigate).toHaveBeenCalledWith({
      pathname: '/search',
      params: { typing: '1' },
    });

    // "Hide these steps": gone for good on this phone, and the box offers "Add cards".
    fireEvent.press(screen.getByLabelText('Hide these steps'));
    await waitFor(() => expect(screen.queryByTestId('home-get-started')).toBeNull());
    expect(screen.getByTestId('home-quiet-add')).toHaveTextContent('Add cards');
    expect(await AsyncStorage.getItem(`${GET_STARTED_STORAGE_PREFIX}${UID}`)).toBe('hidden');
  });

  it('asks to turn on the map for a location hidden from it, and to choose one without', async () => {
    mockApi(
      signedInRoutes({
        'GET /api/v1/feed': ok(feedPageFixture([])),
        'GET /api/v1/me/location': ok(locationFixture({ discoverable: false })),
        'GET /api/v1/inventory/items': ok(inventoryPage([])),
        'GET /api/v1/wishlist': ok([]),
      })
    );
    render();
    const step = await screen.findByTestId('home-step-province-todo');
    expect(step).toHaveTextContent(/Turn on Show me on the map/);
    expect(screen.getByTestId('home-step-province-action')).toHaveTextContent('Turn on');
    fireEvent.press(screen.getByTestId('home-step-province-action'));
    expect(mockRouter.push).toHaveBeenCalledWith('/settings/location');
  });

  it('says the game is quiet when only the game is, and never shows Get started once done', async () => {
    mockApi(
      doneRoutes({
        'GET /api/v1/feed': ok(feedPageFixture([], { regionHasPosts: true })),
      })
    );
    render();
    expect(await screen.findByTestId('home-quiet')).toHaveTextContent(
      /Nothing new in Yu-Gi-Oh! yet/
    );
    // All three steps done: hidden for good, and the box offers "Add cards".
    await waitFor(async () =>
      expect(await AsyncStorage.getItem(`${GET_STARTED_STORAGE_PREFIX}${UID}`)).toBe('hidden')
    );
    expect(screen.queryByTestId('home-get-started')).toBeNull();
    fireEvent.press(await screen.findByTestId('home-quiet-add'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/items/new',
      params: { from: 'home' },
    });
  });
});

describe('Home at the largest text size', () => {
  it('keeps prices on one line in the grid, stacks the rows and ends long names with "…"', async () => {
    Dimensions.set({
      window: { ...WINDOW, fontScale: 3.1 },
      screen: { ...WINDOW, fontScale: 3.1 },
    });
    mockApi(doneRoutes({ 'GET /api/v1/feed': feedOf(ALL_POSTS) }));
    render();
    const first = TWELVE.newCards!.previews[0]!;
    const price = await screen.findByTestId(`home-tile-${first.itemId}-price`);
    expect(price).toHaveProp('numberOfLines', 1);
    // Four prices side by side follow the text size only a little, so they can still be read.
    expect(price).toHaveProp('maxFontSizeMultiplier', 1.35);
    const row = screen.getByTestId(`home-post-${SINGLE.id}-single`);
    // The row stacks (its button under the words), and its name takes two lines at most.
    expect(StyleSheet.flatten(row.props.style)).toMatchObject({ flexDirection: 'column' });
    expect(within(row).getByText('Infinite Impermanence')).toHaveProp('numberOfLines', 2);
    expect(within(row).getByText('$24.00')).toHaveProp('numberOfLines', 1);
    expect(screen.getByText('Yubel core')).toHaveProp('numberOfLines', 2);
    expect(screen.getByText('14 cards, NM, in sleeves. Ships tracked.')).toHaveProp(
      'numberOfLines',
      1
    );
  });
});

describe('Home: loading and errors', () => {
  it('shows the skeleton first, and "Couldn\'t load what\'s new." with "Try again"', async () => {
    const api = mockApi(
      doneRoutes({ 'GET /api/v1/feed': problem(500, 'INTERNAL_ERROR', 'Something went wrong') })
    );
    render();
    expect(screen.getByTestId('home-loading')).toBeOnTheScreen();
    expect(await screen.findByTestId('home-error', {}, { timeout: 15_000 })).toHaveTextContent(
      /Couldn't load what's new\./
    );
    // The chips stay (only a quiet region has none).
    expect(screen.getByTestId('home-chips')).toBeOnTheScreen();
    api.use({ 'GET /api/v1/feed': feedOf(ALL_POSTS) });
    fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByTestId(`home-post-${TWELVE.id}`)).toBeOnTheScreen();
  });

  it('keeps its own title when the connection is lost, with the reason under it', async () => {
    // R7 review U4: the shared "You appear to be offline" replaced Home's words.
    mockApi(
      doneRoutes({
        'GET /api/v1/feed': () => {
          throw new TypeError('Network request failed');
        },
      })
    );
    render();
    const error = await screen.findByTestId('home-error', {}, { timeout: 15_000 });
    expect(within(error).getByText("Couldn't load what's new.")).toBeOnTheScreen();
    expect(error).toHaveTextContent(/Check your connection and try again\./);
    expect(screen.queryByText(/appear to be offline|No answer from OrenjiTrade/)).toBeNull();
  });

  it('keeps the chips above a chip that failed, so All, already read, can be shown again', async () => {
    // R7 review U3: the error hid the chips and the collector was stuck on it.
    const api = mockApi(
      doneRoutes({
        'GET /api/v1/feed': (request: MockRequest) => {
          if (request.query.get('kind') === 'WANTED') {
            throw new TypeError('Network request failed');
          }
          return feedOf(ALL_POSTS)(request);
        },
      })
    );
    render();
    await screen.findByTestId(`home-post-${TWELVE.id}`);
    fireEvent.press(screen.getByTestId('home-chip-WANTED'));
    expect(await screen.findByTestId('home-error', {}, { timeout: 15_000 })).toBeOnTheScreen();
    expect(screen.getByTestId('home-chips')).toBeOnTheScreen();
    const reads = api.callsTo('GET /api/v1/feed').length;

    fireEvent.press(screen.getByTestId('home-chip-ALL'));
    expect(await screen.findByTestId(`home-post-${TWELVE.id}`)).toBeOnTheScreen();
    expect(screen.queryByTestId('home-error')).toBeNull();
    // The page already read, not a new request.
    expect(api.callsTo('GET /api/v1/feed')).toHaveLength(reads);
  });
});

describe('Home: coming back into view', () => {
  it('re-reads Get started every time, and the feed only when older than 5 minutes', async () => {
    const api = mockApi(
      doneRoutes({
        'GET /api/v1/feed': feedOf(ALL_POSTS),
        'GET /api/v1/inventory/items': ok(inventoryPage([])),
      })
    );
    render();
    await screen.findByTestId(`home-post-${TWELVE.id}`);
    await waitFor(() => expect(api.callsTo('GET /api/v1/me/location').length).toBeGreaterThan(0));
    const reads = (route: string) => api.callsTo(route).length;
    const feed = reads('GET /api/v1/feed');
    const location = reads('GET /api/v1/me/location');
    const publicCards = reads('GET /api/v1/inventory/items');
    const wishes = reads('GET /api/v1/wishlist');

    // Back after 4 minutes: the three steps of Get started are read again, the feed is kept, so
    // no post slides in.
    jest.setSystemTime(NOW.getTime() + 4 * 60_000);
    refocus();
    await waitFor(() => expect(reads('GET /api/v1/me/location')).toBe(location + 1));
    await waitFor(() => expect(reads('GET /api/v1/inventory/items')).toBe(publicCards + 1));
    await waitFor(() => expect(reads('GET /api/v1/wishlist')).toBe(wishes + 1));
    expect(reads('GET /api/v1/feed')).toBe(feed);

    // Back after more than 5 minutes: the feed is read again.
    jest.setSystemTime(NOW.getTime() + 6 * 60_000);
    refocus();
    await waitFor(() => expect(reads('GET /api/v1/feed')).toBe(feed + 1));
    expect(api.callsTo('GET /api/v1/feed').at(-1)?.query.get('cursor')).toBeNull();
  });

  it('keeps the post being read in place when posts are added above it', async () => {
    // R7 review U6: a refresh on coming back put new posts above and the list jumped.
    mockApi(doneRoutes({ 'GET /api/v1/feed': feedOf(ALL_POSTS) }));
    render();
    await screen.findByTestId(`home-post-${TWELVE.id}`);
    expect(screen.getByTestId('home-list')).toHaveProp('maintainVisibleContentPosition', {
      minIndexForVisible: 0,
    });
  });
});

describe('Home and blocks', () => {
  it('drops a collector the caller blocks from Home at once and reads the feed again', async () => {
    // R7 review P1/F3: after a block from a profile, the collector's posts stayed on Home until a
    // pull or the 5-minute refresh.
    const api = mockApi(
      doneRoutes({
        'GET /api/v1/feed': feedOf(ALL_POSTS),
        'POST /api/v1/users/{id}/block': noContent,
        'DELETE /api/v1/users/{id}/block': noContent,
      })
    );
    renderWithProviders(
      <>
        <HomeScreen />
        <BlockProbe id={WISH.collector.id} />
      </>,
      { port: new FakeAuthPort(testUser()) }
    );
    await screen.findByTestId(`home-post-${WISH.id}`);
    const reads = api.callsTo('GET /api/v1/feed').length;
    // From now on the server leaves the blocked collector out.
    api.use({
      'GET /api/v1/feed': feedOf(ALL_POSTS.filter((post) => post.id !== WISH.id)),
    });

    fireEvent.press(screen.getByTestId('probe-block'));
    await waitFor(() => expect(screen.queryByTestId(`home-post-${WISH.id}`)).toBeNull());
    await waitFor(() => expect(api.callsTo('GET /api/v1/feed').length).toBeGreaterThan(reads));
    expect(screen.getByTestId(`home-post-${TWELVE.id}`)).toBeOnTheScreen();

    // Unblocking reads the feed again too: their posts come back.
    api.use({ 'GET /api/v1/feed': feedOf(ALL_POSTS) });
    const before = api.callsTo('GET /api/v1/feed').length;
    fireEvent.press(screen.getByTestId('probe-unblock'));
    expect(await screen.findByTestId(`home-post-${WISH.id}`)).toBeOnTheScreen();
    expect(api.callsTo('GET /api/v1/feed').length).toBeGreaterThan(before);
  });
});
