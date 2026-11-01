import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

import MessagesScreen from '@/app/(tabs)/messages';
import { markRoomVisited } from '@/src/features/community/roomVisits';
import { toLastMessage } from '@/src/features/messages/messageText';
import { HANDLE_MAX_FONT_SCALE, TITLE_MAX_FONT_SCALE } from '@/src/theme';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import {
  CHANNELS,
  CONVERSATION_ID,
  GAMES,
  SELF_ID,
  conversationFixture,
  conversationPage,
  deckCoreSubjectFixture,
  messageFixture,
  saleMessageFixture,
  subjectFixture,
} from '../support/fixtures';
import { mockApi, ok, problem, type MockAnswer, type MockRoutes } from '../support/mockApi';
import { fakeRealtime, type FakeRealtime } from '../support/realtime';
import { signedInRoutes } from '../support/routes';
import { mockParams, mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());

beforeEach(() => {
  resetRouterMock();
  resetAppState();
});

const devon = conversationFixture({
  id: 'conv-devon',
  other: {
    id: '00000000-0000-4000-8000-0000000000c1',
    handle: 'collector3',
    displayName: 'Devon Okafor',
    avatarUrl: null,
    onlineStatus: 'ONLINE',
  },
  unreadCount: 2,
  createdAt: '2026-10-03T12:00:00Z',
  lastMessage: {
    id: 'm-d',
    preview: 'Card: Lantern Fox',
    kind: 'CARD_LINK',
    createdAt: '2026-10-05T09:00:00Z',
    senderId: '00000000-0000-4000-8000-0000000000c1',
  },
});
const noe = conversationFixture({
  muted: true,
  lastMessage: {
    id: 'm-n',
    preview: 'See you Saturday',
    kind: 'TEXT',
    createdAt: '2026-10-04T09:00:00Z',
    senderId: SELF_ID,
  },
});

function routes(extra: MockRoutes = {}): MockRoutes {
  return signedInRoutes({
    'GET /api/v1/conversations': ok(conversationPage([noe, devon])),
    'GET /api/v1/community/channels': ok(CHANNELS),
    ...extra,
  });
}

const render = (realtime?: FakeRealtime) =>
  renderWithProviders(<MessagesScreen />, {
    port: new FakeAuthPort(testUser()),
    realtime: realtime?.client,
  });

