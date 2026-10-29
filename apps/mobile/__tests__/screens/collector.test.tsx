import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { Dimensions, Share, StyleSheet } from 'react-native';

import CollectorScreen from '@/app/collectors/[id]/index';
import { meKeys } from '@/src/api/queryKeys';
import { HANDLE_MAX_FONT_SCALE, TITLE_MAX_FONT_SCALE } from '@/src/theme';
import { useSessionNotice } from '@/src/auth/sessionNotice';
import { peekPendingDraft } from '@/src/features/messages/pendingDraft';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import {
  CARD_ID,
  CONVERSATION_ID,
  ONTARIO,
  PUBLIC_BINDER_ID,
  TAGS,
  binderFixture,
  blockedUserFixture,
  collectorFixture,
  conversationFixture,
  deckCoreFixture,
  inventoryPage,
  itemFixture,
  printingFixture,
  publicBinderSummaryFixture,
  publicItemFixture,
  publicItemsPage,
  referencesPageFixture,
  wishFixture,
  wishlistEntryFixture,
} from '../support/fixtures';
import { mockApi, ok, problem, type MockRoutes } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { mockParams, mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());

const OTHER = collectorFixture({
  id: '00000000-0000-4000-8000-0000000000b1',
  handle: 'collector2',
  displayName: 'Noé Verdun',
  bio: 'Magic and Pokémon in Verdun.',
  games: ['mtg', 'pokemon'],
  tags: [TAGS[0]!, { slug: 'pokemon', label: 'Pokemon' }],
  location: { ...ONTARIO },
  memberSince: '2024-03-01',
  lastActiveBucket: 'THIS_WEEK',
  onlineStatus: 'ONLINE',
  rating: { average: 4.8, count: 12 },
});

const CARD = publicItemFixture({ askingPriceText: '85% TCG' });
const CORE = publicBinderSummaryFixture({
  id: 'core-1',
  name: 'Yubel core',
  kind: 'DECK',
  itemCount: 0,
  sellsAsCore: true,
  askingPriceText: '$95',
  previewImages: ['/api/v1/public/binder-images/core-1-photo'],
});
const BINDER = publicBinderSummaryFixture({ previewImages: [] });

// The default text size of a phone (jest's window says 2, a larger size where rows stack).
const WINDOW = Dimensions.get('window');
beforeEach(() => {
  Dimensions.set({ window: { ...WINDOW, fontScale: 1 }, screen: { ...WINDOW, fontScale: 1 } });
  resetRouterMock();
  resetAppState();
  mockParams.current = { id: 'collector2' };
});

afterAll(() => {
  Dimensions.set({ window: WINDOW, screen: WINDOW });
});

function routes(extra: MockRoutes = {}): MockRoutes {
  return signedInRoutes({
    'GET /api/v1/collectors/{handle}/binders': ok([CORE, BINDER]),
    'GET /api/v1/collectors/{handle}/inventory': ok(publicItemsPage([CARD])),
    'GET /api/v1/collectors/{handle}/references': ok(referencesPageFixture()),
    'GET /api/v1/collectors/{handle}/wishlist': ok([wishlistEntryFixture()]),
    'GET /api/v1/collectors/{handle}': ok(OTHER),
    'GET /api/v1/me/blocks': ok([]),
    'GET /api/v1/wishlist': ok([wishFixture()]),
    ...extra,
  });
}

const render = (port = new FakeAuthPort(testUser())) =>
  renderWithProviders(<CollectorScreen />, { port });

/** The order in which test ids appear in the rendered tree. */
function order(ids: string[]): string[] {
  const tree = JSON.stringify(screen.toJSON());
  return [...ids].sort((a, b) => tree.indexOf(`"${a}"`) - tree.indexOf(`"${b}"`));
}

/**
 * A handle, or a label that names one, on one line, capped, its end cut with "…" where its row is
 * too narrow (owner, 2026-10-28); never shrunk to fit (review fix 2, R1-1).
 */
function expectHandleLine(text: ReturnType<typeof screen.getByTestId>) {
  expect(text).toHaveProp('numberOfLines', 1);
  expect(text).toHaveProp('ellipsizeMode', 'tail');
  expect(text).toHaveProp('maxFontSizeMultiplier', HANDLE_MAX_FONT_SCALE);
  expect(text.props.adjustsFontSizeToFit).toBeUndefined();
}

