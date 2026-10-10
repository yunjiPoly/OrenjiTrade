import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import {
  CursorPageNotificationResponse,
  NotificationResponse,
  NotificationResponseTypeEnum as Type,
  NotificationsService,
} from '@orenji/api-client';
import { Subject, of, throwError } from 'rxjs';
import {
  NotificationCenter,
  ReadChange,
} from '../../../core/notifications/notification-center.service';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { FEED_PAGE, NotificationFeedStore, groupByDay } from './notification-feed.store';

function notification(
  id: string,
  createdAt = '2026-09-30T10:00:00Z',
  readAt: string | null = null,
): NotificationResponse {
  return {
    id,
    type: Type.WishlistAlert,
    title: `Match ${id}`,
    body: 'Listed in your region',
    data: {},
    createdAt,
    readAt,
  };
}

async function flush(): Promise<void> {
  for (let index = 0; index < 5; index++) {
    await Promise.resolve();
  }
}

describe('groupByDay', () => {
  it('splits notifications into today, yesterday, this week and older (local time)', () => {
    const now = new Date(2026, 8, 30, 15, 0).getTime();
    const at = (day: number, hour: number) => new Date(2026, 8, day, hour).toISOString();
    const groups = groupByDay(
      [
        notification('a', at(30, 9)),
        notification('b', at(29, 23)),
        notification('c', at(26, 8)),
        notification('d', at(10, 8)),
        notification('e', 'not a date'),
      ],
      now,
    );
    expect(groups.map((group) => [group.label, group.items.map((item) => item.id)])).toEqual([
      ['Today', ['a']],
      ['Yesterday', ['b']],
      ['Earlier this week', ['c']],
      ['Older', ['d', 'e']],
    ]);
    expect(groupByDay([], now)).toEqual([]);
  });
});

describe('NotificationFeedStore', () => {
  let store: NotificationFeedStore;
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let pages: CursorPageNotificationResponse[];
  let pushed$: Subject<NotificationResponse>;
  let readChanges$: Subject<ReadChange>;
  let resync$: Subject<void>;
  let center: Record<string, unknown>;

  beforeEach(() => {
    pages = [
      {
        items: [notification('a'), notification('b', undefined, 'yesterday')],
        nextCursor: 'next',
        hasMore: true,
      },
    ];
    api = { listNotifications: vi.fn(() => of(pages.shift() ?? { items: [], hasMore: false })) };
    pushed$ = new Subject();
    readChanges$ = new Subject();
    resync$ = new Subject();
    center = {
      pushed$,
      readChanges$,
      markRead: vi.fn(async () => undefined),
      markAllRead: vi.fn(async () => 1),
    };
    TestBed.configureTestingModule({
      providers: [
        NotificationFeedStore,
        { provide: NotificationsService, useValue: api },
        { provide: NotificationCenter, useValue: center },
        { provide: RealtimeService, useValue: { resync$ } },
      ],
    });
    store = TestBed.inject(NotificationFeedStore);
    store.init();
  });

  it('loads all notifications, then only the unread ones when the filter changes', () => {
    store.setFilter(false);
    expect(api['listNotifications']).toHaveBeenCalledWith(
      { limit: FEED_PAGE },
      'body',
      false,
      expect.anything(),
    );
    expect(store.items().map((item) => item.id)).toEqual(['a', 'b']);
    store.setFilter(false);
    expect(api['listNotifications']).toHaveBeenCalledTimes(1);

    pages.push({ items: [notification('a')], hasMore: false });
    store.setFilter(true);
    expect(api['listNotifications']).toHaveBeenLastCalledWith(
      { limit: FEED_PAGE, unreadOnly: true },
      'body',
      false,
      expect.anything(),
    );
    expect(store.unreadOnly()).toBe(true);
    expect(store.hasMore()).toBe(false);
  });

  it('pages with the cursor and reports a failed page', () => {
    store.setFilter(false);
    pages.push({ items: [notification('c', '2026-09-20T10:00:00Z')], hasMore: false });
    store.loadMore();
    expect(api['listNotifications']).toHaveBeenLastCalledWith(
      { limit: FEED_PAGE, cursor: 'next' },
      'body',
      false,
      expect.anything(),
    );
    expect(store.items().map((item) => item.id)).toEqual(['a', 'b', 'c']);

    api['listNotifications'].mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 500 })),
    );
    store.load();
    expect(store.status()).toBe('error');
  });

  it('prepends pushed notifications and applies reads made elsewhere', () => {
    store.setFilter(false);
    pushed$.next(notification('new'));
    expect(store.items().map((item) => item.id)).toEqual(['new', 'a', 'b']);
    readChanges$.next({ kind: 'one', id: 'a', readAt: 'now' });
    expect(store.items().find((item) => item.id === 'a')?.readAt).toBe('now');
    readChanges$.next({ kind: 'all', readAt: 'later' });
    expect(store.items().every((item) => !!item.readAt)).toBe(true);
    expect(store.items().find((item) => item.id === 'b')?.readAt).toBe('yesterday');
  });

  it('drops what became read from the unread view', () => {
    pages = [{ items: [notification('a'), notification('c')], hasMore: false }];
    store.setFilter(true);
    pushed$.next(notification('read', undefined, 'already'));
    expect(store.items().map((item) => item.id)).toEqual(['a', 'c']);
    readChanges$.next({ kind: 'one', id: 'a', readAt: 'now' });
    expect(store.items().map((item) => item.id)).toEqual(['c']);
    readChanges$.next({ kind: 'all', readAt: 'now' });
    expect(store.items()).toEqual([]);
  });

  it('merges the first page again after a reconnection', async () => {
    pages = [{ items: [notification('a'), notification('b')], hasMore: false }];
    store.setFilter(false);
    pages.push({ items: [notification('missed'), notification('a')], hasMore: false });
    resync$.next();
    await flush();
    expect(store.items().map((item) => item.id)).toEqual(['missed', 'a']);
  });

  it('delegates reads to the notification centre', async () => {
    await store.markRead(notification('a'));
    expect(center['markRead']).toHaveBeenCalled();
    expect(await store.markAllRead()).toBe(1);
  });
});
