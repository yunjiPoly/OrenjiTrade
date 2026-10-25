import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { Text } from 'react-native';

import BinderScreen from '@/app/binders/[id]';
import CardScreen from '@/app/cards/[id]';
import InventoryTab from '@/app/(tabs)/inventory';
import MessagesTab from '@/app/(tabs)/messages';
import ProfileTab from '@/app/(tabs)/profile';
import SearchScreen from '@/app/(tabs)/search';
import SignInScreen from '@/app/(auth)/sign-in';
import { useGuestAction } from '@/src/account/guestAction';
import { usePendingLink } from '@/src/account/pendingLink';
import type { CardHolderResult, FeedPost } from '@/src/api/types';
import { useBrowsingGame } from '@/src/features/games/browsingGame';
import { GuestTab } from '@/src/features/guest/GuestTab';
import { SignInSheet } from '@/src/features/guest/SignInSheet';
import { HomeScreen } from '@/src/features/home/HomeScreen';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import {
  CARD_ID,
  GAMES,
  LEGAL_DOCUMENTS,
  ONTARIO,
  QUEBEC,
  cardDetailFixture,
  cardHolderFixture,
  cardHoldersPage,
  feedPageFixture,
  feedPostFixture,
  markerFixture,
  printingFixture,
  publicBinderFixture,
  publicDeckCoreFixture,
  publicItemFixture,
  regionsFixture,
} from '../support/fixtures';
import { mockApi, ok, type MockRoutes } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import {
  mockParams,
  mockPathname,
  mockRouter,
  mockSegments,
  resetRouterMock,
} from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());

/**
 * Browsing without an account (stage R15; owner prompt of 2026-10-20, section R15; mockup v50
 * screens 70 to 75): Home and Search as a guest (the person button, the guest's card, "A collector"
 * posts and rows with their places), the member-only tabs in place, the sheet of 71 with its title
 * per action, and the action kept by its listing for after the sign-in.
 */

const NOBODY = { id: null, handle: null, displayName: null, avatarUrl: null };

/** A post as a signed-out caller reads it: who posted is left out, the place stays. */
function guestPost(overrides: Partial<FeedPost> = {}): FeedPost {
  return feedPostFixture({ ...overrides, collector: NOBODY });
}

const CARDS = guestPost();
const WISH = guestPost({ kind: 'WANTED', place: ONTARIO });
const CORE = guestPost({ kind: 'DECK_CORE' });
const SINGLE = guestPost({
  newCards: {
    total: 1,
    previews: [
      {
        ...CARDS.newCards!.previews![0]!,
        itemId: '00000000-0000-4000-8c00-000000000909',
        name: 'Infinite Impermanence',
      },
    ],
  },
});

/** A holder as a signed-out caller reads it (stage R15). */
function guestHolder(id: string, place = QUEBEC): CardHolderResult {
  return cardHolderFixture({
    collector: markerFixture({
      ...NOBODY,
      rating: null as never,
      lastActiveBucket: 'HIDDEN',
      onlineStatus: 'HIDDEN',
      place,
    }),
    item: publicItemFixture({
      id,
      askingPriceText: '$18',
      printing: printingFixture({ printingCode: 'LAVD-EN008', rarity: 'Ultra Rare' }),
    }),
  });
}

/** What a guest's phone asks: public reads only (no `/me`, no inventory, no wishlist). */
function guestRoutes(extra: MockRoutes = {}): MockRoutes {
  return {
    'GET /api/v1/games': ok(GAMES),
    'GET /api/v1/regions': ok(regionsFixture()),
    'GET /api/v1/public/legal/documents': ok(LEGAL_DOCUMENTS),
    'GET /api/v1/feed': ok(feedPageFixture([CARDS, WISH, CORE, SINGLE])),
    ...extra,
  };
}

function renderAsGuest(ui: React.ReactElement) {
  return renderWithProviders(
    <>
      {ui}
      <SignInSheet />
    </>,
    { port: new FakeAuthPort(null) }
  );
}

