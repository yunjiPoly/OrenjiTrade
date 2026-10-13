import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, RouterLink } from '@angular/router';
import type { NotificationResponse } from '@orenji/api-client';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { toApiError } from '../../http/api-error';
import { friendlyMessage } from '../../http/api-error-messages';
import { NotificationCenter } from '../../notifications/notification-center.service';
import { NotificationEntryComponent } from '../../notifications/notification-entry.component';
import { notificationLink } from '../../notifications/notification-kinds';
import { RealtimeService } from '../../realtime/realtime.service';

/** How long the badge "bumps" after a new notification arrives. */
const BUMP_MS = 700;

/**
 * Top-bar bell: unread badge kept live by the realtime channel, and a menu with the latest
 * notifications (icon per type, deep link to the page concerned, marked read when opened),
 * "Mark all as read" and a link to the full list. Signed-out visitors are invited to sign in.
 */
@Component({
  selector: 'app-notification-bell',
  imports: [
    RouterLink,
    MatButtonModule,
    MatDividerModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    NotificationEntryComponent,
    SkeletonComponent,
  ],
  template: `
    <button
      matIconButton
      type="button"
      class="bell"
      data-testid="notification-bell"
      [attr.aria-label]="label()"
      [attr.data-realtime]="realtime.state()"
      matTooltip="Notifications"
      [matMenuTriggerFor]="menu"
      (menuOpened)="onOpened()"
    >
      <mat-icon>{{ unread() > 0 ? 'notifications_active' : 'notifications' }}</mat-icon>
      @if (unread() > 0) {
        <span
          class="bell__badge"
          [class.bell__badge--bump]="bump()"
          data-testid="notification-badge"
          aria-hidden="true"
          >{{ badgeText() }}</span
        >
      }
    </button>
    <span class="visually-hidden" aria-live="polite">{{ announcement() }}</span>

    <mat-menu
      #menu="matMenu"
      xPosition="before"
      class="notification-menu"
      aria-label="Notifications"
    >
      <ng-template matMenuContent>
        <div class="nm__head">
          <span class="nm__title">Notifications</span>
          @if (center.active() && unread() > 0) {
            <span class="nm__count">{{ unread() }} unread</span>
          }
        </div>
        @if (!center.active()) {
          <p class="nm__note">Sign in to hear about wishlist alerts, messages and offers.</p>
          <a mat-menu-item routerLink="/auth/sign-in">
            <mat-icon>login</mat-icon>
            <span>Sign in</span>
          </a>
        } @else {
          @switch (center.recentStatus()) {
            @case ('error') {
              <p class="nm__note" role="alert">Notifications could not load.</p>
              <button mat-menu-item type="button" (click)="retry($event)">
                <mat-icon>refresh</mat-icon>
                <span>Retry</span>
              </button>
            }
            @case ('ready') {
              @for (notification of center.recent(); track notification.id) {
                <button
                  mat-menu-item
                  type="button"
                  class="nm__item"
                  [class.nm__item--unread]="!notification.readAt"
                  (click)="open(notification)"
                >
                  <app-notification-entry compact [notification]="notification" />
                </button>
              } @empty {
                <div class="nm__empty">
                  <mat-icon aria-hidden="true">notifications_off</mat-icon>
                  <p>You're all caught up. New wishlist alerts and messages will show up here.</p>
                </div>
              }
            }
            @default {
              <div class="nm__loading" aria-busy="true">
                <span class="visually-hidden">Loading notifications</span>
                <app-skeleton variant="list" lines="3" />
              </div>
            }
          }
          <mat-divider />
          <button
            mat-menu-item
            type="button"
            [disabled]="unread() === 0 || marking()"
            (click)="markAll()"
          >
            <mat-icon>done_all</mat-icon>
            <span>Mark all as read</span>
          </button>
          <a mat-menu-item routerLink="/notifications">
            <mat-icon>inbox</mat-icon>
            <span>See all notifications</span>
          </a>
        }
      </ng-template>
    </mat-menu>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
    .bell {
      position: relative;
    }
    .bell__badge {
      position: absolute;
      top: 4px;
      right: 2px;
      display: grid;
      place-items: center;
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      border-radius: var(--radius-pill);
      background: var(--color-primary);
      color: var(--color-on-primary);
      box-shadow: 0 0 0 2px var(--color-surface);
      font-size: 11px;
      font-weight: var(--font-weight-bold);
      line-height: 1;
      pointer-events: none;
    }
    .bell__badge--bump {
      animation: bell-bump var(--motion-duration-slow) var(--motion-easing-standard);
    }
    @keyframes bell-bump {
      30% {
        transform: scale(1.35);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .bell__badge--bump {
        animation: none;
      }
    }
    .nm__head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--spacing-2);
      padding: var(--spacing-2) var(--spacing-4) var(--spacing-1);
    }
    .nm__title {
      font-family: var(--font-display);
      font-size: var(--font-size-md);
      font-weight: var(--font-weight-semibold);
    }
    .nm__count {
      color: var(--color-primary);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
    }
    .nm__note {
      margin: 0;
      padding: var(--spacing-2) var(--spacing-4);
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .nm__item {
      min-height: 72px;
      padding-top: var(--spacing-2);
      padding-bottom: var(--spacing-2);
    }
    .nm__item--unread {
      background: color-mix(in srgb, var(--color-primary) 5%, transparent);
    }
    .nm__empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--spacing-2);
      padding: var(--spacing-5) var(--spacing-4);
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
      text-align: center;
    }
    .nm__empty p {
      margin: 0;
    }
    .nm__loading {
      padding: var(--spacing-2) var(--spacing-4);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationBellComponent {
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly center = inject(NotificationCenter);
  protected readonly realtime = inject(RealtimeService);

  protected readonly unread = computed(() =>
    this.center.active() ? this.center.unreadCount() : 0,
  );
  protected readonly badgeText = computed(() => (this.unread() > 99 ? '99+' : `${this.unread()}`));
  protected readonly label = computed(() => {
    const unread = this.unread();
    return unread > 0 ? `Notifications, ${unread} unread` : 'Notifications';
  });
  protected readonly announcement = computed(() => {
    const last = this.center.lastPush();
    return last ? `New notification: ${last.title}` : '';
  });
  protected readonly bump = signal(false);
  protected readonly marking = signal(false);

  private bumpTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    let previous = 0;
    effect(() => {
      const unread = this.unread();
      untracked(() => {
        if (unread > previous) {
          this.startBump();
        }
        previous = unread;
      });
    });
    inject(DestroyRef).onDestroy(() => {
      if (this.bumpTimer) {
        clearTimeout(this.bumpTimer);
      }
    });
  }

  protected onOpened(): void {
    void this.center.loadRecent();
  }

  protected retry(event: Event): void {
    // Keep the menu open while the list reloads.
    event.stopPropagation();
    void this.center.loadRecent();
  }

  /** Opens the page the notification is about and marks it read. */
  protected open(notification: NotificationResponse): void {
    void this.center.markRead(notification);
    void this.router.navigateByUrl(notificationLink(notification));
  }

  protected async markAll(): Promise<void> {
    this.marking.set(true);
    try {
      const updated = await this.center.markAllRead();
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

  private startBump(): void {
    if (this.bumpTimer) {
      clearTimeout(this.bumpTimer);
    }
    this.bump.set(false);
    // Next frame, so the animation restarts when two notifications arrive close together.
    queueMicrotask(() => this.bump.set(true));
    this.bumpTimer = setTimeout(() => {
      this.bumpTimer = null;
      this.bump.set(false);
    }, BUMP_MS);
  }
}