describe('Messages tab: inbox', () => {
  it('lists conversations, most recent first, with previews, unread and muted marks', async () => {
    mockApi(routes());
    render();
    expect(screen.getByTestId('inbox-loading')).toBeOnTheScreen();
    expect(await screen.findByTestId('conversation-row-collector3')).toBeOnTheScreen();
    const rows = screen.getAllByTestId(/^conversation-row-/);
    expect(rows.map((row) => row.props.testID)).toEqual([
      'conversation-row-collector3',
      'conversation-row-collector2',
    ]);
    expect(screen.getByTestId('conversation-preview-collector2')).toHaveTextContent(
      'You: See you Saturday'
    );
    // Unread: an orange dot and an orange time; muted keeps its icon (mockup screen 22).
    expect(screen.getByTestId('unread-badge-collector3')).toBeOnTheScreen();
    expect(screen.queryByTestId('unread-badge-collector2')).toBeNull();
    expect(screen.getByTestId('conversation-muted-collector2')).toBeOnTheScreen();
    expect(screen.queryByTestId('conversation-muted-collector3')).toBeNull();
    expect(screen.getByTestId('conversation-row-collector3').props.accessibilityLabel).toBe(
      'collector3, online, 2 unread messages, Card: Lantern Fox'
    );
    // Rows name the handle (the mockup's rows), not the display name.
    expect(screen.getByTestId('conversation-row-collector3')).toHaveTextContent(/collector3/);
    expect(screen.getByTestId('conversation-row-collector3')).not.toHaveTextContent(/Devon Okafor/);
    expect(screen.queryByText('Messages view')).toBeNull();
    fireEvent.press(screen.getByTestId('conversation-row-collector2'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/messages/[id]',
      params: { id: CONVERSATION_ID },
    });
  });

  it('words a last message about an old offer or trade as no longer available (ADR 0018)', async () => {
    mockApi(
      routes({
        'GET /api/v1/conversations': ok(
          conversationPage([
            {
              ...devon,
              lastMessage: {
                id: 'm-trade',
                preview: 'Devon Okafor cancelled the trade: 18.00 CAD for Tidebinder Sovereign.',
                kind: 'SYSTEM',
                createdAt: '2026-10-05T09:00:00Z',
                senderId: null,
              },
            },
            {
              ...noe,
              lastMessage: { ...noe.lastMessage!, preview: 'Offer', kind: 'OFFER_LINK' },
            },
          ])
        ),
      })
    );
    render();
    expect(await screen.findByTestId('conversation-preview-collector3')).toHaveTextContent(
      'Offer (no longer available)'
    );
    expect(screen.getByTestId('conversation-preview-collector2')).toHaveTextContent(
      'You: Offer (no longer available)'
    );
    expect(screen.queryByText(/trade/i)).toBeNull();
  });

  it('shows the picture of what each chat is about and words a sale for the reader (R4)', async () => {
    mockApi(
      routes({
        'GET /api/v1/conversations': ok(
          conversationPage([
            {
              ...devon,
              subject: deckCoreSubjectFixture({ ownerId: devon.other.id }),
              lastMessage: toLastMessage(
                saleMessageFixture(
                  { sellerId: devon.other.id, name: 'Snake-Eye core' },
                  { createdAt: '2026-10-05T09:00:00Z' }
                )
              ),
            },
            { ...noe, subject: subjectFixture({ ownerId: SELF_ID }) },
          ])
        ),
      })
    );
    render();
    expect(await screen.findByTestId('conversation-subject-collector3')).toBeOnTheScreen();
    expect(screen.getByTestId('conversation-subject-collector2')).toBeOnTheScreen();
    expect(screen.getByTestId('conversation-preview-collector3')).toHaveTextContent(
      'collector3 marked Snake-Eye core as sold to you.'
    );
    expect(screen.getByTestId('conversation-row-collector3').props.accessibilityLabel).toMatch(
      /, about Snake-Eye core$/
    );
  });

  it('keeps the header small and gives the handle and the last message room at the largest text size', async () => {
    const window = Dimensions.get('window');
    act(() => {
      Dimensions.set({
        window: { ...window, fontScale: 3.1 },
        screen: { ...window, fontScale: 3.1 },
      });
    });
    try {
      mockApi(routes({ 'GET /api/v1/notifications/unread-count': ok({ count: 3 }) }));
      render();
      const handle = await screen.findByText('collector3');
      // The handle takes the row's width on one line, capped like every handle (owner decision
      // of 2026-10-28), its end cut rather than broken or shrunk; the time under it.
      expect(handle).toHaveProp('maxFontSizeMultiplier', HANDLE_MAX_FONT_SCALE);
      expect(handle).toHaveProp('numberOfLines', 1);
      expect(handle).toHaveProp('ellipsizeMode', 'tail');
      expect(handle.props.adjustsFontSizeToFit).toBeUndefined();
      expect(screen.getByTestId('conversation-preview-collector3')).toHaveProp('numberOfLines', 2);
      // The title and the bell stay within the header (the bell's dot has no text, stage R9).
      expect(screen.getByText('Messages')).toHaveProp(
        'maxFontSizeMultiplier',
        TITLE_MAX_FONT_SCALE
      );
      expect(await screen.findByLabelText('Notifications, 3 new')).toBeOnTheScreen();
      expect(screen.getByTestId('notification-bell-messages-dot')).toBeOnTheScreen();
    } finally {
      act(() => {
        Dimensions.set({ window, screen: window });
      });
    }
  });

  it('shows the empty inbox, and an error with retry', async () => {
    mockApi(
      routes({
        'GET /api/v1/conversations': [
          problem(500, 'INTERNAL_ERROR', 'Boom'),
          ok(conversationPage([])),
        ],
      })
    );
    render();
    expect(await screen.findByTestId('inbox-error')).toHaveTextContent(
      /Conversations could not load/
    );
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    const empty = await screen.findByTestId('inbox-empty');
    // Spec section 10: "No messages yet. Find a card in Search and message its owner."
    expect(empty).toHaveTextContent(
      /No messages yet.*Find a card in Search and message its owner\./
    );
    expect(empty).not.toHaveTextContent(/map|preview|near/i);
    fireEvent.press(screen.getByText('Open search'));
    expect(mockRouter.navigate).toHaveBeenCalledWith('/search');
  });

  it('stays live: a pushed message moves its conversation up with one more unread', async () => {
    const rt = fakeRealtime();
    const api = mockApi(routes());
    render(rt);
    await screen.findByTestId('conversation-row-collector2');
    await waitFor(() => expect(rt.client.state).toBe('connected'));
    expect(await screen.findByTestId('realtime-status')).toHaveTextContent('Live');
    act(() =>
      rt
        .current()
        .push(
          '/user/queue/messages',
          messageFixture({ id: 'new', body: 'Still there?', createdAt: new Date().toISOString() })
        )
    );
    await waitFor(() =>
      expect(screen.getAllByTestId(/^conversation-row-/)[0]?.props.testID).toBe(
        'conversation-row-collector2'
      )
    );
    expect(screen.getByTestId('conversation-preview-collector2')).toHaveTextContent('Still there?');
    expect(screen.getByTestId('unread-badge-collector2')).toBeOnTheScreen();

    // A message of a conversation the inbox does not hold yet re-reads the inbox.
    const before = api.callsTo('GET /api/v1/conversations').length;
    act(() =>
      rt.current().push(
        '/user/queue/messages',
        messageFixture({
          id: 'x',
          conversationId: 'brand-new',
          createdAt: new Date().toISOString(),
        })
      )
    );
    await waitFor(() =>
      expect(api.callsTo('GET /api/v1/conversations').length).toBeGreaterThan(before)
    );

    // The caller read a conversation on another device: its count clears.
    act(() =>
      rt.current().push('/user/queue/receipts', {
        conversationId: 'conv-devon',
        userId: SELF_ID,
        lastReadMessageId: 'm-d',
        readAt: new Date().toISOString(),
      })
    );
    await waitFor(() =>
      expect(screen.queryByTestId('unread-badge-collector3')).not.toBeOnTheScreen()
    );
  });
});

