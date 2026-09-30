import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  NotificationResponse,
  NotificationResponseTypeEnum as Type,
  NotificationsService,
} from '@orenji/api-client';
import { Subject, of, throwError } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { SessionService } from '../auth/session.service';
import { ReadReceiptNotice } from '../realtime/realtime-events';
import { RealtimeService } from '../realtime/realtime.service';
import {
  NotificationCenter,
  RECEIPT_REFRESH_MS,
  RECENT_NOTIFICATIONS,
  ReadChange,
} from './notification-center.service';

function notification(
  id: string,
  overrides: Partial<NotificationResponse> = {},
): NotificationResponse {
  return {
    id,
    type: Type.WishlistMatch,
    title: `Wishlist match ${id}`,
    body: 'Emberfang Fox PFT-002 was listed ~1-5 km away.',
    data: { deepLink: `/wishlist/w-${id}` },
    createdAt: '2026-09-30T10:00:00Z',
    readAt: null,
    ...overrides,
  };
}

describe('NotificationCenter', () => {
  let center: NotificationCenter;
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let realtime: {
    notifications$: Subject<NotificationResponse>;
    resync$: Subject<void>;
    receipts$: Subject<ReadReceiptNotice>;
  };
  const status = signal('anonymous');
  const user = signal<{ uid: string } | null>(null);
  const me = signal<{ id: string } | null>(null);
  let count: number;

  beforeEach(() => {
    count = 2;
    api = {
      getUnreadNotificationCount: vi.fn(() => of({ count })),
      listNotifications: vi.fn(() =>
        of({ items: [notification('a'), notification('b', { readAt: '2026-09-30T09:00:00Z' })] }),
      ),
      markNotificationRead: vi.fn(({ id }) => of(notification(id, { readAt: 'now' }))),
      markAllNotificationsRead: vi.fn(() => of({ updated: 2 })),
    };
    realtime = { notifications$: new Subject(), resync$: new Subject(), receipts$: new Subject() };
    TestBed.configureTestingModule({
      providers: [
        { provide: NotificationsService, useValue: api },
        { provide: RealtimeService, useValue: realtime },
        { provide: SessionService, useValue: { status, me } },
        { provide: AuthService, useValue: { user } },
      ],
    });
    center = TestBed.inject(NotificationCenter);
    center.start();
  });

  afterEach(() => {
    status.set('anonymous');
    user.set(null);
    me.set(null);
    vi.useRealTimers();
  });

  /** Lets pending promise chains (firstValueFrom of synchronous fakes) settle. */
  async function flush(): Promise<void> {
    for (let index = 0; index < 5; index++) {
      await Promise.resolve();
    }
  }

  async function signIn(uid = 'uid-a'): Promise<void> {
    me.set({ id: `user-${uid}` });
    user.set({ uid });
    status.set('ready');
    TestBed.tick();
    await flush();
  }

  it('stays idle while nobody is signed in', () => {
    TestBed.tick();
    expect(center.active()).toBe(false);
    expect(center.unreadCount()).toBe(0);
    expect(api['getUnreadNotificationCount']).not.toHaveBeenCalled();
  });

  it('reads the unread count when a ready account signs in and resets on sign-out', async () => {
    await signIn();
    expect(center.active()).toBe(true);
    expect(center.unreadCount()).toBe(2);

    status.set('anonymous');
    user.set(null);
    TestBed.tick();
    expect(center.active()).toBe(false);
    expect(center.unreadCount()).toBe(0);
  });

  it('counts each pushed notification once and puts it on top of the menu', async () => {
    await signIn();
    await center.loadRecent();
    expect(center.recent()?.map((item) => item.id)).toEqual(['a', 'b']);

    const pushed: string[] = [];
    center.pushed$.subscribe((item) => pushed.push(item.id));
    realtime.notifications$.next(notification('c'));
    realtime.notifications$.next(notification('c'));
    realtime.notifications$.next(notification('a'));
    expect(center.unreadCount()).toBe(3);
    expect(pushed).toEqual(['c']);
    expect(center.recent()?.map((item) => item.id)).toEqual(['c', 'a', 'b']);
    expect(center.lastPush()?.id).toBe('c');
  });

  it('keeps the menu to the latest notifications', async () => {
    await signIn();
    await center.loadRecent();
    for (let index = 0; index < RECENT_NOTIFICATIONS + 3; index++) {
      realtime.notifications$.next(notification(`n${index}`));
    }
    expect(center.recent()).toHaveLength(RECENT_NOTIFICATIONS);
    expect(center.recent()?.[0].id).toBe(`n${RECENT_NOTIFICATIONS + 2}`);
  });

  it('marks one notification read optimistically and tells the lists', async () => {
    await signIn();
    await center.loadRecent();
    const changes: ReadChange[] = [];
    center.readChanges$.subscribe((change) => changes.push(change));

    await center.markRead(center.recent()![0]);
    expect(api['markNotificationRead']).toHaveBeenCalledWith({ id: 'a' }, 'body', false, {
      context: expect.anything(),
    });
    expect(center.unreadCount()).toBe(1);
    expect(center.recent()?.[0].readAt).toBeTruthy();
    expect(changes).toEqual([expect.objectContaining({ kind: 'one', id: 'a' })]);

    await center.markRead(center.recent()![1]);
    expect(api['markNotificationRead']).toHaveBeenCalledTimes(1);
  });

  it('re-reads the count when marking read fails', async () => {
    await signIn();
    api['markNotificationRead'].mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 500 })),
    );
    count = 5;
    await center.markRead(notification('a'));
    await flush();
    expect(center.unreadCount()).toBe(5);
  });

  it('marks everything read', async () => {
    await signIn();
    await center.loadRecent();
    const changes: ReadChange[] = [];
    center.readChanges$.subscribe((change) => changes.push(change));
    expect(await center.markAllRead()).toBe(2);
    expect(center.unreadCount()).toBe(0);
    expect(center.recent()?.every((item) => !!item.readAt)).toBe(true);
    expect(changes).toEqual([expect.objectContaining({ kind: 'all' })]);
  });

  it('re-reads after a reconnection and after the caller read a conversation', async () => {
    vi.useFakeTimers();
    await signIn();
    await center.loadRecent();
    api['getUnreadNotificationCount'].mockClear();
    api['listNotifications'].mockClear();

    count = 4;
    realtime.resync$.next();
    await vi.advanceTimersByTimeAsync(0);
    expect(center.unreadCount()).toBe(4);
    expect(api['listNotifications']).toHaveBeenCalledTimes(1);

    count = 3;
    realtime.receipts$.next({
      conversationId: 'c1',
      userId: 'someone-else',
      lastReadMessageId: 'm1',
      readAt: 'now',
    });
    await vi.advanceTimersByTimeAsync(RECEIPT_REFRESH_MS + 10);
    expect(center.unreadCount()).toBe(4);

    realtime.receipts$.next({
      conversationId: 'c1',
      userId: 'user-uid-a',
      lastReadMessageId: 'm1',
      readAt: 'now',
    });
    await vi.advanceTimersByTimeAsync(RECEIPT_REFRESH_MS + 10);
    expect(center.unreadCount()).toBe(3);
  });

  it('reports a menu that could not load', async () => {
    await signIn();
    api['listNotifications'].mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 0 })),
    );
    await center.loadRecent();
    expect(center.recentStatus()).toBe('error');
    expect(center.recent()).toBeNull();
  });
});
