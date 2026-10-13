import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleChange, MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, RouterLink, UrlTree } from '@angular/router';
import type { NotificationResponse } from '@orenji/api-client';
import { AuthService } from '../../core/auth/auth.service';
import { toApiError } from '../../core/http/api-error';
import { friendlyMessage } from '../../core/http/api-error-messages';
import { NotificationCenter } from '../../core/notifications/notification-center.service';
import { NotificationEntryComponent } from '../../core/notifications/notification-entry.component';
import { notificationLink } from '../../core/notifications/notification-kinds';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../shared/ui/error-state/error-state.component';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { SkeletonComponent } from '../../shared/ui/skeleton/skeleton.component';
import { NotificationFeedStore } from './data/notification-feed.store';

/**
 * `/notifications` (`?unread=1` shows unread ones only): every notification grouped by day, with
 * cursor pages ("Load more"), deep links that mark the notification read, a per-row "Mark as
 * read", "Mark all as read" and a link to the notification preferences. Live over realtime.
 */
@Component({
  selector: 'app-notifications-page',
  imports: [
    RouterLink,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatTooltipModule,
    EmptyStateComponent,
    ErrorStateComponent,
    NotificationEntryComponent,
    PageHeaderComponent,
    SkeletonComponent,
  ],
  providers: [NotificationFeedStore],
  template: `
    <div class="page feed">
      @if (auth.isAuthenticated()) {
        <app-page-header
          title="Notifications"
          subtitle="Wishlist alerts, messages and updates about your listings."
        >
          <button
            actions
            matButton="outlined"
            type="button"
            [disabled]="center.unreadCount() === 0 || marking()"
            (click)="markAll()"
          >
            <mat-icon aria-hidden="true">done_all</mat-icon>
            Mark all as read
          </button>
          <a actions matButton routerLink="/settings/notifications">
            <mat-icon aria-hidden="true">tune</mat-icon>
            Preferences
          </a>
          <mat-button-toggle-group
            class="feed__filter"
            aria-label="Show notifications"
            hideSingleSelectionIndicator
            [value]="store.unreadOnly() ? 'unread' : 'all'"
            (change)="onFilter($event)"
          >
            <mat-button-toggle value="all">All</mat-button-toggle>
            <mat-button-toggle value="unread">
              Unread
              @if (center.unreadCount() > 0) {
                ({{ center.unreadCount() }})
              }
            </mat-button-toggle>
          </mat-button-toggle-group>
        </app-page-header>

        <section class="feed__body" aria-label="Notification list" [attr.aria-busy]="busy()">
          @switch (store.status()) {
            @case ('loading') {
              <span class="visually-hidden">Loading notifications</span>
              <app-skeleton variant="list" lines="5" />
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
              @for (group of store.groups(); track group.label) {
                <h2 class="feed__day">{{ group.label }}</h2>
                <ul class="feed__list" [attr.aria-label]="group.label + ' notifications'">
                  @for (notification of group.items; track notification.id) {
                    <li class="feed__row" [class.feed__row--unread]="!notification.readAt">
                      <a
                        class="feed__link"
                        [routerLink]="linkOf(notification)"
                        (click)="store.markRead(notification)"
                      >
                        <app-notification-entry [notification]="notification" />
                      </a>
                      @if (!notification.readAt) {
                        <button
                          matIconButton
                          type="button"
                          class="feed__read"
                          [attr.aria-label]="'Mark as read: ' + notification.title"
                          matTooltip="Mark as read"
                          (click)="store.markRead(notification)"
                        >
                          <mat-icon>check</mat-icon>
                        </button>
                      }
                    </li>
                  }
                </ul>
              } @empty {
                @if (store.unreadOnly()) {
                  <app-empty-state
                    icon="task_alt"
                    title="You're all caught up"
                    description="No unread notifications. New wishlist alerts and messages will appear here."
                  >
                    <button actions matButton="outlined" type="button" (click)="showAll()">
                      Show all notifications
                    </button>
                  </app-empty-state>
                } @else {
                  <app-empty-state
                    icon="notifications_none"
                    title="No notifications yet"
                    description="Add cards to your wishlist: we'll tell you when a collector of your region lists one."
                  >
                    <a actions matButton="filled" routerLink="/wishlist">Open my wishlist</a>
                  </app-empty-state>
                }
              }
              @if (store.hasMore()) {
                <div class="feed__more">
                  @if (store.moreFailed()) {
                    <p class="feed__muted" role="alert">Older notifications could not load.</p>
                  }
                  <button
                    matButton="outlined"
                    type="button"
                    [disabled]="store.loadingMore()"
                    (click)="store.loadMore()"
                  >
                    {{
                      store.loadingMore()
                        ? 'Loading…'
                        : store.moreFailed()
                          ? 'Try again'
                          : 'Load older notifications'
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
          description="Sign in to get wishlist alerts, messages and offers in one place."
        >
          <a
            actions
            matButton="filled"
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
    .feed {
      max-width: 880px;
    }
    .feed__filter {
      margin-top: var(--spacing-1);
    }
    .feed__day {
      margin: var(--spacing-5) 0 var(--spacing-2);
      color: var(--color-text-muted);
      font-family: var(--font-body);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .feed__day:first-child {
      margin-top: 0;
    }
    .feed__list {
      display: flex;
      flex-direction: column;
      margin: 0;
      padding: 0;
      overflow: hidden;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
      list-style: none;
    }
    .feed__row {
      position: relative;
      display: flex;
      align-items: center;
      gap: var(--spacing-1);
      padding-right: var(--spacing-2);
      transition: background var(--motion-duration-fast) var(--motion-easing-standard);
    }
    .feed__row + .feed__row {
      border-top: 1px solid var(--color-border);
    }
    .feed__row--unread {
      background: color-mix(in srgb, var(--color-primary) 5%, var(--color-surface));
    }
    .feed__row:hover {
      background: var(--color-surface-variant);
    }
    .feed__link {
      display: flex;
      flex: 1 1 auto;
      min-width: 0;
      padding: var(--spacing-3) var(--spacing-4);
      color: inherit;
      text-decoration: none;
      border-radius: var(--radius-md);
    }
    .feed__link:focus-visible {
      outline: var(--focus-width) solid var(--color-focus-ring);
      outline-offset: calc(var(--focus-width) * -1);
    }
    .feed__read {
      flex: 0 0 auto;
    }
    .feed__more {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--spacing-2);
      margin-top: var(--spacing-4);
    }
    .feed__muted {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    @media (max-width: 599px) {
      .feed__link {
        padding: var(--spacing-3);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationsPageComponent {
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly auth = inject(AuthService);
  protected readonly center = inject(NotificationCenter);
  protected readonly store = inject(NotificationFeedStore);

  /** `?unread=1` (bound by the router). */
  readonly unread = input<string | undefined>();

  protected readonly marking = signal(false);
  protected readonly busy = computed(
    () => this.store.status() === 'loading' || this.store.loadingMore(),
  );
  protected readonly errorMessage = computed(() => {
    const error = this.store.error();
    return error ? friendlyMessage(error) : '';
  });

  private readonly links = new Map<string, UrlTree>();

  constructor() {
    this.store.init();
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

  /** The page a notification opens, parsed once (deep links may carry a query string). */
  protected linkOf(notification: NotificationResponse): UrlTree {
    let tree = this.links.get(notification.id);
    if (!tree) {
      tree = this.router.parseUrl(notificationLink(notification));
      this.links.set(notification.id, tree);
    }
    return tree;
  }

  protected onFilter(event: MatButtonToggleChange): void {
    void this.router.navigate([], {
      queryParams: { unread: event.value === 'unread' ? '1' : null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected showAll(): void {
    void this.router.navigate([], { queryParams: { unread: null }, replaceUrl: true });
  }

  protected async markAll(): Promise<void> {
    this.marking.set(true);
    try {
      const updated = await this.store.markAllRead();
      this.snackBar.open(
        updated === 1
          ? '1 notification marked as read.'
          : `${updated} notifications marked as read.`,
        'OK',
        { duration: 4000 },
      );
    } catch (error) {
      this.snackBar.open(friendlyMessage(toApiError(error)), 'OK', { duration: 6000 });
    } finally {
      this.marking.set(false);
    }
  }
}