describe("Another collector's profile (mockup screens 19 and 20)", () => {
  it('shows a skeleton, then the header, the line and Message, never a distance', async () => {
    mockApi(routes());
    render();
    expect(screen.getByTestId('collector-loading')).toBeOnTheScreen();
    expect(await screen.findByTestId('collector-name')).toHaveTextContent('Noé Verdun');
    expect(screen.getByTestId('collector-handle')).toHaveTextContent('@collector2');
    expect(screen.getByTestId('collector-rating')).toHaveTextContent(/4\.8$/);
    expect(screen.getByTestId('collector-rating').props.accessibilityLabel).toBe(
      'Rated 4.8 out of 5. Go to ratings and references'
    );
    expect(screen.getByLabelText('Online now')).toBeOnTheScreen();
    // Games first (orange), then the tags; the "Pokemon" tag repeats a game and is left out.
    const chips = screen.getByTestId('collector-chips');
    expect(chips).toHaveTextContent('Magic: The GatheringPokémonTracked shipping');
    expect(screen.getByTestId('collector-line')).toHaveTextContent(
      'Ontario · Member since 2024 · Active this week'
    );
    expect(screen.getByTestId('collector-message')).toHaveTextContent(/Message collector2$/);
    // The handle in the header and in "Message {handle}" stays on one line, capped, at the
    // largest text size as at this one (owner decision of 2026-10-28, review fixes 1 and 2).
    expectHandleLine(screen.getByTestId('collector-handle'));
    expectHandleLine(
      within(screen.getByTestId('collector-message')).getByText('Message collector2')
    );
    expect(screen.queryByText(/km|Canada/)).toBeNull();
    // The location section is gone.
    expect(screen.queryByText('Location')).toBeNull();
  });

  it('writes the city only when the API sends it, and the activity in two buckets', async () => {
    const cases: [Partial<typeof OTHER>, string][] = [
      [
        { location: { ...ONTARIO, city: 'Ottawa' } },
        'Ottawa, Ontario · Member since 2024 · Active this week',
      ],
      [{ lastActiveBucket: 'TODAY' }, 'Ontario · Member since 2024 · Active this week'],
      [{ lastActiveBucket: 'THIS_MONTH' }, 'Ontario · Member since 2024 · Active this month'],
      [{ lastActiveBucket: 'LONGER_AGO' }, 'Ontario · Member since 2024'],
      [{ lastActiveBucket: 'HIDDEN' }, 'Ontario · Member since 2024'],
      [{ location: undefined }, 'Member since 2024 · Active this week'],
    ];
    for (const [changes, line] of cases) {
      mockApi(routes({ 'GET /api/v1/collectors/{handle}': ok({ ...OTHER, ...changes }) }));
      const view = render();
      expect(await screen.findByTestId('collector-line')).toHaveTextContent(line);
      view.unmount();
    }
    mockApi(
      routes({ 'GET /api/v1/collectors/{handle}': ok({ ...OTHER, onlineStatus: 'HIDDEN' }) })
    );
    render();
    await screen.findByTestId('collector-name');
    expect(screen.queryByLabelText('Online now')).toBeNull();
  });

  it('shows Cards, Binders, Looking for, About and Ratings & references, in that order', async () => {
    // The owner made the binder before the deck core: the rail still shows the deck core first.
    const api = mockApi(routes({ 'GET /api/v1/collectors/{handle}/binders': ok([BINDER, CORE]) }));
    render();
    const card = await screen.findByTestId(`profile-card-${CARD.id}`);
    // The cards of a deck core sell only with it: the Binders rail shows the core instead.
    expect(
      api.callsTo('GET /api/v1/collectors/{handle}/inventory')[0]?.query.get('excludeDeckCoreItems')
    ).toBe('true');
    expect(card).toHaveTextContent('Azure-Eyes Sky Dragon85% TCG');
    const core = screen.getByTestId('profile-binder-core-1');
    expect(core).toHaveTextContent('Deck coreYubel core$95');
    expect(core.props.accessibilityLabel).toBe('Yubel core, deck core, $95');
    expect(screen.getByTestId(`profile-binder-${PUBLIC_BINDER_ID}`)).toHaveTextContent(
      'Magic trades14 cards'
    );
    expect(order([`profile-binder-${PUBLIC_BINDER_ID}`, 'profile-binder-core-1'])).toEqual([
      'profile-binder-core-1',
      `profile-binder-${PUBLIC_BINDER_ID}`,
    ]);
    const wish = await screen.findByTestId(`profile-have-${CARD_ID}`);
    expect(wish).toHaveTextContent('I have it');
    expect(wish.props.accessibilityLabel).toBe('I have Azure-Eyes Sky Dragon. Message collector2');
    expect(screen.getByTestId('profile-wishes')).toHaveTextContent(/Any printing · NM only/);
    expect(screen.getByTestId('profile-bio-text')).toHaveTextContent(
      'Magic and Pokémon in Verdun.'
    );
    expect(screen.getByTestId('profile-rating-summary')).toHaveTextContent(/^4\.8.*12 ratings$/);
    expect(screen.getByLabelText('4.8 out of 5')).toBeOnTheScreen();
    expect(await screen.findByText('Fair and friendly trader.')).toBeOnTheScreen();
    expect(screen.getByText(/^collector1/)).toBeOnTheScreen();
    expect(screen.getByText(/· Sep 2026/)).toBeOnTheScreen();
    expect(
      order([
        'profile-ratings',
        'profile-about',
        'profile-wishes',
        'profile-binders',
        'profile-cards',
      ])
    ).toEqual([
      'profile-cards',
      'profile-binders',
      'profile-wishes',
      'profile-about',
      'profile-ratings',
    ]);
    // No counts beyond the design's (no "N cards" for the collector, no holders).
    expect(screen.queryByText(/public binders/)).toBeNull();
  });

  it('shows at most 3 wishes and the 2 latest references', async () => {
    const entries = ['A', 'B', 'C', 'D'].map((name) =>
      wishlistEntryFixture({ card: { id: `card-${name}`, name: `Card ${name}`, imageUrl: null } })
    );
    const refs = referencesPageFixture();
    const reference = refs.items![0]!;
    mockApi(
      routes({
        'GET /api/v1/collectors/{handle}/wishlist': ok(entries),
        'GET /api/v1/collectors/{handle}/references': ok({
          ...refs,
          items: [
            reference,
            { ...reference, id: 'r2', body: 'Second.' },
            { ...reference, id: 'r3', body: 'Third.' },
          ],
        }),
      })
    );
    render();
    expect(await screen.findByTestId('profile-have-card-C')).toBeOnTheScreen();
    expect(screen.queryByTestId('profile-have-card-D')).toBeNull();
    expect(await screen.findByText('Second.')).toBeOnTheScreen();
    expect(screen.queryByText('Third.')).toBeNull();
  });

  it('says when a section is empty, and retries one that failed', async () => {
    const api = mockApi(
      routes({
        'GET /api/v1/collectors/{handle}': ok({
          ...OTHER,
          bio: '',
          rating: { average: null, count: 0 },
        }),
        'GET /api/v1/collectors/{handle}/inventory': ok(publicItemsPage([])),
        'GET /api/v1/collectors/{handle}/binders': [problem(500, 'INTERNAL_ERROR', 'Boom'), ok([])],
        'GET /api/v1/collectors/{handle}/wishlist': problem(404, 'NOT_FOUND', 'hidden'),
        'GET /api/v1/collectors/{handle}/references': ok(referencesPageFixture({ items: [] })),
      })
    );
    render();
    expect(await screen.findByTestId('profile-cards-empty')).toHaveTextContent(
      'No public cards yet.'
    );
    const failed = await screen.findByTestId('profile-binders-error');
    expect(failed).toHaveTextContent(/^Binders could not load\./);
    fireEvent.press(within(failed).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('profile-binders-empty')).toHaveTextContent(
      'No public binders yet.'
    );
    expect(api.callsTo('GET /api/v1/collectors/{handle}/binders')).toHaveLength(2);
    // A hidden wishlist reads like an empty one (nothing says why).
    expect(await screen.findByTestId('profile-wishes-empty')).toHaveTextContent(
      'No public wishes.'
    );
    expect(screen.getByTestId('profile-bio-text')).toHaveTextContent(
      'Noé Verdun has not written a bio yet.'
    );
    expect(screen.getByTestId('profile-ratings-empty')).toHaveTextContent('No ratings yet.');
    expect(await screen.findByTestId('profile-references-empty')).toHaveTextContent(
      'No references yet.'
    );
    // Nothing to see in full: no "See all" on the empty sections.
    expect(screen.queryByTestId('profile-cards-see-all')).toBeNull();
    expect(screen.queryByTestId('profile-wishes-see-all')).toBeNull();
    // The references page still holds Rate and Write a reference.
    expect(screen.getByTestId('profile-references-see-all')).toBeOnTheScreen();
  });

  it('opens a card, a binder, each "See all" and a reference author', async () => {
    mockApi(routes());
    render();
    fireEvent.press(await screen.findByTestId(`profile-card-${CARD.id}`));
    expect(mockRouter.push).toHaveBeenLastCalledWith({
      pathname: '/cards/[id]',
      params: { id: CARD_ID, printing: CARD.printing.id },
    });
    fireEvent.press(screen.getByTestId('profile-binder-core-1'));
    expect(mockRouter.push).toHaveBeenLastCalledWith({
      pathname: '/binders/[id]',
      params: { id: 'core-1' },
    });
    const seeAll: [string, string][] = [
      ['profile-cards-see-all', '/collectors/[id]/cards'],
      ['profile-binders-see-all', '/collectors/[id]/binders'],
      ['profile-wishes-see-all', '/collectors/[id]/wishes'],
      ['profile-references-see-all', '/collectors/[id]/references'],
    ];
    await screen.findByTestId(`profile-have-${CARD_ID}`);
    for (const [id, pathname] of seeAll) {
      fireEvent.press(screen.getByTestId(id));
      expect(mockRouter.push).toHaveBeenLastCalledWith({
        pathname,
        params: { id: 'collector2' },
      });
    }
    expect(screen.getByTestId('profile-cards-see-all').props.accessibilityLabel).toBe(
      'See all cards'
    );
    fireEvent.press(await screen.findByText(/^collector1/));
    expect(mockRouter.push).toHaveBeenLastCalledWith({
      pathname: '/collectors/[id]',
      params: { id: 'collector1' },
    });
  });

  it('"Message {handle}" opens or reuses the chat without changing its card', async () => {
    const api = mockApi(routes({ 'POST /api/v1/conversations': ok(conversationFixture()) }));
    render();
    fireEvent.press(await screen.findByTestId('collector-message'));
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/messages/[id]',
        params: { id: CONVERSATION_ID },
      })
    );
    expect(api.callsTo('POST /api/v1/conversations')[0]?.body).toEqual({ recipientId: OTHER.id });
  });

  it('respects the messaging permission: Message is off with the reason, no "I have it"', async () => {
    mockApi(routes({ 'GET /api/v1/collectors/{handle}': ok({ ...OTHER, canMessage: false }) }));
    render();
    expect(await screen.findByTestId('collector-message')).toBeDisabled();
    expect(screen.getByTestId('collector-message-reason')).toHaveTextContent(
      'collector2 does not accept messages from you.'
    );
    expect(await screen.findByTestId('profile-wishes')).toHaveTextContent(/Azure-Eyes Sky Dragon/);
    expect(screen.queryByTestId(`profile-have-${CARD_ID}`)).toBeNull();
  });

  it('shows the small top bar with Message once the header has scrolled away', async () => {
    const api = mockApi(routes({ 'POST /api/v1/conversations': ok(conversationFixture()) }));
    render();
    await screen.findByTestId('collector-name');
    expect(screen.queryByTestId('profile-top-bar-name')).toBeNull();
    fireEvent(screen.getByTestId('profile-actions'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 120, width: 360, height: 44 } },
    });
    fireEvent.scroll(screen.getByTestId('collector-scroll'), {
      nativeEvent: { contentOffset: { x: 0, y: 400 } },
    });
    expect(await screen.findByTestId('profile-top-bar-name')).toHaveTextContent('Noé Verdun');
    fireEvent.press(screen.getByTestId('profile-top-bar-message'));
    await waitFor(() => expect(api.callsTo('POST /api/v1/conversations')).toHaveLength(1));
    fireEvent.scroll(screen.getByTestId('collector-scroll'), {
      nativeEvent: { contentOffset: { x: 0, y: 40 } },
    });
    await waitFor(() => expect(screen.queryByTestId('profile-top-bar-name')).toBeNull());
  });
});

