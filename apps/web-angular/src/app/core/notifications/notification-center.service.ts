import {
  DestroyRef,
  EnvironmentProviders,
  Injectable,
  Injector,
  effect,
  inject,
  makeEnvironmentProviders,
  provideAppInitializer,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NotificationResponse, NotificationsService } from '@orenji/api-client';
import { Observable, Subject, firstValueFrom } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { SessionService } from '../auth/session.service';
import { silentErrors } from '../http/http-context';
import { RealtimeService } from '../realtime/realtime.service';

/** Notifications shown in the top-bar menu. */
export const RECENT_NOTIFICATIONS = 8;
/** Pause before re-reading the unread count after the caller read a conversation. */
export const RECEIPT_REFRESH_MS = 800;

export type RecentStatus = 'idle' | 'loading' | 'ready' | 'error';

/** A notification (or all of them) became read; lists showing notifications apply it. */
export type ReadChange =
  { kind: 'one'; id: string; readAt: string } | { kind: 'all'; readAt: string };

/**
 * The notification centre of the signed-in collector (Phase 6): the unread count behind the
 * top-bar bell (`GET /notifications/unread-count`), the latest notifications for the bell menu
 * (`GET /notifications`), mark read (`POST /notifications/{id}/read`) and mark all read
 * (`POST /notifications/read-all`).
 *
 * Kept live by the realtime channel: every push on `/user/queue/notifications` (a
 * `NotificationResponse`) raises the count once and is re-emitted on {@link pushed$} so pages can
 * refresh what it concerns (a wishlist match). Pushes lost while the socket was down are covered
 * by re-reading after each (re)connection; the caller's own read receipts re-read the count
 * because reading a conversation marks its MESSAGE notifications read on the server.
 *
 * Follows the session like `RealtimeService`: active while a collector with a ready account is
 * signed in, reset on sign-out or when another account signs in.
 */