/** The sheet of 71 on screen, with `title`. */
async function expectSheet(title: string) {
  expect(await screen.findByTestId('sign-in-sheet-title')).toHaveTextContent(title);
  expect(
    screen.getByText('It’s free. When you’re done, you come right back here.')
  ).toBeOnTheScreen();
  expect(screen.getByTestId('sign-in-sheet-create')).toBeOnTheScreen();
  expect(screen.getByTestId('sign-in-sheet-sign-in')).toBeOnTheScreen();
  expect(screen.getByTestId('sign-in-sheet-not-now')).toBeOnTheScreen();
}

beforeEach(async () => {
  resetRouterMock();
  resetAppState();
  await AsyncStorage.clear();
});

describe('Home as a guest (screen 70)', () => {
  it('has the person button for the bell, the guest card for Get started, and no badge to read', async () => {
    const api = mockApi(guestRoutes());
    renderAsGuest(<HomeScreen />);
    expect(await screen.findByTestId('person-button-home')).toHaveProp(
      'accessibilityLabel',
      'Sign in'
    );
    expect(screen.queryByTestId('notification-bell-home')).toBeNull();
    const card = screen.getByTestId('home-guest-card');
    expect(within(card).getByText('You’re browsing as a guest')).toBeOnTheScreen();
    expect(
      within(card).getByText(
        'Create a free account to message collectors, save wishes and list your own cards.'
      )
    ).toBeOnTheScreen();
    expect(within(card).getByText('Create account')).toBeOnTheScreen();
    expect(within(card).getByText('Sign in')).toBeOnTheScreen();
    expect(screen.queryByText('Get started')).toBeNull();
    await screen.findByTestId(`home-post-${CARDS.id}`);
    // A guest asks nothing of an account: the feed, the games and the regions only.
    for (const call of ['GET /api/v1/me', 'GET /api/v1/wishlist', 'GET /api/v1/inventory/items']) {
      expect(api.callsTo(call)).toHaveLength(0);
    }
    const request = api.callsTo('GET /api/v1/feed')[0]!;
    expect(request.query.get('region')).toBe('americas-north');
    expect(request.query.get('game')).toBe('yugioh');
  });

  it('shows each post as "A collector" with a plain avatar and the place', async () => {
    mockApi(guestRoutes());
    renderAsGuest(<HomeScreen />);
    const header = await screen.findByTestId(`home-post-${CARDS.id}-header`);
    expect(within(header).getByText(/A collector/)).toBeOnTheScreen();
    expect(within(header).getByText('5 min · Quebec')).toBeOnTheScreen();
    expect(screen.getByTestId(`home-post-${CARDS.id}-guest-avatar`)).toBeOnTheScreen();
    expect(header).toHaveProp(
      'accessibilityLabel',
      'A collector listed 12 cards, 5 min, Quebec. Sign in to see who'
    );
    expect(screen.queryByText('maya_k')).toBeNull();
    expect(screen.getByTestId(`home-post-${WISH.id}-have`).props.accessibilityLabel).toBe(
      'I have Ash Blossom & Joyous Spring. Needs an account'
    );
    expect(screen.getByTestId(`home-post-${SINGLE.id}-message`).props.accessibilityLabel).toBe(
      'Message this collector about Infinite Impermanence. Needs an account'
    );
  });

  it('asks to sign in for a post header, Message and I have it, keeping the listing only', async () => {
    mockApi(guestRoutes());
    renderAsGuest(<HomeScreen />);
    fireEvent.press(await screen.findByTestId(`home-post-${CARDS.id}-header`));
    await expectSheet('Sign in to see collector profiles');
    expect(useGuestAction.getState().pending).toEqual({
      kind: 'profile',
      listing: { itemId: CARDS.newCards!.previews![0]!.itemId },
      page: 'profile',
    });
    expect(mockRouter.push).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('sign-in-sheet-not-now'));
    await waitFor(() => expect(useGuestAction.getState().pending).toBeNull());

    fireEvent.press(screen.getByTestId(`home-post-${SINGLE.id}-message`));
    await expectSheet('Sign in to message this collector');
    expect(useGuestAction.getState().pending).toEqual({
      kind: 'message',
      listing: { itemId: '00000000-0000-4000-8c00-000000000909' },
    });
    fireEvent.press(screen.getByTestId('sign-in-sheet-not-now'));

    fireEvent.press(screen.getByTestId(`home-post-${WISH.id}-have`));
    await expectSheet('Sign in to tell them you have it');
    expect(useGuestAction.getState().pending).toMatchObject({
      kind: 'have',
      wishId: WISH.wanted!.wishId,
      card: { cardId: WISH.wanted!.cardId, cardName: 'Ash Blossom & Joyous Spring' },
    });
    // Never a collector id: a guest has none.
    expect(JSON.stringify(useGuestAction.getState().pending)).not.toContain('collector');

    // "+n" opens the collector's cards once signed in.
    fireEvent.press(screen.getByTestId('sign-in-sheet-not-now'));
    fireEvent.press(screen.getByTestId(`home-post-${CARDS.id}-more`));
    await expectSheet('Sign in to see collector profiles');
    expect(useGuestAction.getState().pending).toMatchObject({ kind: 'profile', page: 'cards' });

    // A card or a deck core opens as for anyone.
    fireEvent.press(screen.getByTestId('sign-in-sheet-not-now'));
    fireEvent.press(screen.getByTestId(`home-post-${CORE.id}-core`));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/binders/[id]',
      params: { id: CORE.deckCore!.binderId },
    });
  });

  it('Sign in keeps the action and the screen; Create account opens over Sign in', async () => {
    mockSegments.current = ['(tabs)'];
    mockPathname.current = '/';
    mockApi(guestRoutes());
    renderAsGuest(<HomeScreen />);
    fireEvent.press(await screen.findByTestId(`home-post-${SINGLE.id}-message`));
    await expectSheet('Sign in to message this collector');
    fireEvent.press(screen.getByTestId('sign-in-sheet-sign-in'));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/sign-in'));
    expect(useGuestAction.getState().ask).toBeNull();
    expect(useGuestAction.getState().pending).toMatchObject({ kind: 'message' });
    expect(usePendingLink.getState()).toMatchObject({ href: '/', owner: null });

    mockRouter.push.mockClear();
    fireEvent.press(screen.getByTestId('home-guest-card-create'));
    await waitFor(() => expect(mockRouter.push).toHaveBeenNthCalledWith(2, '/sign-up'));
    expect(mockRouter.push).toHaveBeenNthCalledWith(1, '/sign-in');
    // Home's card signs in for nothing in particular: an action left (Sign in closed with a
    // swipe) is forgotten, never finished later by surprise.
    expect(useGuestAction.getState().pending).toBeNull();
  });

  it('the person button opens Sign in and comes back to Search after', async () => {
    mockSegments.current = ['(tabs)', 'search'];
    mockPathname.current = '/search';
    mockApi(guestRoutes());
    renderAsGuest(<SearchScreen />);
    fireEvent.press(await screen.findByTestId('person-button-search'));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/sign-in'));
    expect(usePendingLink.getState().href).toBe('/search');
    expect(screen.queryByTestId('notification-bell-search')).toBeNull();
  });
});