describe('At the largest text size (the walk of stage R6)', () => {
  it('puts the avatar above the name and keeps the titles and "See all" on their words', async () => {
    const window = WINDOW;
    act(() => {
      Dimensions.set({
        window: { ...window, fontScale: 3.1 },
        screen: { ...window, fontScale: 3.1 },
      });
    });
    try {
      mockApi(routes());
      render();
      expect(await screen.findByTestId('collector-name')).toHaveProp(
        'maxFontSizeMultiplier',
        TITLE_MAX_FONT_SCALE
      );
      // Beside the avatar the handle broke in the middle of a word.
      expect(StyleSheet.flatten(screen.getByTestId('collector-header').props.style)).toMatchObject({
        flexDirection: 'column',
      });
      // "Looking for" broke as "Looki / ng for" beside "See all". Each section loads on its own
      // after the header: its "See all" and its rail are waited for, never read on the header's
      // frame (on a loaded CI runner they were not there yet).
      expect(screen.getByText('Looking for')).toHaveProp(
        'maxFontSizeMultiplier',
        TITLE_MAX_FONT_SCALE
      );
      expect((await screen.findAllByText('See all'))[0]).toHaveProp(
        'maxFontSizeMultiplier',
        TITLE_MAX_FONT_SCALE
      );
      // A wish puts "I have it" under the card.
      expect(await screen.findByTestId(`profile-have-${CARD_ID}`)).toBeOnTheScreen();
      // The cards and binders are rows, the whole name beside the picture (in a tile the name
      // broke in the middle of a word).
      expect(await screen.findByTestId(`profile-card-${CARD.id}`)).toHaveTextContent(
        'Azure-Eyes Sky Dragon85% TCG'
      );
      expect(screen.getByTestId('profile-cards-rail').type).not.toBe('RCTScrollView');
      expect((await screen.findByTestId('profile-binders-rail')).type).not.toBe('RCTScrollView');
    } finally {
      act(() => {
        Dimensions.set({ window, screen: window });
      });
    }
  });
});

