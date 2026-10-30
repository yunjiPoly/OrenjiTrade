import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { NotificationResponse } from '@orenji/api-client';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/feedback/toast.service';
import { toApiError } from '../../core/http/api-error';
import { friendlyMessage } from '../../core/http/api-error-messages';
import { ShellIconComponent } from '../../core/layout/shell-icon/shell-icon.component';
import { NotificationCenter } from '../../core/notifications/notification-center.service';
import { NotificationRowComponent } from '../../core/notifications/notification-row.component';
import { isFreshnessRow } from '../../core/notifications/notification-rows';
import { ReminderAnswers } from '../../core/notifications/reminder-answers.service';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../shared/ui/error-state/error-state.component';
import { SegmentOption, SegmentedComponent } from '../../shared/ui/segmented/segmented.component';
import { NotificationFeedStore } from './data/notification-feed.store';

/**
 * `/notifications` (`?unread=1` shows unread ones only; spec 12, board W24): centred at 720, the
 * H1 with "Chats are in Messages" and Notification settings, [All | Unread n], "New" with "Mark
 * all as read", then "Earlier" grouped by day, cursor pages ("Load more"). Chats are left out
 * (`excludeTypes=MESSAGE`); old offer, trade, payment and dispute notices read as history; a
 * freshness reminder answers in place. Live over realtime. No web push (decision 13).
 */
