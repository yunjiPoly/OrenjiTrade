import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { MessageResponse, NotificationResponse } from '@orenji/api-client';
import { AuthService } from '../auth/auth.service';
import { SessionService } from '../auth/session.service';
import { DEFAULT_APP_CONFIG } from '../config/app-config.model';
import { AppConfigService } from '../config/app-config.service';
import { ReadReceiptNotice } from './realtime-events';
import {
  RealtimeService,
  STOMP_CONNECTOR,
  StompConnector,
  realtimeUrl,
  reconnectDelay,
} from './realtime.service';
import type { StompConnectOptions, StompSession } from './stomp-connection';
import type { StompFrame } from './stomp-frames';

class FakeSession implements StompSession {
  readonly handlers = new Map<string, (frame: StompFrame) => void>();
  readonly sent: { destination: string; body: string }[] = [];
  closed = false;

  constructor(readonly options: StompConnectOptions) {}

  subscribe(destination: string, handler: (frame: StompFrame) => void): () => void {
    this.handlers.set(destination, handler);
    return () => this.handlers.delete(destination);
  }

  send(destination: string, body: string): void {
    this.sent.push({ destination, body });
  }

  close(): void {
    this.closed = true;
  }

  push(destination: string, payload: unknown): void {
    this.handlers.get(destination)?.({
      command: 'MESSAGE',
      headers: {},
      body: JSON.stringify(payload),
    });
  }

  drop(): void {
    this.options.onClose({ code: 1006, reason: 'closed', connected: true });
  }
}