describe('"I have it" (owner spec 2026-10-14, section 10)', () => {
  const mine = (id: string, visibility: 'PUBLIC' | 'PRIVATE', updatedAt: string) =>
    itemFixture({
      id,
      card: { id: CARD_ID, name: 'Azure-Eyes Sky Dragon', game: 'yugioh' },
      printing: printingFixture({ printingCode: 'AZR-EN001' }),
      askingPriceText: '$12.50',
      visibility,
      updatedAt,
    });

  it('puts your copy and the text in the box, leaving the chat card alone until send', async () => {
    const api = mockApi(
      routes({
        'GET /api/v1/inventory/items': ok(
          inventoryPage([
            mine('private-copy', 'PRIVATE', '2026-10-10T12:00:00Z'),
            mine('public-copy', 'PUBLIC', '2026-10-01T12:00:00Z'),
          ])
        ),
        'POST /api/v1/conversations': ok(conversationFixture()),
      })
    );
    render();
    fireEvent.press(await screen.findByTestId(`profile-have-${CARD_ID}`));
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/messages/[id]',
        params: { id: CONVERSATION_ID },
      })
    );
    const lookup = api.callsTo('GET /api/v1/inventory/items')[0];
    expect(lookup?.query.get('cardId')).toBe(CARD_ID);
    // The chat opens as "Message" opens it: its card is not changed before send (the other
    // collector would see your copy, even a private one, in their inbox at once).
    expect(api.callsTo('POST /api/v1/conversations')[0]?.body).toEqual({ recipientId: OTHER.id });
    expect(peekPendingDraft(CONVERSATION_ID)).toEqual({
      text: 'I have Azure-Eyes Sky Dragon for your wishlist. Interested?',
      attachment: {
        kind: 'item',
        item: {
          itemId: 'public-copy',
          name: 'Azure-Eyes Sky Dragon',
          printingCode: 'AZR-EN001',
          imageUrl: '/api/v1/public/card-images/pa',
          game: 'yugioh',
          askingPriceText: '$12.50',
        },
      },
    });
    // Nothing is sent until the collector taps send in the chat.
    expect(api.callsTo('POST /api/v1/conversations/{id}/messages')).toHaveLength(0);
  });

  it('never offers a copy filed in one of your deck cores (it sells only with its core)', async () => {
    const core = deckCoreFixture();
    const api = mockApi(
      routes({
        'GET /api/v1/binders': ok([binderFixture(), core]),
        'GET /api/v1/inventory/items': ok(
          inventoryPage([
            {
              ...mine('core-copy', 'PUBLIC', '2026-10-10T12:00:00Z'),
              binder: { id: core.id, name: core.name },
            },
          ])
        ),
        'POST /api/v1/conversations': ok(conversationFixture()),
      })
    );
    render();
    fireEvent.press(await screen.findByTestId(`profile-have-${CARD_ID}`));
    await waitFor(() => expect(api.callsTo('POST /api/v1/conversations')).toHaveLength(1));
    await waitFor(() =>
      expect(peekPendingDraft(CONVERSATION_ID)).toEqual({
        text: 'I have Azure-Eyes Sky Dragon for your wishlist. Interested?',
        attachment: null,
      })
    );
  });

  it('without a copy, opens the chat with the text only and no card pinned', async () => {
    const api = mockApi(
      routes({
        'GET /api/v1/inventory/items': ok(inventoryPage([])),
        'POST /api/v1/conversations': ok(conversationFixture()),
      })
    );
    render();
    fireEvent.press(await screen.findByTestId(`profile-have-${CARD_ID}`));
    await waitFor(() => expect(api.callsTo('POST /api/v1/conversations')).toHaveLength(1));
    expect(api.callsTo('POST /api/v1/conversations')[0]?.body).toEqual({ recipientId: OTHER.id });
    await waitFor(() =>
      expect(peekPendingDraft(CONVERSATION_ID)).toEqual({
        text: 'I have Azure-Eyes Sky Dragon for your wishlist. Interested?',
        attachment: null,
      })
    );
  });

  it('says why when the chat cannot open', async () => {
    mockApi(
      routes({
        'GET /api/v1/inventory/items': ok(inventoryPage([])),
        'POST /api/v1/conversations': problem(403, 'MESSAGING_BLOCKED', 'No'),
      })
    );
    render();
    fireEvent.press(await screen.findByTestId(`profile-have-${CARD_ID}`));
    expect(await screen.findByTestId('snackbar')).toBeOnTheScreen();
    expect(mockRouter.push).not.toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/messages/[id]' })
    );
  });
});

