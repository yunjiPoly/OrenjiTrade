import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import MessagesScreen from '@/app/(tabs)/messages';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import {
  CHANNELS,
  CONVERSATION_ID,
  SELF_ID,
  conversationFixture,
  conversationPage,
  messageFixture,
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
    expect(screen.getByTestId('unread-badge-collector3')).toHaveTextContent('2');
    expect(screen.queryByTestId('unread-badge-collector2')).toBeNull();
    expect(screen.getByTestId('conversation-row-collector3').props.accessibilityLabel).toBe(
      'Devon Okafor, online, 2 unread messages, Card: Lantern Fox'
    );
    fireEvent.press(screen.getByTestId('conversation-row-collector2'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/messages/[id]',
      params: { id: CONVERSATION_ID },
    });
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
    expect(await screen.findByTestId('inbox-empty')).toHaveTextContent(/No conversations yet/);
    fireEvent.press(screen.getByText('Open the map'));
    expect(mockRouter.navigate).toHaveBeenCalledWith('/');
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
    expect(screen.getByTestId('unread-badge-collector2')).toHaveTextContent('1');

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
    await waitFor(() => expect(screen.queryByTestId('unread-badge-collector3')).toBeNull());
  });
});

describe('Messages tab: community', () => {
  it('switches to the public channels, grouped, with their activity of the day', async () => {
    mockApi(routes());
    render();
    await screen.findByTestId('conversation-row-collector2');
    fireEvent.press(screen.getByTestId('messages-view-community'));
    expect(mockRouter.setParams).toHaveBeenCalledWith({ view: 'community' });
    expect(await screen.findByTestId('channel-montreal-pokemon')).toBeOnTheScreen();
    expect(screen.getByText('Montréal')).toBeOnTheScreen();
    expect(screen.getByText('Topics')).toBeOnTheScreen();
    expect(screen.getByTestId('channel-count-montreal-pokemon')).toHaveTextContent('3');
    expect(screen.queryByTestId('channel-count-yugioh')).toBeNull();
    // Filtering by a game keeps the topics.
    fireEvent.press(screen.getByTestId('community-game-yugioh'));
    expect(screen.queryByTestId('channel-montreal-pokemon')).toBeNull();
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
        'GET /api/v1/community/channels': [problem(500, 'INTERNAL_ERROR', 'Boom'), ok(CHANNELS)],
      })
    );
    render();
    expect(await screen.findByTestId('community-error')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('channel-looking-for')).toBeOnTheScreen();
  });
});