@Component({
  selector: 'app-notifications-page',
  imports: [
    RouterLink,
    EmptyStateComponent,
    ErrorStateComponent,
    NotificationRowComponent,
    SegmentedComponent,
    ShellIconComponent,
  ],
  providers: [NotificationFeedStore],
  template: `
    <div class="nf">
      @if (auth.isAuthenticated()) {
        <header class="nf__head">
          <div class="nf__titles">
            <h1 class="nf__title" tabindex="-1">Notifications</h1>
            <p class="nf__lead">
              Wishlist alerts, sales, ratings and reminders, for every game. Chats are in
              <a routerLink="/messages">Messages</a>.
            </p>
          </div>
          <a class="nf__outline" routerLink="/settings/notifications">
            <app-shell-icon name="settings" [size]="18" />
            Notification settings
          </a>
        </header>
        <app-segmented
          class="nf__filter"
          label="Show notifications"
          size="sm"
          [options]="filters()"
          [value]="store.unreadOnly() ? 'unread' : 'all'"
          (valueChange)="onFilter($event)"
        />

        <section class="nf__body" aria-label="Notification list" [attr.aria-busy]="busy()">
          @switch (store.status()) {
            @case ('loading') {
              <span class="visually-hidden">Loading notifications</span>
              @for (bone of [0, 1, 2, 3]; track bone) {
                <div class="nf__bone" aria-hidden="true"><span></span><span></span></div>
              }
            }
            @case ('error') {
              <app-error-state
                title="Notifications could not load"
                [message]="errorMessage()"
                [requestId]="store.error()?.requestId ?? null"
                (retry)="store.load()"
              />
            }
            @default {
              @if (store.fresh().length > 0) {
                <div class="nf__section-head">
                  <h2 class="nf__h2">New</h2>
                  <button
                    type="button"
                    class="nf__mark"
                    data-testid="notifications-mark-all"
                    [attr.aria-disabled]="markDisabled() ? 'true' : null"
                    (click)="markAll()"
                  >
                    Mark all as read
                  </button>
                </div>
                <ul class="nf__list nf__list--new" aria-label="New notifications">
                  @for (n of store.fresh(); track n.id) {
                    <li>
                      <app-notification-row
                        page
                        [notification]="n"
                        [now]="now"
                        (opened)="store.markRead($event)"
                        (markRead)="markOne($event)"
                      />
                    </li>
                  }
                </ul>
              }
              @if (!store.unreadOnly() && store.earlier().length > 0) {
                @if (store.fresh().length > 0) {
                  <h2 class="nf__h2 nf__h2--earlier">Earlier</h2>
                }
                @for (group of store.earlier(); track group.label) {
                  <h3 class="nf__day">{{ group.label }}</h3>
                  <ul class="nf__list" [attr.aria-label]="group.label + ' notifications'">
                    @for (n of group.items; track n.id) {
                      <li>
                        <app-notification-row
                          page
                          [notification]="n"
                          [now]="now"
                          (opened)="store.markRead($event)"
                        />
                      </li>
                    }
                  </ul>
                }
              }
              @if (
                store.fresh().length === 0 && (store.unreadOnly() || store.earlier().length === 0)
              ) {
                @if (store.unreadOnly()) {
                  <app-empty-state
                    icon="task_alt"
                    title="You're all caught up"
                    description="No unread notifications. New wishlist alerts, sales and ratings will appear here."
                  >
                    <button actions type="button" class="nf__outline" (click)="showAll()">
                      Show all notifications
                    </button>
                  </app-empty-state>
                } @else {
                  <app-empty-state
                    icon="notifications_none"
                    title="No notifications yet"
                    description="We'll tell you when a card you want is listed in your region."
                  >
                    <a
                      actions
                      class="nf__outline"
                      routerLink="/search"
                      [queryParams]="{ tab: 'wishlist' }"
                      >Open my wishlist</a
                    >
                  </app-empty-state>
                }
              }
              @if (store.hasMore()) {
                <div class="nf__more">
                  @if (store.moreFailed()) {
                    <p class="nf__muted" role="alert">Older notifications could not load.</p>
                  }
                  <button
                    type="button"
                    class="nf__outline"
                    [disabled]="store.loadingMore()"
                    (click)="store.loadMore()"
                  >
                    {{
                      store.loadingMore()
                        ? 'Loading…'
                        : store.moreFailed()
                          ? 'Try again'
                          : 'Load more'
                    }}
                  </button>
                </div>
              }
            }
          }
        </section>
      } @else {
        <app-empty-state
          icon="lock_person"
          title="Notifications are for members"
          description="Sign in to get wishlist alerts, sales and ratings in one place."
        >
          <a
            actions
            class="nf__outline"
            routerLink="/auth/sign-in"
            [queryParams]="{ returnUrl: '/notifications' }"
          >
            Sign in
          </a>
        </app-empty-state>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .nf {
      max-width: 720px;
      margin: 0 auto;
      padding: 32px 24px 64px;
    }
    .nf__head {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
    }
    .nf__title {
      margin: 0;
      font-family: var(--font-display);
      font-size: 30px;
      font-weight: var(--font-weight-bold);
      letter-spacing: -0.5px;
    }
    .nf__titles {
      flex: 1 1 320px;
      min-width: 0;
    }
    .nf__lead {
      max-width: 480px;
      margin: 6px 0 0;
      color: var(--color-text-secondary);
    }
    .nf__lead a {
      color: var(--color-accent);
      font-weight: var(--font-weight-semibold);
    }
    .nf__outline {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      min-height: 40px;
      padding: 0 16px;
      border: 1px solid var(--color-border-strong);
      border-radius: var(--radius-pill);
      background: transparent;
      color: var(--color-ink);
      font: inherit;
      font-weight: var(--font-weight-semibold);
      text-decoration: none;
      cursor: pointer;
    }
    .nf__outline:hover {
      background: var(--color-surface-variant);
    }
    .nf__filter {
      display: inline-block;
      margin-top: 20px;
    }
    .nf__body {
      margin-top: 24px;
    }
    .nf__section-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin: 16px 0 12px;
    }
    .nf__h2 {
      margin: 0;
      font-family: var(--font-display);
      font-size: 17px;
      font-weight: var(--font-weight-bold);
    }
    .nf__h2--earlier {
      margin: 40px 0 0;
    }
    .nf__mark {
      padding: 4px;
      border: 0;
      background: none;
      color: var(--color-accent);
      font: inherit;
      font-weight: var(--font-weight-semibold);
      cursor: pointer;
    }
    .nf__mark[aria-disabled='true'] {
      color: var(--color-text-disabled);
      cursor: default;
    }
    .nf__day {
      margin: 24px 0 10px;
      color: var(--color-text-secondary);
      font-family: var(--font-body);
      font-size: 12px;
      font-weight: var(--font-weight-semibold);
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .nf__list {
      margin: 0;
      padding: 0;
      overflow: hidden;
      border: 1px solid var(--color-border);
      border-radius: 16px;
      background: var(--color-surface);
      list-style: none;
    }
    .nf__list li + li {
      border-top: 1px solid var(--color-border);
    }
    .nf__bone {
      display: flex;
      gap: 14px;
      padding: 16px 20px;
      border: 1px solid var(--color-border);
      border-radius: 16px;
      margin-bottom: 8px;
    }
    .nf__bone span:first-child {
      width: 36px;
      height: 36px;
      border-radius: 10px;
      background: var(--color-surface-variant);
    }
    .nf__bone span:last-child {
      flex: 1;
      height: 40px;
      border-radius: 8px;
      background: var(--color-surface-variant);
    }
    .nf__more {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      margin-top: 24px;
    }
    .nf__muted {
      margin: 0;
      color: var(--color-text-muted);
    }
    @media (max-width: 959.98px) {
      .nf {
        padding: 16px 16px 32px;
      }
      .nf__title {
        font-size: 24px;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationsPageComponent {
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);
  private readonly answers = inject(ReminderAnswers);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  protected readonly auth = inject(AuthService);
  protected readonly center = inject(NotificationCenter);
  protected readonly store = inject(NotificationFeedStore);

  /** `?unread=1` (bound by the router). */
  readonly unread = input<string | undefined>();

  protected readonly marking = signal(false);
  /** `aria-disabled`, so the focus stays on "Mark all as read" once everything is read (A4). */
  protected readonly markDisabled = computed(
    () => this.center.unreadCount() === 0 || this.marking(),
  );
  protected readonly busy = computed(
    () => this.store.status() === 'loading' || this.store.loadingMore(),
  );
  protected readonly errorMessage = computed(() => {
    const error = this.store.error();
    return error ? friendlyMessage(error) : '';
  });

  constructor() {
    this.store.init();
    // The reminders answered in place need your binders' state.
    effect(() => {
      if (this.store.groups().some((group) => group.items.some((n) => isFreshnessRow(n)))) {
        untracked(() => void this.answers.load());
      }
    });
    effect(() => {
      const unreadOnly = this.unread() === '1' || this.unread() === 'true';
      const signedIn = this.auth.isAuthenticated();
      untracked(() => {
        if (signedIn) {
          this.store.setFilter(unreadOnly);
        }
      });
    });
  }

  protected readonly now = new Date();
  /** [All | Unread n] (board W24). */
  protected readonly filters = computed<SegmentOption<string>[]>(() => {
    const unread = this.center.unreadCount();
    return [
      { value: 'all', label: 'All' },
      { value: 'unread', label: unread > 0 ? `Unread ${unread}` : 'Unread' },
    ];
  });

  protected onFilter(value: string): void {
    void this.router.navigate([], {
      queryParams: { unread: value === 'unread' ? '1' : null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected showAll(): void {
    void this.router.navigate([], { queryParams: { unread: null }, replaceUrl: true });
  }

  /**
   * A row's "Mark as read": the row leaves "New", so the focus goes to the next unread row's
   * "Mark as read" (the one before it at the end), or to the page's heading when none is left (A4).
   */
  protected async markOne(notification: NotificationResponse): Promise<void> {
    const index = this.store.fresh().findIndex((item) => item.id === notification.id);
    await this.store.markRead(notification);
    afterNextRender(
      () => {
        const root = this.host.nativeElement;
        const marks = Array.from(root.querySelectorAll<HTMLElement>('.nf__list--new .nr__read'));
        const next = marks[Math.min(Math.max(index, 0), marks.length - 1)];
        (next ?? root.querySelector<HTMLElement>('.nf__title'))?.focus();
      },
      { injector: this.injector },
    );
  }

  protected async markAll(): Promise<void> {
    if (this.markDisabled()) {
      return;
    }
    this.marking.set(true);
    try {
      await this.store.markAllRead();
      this.toasts.show({ title: 'Everything is marked as read.' });
    } catch (error) {
      this.toasts.show({ title: friendlyMessage(toApiError(error)), tone: 'error' });
    } finally {
      this.marking.set(false);
    }
  }
}