@Injectable({ providedIn: 'root' })
export class NotificationCenter {
  private readonly api = inject(NotificationsService);
  private readonly realtime = inject(RealtimeService);
  private readonly session = inject(SessionService);
  private readonly auth = inject(AuthService);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);

  private readonly unreadState = signal(0);
  private readonly recentState = signal<NotificationResponse[] | null>(null);
  private readonly recentStatusState = signal<RecentStatus>('idle');
  private readonly activeState = signal(false);
  private readonly lastPushState = signal<NotificationResponse | null>(null);
  private readonly pushedSubject = new Subject<NotificationResponse>();
  private readonly readSubject = new Subject<ReadChange>();

  /** Unread notifications of the caller (badge). */
  readonly unreadCount = this.unreadState.asReadonly();
  /** The latest notifications (menu); `null` until first loaded. */
  readonly recent = this.recentState.asReadonly();
  readonly recentStatus = this.recentStatusState.asReadonly();
  /** A collector with a ready account is signed in. */
  readonly active = this.activeState.asReadonly();
  /** The most recent pushed notification (screen-reader announcement). */
  readonly lastPush = this.lastPushState.asReadonly();
  /** Every new notification pushed over the realtime channel (once per notification). */
  readonly pushed$: Observable<NotificationResponse> = this.pushedSubject.asObservable();
  /** Notifications marked read from anywhere in the app. */
  readonly readChanges$: Observable<ReadChange> = this.readSubject.asObservable();

  private uid: string | null = null;
  private generation = 0;
  private started = false;
  /** Ids already counted (a push repeated by a reconnection is counted once). */
  private readonly seen = new Set<string>();
  private receiptTimer: ReturnType<typeof setTimeout> | null = null;

  /** Follows the session from now on (called once by {@link provideNotifications}). */
  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    effect(
      () => {
        const ready = this.session.status() === 'ready';
        const uid = this.auth.user()?.uid ?? null;
        untracked(() => this.follow(ready ? uid : null));
      },
      { injector: this.injector },
    );
    this.realtime.notifications$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((notification) => this.receive(notification));
    this.realtime.resync$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.resync());
    this.realtime.receipts$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((receipt) => {
      if (receipt.userId === this.session.me()?.id) {
        this.scheduleCountRefresh();
      }
    });
    this.destroyRef.onDestroy(() => this.clearReceiptTimer());
  }

  /** Activates the centre for account `uid`, or resets it for `null`. */
  follow(uid: string | null): void {
    if (uid === this.uid) {
      return;
    }
    this.generation++;
    this.uid = uid;
    this.seen.clear();
    this.clearReceiptTimer();
    this.unreadState.set(0);
    this.recentState.set(null);
    this.recentStatusState.set('idle');
    this.lastPushState.set(null);
    this.activeState.set(!!uid);
    if (uid) {
      void this.refreshCount();
    }
  }

  /** Re-reads the unread count (badge). Never rejects; keeps the current value on failure. */
  async refreshCount(): Promise<void> {
    if (!this.uid) {
      return;
    }
    const generation = this.generation;
    try {
      const answer = await firstValueFrom(
        this.api.getUnreadNotificationCount('body', false, { context: silentErrors() }),
      );
      if (generation === this.generation) {
        this.unreadState.set(Math.max(0, answer.count ?? 0));
      }
    } catch {
      // The badge keeps its value; the next push or reconnection tries again.
    }
  }

  /** (Re)loads the latest notifications for the menu, keeping the current ones on screen. */
  async loadRecent(): Promise<void> {
    if (!this.uid) {
      return;
    }
    const generation = this.generation;
    if (this.recentState() === null) {
      this.recentStatusState.set('loading');
    }
    try {
      const page = await firstValueFrom(
        this.api.listNotifications({ limit: RECENT_NOTIFICATIONS }, 'body', false, {
          context: silentErrors(),
        }),
      );
      if (generation !== this.generation) {
        return;
      }
      const items = page.items ?? [];
      items.forEach((item) => this.seen.add(item.id));
      this.recentState.set(items);
      this.recentStatusState.set('ready');
    } catch {
      if (generation === this.generation && this.recentState() === null) {
        this.recentStatusState.set('error');
      }
    }
  }

  /** Marks one notification read (optimistically); no-op when it already is. */
  async markRead(notification: NotificationResponse): Promise<void> {
    if (notification.readAt || !this.uid) {
      return;
    }
    const readAt = new Date().toISOString();
    this.applyRead({ kind: 'one', id: notification.id, readAt });
    this.unreadState.update((count) => Math.max(0, count - 1));
    try {
      await firstValueFrom(
        this.api.markNotificationRead({ id: notification.id }, 'body', false, {
          context: silentErrors(),
        }),
      );
    } catch {
      void this.refreshCount();
    }
  }

  /** Marks every notification read; resolves how many were unread. Rejects with an `ApiError`. */
  async markAllRead(): Promise<number> {
    const answer = await firstValueFrom(
      this.api.markAllNotificationsRead('body', false, { context: silentErrors() }),
    );
    this.applyRead({ kind: 'all', readAt: new Date().toISOString() });
    this.unreadState.set(0);
    return answer.updated ?? 0;
  }

  private receive(notification: NotificationResponse): void {
    if (!this.uid || this.seen.has(notification.id)) {
      return;
    }
    this.seen.add(notification.id);
    if (!notification.readAt) {
      this.unreadState.update((count) => count + 1);
    }
    const recent = this.recentState();
    if (recent) {
      this.recentState.set(
        [notification, ...recent.filter((item) => item.id !== notification.id)].slice(
          0,
          RECENT_NOTIFICATIONS,
        ),
      );
    }
    this.lastPushState.set(notification);
    this.pushedSubject.next(notification);
  }

  private resync(): void {
    if (!this.uid) {
      return;
    }
    void this.refreshCount();
    if (this.recentState() !== null) {
      void this.loadRecent();
    }
  }

  private applyRead(change: ReadChange): void {
    const recent = this.recentState();
    if (recent) {
      this.recentState.set(
        recent.map((item) =>
          !item.readAt && (change.kind === 'all' || item.id === change.id)
            ? { ...item, readAt: change.readAt }
            : item,
        ),
      );
    }
    this.readSubject.next(change);
  }

  private scheduleCountRefresh(): void {
    this.clearReceiptTimer();
    this.receiptTimer = setTimeout(() => {
      this.receiptTimer = null;
      void this.refreshCount();
    }, RECEIPT_REFRESH_MS);
  }

  private clearReceiptTimer(): void {
    if (this.receiptTimer) {
      clearTimeout(this.receiptTimer);
      this.receiptTimer = null;
    }
  }
}

/** Starts the notification centre with the application (it waits for a signed-in session). */
export function provideNotifications(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideAppInitializer(() => inject(NotificationCenter).start()),
  ]);
}