describe('The "⋯" sheet: Share profile, Report, Block', () => {
  it('shares the public link of the profile once iOS has dismissed the sheet', async () => {
    // iOS takes a share sheet asked for while it still dismisses the "⋯" sheet away with it: the
    // share waits for the sheet's Modal to report `onDismiss` (stage R6, review fix 1).
    const { mockDismissals } = require('react-native/Libraries/Modal/Modal') as {
      mockDismissals: { count: number };
    };
    const before = mockDismissals.count;
    let dismissalsAtShare = -1;
    const share = jest.spyOn(Share, 'share').mockImplementation(async () => {
      dismissalsAtShare = mockDismissals.count;
      return { action: 'sharedAction' };
    });
    mockApi(routes());
    render();
    fireEvent.press(await screen.findByRole('button', { name: 'More for collector2' }));
    fireEvent.press(within(screen.getByTestId('collector-menu-sheet')).getByText('Share profile'));
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(dismissalsAtShare).toBe(before + 1);
    expect(screen.queryByTestId('collector-menu-sheet')).toBeNull();
    expect(JSON.stringify(share.mock.calls[0]?.[0])).toContain(
      'https://www.orenjitrade.com/collectors/collector2'
    );
    share.mockRestore();
  });

  it('shows the link when the device cannot share', async () => {
    const share = jest.spyOn(Share, 'share').mockRejectedValue(new Error('not supported'));
    mockApi(routes());
    render();
    fireEvent.press(await screen.findByTestId('collector-menu'));
    fireEvent.press(screen.getByTestId('collector-share'));
    expect(await screen.findByTestId('snackbar')).toHaveTextContent(
      'Profile link: https://www.orenjitrade.com/collectors/collector2'
    );
    share.mockRestore();
  });

  it('flashes the scroll bar when its rows do not all fit (the largest text size)', async () => {
    const { ScrollView } = jest.requireActual<typeof import('react-native')>('react-native');
    const flash = ScrollView.prototype.flashScrollIndicators as jest.Mock;
    mockApi(routes());
    render();
    fireEvent.press(await screen.findByTestId('collector-menu'));
    const list = screen.getByTestId('collector-menu-scroll');
    flash.mockClear();
    // Everything fits: nothing to show.
    fireEvent(list, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 400 } } });
    fireEvent(list, 'contentSizeChange', 390, 300);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    expect(flash).not.toHaveBeenCalled();
    // Block is below the fold: the scroll bar shows that the rows go on.
    fireEvent(list, 'contentSizeChange', 390, 900);
    await waitFor(() => expect(flash).toHaveBeenCalled());
  });

  it('reports the collector', async () => {
    mockApi(routes());
    render();
    fireEvent.press(await screen.findByTestId('collector-menu'));
    expect(screen.getByTestId('collector-report')).toHaveTextContent(/Report collector2$/);
    // The sheet's rows that name the collector keep the handle on one line (review fix 1, F7).
    expectHandleLine(within(screen.getByTestId('collector-report')).getByText('Report collector2'));
    expectHandleLine(within(screen.getByTestId('collector-block')).getByText('Block collector2'));
    fireEvent.press(screen.getByTestId('collector-report'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/report',
      params: {
        userId: OTHER.id,
        name: 'Noé Verdun',
        handle: 'collector2',
        source: 'PROFILE',
      },
    });
  });
});

