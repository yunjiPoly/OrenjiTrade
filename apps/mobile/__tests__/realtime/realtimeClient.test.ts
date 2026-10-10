import type { MessageResponse, NotificationResponse } from '@/src/api/types';
import {
  realtimeEndpoint,
  reconnectDelay,
  type RealtimeState,
} from '@/src/realtime/realtimeClient';
import type { ReadReceiptNotice } from '@/src/realtime/realtimeEvents';

import { fakeRealtime, type FakeRealtime } from '../support/realtime';

describe('realtimeEndpoint', () => {
  it('sends the ID token in the handshake header on native, never in the URL', () => {
    expect(realtimeEndpoint('http://10.0.2.2:8090/', 'a+b/c', 'android')).toEqual({
      url: 'ws://10.0.2.2:8090/ws',
      headers: { Authorization: 'Bearer a+b/c' },
    });
    expect(realtimeEndpoint('https://api.orenjitrade.com', 't', 'ios')).toEqual({
      url: 'wss://api.orenjitrade.com/ws',
      headers: { Authorization: 'Bearer t' },
    });
  });

  it('passes it as an encoded access_token on web (browsers cannot set WebSocket headers)', () => {
    expect(realtimeEndpoint('http://localhost:8090', 'a+b/c', 'web')).toEqual({
      url: 'ws://localhost:8090/ws?access_token=a%2Bb%2Fc',
    });
  });
});

describe('reconnectDelay', () => {
  it('backs off exponentially with jitter up to 30 seconds', () => {
    const mid = () => 0.5;
    expect([1, 2, 3, 4, 5, 6, 7].map((attempt) => reconnectDelay(attempt, mid))).toEqual([
      1000, 2000, 4000, 8000, 16000, 30000, 30000,
    ]);
    expect(reconnectDelay(1, () => 0)).toBe(800);
    expect(reconnectDelay(1, () => 1)).toBe(1200);
  });
});

