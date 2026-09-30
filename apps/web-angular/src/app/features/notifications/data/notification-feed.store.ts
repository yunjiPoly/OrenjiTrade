import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  CursorPageNotificationResponse,
  NotificationResponse,
  NotificationsService,
} from '@orenji/api-client';
import { Subscription, firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { silentErrors } from '../../../core/http/http-context';
import {
  NotificationCenter,
  ReadChange,
} from '../../../core/notifications/notification-center.service';
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

/** Splits newest-first notifications into day sections (local time). Empty sections are left out. */
export function groupByDay(
  items: readonly NotificationResponse[],
  now: number = Date.now(),
): FeedGroup[] {
  const today = startOfDay(now);
  const labels = ['Today', 'Yesterday', 'Earlier this week', 'Older'];
  const groups: NotificationResponse[][] = [[], [], [], []];
  for (const item of items) {
    const created = Date.parse(item.createdAt);
    let index = 3;
    if (Number.isFinite(created)) {
      if (created >= today) {
        index = 0;
      } else if (created >= today - DAY_MS) {
        index = 1;
      } else if (created >= today - 6 * DAY_MS) {
        index = 2;
      }
    }
    groups[index].push(item);
  }
  return groups
    .map((group, index) => ({ label: labels[index], items: group }))
    .filter((group) => group.items.length > 0);
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
  private readonly destroyRef = inject(DestroyRef);

  private readonly itemsState = signal<NotificationResponse[]>([]);
  private readonly statusState = signal<FeedStatus>('loading');
  private readonly errorState = signal<ApiError | null>(null);
  private readonly hasMoreState = signal(false);
  private readonly loadingMoreState = signal(false);
  private readonly moreFailedState = signal(false);
  private readonly unreadOnlyState = signal(false);

  readonly items = this.itemsState.asReadonly();
  readonly status = this.statusState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly hasMore = this.hasMoreState.asReadonly();
  readonly loadingMore = this.loadingMoreState.asReadonly();
  readonly moreFailed = this.moreFailedState.asReadonly();
  readonly unreadOnly = this.unreadOnlyState.asReadonly();
  readonly groups = computed(() => groupByDay(this.itemsState()));

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
      .subscribe((notification) => this.prepend(notification));
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

  private request(): { limit: number; unreadOnly?: boolean } {
    return this.unreadOnlyState() ? { limit: FEED_PAGE, unreadOnly: true } : { limit: FEED_PAGE };
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
      this.itemsState.update((items) => items.filter((item) => !matches(item)));
      return;
    }
    this.itemsState.update((items) =>
      items.map((item) => (matches(item) ? { ...item, readAt: change.readAt } : item)),
    );
  }
}