describe('Your own profile opened from a link', () => {
  it('is your page: Edit profile and Share profile, no Message, no "⋯", no "I have it"', async () => {
    mockParams.current = { id: 'maika' };
    mockApi(routes({ 'GET /api/v1/collectors/{handle}': ok(collectorFixture()) }));
    render();
    expect(await screen.findByTestId('profile-name')).toHaveTextContent('Maïka Test');
    expect(screen.getByTestId('profile-edit')).toBeOnTheScreen();
    expect(screen.getByTestId('profile-share')).toBeOnTheScreen();
    expect(screen.queryByTestId('collector-message')).toBeNull();
    expect(screen.queryByTestId('collector-menu')).toBeNull();
    // Your wishes (GET /wishlist) open the wish, never "I have it".
    const wish = await screen.findByTestId('profile-wish-00000000-0000-4000-9a00-000000000001');
    fireEvent.press(wish);
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/wishlist/edit',
      params: { id: '00000000-0000-4000-9a00-000000000001' },
    });
    expect(screen.queryByText('I have it')).toBeNull();
    // Your own line: the city you show, no "Active".
    expect(screen.getByTestId('profile-line')).toHaveTextContent(
      'Montréal, Quebec · Member since 2026'
    );
  });
});

describe('Collector profile visibility (like the web)', () => {
  it('PRIVATE (or unknown, suspended, deleted): "not available", whatever the reason', async () => {
    mockApi(routes({ 'GET /api/v1/collectors/{handle}': problem(404, 'NOT_FOUND', 'Not found') }));
    render();
    const empty = await screen.findByTestId('collector-not-found');
    expect(empty).toHaveTextContent(/This collector is not available/);
    expect(empty).toHaveTextContent(/does not exist, is private, or is no longer active/);
    fireEvent.press(within(empty).getByRole('button', { name: 'Back to Search' }));
    expect(mockRouter.navigate).toHaveBeenCalledWith('/search');
  });

  it('MEMBERS while signed out: sign-in required, nothing is requested', async () => {
    const api = mockApi(routes());
    render(new FakeAuthPort());
    expect(await screen.findByTestId('collector-members-only')).toHaveTextContent(
      /Collector profiles are for members/
    );
    expect(api.callsTo('GET /api/v1/collectors/{handle}')).toHaveLength(0);
    fireEvent.press(screen.getByTestId('collector-sign-in'));
    expect(mockRouter.push).toHaveBeenCalledWith('/sign-in');
    fireEvent.press(screen.getByTestId('collector-sign-up'));
    expect(mockRouter.push).toHaveBeenCalledWith('/sign-up');
  });

  it('a 401 ends the session: signed out, so the gate opens sign-in instead of looping', async () => {
    mockApi(
      routes({ 'GET /api/v1/collectors/{handle}': problem(401, 'UNAUTHENTICATED', 'Sign in') })
    );
    const port = new FakeAuthPort(testUser());
    render(port);
    expect(await screen.findByTestId('collector-members-only')).toBeOnTheScreen();
    await waitFor(() => expect(port.signOut).toHaveBeenCalled());
    expect(useSessionNotice.getState().ended).toBe(true);
    fireEvent.press(screen.getByTestId('collector-sign-in'));
    expect(mockRouter.push).toHaveBeenCalledWith('/sign-in');
  });

  it('shows an error with retry for other failures', async () => {
    const api = mockApi(
      routes({
        'GET /api/v1/collectors/{handle}': [problem(500, 'INTERNAL_ERROR', 'Boom'), ok(OTHER)],
      })
    );
    render();
    expect(await screen.findByText('We could not load this profile')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('collector-name')).toHaveTextContent('Noé Verdun');
    expect(api.callsTo('GET /api/v1/collectors/{handle}')).toHaveLength(2);
  });

  it('shows the offline error when the network is down', async () => {
    mockApi(routes({ 'GET /api/v1/collectors/{handle}': problem(0, 'NETWORK_ERROR', 'offline') }));
    render();
    expect(await screen.findByTestId('collector-error')).toBeOnTheScreen();
  });
});