describe('Search › Wishlist, Inventory, Messages and Profile as a guest (72 to 75)', () => {
  it('Search › Wishlist asks to sign in in place', async () => {
    mockParams.current = { segment: 'wishlist' };
    const api = mockApi(guestRoutes());
    renderAsGuest(<SearchScreen />);
    expect(await screen.findByTestId('guest-wishlist-title')).toHaveTextContent(
      'Get told when it’s listed'
    );
    expect(
      screen.getByText(
        'Save the cards you’re looking for. We let you know the moment a collector in your region lists one.'
      )
    ).toBeOnTheScreen();
    expect(screen.getByTestId('guest-wishlist-create')).toBeOnTheScreen();
    expect(screen.getByTestId('guest-wishlist-sign-in')).toBeOnTheScreen();
    expect(api.callsTo('GET /api/v1/wishlist')).toHaveLength(0);
  });

  it('Sign in from the Wishlist page comes back to Wishlist, not Cards, after a remount (review fix 1)', async () => {
    // The segment lives in Search's state: the link remembered says it, so Review our terms or
    // the welcome replacing the tabs in between does not land the guest on Cards.
    mockSegments.current = ['(tabs)', 'search'];
    mockPathname.current = '/search';
    mockApi(guestRoutes());
    renderAsGuest(<SearchScreen />);
    fireEvent.press(await screen.findByTestId('search-segment-wishlist'));
    fireEvent.press(await screen.findByTestId('guest-wishlist-sign-in'));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/sign-in'));
    expect(usePendingLink.getState().href).toBe('/search?segment=wishlist');
    expect(usePendingLink.getState().owner).toBeNull();
  });

  it('Search › Binders never invites a guest to search collectors by name (review fix 1)', async () => {
    mockParams.current = { segment: 'binders' };
    const api = mockApi(
      guestRoutes({
        'GET /api/v1/regions/{region}/binders': ok({ items: [], nextCursor: null }),
      })
    );
    renderAsGuest(<SearchScreen />);
    const input = await screen.findByTestId('binders-input');
    expect(input).toHaveProp('placeholder', 'Deck or binder, like Yubel');
    expect(await screen.findByTestId('binders-empty')).toHaveTextContent(
      'No public Yu-Gi-Oh! binders here yet.'
    );
    fireEvent.changeText(input, 'collector1');
    await waitFor(() =>
      expect(screen.getByTestId('binders-empty')).toHaveTextContent(
        'Nothing matches. Try a deck or card name. Sign in to find collectors by name.'
      )
    );
    expect(api.callsTo('GET /api/v1/regions/{region}/binders').at(-1)?.query.get('q')).toBe(
      'collector1'
    );
  });

  it.each([
    [InventoryTab, 'inventory', 'Inventory', 'Your cards, in one place', 'Add cards in seconds'],
    [MessagesTab, 'messages', 'Messages', 'Talk to collectors', 'Message a collector about a card'],
    [ProfileTab, 'profile', 'Profile', 'Your collector profile', 'Show your cards, binders'],
  ] as const)('the %s tab shows its page in place', async (Tab, kind, title, heading, line) => {
    const api = mockApi(guestRoutes());
    renderAsGuest(<Tab />);
    expect(await screen.findByTestId(`screen-${kind}-guest`)).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: title })).toBeOnTheScreen();
    expect(screen.getByTestId(`guest-${kind}-title`)).toHaveTextContent(heading);
    expect(screen.getByText(new RegExp(`^${line}`))).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId(`guest-${kind}-sign-in`));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/sign-in'));
    expect(api.callsTo('GET /api/v1/me')).toHaveLength(0);
    expect(api.callsTo('GET /api/v1/conversations')).toHaveLength(0);
  });

  it('Profile also lists Appearance, Trading safely and Legal', async () => {
    mockApi(guestRoutes());
    renderAsGuest(<GuestTab kind="profile" title="Profile" />);
    expect(await screen.findByTestId('guest-profile-appearance')).toHaveTextContent(/Appearance/);
    expect(screen.getByTestId('guest-profile-appearance')).toHaveTextContent(/Dark/);
    fireEvent.press(screen.getByTestId('guest-profile-appearance'));
    expect(mockRouter.push).toHaveBeenCalledWith('/settings/appearance');
    fireEvent.press(screen.getByTestId('guest-profile-trading-safely'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/legal/[key]',
      params: { key: 'trading-safely' },
    });
    expect(screen.getByTestId('guest-profile-legal')).toHaveTextContent(
      /Legal.*Terms, privacy, guidelines/
    );
  });
});

