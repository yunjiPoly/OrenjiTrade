import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

import MessagesScreen from '@/app/(tabs)/messages';
import { toLastMessage } from '@/src/features/messages/messageText';
import { TITLE_MAX_FONT_SCALE } from '@/src/theme';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import {
  CHANNELS,
  CONVERSATION_ID,
  SELF_ID,
  conversationFixture,
  conversationPage,
  deckCoreSubjectFixture,
  messageFixture,
  saleMessageFixture,
  subjectFixture,
} from '../support/fixtures';
import { mockApi, ok, problem, type MockRoutes } from '../support/mockApi';
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
      // The handle follows the text size (it was held at 1.35 beside an uncapped last message) and
      // takes the row's width, up to three lines, the time under it.
      expect(handle.props.maxFontSizeMultiplier).toBeUndefined();
      expect(handle).toHaveProp('numberOfLines', 3);
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

/** The community is behind the `publicChat` flag: the Inbox | Community switch shows only then. */
const COMMUNITY_ON = { 'GET /api/v1/public/feature-flags': ok({ publicChat: true }) };

describe('Messages tab: community', () => {
  it('has no Inbox | Community switch while the publicChat flag is off', async () => {
    mockParams.current = { view: 'community' };
    mockApi(routes({ 'GET /api/v1/public/feature-flags': ok({ publicChat: false }) }));
    render();
    // The inbox, even from a link to the community.
    expect(await screen.findByTestId('conversation-row-collector2')).toBeOnTheScreen();
    expect(screen.queryByTestId('messages-view')).toBeNull();
    expect(screen.queryByTestId('channel-americas-north')).toBeNull();
  });

  it('switches to the public channels, grouped, with their activity of the day', async () => {
    mockApi(routes(COMMUNITY_ON));
    render();
    await screen.findByTestId('conversation-row-collector2');
    fireEvent.press(screen.getByTestId('messages-view-community'));
    expect(mockRouter.setParams).toHaveBeenCalledWith({ view: 'community' });
    expect(await screen.findByTestId('channel-americas-north')).toBeOnTheScreen();
    expect(screen.getByText('Regions')).toBeOnTheScreen();
    expect(screen.getByText('Topics')).toBeOnTheScreen();
    expect(screen.getByTestId('channel-count-americas-north')).toHaveTextContent('3');
    expect(screen.queryByTestId('channel-count-yugioh')).toBeNull();
    // Filtering by a game keeps the region channels (every game) and the topics.
    fireEvent.press(screen.getByTestId('community-game-yugioh'));
    expect(screen.getByTestId('channel-americas-north')).toBeOnTheScreen();
    expect(screen.getByTestId('channel-yugioh')).toBeOnTheScreen();
    expect(screen.getByTestId('channel-looking-for')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('channel-looking-for'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/community/[slug]',
      params: { slug: 'looking-for' },
    });
  });

  it('opens on the channels from a link, and explains a closed community', async () => {
    mockParams.current = { view: 'community' };
    mockApi(
      routes({
        ...COMMUNITY_ON,
        'GET /api/v1/community/channels': problem(403, 'FEATURE_DISABLED', 'Disabled'),
      })
    );
    render();
    expect(await screen.findByTestId('community-disabled')).toHaveTextContent(
      /The community is closed right now/
    );
    fireEvent.press(screen.getByText('Open messages'));
    expect(await screen.findByTestId('conversation-row-collector2')).toBeOnTheScreen();
  });

  it('shows the channel error with retry', async () => {
    mockParams.current = { view: 'community' };
    mockApi(
      routes({
        ...COMMUNITY_ON,
        'GET /api/v1/community/channels': [problem(500, 'INTERNAL_ERROR', 'Boom'), ok(CHANNELS)],
      })
    );
    render();
    expect(await screen.findByTestId('community-error')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('channel-looking-for')).toBeOnTheScreen();
  });
});