describe('RealtimeClient', () => {
  let rt: FakeRealtime;
  let states: RealtimeState[];

  beforeEach(() => {
    jest.useFakeTimers();
    rt = fakeRealtime();
    states = [];
    rt.client.on('state', (state) => states.push(state));
  });

  afterEach(() => {
    rt.client.dispose();
    jest.useRealTimers();
  });

  it('connects for an account, subscribes to the own queues only and relays valid pushes', async () => {
    expect(rt.client.state).toBe('disabled');
    rt.client.follow('uid-a');
    expect(rt.client.state).toBe('connecting');
    await jest.advanceTimersByTimeAsync(0);
    expect(rt.client.state).toBe('connected');
    const session = rt.current();
    expect(session.options.url).toBe('ws://10.0.2.2:8090/ws');
    expect(session.options.handshakeHeaders).toEqual({
      Authorization: 'Bearer id-token/with+chars',
    });
    expect([...session.handlers.keys()].sort()).toEqual([
      '/user/queue/messages',
      '/user/queue/notifications',
      '/user/queue/presence',
      '/user/queue/receipts',
      '/user/queue/typing',
    ]);

    const messages: MessageResponse[] = [];
    const receipts: ReadReceiptNotice[] = [];
    const notifications: NotificationResponse[] = [];
    rt.client.on('message', (message) => messages.push(message));
    rt.client.on('receipt', (receipt) => receipts.push(receipt));
    rt.client.on('notification', (notification) => notifications.push(notification));
    session.push('/user/queue/messages', {
      id: 'm1',
      conversationId: 'c1',
      kind: 'TEXT',
      createdAt: '2026-10-05T12:00:00Z',
    });
    session.push('/user/queue/messages', { nonsense: true });
    session.push('/user/queue/receipts', {
      conversationId: 'c1',
      userId: 'u2',
      lastReadMessageId: 'm1',
      readAt: '2026-10-05T12:00:00Z',
    });
    session.push('/user/queue/notifications', {
      id: 'n1',
      type: 'WISHLIST_ALERT',
      title: 'Wishlist alert: Emberfang Fox',
      body: 'Emberfang Fox PFT-002 Common was just listed by @collector5 in California, United States.',
      data: { deepLink: '/cards/c1' },
      createdAt: '2026-10-05T12:00:00Z',
      readAt: null,
    });
    session.push('/user/queue/notifications', { id: 'n2', type: 'SYSTEM' });
    // Malformed JSON is ignored.
    session.handlers.get('/user/queue/typing')?.({ command: 'MESSAGE', headers: {}, body: '{' });
    expect(messages.map((message) => message.id)).toEqual(['m1']);
    expect(receipts).toHaveLength(1);
    expect(notifications.map((notification) => notification.id)).toEqual(['n1']);

    rt.client.sendTyping('c1');
    expect(session.sent).toEqual([{ destination: '/app/typing', body: '{"conversationId":"c1"}' }]);

    rt.client.follow(null);
    expect(session.closed).toBe(true);
    expect(rt.client.state).toBe('disabled');
    expect(states).toEqual(['connecting', 'connected', 'disabled']);
  });

  it('reconnects with backoff, refreshes the token after a failed handshake and asks to resync', async () => {
    let resyncs = 0;
    rt.client.on('resync', () => resyncs++);
    rt.client.follow('uid-a');
    await jest.advanceTimersByTimeAsync(0);
    expect(resyncs).toBe(1);

    rt.failNext(1);
    rt.current().drop();
    expect(rt.client.state).toBe('reconnecting');
    await jest.advanceTimersByTimeAsync(1000); // attempt 1 fails (refused handshake)
    expect(rt.client.state).toBe('reconnecting');
    expect(rt.tokenSource).toHaveBeenLastCalledWith(false);
    await jest.advanceTimersByTimeAsync(1999);
    expect(rt.sessions).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(1); // attempt 2 after 2 s, with a fresh token
    expect(rt.tokenSource).toHaveBeenLastCalledWith(true);
    expect(rt.sessions).toHaveLength(2);
    expect(rt.client.state).toBe('connected');
    expect(resyncs).toBe(2);
  });

  it('waits and tries again when no token is available', async () => {
    rt.tokenSource.mockResolvedValueOnce(null);
    rt.client.follow('uid-a');
    await jest.advanceTimersByTimeAsync(0);
    expect(rt.client.state).toBe('reconnecting');
    expect(rt.sessions).toHaveLength(0);
    await jest.advanceTimersByTimeAsync(1000);
    expect(rt.client.state).toBe('connected');
  });

  it('skips the wait when the network comes back', async () => {
    rt.client.follow('uid-a');
    await jest.advanceTimersByTimeAsync(0);
    rt.current().drop();
    expect(rt.client.state).toBe('reconnecting');
    rt.client.reconnectNow();
    await jest.advanceTimersByTimeAsync(0);
    expect(rt.client.state).toBe('connected');
    expect(rt.sessions).toHaveLength(2);
    // Connected: nothing to skip.
    rt.client.reconnectNow();
    await jest.advanceTimersByTimeAsync(0);
    expect(rt.sessions).toHaveLength(2);
  });

  it('closes in the background and reconnects (then resyncs) in the foreground', async () => {
    let resyncs = 0;
    rt.client.on('resync', () => resyncs++);
    rt.client.follow('uid-a');
    await jest.advanceTimersByTimeAsync(0);
    const first = rt.current();

    rt.client.pause();
    expect(first.closed).toBe(true);
    expect(rt.client.state).toBe('paused');
    // No retry while paused, even if the network flaps.
    rt.client.reconnectNow();
    await jest.advanceTimersByTimeAsync(60_000);
    expect(rt.sessions).toHaveLength(1);

    rt.client.resume();
    expect(rt.client.state).toBe('connecting');
    await jest.advanceTimersByTimeAsync(0);
    expect(rt.client.state).toBe('connected');
    expect(rt.sessions).toHaveLength(2);
    expect(resyncs).toBe(2);
  });

  it('stays paused when an account signs in while the app is in the background', async () => {
    rt.client.pause();
    rt.client.follow('uid-a');
    expect(rt.client.state).toBe('paused');
    await jest.advanceTimersByTimeAsync(0);
    expect(rt.sessions).toHaveLength(0);
    rt.client.resume();
    await jest.advanceTimersByTimeAsync(0);
    expect(rt.client.state).toBe('connected');
  });

  it('switches accounts cleanly', async () => {
    rt.client.follow('uid-a');
    await jest.advanceTimersByTimeAsync(0);
    rt.client.follow('uid-b');
    await jest.advanceTimersByTimeAsync(0);
    expect(rt.sessions[0]?.closed).toBe(true);
    expect(rt.sessions).toHaveLength(2);
    expect(rt.client.state).toBe('connected');
  });

  it('drops an attempt overtaken by a switch before it opened anything', async () => {
    rt.client.follow('uid-a');
    rt.client.follow('uid-b');
    await jest.advanceTimersByTimeAsync(0);
    expect(rt.sessions).toHaveLength(1);
    expect(rt.client.state).toBe('connected');
  });

  it('keeps calling the other listeners when one throws', async () => {
    const seen: string[] = [];
    rt.client.on('message', () => {
      throw new Error('boom');
    });
    rt.client.on('message', (message) => seen.push(message.id));
    rt.client.follow('uid-a');
    await jest.advanceTimersByTimeAsync(0);
    rt.current().push('/user/queue/messages', {
      id: 'm9',
      conversationId: 'c1',
      kind: 'TEXT',
      createdAt: '2026-10-05T12:00:00Z',
    });
    expect(seen).toEqual(['m9']);
  });
});
