import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
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
import { ReminderAnswers } from '../../../core/notifications/reminder-answers.service';
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
  it('splits notifications into today, yesterday, this week, last week and months (board W24)', () => {
    const now = new Date(2026, 8, 30, 15, 0).getTime();
    const at = (month: number, day: number, hour: number) =>
      new Date(2026, month, day, hour).toISOString();
    const groups = groupByDay(
      [
        notification('a', at(8, 30, 9)),
        notification('b', at(8, 29, 23)),
        notification('c', at(8, 26, 8)),
        notification('d', at(8, 20, 8)),
        notification('e', at(7, 10, 8)),
        notification('f', new Date(2025, 11, 2, 8).toISOString()),
        notification('g', 'not a date'),
      ],
      now,
    );
    expect(groups.map((group) => [group.label, group.items.map((item) => item.id)])).toEqual([
      ['Today', ['a']],
      ['Yesterday', ['b']],
      ['Earlier this week', ['c']],
      ['Last week', ['d']],
      ['August', ['e']],
      ['December 2025', ['f']],
      ['Older', ['g']],
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
  let confirming: ReturnType<typeof signal<string | null>>;

  beforeEach(() => {
    confirming = signal<string | null>(null);
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
        { provide: ReminderAnswers, useValue: { confirming } },
      ],
    });
    store = TestBed.inject(NotificationFeedStore);
    store.init();
  });

  it('loads all notifications, then only the unread ones when the filter changes', () => {
    store.setFilter(false);
    expect(api['listNotifications']).toHaveBeenCalledWith(
      { limit: FEED_PAGE, excludeTypes: ['MESSAGE'] },
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
      { limit: FEED_PAGE, excludeTypes: ['MESSAGE'], unreadOnly: true },
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
      { limit: FEED_PAGE, excludeTypes: ['MESSAGE'], cursor: 'next' },
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

  it('never prepends a pushed chat notice: chats are in Messages (spec 12, R9); a wishlist alert is', () => {
    store.setFilter(false);
    pushed$.next({ ...notification('chat'), type: Type.Message, title: 'New message from maya_k' });
    expect(store.items().map((item) => item.id)).toEqual(['a', 'b']);
    pushed$.next(notification('alert'));
    expect(store.items().map((item) => item.id)).toEqual(['alert', 'a', 'b']);
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

  it('keeps a reminder answered in the unread view, read, until the next load (WE review R2-1)', () => {
    pages = [{ items: [notification('reminder'), notification('c')], hasMore: false }];
    store.setFilter(true);
    // "Still have them" marks the reminder read while it is being confirmed.
    confirming.set('reminder');
    readChanges$.next({ kind: 'one', id: 'reminder', readAt: 'now' });
    confirming.set(null);
    expect(store.items().map((item) => item.id)).toEqual(['reminder', 'c']);
    expect(store.fresh().map((item) => item.id)).toEqual(['reminder', 'c']);
    expect(store.fresh()[0].readAt).toBe('now');
    // Another read (not an answer) still leaves the view.
    readChanges$.next({ kind: 'one', id: 'c', readAt: 'now' });
    expect(store.fresh().map((item) => item.id)).toEqual(['reminder']);
    // The next load forgets it: the server answers unread ones only.
    pages.push({ items: [], hasMore: false });
    store.load();
    expect(store.fresh()).toEqual([]);
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
