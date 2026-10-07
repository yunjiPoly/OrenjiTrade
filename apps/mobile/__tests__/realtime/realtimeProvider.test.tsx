import NetInfo from '@react-native-community/netinfo';
import { act, screen, waitFor } from '@testing-library/react-native';
import { AppState, Text, type AppStateStatus } from 'react-native';

import { meKeys } from '@/src/api/queryKeys';
import { useRealtimeState } from '@/src/realtime/RealtimeProvider';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import {
  CONVERSATION_ID,
  SELF_ID,
  conversationFixture,
  conversationPage,
  meFixture,
  messageFixture,
  notificationFixture,
} from '../support/fixtures';
import { mockApi, ok, problem } from '../support/mockApi';
import { fakeRealtime } from '../support/realtime';
import { renderWithProviders, resetAppState } from '../test-utils';

function State() {
  return <Text testID="state">{useRealtimeState()}</Text>;
}

let appStateListener: ((status: AppStateStatus) => void) | null = null;
let netInfoListener:
  ((state: { isConnected: boolean; isInternetReachable: boolean }) => void) | null = null;

beforeEach(() => {
  resetAppState();
  appStateListener = null;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateListener = listener as (status: AppStateStatus) => void;
    return { remove: jest.fn() } as never;
  });
  jest.spyOn(NetInfo, 'addEventListener').mockImplementation((listener) => {
    netInfoListener = listener as never;
    return jest.fn();
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('RealtimeProvider', () => {
  it('connects only for a ready account, pauses in the background and resumes in the foreground', async () => {
    const rt = fakeRealtime();
    mockApi({ 'GET /api/v1/me': ok(meFixture()) });
    await renderWithProviders(<State />, {
      port: new FakeAuthPort(testUser()),
      realtime: rt.client,
    });
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('connected'));
    expect(rt.sessions).toHaveLength(1);

    await act(() => appStateListener?.('background'));
    expect(screen.getByTestId('state')).toHaveTextContent('paused');
    expect(rt.sessions[0]?.closed).toBe(true);

    await act(() => appStateListener?.('active'));
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('connected'));
    expect(rt.sessions).toHaveLength(2);

    // The network comes back while reconnecting: no backoff wait.
    await act(() => rt.current().drop());
    expect(screen.getByTestId('state')).toHaveTextContent('reconnecting');
    await act(() => netInfoListener?.({ isConnected: true, isInternetReachable: true }));
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('connected'));
    expect(rt.sessions).toHaveLength(3);
  });

  it('stays disabled while signed out or while the account is not ready', async () => {
    const signedOut = fakeRealtime();
    mockApi({});
    const first = await renderWithProviders(<State />, {
      port: new FakeAuthPort(null),
      realtime: signedOut.client,
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByTestId('state')).toHaveTextContent('disabled');
    await first.unmount();

    const suspended = fakeRealtime();
    mockApi({ 'GET /api/v1/me': problem(403, 'ACCOUNT_SUSPENDED', 'Suspended') });
    await renderWithProviders(<State />, {
      port: new FakeAuthPort(testUser()),
      realtime: suspended.client,
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByTestId('state')).toHaveTextContent('disabled');
    expect(suspended.sessions).toHaveLength(0);
  });
});

describe('RealtimeCacheSync', () => {
  it('applies pushes to the caches and re-reads after a reconnection', async () => {
    const rt = fakeRealtime();
    const api = mockApi({
      'GET /api/v1/me': ok(meFixture()),
      'GET /api/v1/conversations': ok(conversationPage([conversationFixture()])),
      'GET /api/v1/notifications/unread-count': ok({ count: 1 }),
    });
    const { queryClient } = await renderWithProviders(<State />, {
      port: new FakeAuthPort(testUser()),
      realtime: rt.client,
    });
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('connected'));
    const uid = 'uid-maika';
    queryClient.setQueryData(meKeys.notificationUnread(uid), { count: 1 });
    queryClient.setQueryData(meKeys.conversationList(uid), {
      pages: [conversationPage([conversationFixture()])],
      pageParams: [null],
    });
    queryClient.setQueryData(meKeys.messages(uid, CONVERSATION_ID), {
      pages: [{ items: [messageFixture({ id: 'mine', senderId: SELF_ID })], hasMore: false }],
      pageParams: [null],
    });
    queryClient.setQueryData(meKeys.wishlistItems(uid), []);
    const session = rt.current();

    await act(() =>
      session.push(
        '/user/queue/messages',
        messageFixture({ id: 'pushed', createdAt: new Date().toISOString() })
      )
    );
    const thread = queryClient.getQueryData<{ pages: { items: { id: string }[] }[] }>(
      meKeys.messages(uid, CONVERSATION_ID)
    );
    expect(thread?.pages[0]?.items.map((item) => item.id)).toEqual(['pushed', 'mine']);
    const inbox = queryClient.getQueryData<{ pages: { items: { unreadCount: number }[] }[] }>(
      meKeys.conversationList(uid)
    );
    expect(inbox?.pages[0]?.items[0]?.unreadCount).toBe(1);

    await act(() =>
      session.push('/user/queue/receipts', {
        conversationId: CONVERSATION_ID,
        userId: '00000000-0000-4000-8000-0000000000b1',
        lastReadMessageId: 'mine',
        readAt: new Date().toISOString(),
      })
    );
    const seen = queryClient.getQueryData<{
      pages: { items: { id: string; readByOther: boolean }[] }[];
    }>(meKeys.messages(uid, CONVERSATION_ID));
    expect(seen?.pages[0]?.items.find((item) => item.id === 'mine')?.readByOther).toBe(true);

    await act(() =>
      session.push('/user/queue/presence', {
        userId: '00000000-0000-4000-8000-0000000000b1',
        status: 'ONLINE',
      })
    );
    expect(
      queryClient.getQueryData<{ pages: { items: { other: { onlineStatus: string } }[] }[] }>(
        meKeys.conversationList(uid)
      )?.pages[0]?.items[0]?.other.onlineStatus
    ).toBe('ONLINE');

    // A notification counts once, however often it is pushed.
    const notification = notificationFixture();
    await act(() => session.push('/user/queue/notifications', notification));
    await act(() => session.push('/user/queue/notifications', notification));
    expect(queryClient.getQueryData<{ count: number }>(meKeys.notificationUnread(uid))?.count).toBe(
      2
    );
    // A wishlist match makes the wishlist stale (match counts).
    expect(queryClient.getQueryState(meKeys.wishlistItems(uid))?.isInvalidated).toBe(true);

    // A reconnection re-reads the inbox.
    const before = api.callsTo('GET /api/v1/conversations').length;
    await act(() => session.drop());
    await act(async () => {
      rt.client.reconnectNow();
    });
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('connected'));
    expect(queryClient.getQueryState(meKeys.conversationList(uid))?.isInvalidated).toBe(true);
    expect(api.callsTo('GET /api/v1/conversations').length).toBeGreaterThanOrEqual(before);
  });
});