/** The community is behind the `publicChat` flag: the Chats | Community tabs show only then. */
const COMMUNITY_ON = { 'GET /api/v1/public/feature-flags': ok({ publicChat: true }) };

describe('Messages tab: community (stage R11)', () => {
  it('has no Chats | Community tabs while the publicChat flag is off', async () => {
    mockParams.current = { view: 'community' };
    mockApi(routes({ 'GET /api/v1/public/feature-flags': ok({ publicChat: false }) }));
    render();
    // The chats, even from a link to the community.
    expect(await screen.findByTestId('conversation-row-collector2')).toBeOnTheScreen();
    expect(screen.queryByTestId('messages-view')).toBeNull();
    expect(screen.queryByTestId('community-rooms')).toBeNull();
  });

  it('names the tabs Chats and Community, with an orange dot on Chats while a chat is unread', async () => {
    mockApi(routes(COMMUNITY_ON));
    render();
    await screen.findByTestId('conversation-row-collector3');
    const chats = screen.getByTestId('messages-view-inbox');
    expect(chats).toHaveTextContent('Chats');
    expect(chats.props.accessibilityLabel).toBe('Chats, 1 unread');
    expect(screen.getByTestId('messages-view-inbox-dot')).toBeOnTheScreen();
    expect(screen.getByTestId('messages-view-community')).toHaveTextContent('Community');
    expect(screen.queryByTestId('messages-view-community-dot')).toBeNull();
  });

  it('has no dot on Chats when every chat is read', async () => {
    mockApi(
      routes({
        ...COMMUNITY_ON,
        'GET /api/v1/conversations': ok(conversationPage([noe, { ...devon, unreadCount: 0 }])),
      })
    );
    render();
    await screen.findByTestId('conversation-row-collector3');
    expect(screen.queryByTestId('messages-view-inbox-dot')).toBeNull();
    expect(screen.getByTestId('messages-view-inbox').props.accessibilityLabel).toBe('Chats');
  });

  it('lists the browsed region’s five rooms, the browsed game’s first, with their last posts', async () => {
    const api = mockApi(routes(COMMUNITY_ON));
    render();
    await screen.findByTestId('conversation-row-collector2');
    fireEvent.press(screen.getByTestId('messages-view-community'));
    expect(mockRouter.setParams).toHaveBeenCalledWith({ view: 'community' });
    expect(await screen.findByTestId('room-americas-north-pokemon')).toBeOnTheScreen();
    await waitFor(() =>
      expect(api.callsTo('GET /api/v1/community/channels')[0]?.query.get('region')).toBe(
        'americas-north'
      )
    );
    // The collector browses Pokémon (their first profile game with cards): its room comes first,
    // then the games’ order.
    expect(
      screen.getAllByTestId(/^room-americas-north-[a-z]+$/).map((row) => row.props.testID)
    ).toEqual([
      'room-americas-north-pokemon',
      'room-americas-north-yugioh',
      'room-americas-north-mtg',
      'room-americas-north-onepiece',
      'room-americas-north-riftbound',
    ]);
    expect(screen.getByTestId('community-region')).toHaveTextContent(/Americas \(North\)/);
    expect(screen.getByTestId('room-preview-americas-north-yugioh')).toHaveTextContent(
      'kaiba_fan: Does anyone ship to New York? Looking for Nibiru.'
    );
    expect(screen.getByTestId('room-preview-americas-north-riftbound')).toHaveTextContent(
      'No posts yet. Say hi!'
    );
    expect(screen.queryByTestId('room-time-americas-north-riftbound')).toBeNull();
    // New posts since the last visit on this phone: a dot; your own last post never counts.
    expect(screen.getByTestId('room-unread-americas-north-yugioh')).toBeOnTheScreen();
    expect(screen.queryByTestId('room-unread-americas-north-mtg')).toBeNull();
    expect(screen.queryByTestId('room-unread-americas-north-riftbound')).toBeNull();
    expect(screen.getByTestId('room-americas-north-yugioh').props.accessibilityLabel).toMatch(
      /^Yu-Gi-Oh! room, Americas \(North\)\. Last post: kaiba_fan: Does anyone ship to New York\? Looking for Nibiru\., .+\. New posts\.$/
    );
    expect(screen.getByTestId('room-americas-north-riftbound').props.accessibilityLabel).toBe(
      'Riftbound room, Americas (North). No posts yet.'
    );
    expect(screen.getByTestId('community-footnote')).toHaveTextContent(
      /Every collector in Americas \(North\) can read these rooms\. Keep deals and addresses in private chats\.$/
    );
    fireEvent.press(screen.getByTestId('room-americas-north-yugioh'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/community/[slug]',
      params: { slug: 'americas-north-yugioh' },
    });
  });

  it('asks for the rooms only once the browsed region and game are settled', async () => {
    mockParams.current = { view: 'community' };
    const waiting: ((answer: MockAnswer) => void)[] = [];
    const api = mockApi(
      routes({
        ...COMMUNITY_ON,
        // The games (and so the browsed game) answer late.
        'GET /api/v1/games': () => new Promise<MockAnswer>((resolve) => waiting.push(resolve)),
      })
    );
    const answerGames = () =>
      act(async () => {
        waiting.splice(0).forEach((answer) => answer(ok(GAMES)));
      });
    try {
      render();
      expect(await screen.findByTestId('community-loading')).toBeOnTheScreen();
      await waitFor(() => expect(api.callsTo('GET /api/v1/games').length).toBeGreaterThan(0));
      // The account, the profile and the stored region are in (the conversations too).
      await screen.findByTestId('messages-view-community');
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });
      // No other region's or game's rooms first (review fix 1, F4).
      expect(api.callsTo('GET /api/v1/community/channels')).toHaveLength(0);
    } finally {
      await answerGames();
    }
    expect(await screen.findByTestId('room-americas-north-pokemon')).toBeOnTheScreen();
    const asked = api.callsTo('GET /api/v1/community/channels');
    expect(asked).toHaveLength(1);
    expect(asked[0]?.query.get('region')).toBe('americas-north');
  });

  it('shows the closed community when a refresh finds it switched off, even after rooms showed', async () => {
    mockParams.current = { view: 'community' };
    mockApi(
      routes({
        ...COMMUNITY_ON,
        'GET /api/v1/community/channels': [
          ok(CHANNELS),
          problem(404, 'FEATURE_DISABLED', 'Disabled'),
        ],
      })
    );
    render();
    expect(await screen.findByTestId('room-americas-north-yugioh')).toBeOnTheScreen();
    const refresh = screen.getByTestId('community-rooms').props.refreshControl as {
      props: { onRefresh: () => void };
    };
    await act(async () => {
      refresh.props.onRefresh();
    });
    expect(await screen.findByTestId('community-disabled')).toHaveTextContent(
      /The community is closed right now/
    );
    expect(screen.queryByTestId('room-americas-north-yugioh')).toBeNull();
    // It scrolls: centred in a plain view, it ran over the title and the tabs at the largest size.
    expect(
      within(screen.getByTestId('community-state')).getByTestId('community-disabled')
    ).toBeOnTheScreen();
  });

  it('drops a room’s dot once its newest post was read on this phone', async () => {
    await markRoomVisited(testUser().uid, 'americas-north-yugioh', '2026-10-05T14:41:00Z');
    mockParams.current = { view: 'community' };
    mockApi(routes(COMMUNITY_ON));
    render();
    expect(await screen.findByTestId('room-americas-north-yugioh')).toBeOnTheScreen();
    expect(screen.queryByTestId('room-unread-americas-north-yugioh')).toBeNull();
    expect(screen.getByTestId('room-unread-americas-north-pokemon')).toBeOnTheScreen();
  });

  it('opens on the rooms from a link, and explains a closed community', async () => {
    mockParams.current = { view: 'community' };
    mockApi(
      routes({
        ...COMMUNITY_ON,
        'GET /api/v1/community/channels': problem(404, 'FEATURE_DISABLED', 'Disabled'),
      })
    );
    render();
    expect(await screen.findByTestId('community-disabled')).toHaveTextContent(
      /The community is closed right now/
    );
    fireEvent.press(screen.getByText('Open chats'));
    expect(await screen.findByTestId('conversation-row-collector2')).toBeOnTheScreen();
  });

  it('shows skeleton rows, then the error with Try again', async () => {
    mockParams.current = { view: 'community' };
    mockApi(
      routes({
        ...COMMUNITY_ON,
        'GET /api/v1/community/channels': [problem(500, 'INTERNAL_ERROR', 'Boom'), ok(CHANNELS)],
      })
    );
    render();
    expect(await screen.findByTestId('community-error')).toBeOnTheScreen();
    // The region pill stays above the error, and both scroll at large text sizes.
    const state = within(screen.getByTestId('community-state'));
    expect(state.getByTestId('community-region')).toBeOnTheScreen();
    expect(state.getByTestId('community-error')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('room-americas-north-yugioh')).toBeOnTheScreen();
  });
});