describe('the card page and binders as a guest', () => {
  const ASH = cardDetailFixture({
    id: CARD_ID,
    game: 'yugioh',
    name: 'Ash Blossom & Joyous Spring',
  });
  const cardRoutes = () =>
    guestRoutes({
      'GET /api/v1/cards/{id}': ok(ASH),
      'GET /api/v1/search/card-holders': ok(
        cardHoldersPage([guestHolder('i1'), guestHolder('i2', ONTARIO)])
      ),
      'GET /api/v1/search/deck-cores': ok([]),
    });

  it('lists the holders as "A collector" by province, and Message asks to sign in', async () => {
    mockParams.current = { id: CARD_ID };
    const api = mockApi(cardRoutes());
    renderAsGuest(<CardScreen />);
    const row = await screen.findByTestId('holder-i1');
    expect(within(row).getByText('A collector')).toBeOnTheScreen();
    expect(screen.getByTestId('holder-i1-guest-avatar')).toBeOnTheScreen();
    expect(screen.getByTestId('holder-i1-collector').props.accessibilityLabel).toMatch(
      /^A collector\. .*Sign in to see who$/
    );
    fireEvent.press(screen.getByTestId('holder-i1-message'));
    await expectSheet('Sign in to message this collector');
    expect(useGuestAction.getState().pending).toEqual({
      kind: 'message',
      listing: { itemId: 'i1' },
    });
    fireEvent.press(screen.getByTestId('sign-in-sheet-not-now'));
    fireEvent.press(screen.getByTestId('holder-i2-collector'));
    await expectSheet('Sign in to see collector profiles');
    expect(useGuestAction.getState().pending).toEqual({
      kind: 'profile',
      listing: { itemId: 'i2' },
      page: 'profile',
    });
    expect(api.callsTo('POST /api/v1/conversations')).toHaveLength(0);
  });

  it('Add to wishlist asks to sign in to save your wishes and keeps the card', async () => {
    mockParams.current = { id: CARD_ID };
    const api = mockApi(cardRoutes());
    renderAsGuest(<CardScreen />);
    const toggle = await screen.findByTestId('card-wishlist');
    expect(toggle).not.toBeDisabled();
    fireEvent.press(toggle);
    await expectSheet('Sign in to save your wishes');
    expect(useGuestAction.getState().pending).toEqual({
      kind: 'wish',
      cardId: CARD_ID,
      printingId: null,
    });
    expect(api.callsTo('POST /api/v1/wishlist')).toHaveLength(0);
  });

  it('a public binder shows "A collector"; Message asks to sign in and keeps the binder, nothing to pin', async () => {
    const binder = publicBinderFixture({
      id: 'pub-guest',
      owner: { ...NOBODY, place: QUEBEC },
    });
    mockParams.current = { id: binder.id };
    const api = mockApi(
      guestRoutes({
        'GET /api/v1/public/binders/{id}': ok(binder),
        'GET /api/v1/public/binders/{id}/items': ok({
          items: [publicItemFixture()],
          page: 0,
          size: 24,
          totalItems: 1,
          totalPages: 1,
        }),
      })
    );
    renderAsGuest(<BinderScreen />);
    const seller = await screen.findByTestId('public-binder-owner');
    expect(within(seller).getByText('A collector')).toBeOnTheScreen();
    const message = screen.getByTestId('public-binder-message');
    expect(message).toHaveTextContent(/Message this collector/);
    fireEvent.press(message);
    await expectSheet('Sign in to message this collector');
    // Only a deck core can be a chat's subject: the binder only names its owner (review fix 1).
    expect(useGuestAction.getState().pending).toEqual({
      kind: 'message',
      listing: { binderId: binder.id },
      pin: false,
    });
    expect(api.callsTo('POST /api/v1/conversations')).toHaveLength(0);
  });

  it('a deck core shows "A collector" and its place; Message and Report ask to sign in', async () => {
    const core = publicDeckCoreFixture({
      owner: { ...NOBODY, place: QUEBEC },
    });
    mockParams.current = { id: core.id };
    mockApi(guestRoutes({ 'GET /api/v1/public/binders/{id}': ok(core) }));
    renderAsGuest(<BinderScreen />);
    const seller = await screen.findByTestId('deck-core-seller');
    expect(within(seller).getByText('A collector')).toBeOnTheScreen();
    expect(screen.getByTestId('deck-core-seller-guest-avatar')).toBeOnTheScreen();
    // Never the owner's edit button: a guest owns nothing.
    expect(screen.queryByTestId('deck-core-edit')).toBeNull();
    expect(screen.getByTestId('deck-core-message')).toHaveTextContent(/Message this collector/);
    fireEvent.press(screen.getByTestId('deck-core-message'));
    await expectSheet('Sign in to message this collector');
    expect(useGuestAction.getState().pending).toEqual({
      kind: 'message',
      listing: { binderId: core.id },
    });
    fireEvent.press(screen.getByTestId('sign-in-sheet-not-now'));
    fireEvent.press(seller);
    await expectSheet('Sign in to see collector profiles');
    fireEvent.press(screen.getByTestId('sign-in-sheet-not-now'));
    fireEvent.press(screen.getByTestId('deck-core-report'));
    await expectSheet('Sign in to report this collector');
    expect(useGuestAction.getState().pending).toEqual({ kind: 'report', binderId: core.id });
  });
});