describe("Blocks (today's rule: the header answers, the listings do not, either way)", () => {
  const blockRoutes = (extra: MockRoutes = {}) =>
    routes({
      'GET /api/v1/collectors/{handle}': [
        ok(OTHER),
        ok({ ...OTHER, isBlocked: true, canMessage: false }),
      ],
      'GET /api/v1/me/blocks': [ok([]), ok([blockedUserFixture()])],
      'POST /api/v1/users/{id}/block': { status: 204 },
      'DELETE /api/v1/users/{id}/block': { status: 204 },
      ...extra,
    });

  it('blocks from the sheet after a confirmation; then the header and Unblock only', async () => {
    const api = mockApi(blockRoutes());
    render();
    expect(await screen.findByTestId('collector-name')).toHaveTextContent('Noé Verdun');
    fireEvent.press(screen.getByTestId('collector-menu'));
    const block = screen.getByTestId('collector-block');
    expect(block).toHaveTextContent(/Block collector2$/);
    fireEvent.press(block);
    const dialog = await screen.findByTestId('block-dialog');
    expect(within(dialog).getByText('Block collector2?')).toBeOnTheScreen();
    fireEvent.press(within(dialog).getByRole('button', { name: 'Block' }));
    await waitFor(() => expect(api.callsTo('POST /api/v1/users/{id}/block')).toHaveLength(1));
    expect(api.callsTo('POST /api/v1/users/{id}/block')[0]?.path).toBe(
      '/api/v1/users/00000000-0000-4000-8000-0000000000b1/block'
    );
    expect(await screen.findByTestId('collector-blocked')).toHaveTextContent(
      /You blocked collector2\. Unblock them to see their cards, binders and wishes/
    );
    expect(screen.queryByTestId('profile-cards')).toBeNull();
    expect(screen.queryByTestId('profile-wishes')).toBeNull();
    expect(screen.queryByTestId('collector-message')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Unblock collector2' }));
    await waitFor(() => expect(api.callsTo('DELETE /api/v1/users/{id}/block')).toHaveLength(1));
    expect(screen.getByTestId('snackbar')).toHaveTextContent('collector2 is unblocked.');
  });

  it('reads the region map, search and card holders again after a block and an unblock', async () => {
    mockApi(blockRoutes());
    const { queryClient } = render();
    const keys = [
      meKeys.regionBinderCounts('uid-maika', 'americas-north'),
      meKeys.regionBinderSearch('uid-maika', { region: 'americas-north' }),
      meKeys.search('uid-maika', { q: 'noe', types: ['collectors'], region: 'americas-north' }),
      meKeys.cardHolders('uid-maika', { cardId: 'card-1', region: 'americas-north' }),
    ];
    const read = () => keys.forEach((key) => queryClient.setQueryData(key, { pages: [] }));
    const stale = () => keys.map((key) => queryClient.getQueryState(key)?.isInvalidated);
    read();
    expect(stale()).toEqual([false, false, false, false]);
    expect(await screen.findByTestId('collector-name')).toHaveTextContent('Noé Verdun');
    fireEvent.press(screen.getByTestId('collector-menu'));
    fireEvent.press(screen.getByTestId('collector-block'));
    fireEvent.press(
      within(await screen.findByTestId('block-dialog')).getByRole('button', { name: 'Block' })
    );
    await waitFor(() => expect(stale()).toEqual([true, true, true, true]));
    read();
    fireEvent.press(await screen.findByRole('button', { name: 'Unblock collector2' }));
    await waitFor(() => expect(stale()).toEqual([true, true, true, true]));
  });

  it('a collector who blocked you is "not available", and their listings are not asked for', async () => {
    const api = mockApi(
      routes({
        'GET /api/v1/collectors/{handle}': ok({ ...OTHER, isBlocked: true, canMessage: false }),
        'GET /api/v1/me/blocks': ok([]),
      })
    );
    render();
    expect(await screen.findByTestId('collector-not-found')).toBeOnTheScreen();
    expect(screen.queryByTestId('collector-menu')).toBeNull();
    expect(api.callsTo('GET /api/v1/collectors/{handle}/inventory')).toHaveLength(0);
    expect(api.callsTo('GET /api/v1/collectors/{handle}/binders')).toHaveLength(0);
    expect(api.callsTo('GET /api/v1/collectors/{handle}/wishlist')).toHaveLength(0);
  });

  it("never offers Block or Report on the collector's own profile", async () => {
    mockParams.current = { id: 'maika' };
    mockApi(routes({ 'GET /api/v1/collectors/{handle}': ok(collectorFixture()) }));
    render();
    expect(await screen.findByTestId('profile-name')).toBeOnTheScreen();
    expect(screen.queryByTestId('collector-menu')).toBeNull();
    expect(screen.queryByTestId('collector-block')).toBeNull();
    expect(screen.queryByTestId('collector-report')).toBeNull();
  });
});