describe('RealtimeService', () => {
  let service: RealtimeService;
  let sessions: FakeSession[];
  let failNext: number;
  let getIdToken: ReturnType<typeof vi.fn>;
  const status = signal<string>('anonymous');
  const user = signal<{ uid: string } | null>(null);

  beforeEach(() => {
    vi.useFakeTimers();
    sessions = [];
    failNext = 0;
    getIdToken = vi.fn(async () => 'id-token/with+chars');
    const connector: StompConnector = {
      connect: async (options) => {
        if (failNext > 0) {
          failNext--;
          throw new Error('handshake refused');
        }
        const session = new FakeSession(options);
        sessions.push(session);
        return session;
      },
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: STOMP_CONNECTOR, useValue: connector },
        { provide: AuthService, useValue: { getIdToken, user } },
        { provide: SessionService, useValue: { status } },
        {
          provide: AppConfigService,
          useValue: { config: signal({ ...DEFAULT_APP_CONFIG, wsBaseUrl: 'ws://api.test/ws' }) },
        },
      ],
    });
    service = TestBed.inject(RealtimeService);
  });

  afterEach(() => {
    status.set('anonymous');
    user.set(null);
    vi.useRealTimers();
  });

  it('builds the socket URL with the encoded token, deriving it from the API origin if needed', () => {
    expect(realtimeUrl({ wsBaseUrl: 'ws://api.test/ws', apiBaseUrl: '' }, 'a+b/c')).toBe(
      'ws://api.test/ws?access_token=a%2Bb%2Fc',
    );
    expect(realtimeUrl({ wsBaseUrl: '', apiBaseUrl: 'https://api.orenjitrade.com/' }, 't')).toBe(
      'wss://api.orenjitrade.com/ws?access_token=t',
    );
    expect(realtimeUrl({ wsBaseUrl: '', apiBaseUrl: '' }, 't', 'http://localhost:4200')).toBe(
      'ws://localhost:4200/ws?access_token=t',
    );
  });

  it('backs off exponentially with jitter up to 30 seconds', () => {
    const mid = () => 0.5;
    expect([1, 2, 3, 4, 5, 6, 7].map((attempt) => reconnectDelay(attempt, mid))).toEqual([
      1000, 2000, 4000, 8000, 16000, 30000, 30000,
    ]);
    expect(reconnectDelay(1, () => 0)).toBe(800);
    expect(reconnectDelay(1, () => 1)).toBe(1200);
  });

  it('connects for a ready session, subscribes to the own queues and relays pushes', async () => {
    service.start();
    TestBed.tick();
    expect(service.state()).toBe('disabled');

    user.set({ uid: 'uid-a' });
    status.set('ready');
    TestBed.tick();
    expect(service.state()).toBe('connecting');
    await vi.advanceTimersByTimeAsync(0);
    expect(service.state()).toBe('connected');
    const session = sessions[0];
    expect(session.options.url).toBe('ws://api.test/ws?access_token=id-token%2Fwith%2Bchars');
    expect([...session.handlers.keys()].sort()).toEqual([
      '/user/queue/messages',
      '/user/queue/notifications',
      '/user/queue/presence',
      '/user/queue/receipts',
      '/user/queue/typing',
    ]);

    const messages: MessageResponse[] = [];
    const receipts: ReadReceiptNotice[] = [];
    service.messages$.subscribe((message) => messages.push(message));
    service.receipts$.subscribe((receipt) => receipts.push(receipt));
    session.push('/user/queue/messages', { id: 'm1', conversationId: 'c1', kind: 'TEXT' });
    session.push('/user/queue/messages', { nonsense: true });
    session.push('/user/queue/receipts', {
      conversationId: 'c1',
      userId: 'u2',
      lastReadMessageId: 'm1',
      readAt: '2026-09-29T12:00:00Z',
    });
    expect(messages.map((message) => message.id)).toEqual(['m1']);
    expect(receipts).toHaveLength(1);

    const notifications: NotificationResponse[] = [];
    service.notifications$.subscribe((notification) => notifications.push(notification));
    session.push('/user/queue/notifications', {
      id: 'n1',
      type: 'WISHLIST_MATCH',
      title: 'Wishlist match: Emberfang Fox',
      body: 'Emberfang Fox was listed by @collector5 in California, United States.',
      data: { deepLink: '/wishlist/w1' },
      createdAt: '2026-09-30T12:00:00Z',
      readAt: null,
    });
    session.push('/user/queue/notifications', { id: 'n2', type: 'SYSTEM' });
    expect(notifications.map((notification) => notification.id)).toEqual(['n1']);

    service.sendTyping('c1');
    expect(session.sent).toEqual([{ destination: '/app/typing', body: '{"conversationId":"c1"}' }]);

    status.set('anonymous');
    user.set(null);
    TestBed.tick();
    expect(session.closed).toBe(true);
    expect(service.state()).toBe('disabled');
  });

  it('reconnects with backoff, refreshes the token after a failed handshake and asks to resync', async () => {
    let resyncs = 0;
    service.resync$.subscribe(() => resyncs++);
    service.follow('uid-a');
    await vi.advanceTimersByTimeAsync(0);
    expect(resyncs).toBe(1);

    failNext = 1;
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    sessions[0].drop();
    expect(service.state()).toBe('reconnecting');
    await vi.advanceTimersByTimeAsync(1000); // attempt 1 fails (refused handshake)
    expect(service.state()).toBe('reconnecting');
    expect(getIdToken).toHaveBeenLastCalledWith(false);
    await vi.advanceTimersByTimeAsync(1999);
    expect(sessions).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1); // attempt 2 after 2 s, with a fresh token
    expect(getIdToken).toHaveBeenLastCalledWith(true);
    expect(sessions).toHaveLength(2);
    expect(service.state()).toBe('connected');
    expect(resyncs).toBe(2);
  });

  it('skips the wait when the browser comes back online', async () => {
    user.set({ uid: 'uid-a' });
    status.set('ready');
    service.start();
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(0);
    expect(service.state()).toBe('connected');
    sessions[0].drop();
    expect(service.state()).toBe('reconnecting');
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    expect(service.state()).toBe('connected');
    expect(sessions).toHaveLength(2);
  });

  it('switches accounts cleanly', async () => {
    service.follow('uid-a');
    await vi.advanceTimersByTimeAsync(0);
    service.follow('uid-b');
    await vi.advanceTimersByTimeAsync(0);
    expect(sessions[0].closed).toBe(true);
    expect(sessions).toHaveLength(2);
    expect(service.state()).toBe('connected');
  });
});