describe('Sign in (36): the close button', () => {
  it('"Not now, keep browsing" goes back to where the guest was and forgets the action', async () => {
    useGuestAction.getState().open({ kind: 'wish', cardId: CARD_ID });
    useGuestAction.getState().hide();
    usePendingLink.getState().set('/cards/x');
    mockApi(guestRoutes());
    renderWithProviders(<SignInScreen />, { port: new FakeAuthPort(null) });
    const close = await screen.findByLabelText('Not now, keep browsing');
    fireEvent.press(close);
    expect(mockRouter.back).toHaveBeenCalled();
    expect(useGuestAction.getState().pending).toBeNull();
    expect(usePendingLink.getState().href).toBeNull();

    // Opened from a link with nothing under it: Home.
    resetRouterMock();
    mockRouter.canGoBack.mockReturnValue(false);
    fireEvent.press(screen.getByTestId('sign-in-close'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
    mockRouter.canGoBack.mockReturnValue(true);
  });
});

describe('the guest’s region and game (stage R15)', () => {
  it('stay on the phone under a guest key, the two slugs only', async () => {
    const api = mockApi(guestRoutes());
    renderAsGuest(<HomeScreen />);
    await screen.findByTestId(`home-post-${CARDS.id}`);
    fireEvent.press(screen.getByTestId('home-game'));
    fireEvent.press(await screen.findByTestId('home-game-sheet-option-pokemon'));
    await waitFor(() =>
      expect(api.callsTo('GET /api/v1/feed').at(-1)!.query.get('game')).toBe('pokemon')
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(await AsyncStorage.getItem('orenjitrade.browsing-game.v1.guest')).toBe('pokemon');
    const keys = await AsyncStorage.getAllKeys();
    // Nothing of an account is written for a guest, nothing but the two slugs.
    expect(keys.filter((key) => key.startsWith('orenjitrade.browsing-'))).toEqual([
      'orenjitrade.browsing-game.v1.guest',
    ]);
  });

  it("once signed in, the account's own remembered game wins over the guest's", async () => {
    await AsyncStorage.setItem('orenjitrade.browsing-game.v1.guest', 'pokemon');
    await AsyncStorage.setItem('orenjitrade.browsing-game.v1.uid-maika', 'yugioh');
    const guestApi = mockApi(guestRoutes());
    const guestView = renderAsGuest(<GameProbe />);
    expect(await screen.findByText('pokemon|ready')).toBeOnTheScreen();
    expect(guestApi.callsTo('GET /api/v1/me/profile')).toHaveLength(0);
    guestView.unmount();

    mockApi(signedInRoutes());
    renderWithProviders(<GameProbe />, { port: new FakeAuthPort(testUser()) });
    expect(await screen.findByText('yugioh|ready')).toBeOnTheScreen();
  });
});

function GameProbe() {
  const { game, ready } = useBrowsingGame();
  return <Text>{`${game}|${ready ? 'ready' : 'waiting'}`}</Text>;
}
