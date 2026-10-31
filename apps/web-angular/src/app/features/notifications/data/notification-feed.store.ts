import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  CursorPageNotificationResponse,
  ListNotificationsRequestParams,
  NotificationResponse,
  NotificationsService,
} from '@orenji/api-client';
import { Subscription, firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { silentErrors } from '../../../core/http/http-context';
import {
  EXCLUDED_NOTIFICATION_TYPES,
  NotificationCenter,
  ReadChange,
  bellShows,
} from '../../../core/notifications/notification-center.service';
import { ReminderAnswers } from '../../../core/notifications/reminder-answers.service';
import { RealtimeService } from '../../../core/realtime/realtime.service';

/** Notifications per page of `GET /notifications`. */
export const FEED_PAGE = 20;

export type FeedStatus = 'loading' | 'ready' | 'error';

/** A day section of the list ("Today", "Yesterday", "Earlier this week", "Older"). */
export interface FeedGroup {
  label: string;
  items: NotificationResponse[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(time: number): number {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

const MONTH = new Intl.DateTimeFormat('en-US', { month: 'long' });
const MONTH_YEAR = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });

/**
 * The day section of a notification (local time; board W24): "Today", "Yesterday", "Earlier this
 * week" (2 to 6 days), "Last week" (7 to 13 days), then its month ("September", with the year
 * when it is another year's).
 */
export function dayLabel(createdAt: string, now: number = Date.now()): string {
  const created = Date.parse(createdAt);
  if (!Number.isFinite(created)) {
    return 'Older';
  }
  const today = startOfDay(now);
  if (created >= today) {
    return 'Today';
  }
  if (created >= today - DAY_MS) {
    return 'Yesterday';
  }
  if (created >= today - 6 * DAY_MS) {
    return 'Earlier this week';
  }
  if (created >= today - 13 * DAY_MS) {
    return 'Last week';
  }
  const date = new Date(created);
  return date.getFullYear() === new Date(now).getFullYear()
    ? MONTH.format(date)
    : MONTH_YEAR.format(date);
}

/** Splits newest-first notifications into day sections, in order. Empty sections are left out. */
export function groupByDay(
  items: readonly NotificationResponse[],
  now: number = Date.now(),
): FeedGroup[] {
  const groups: FeedGroup[] = [];
  for (const item of items) {
    const label = dayLabel(item.createdAt, now);
    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      last.items.push(item);
    } else {
      const existing = groups.find((group) => group.label === label);
      if (existing) {
        existing.items.push(item);
      } else {
        groups.push({ label, items: [item] });
      }
    }
  }
  return groups;
}

/**
 * `/notifications`: the caller's notifications newest first with cursor pages
 * (`GET /notifications?cursor=&unreadOnly=`), live through the notification centre (pushed
 * notifications are prepended; reads made anywhere are applied; the unread view drops what
 * became read) and re-read after each realtime reconnection.
 *
 * Provided by the notifications page.
 */
@Injectable()
export class NotificationFeedStore {
  private readonly api = inject(NotificationsService);
  private readonly center = inject(NotificationCenter);
  private readonly realtime = inject(RealtimeService);
  private readonly answers = inject(ReminderAnswers);
  private readonly destroyRef = inject(DestroyRef);

  private readonly itemsState = signal<NotificationResponse[]>([]);
  private readonly statusState = signal<FeedStatus>('loading');
  private readonly errorState = signal<ApiError | null>(null);
  private readonly hasMoreState = signal(false);
  private readonly loadingMoreState = signal(false);
  private readonly moreFailedState = signal(false);
  private readonly unreadOnlyState = signal(false);
  /**
   * Reminders answered in place ("Still have them") while the unread view is on screen: marked
   * read, they stay until the next load, so the row says "Confirmed. They stay in search." and
   * keeps the focus (WE review R2-1, WCAG 2.4.3).
   */
  private readonly keptState = signal<ReadonlySet<string>>(new Set());

  readonly items = this.itemsState.asReadonly();
  readonly status = this.statusState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly hasMore = this.hasMoreState.asReadonly();
  readonly loadingMore = this.loadingMoreState.asReadonly();
  readonly moreFailed = this.moreFailedState.asReadonly();
  readonly unreadOnly = this.unreadOnlyState.asReadonly();
  readonly groups = computed(() => groupByDay(this.itemsState()));
  /**
   * The unread notifications shown ("New", board W24), with a reminder answered in the unread
   * view until the next load.
   */
  readonly fresh = computed(() => {
    const kept = this.keptState();
    return this.itemsState().filter((item) => !item.readAt || kept.has(item.id));
  });
  /** The read ones by day ("Earlier"). */
  readonly earlier = computed(() => groupByDay(this.itemsState().filter((item) => !!item.readAt)));

  private nextCursor: string | null = null;
  private loadSubscription: Subscription | null = null;
  private moreSubscription: Subscription | null = null;
  private started = false;
  /** Filter of the list on screen (`null` before the first load). */
  private filterLoaded: boolean | null = null;

  /** Realtime wiring; idempotent. The first load comes from {@link setFilter}. */
  init(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.center.pushed$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((notification) => bellShows(notification) && this.prepend(notification));
    this.center.readChanges$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((change) => this.applyRead(change));
    this.realtime.resync$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.refresh());
    this.destroyRef.onDestroy(() => {
      this.loadSubscription?.unsubscribe();
      this.moreSubscription?.unsubscribe();
    });
  }

  /** Shows every notification or the unread ones only (reloads when it changes). */
  setFilter(unreadOnly: boolean): void {
    if (unreadOnly === this.filterLoaded) {
      return;
    }
    this.filterLoaded = unreadOnly;
    this.unreadOnlyState.set(unreadOnly);
    this.load();
  }

  /** (Re)loads the first page, showing the skeleton. */
  load(): void {
    this.loadSubscription?.unsubscribe();
    this.moreSubscription?.unsubscribe();
    this.statusState.set('loading');
    this.errorState.set(null);
    this.moreFailedState.set(false);
    this.loadingMoreState.set(false);
    this.keptState.set(new Set());
    this.loadSubscription = this.api
      .listNotifications(this.request(), 'body', false, { context: silentErrors() })
      .subscribe({
        next: (page) => {
          this.itemsState.set(page.items ?? []);
          this.setCursor(page);
          this.statusState.set('ready');
        },
        error: (error: unknown) => {
          this.errorState.set(toApiError(error));
          this.statusState.set('error');
        },
      });
  }

  loadMore(): void {
    if (!this.nextCursor || this.loadingMoreState()) {
      return;
    }
    this.loadingMoreState.set(true);
    this.moreFailedState.set(false);
    this.moreSubscription = this.api
      .listNotifications({ ...this.request(), cursor: this.nextCursor }, 'body', false, {
        context: silentErrors(),
      })
      .subscribe({
        next: (page) => {
          const known = new Set(this.itemsState().map((item) => item.id));
          const added = (page.items ?? []).filter((item) => !known.has(item.id));
          this.itemsState.update((items) => [...items, ...added]);
          this.setCursor(page);
          this.loadingMoreState.set(false);
        },
        error: () => {
          this.loadingMoreState.set(false);
          this.moreFailedState.set(true);
        },
      });
  }

  /** Quietly re-reads the first page and merges it (pushes missed while offline). */
  async refresh(): Promise<void> {
    if (this.statusState() !== 'ready') {
      return;
    }
    try {
      const page = await firstValueFrom(
        this.api.listNotifications(this.request(), 'body', false, { context: silentErrors() }),
      );
      const fresh = page.items ?? [];
      const freshIds = new Set(fresh.map((item) => item.id));
      const oldest = fresh.at(-1)?.createdAt ?? '';
      // Keep the older pages already shown; the first page replaces what it covers.
      const older = this.itemsState().filter(
        (item) => !freshIds.has(item.id) && (!page.hasMore || item.createdAt < oldest),
      );
      this.itemsState.set(page.hasMore ? [...fresh, ...older] : fresh);
      if (!page.hasMore) {
        this.setCursor(page);
      }
    } catch {
      // Keep what is shown.
    }
  }

  /** Marks a notification read (the bell badge follows). */
  markRead(notification: NotificationResponse): Promise<void> {
    return this.center.markRead(notification);
  }

  /** Marks every notification read; resolves how many were unread. */
  markAllRead(): Promise<number> {
    return this.center.markAllRead();
  }

  private request(): ListNotificationsRequestParams {
    const base = { limit: FEED_PAGE, excludeTypes: EXCLUDED_NOTIFICATION_TYPES };
    return this.unreadOnlyState() ? { ...base, unreadOnly: true } : base;
  }

  private setCursor(page: CursorPageNotificationResponse): void {
    this.nextCursor = page.nextCursor ?? null;
    this.hasMoreState.set(!!page.hasMore && !!page.nextCursor);
  }

  private prepend(notification: NotificationResponse): void {
    if (this.statusState() !== 'ready') {
      return;
    }
    if (this.unreadOnlyState() && notification.readAt) {
      return;
    }
    this.itemsState.update((items) => [
      notification,
      ...items.filter((item) => item.id !== notification.id),
    ]);
  }

  private applyRead(change: ReadChange): void {
    const matches = (item: NotificationResponse) =>
      !item.readAt && (change.kind === 'all' || item.id === change.id);
    if (this.unreadOnlyState()) {
      // A reminder answered here stays, read, until the next load (WE review R2-1).
      const answered = change.kind === 'one' ? change.id : null;
      if (answered && answered === this.answers.confirming()) {
        this.keptState.update((kept) => new Set([...kept, answered]));
        this.itemsState.update((items) =>
          items.map((item) => (matches(item) ? { ...item, readAt: change.readAt } : item)),
        );
        return;
      }
      this.itemsState.update((items) => items.filter((item) => !matches(item)));
      return;
    }
    this.itemsState.update((items) =>
      items.map((item) => (matches(item) ? { ...item, readAt: change.readAt } : item)),
    );
  }
}
