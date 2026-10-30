import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { NotificationResponse } from '@orenji/api-client';
import { AuthService } from '../../auth/auth.service';
import { ToastService } from '../../feedback/toast.service';
import { toApiError } from '../../http/api-error';
import { friendlyMessage } from '../../http/api-error-messages';
import { NotificationCenter } from '../../notifications/notification-center.service';
import { NotificationRowComponent } from '../../notifications/notification-row.component';
import { bellSections, isFreshnessRow } from '../../notifications/notification-rows';
import { ReminderAnswers } from '../../notifications/reminder-answers.service';
import { PopoverRef } from '../popover/popover.service';
import { ShellIconComponent } from '../shell-icon/shell-icon.component';

/**
 * The bell's popover (spec 12, board W24): 400 wide and at most 560 tall, anchored to the bell,
 * `surfaceElevated`, radius 16. The header "Notifications" with a teal "Mark all as read" and a
 * gear to Settings › Notifications; the latest notifications in NEW and EARLIER (chats are left
 * out, R9's `excludeTypes`); reminders answered in place; "See all notifications" at the foot.
 * No web push (decision 13). A bottom sheet below 960 (spec 16).
 */
@Component({
  selector: 'app-notification-popover',
  imports: [RouterLink, NotificationRowComponent, ShellIconComponent],
  template: `
    <section class="np" role="dialog" aria-labelledby="np-title" data-testid="notification-popover">
      <header class="np__head">
        <h2 class="np__title" id="np-title">Notifications</h2>
        @if (center.active()) {
          <button
            type="button"
            class="np__mark"
            data-testid="bell-mark-all"
            [disabled]="center.unreadCount() === 0 || marking()"
            (click)="markAll()"
          >
            Mark all as read
          </button>
          <a
            class="np__gear"
            routerLink="/settings/notifications"
            aria-label="Notification settings"
            (click)="ref.close(false)"
          >
            <app-shell-icon name="settings" [size]="18" />
          </a>
        }
      </header>
      <div class="np__body">
        @if (!center.active()) {
          <p class="np__note">Sign in to hear about wishlist alerts, sales and ratings.</p>
          <a class="np__signin" routerLink="/auth/sign-in" (click)="ref.close(false)">Sign in</a>
        } @else {
          @switch (center.recentStatus()) {
            @case ('error') {
              <div class="np__state" role="alert">
                <p>Notifications could not load.</p>
                <button type="button" class="np__retry" (click)="retry()">Try again</button>
              </div>
            }
            @case ('ready') {
              @if (sections().fresh.length > 0) {
                <h3 class="np__label">New</h3>
                <ul class="np__list" aria-label="New notifications">
                  @for (n of sections().fresh; track n.id) {
                    <li>
                      <app-notification-row
                        [notification]="n"
                        [now]="now"
                        (opened)="open($event)"
                      />
                    </li>
                  }
                </ul>
              }
              @if (sections().earlier.length > 0) {
                <h3 class="np__label">Earlier</h3>
                <ul class="np__list" aria-label="Earlier notifications">
                  @for (n of sections().earlier; track n.id) {
                    <li>
                      <app-notification-row
                        [notification]="n"
                        [now]="now"
                        (opened)="open($event)"
                      />
                    </li>
                  }
                </ul>
              }
              @if (sections().fresh.length === 0 && sections().earlier.length === 0) {
                <div class="np__state">
                  <span class="np__empty-icon" aria-hidden="true"
                    ><app-shell-icon name="bell" [size]="22"
                  /></span>
                  <p class="np__empty-title">No notifications yet</p>
                  <p class="np__note">
                    We'll tell you when a card you want is listed in your region.
                  </p>
                </div>
              }
            }
            @default {
              <div class="np__bones" aria-busy="true">
                <span class="visually-hidden">Loading notifications</span>
                @for (bone of [0, 1, 2]; track bone) {
                  <span class="np__bone" aria-hidden="true"><span></span><span></span></span>
                }
              </div>
            }
          }
        }
      </div>
      @if (center.active()) {
        <footer class="np__foot">
          <a routerLink="/notifications" data-testid="bell-see-all" (click)="ref.close(false)"
            >See all notifications</a
          >
        </footer>
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .np {
      display: flex;
      flex-direction: column;
      max-height: min(560px, calc(100dvh - 88px));
      overflow: hidden;
    }
    .np__head {
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 56px;
      padding: 0 12px 0 20px;
      border-bottom: 1px solid var(--color-border);
    }
    .np__title {
      flex: 1;
      margin: 0;
      font-family: var(--font-display);
      font-size: 17px;
      font-weight: var(--font-weight-bold);
    }
    .np__mark {
      padding: 6px 4px;
      border: 0;
      background: none;
      color: var(--color-accent);
      font: inherit;
      font-size: 14px;
      font-weight: var(--font-weight-semibold);
      cursor: pointer;
    }
    .np__mark:disabled {
      color: var(--color-text-disabled);
      cursor: default;
    }
    .np__gear {
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      color: var(--color-text-secondary);
    }
    .np__gear:hover {
      background: var(--color-surface-variant);
      color: var(--color-ink);
    }
    .np__body {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
    }
    .np__label {
      margin: 0;
      padding: 14px 20px 6px;
      color: var(--color-text-secondary);
      font-family: var(--font-body);
      font-size: 12px;
      font-weight: var(--font-weight-semibold);
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .np__list {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .np__state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      padding: 32px 24px;
      text-align: center;
    }
    .np__state p {
      margin: 0;
    }
    .np__empty-icon {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: var(--color-surface-variant);
      color: var(--color-text-secondary);
    }
    .np__empty-title {
      font-weight: var(--font-weight-semibold);
    }
    .np__note {
      margin: 0;
      padding: 16px 20px 8px;
      color: var(--color-text-secondary);
      font-size: 14px;
    }
    .np__state .np__note {
      padding: 0;
    }
    .np__signin {
      display: inline-block;
      margin: 0 20px 20px;
      color: var(--color-accent);
      font-weight: var(--font-weight-semibold);
    }
    .np__retry {
      border: 0;
      background: none;
      color: var(--color-accent);
      font: inherit;
      font-weight: var(--font-weight-semibold);
      cursor: pointer;
    }
    .np__bones {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 16px 20px;
    }
    .np__bone {
      display: flex;
      gap: 12px;
    }
    .np__bone span:first-child {
      width: 36px;
      height: 36px;
      border-radius: 10px;
      background: var(--color-surface-variant);
    }
    .np__bone span:last-child {
      flex: 1;
      height: 36px;
      border-radius: 8px;
      background: var(--color-surface-variant);
    }
    .np__foot {
      display: flex;
      justify-content: center;
      min-height: 48px;
      align-items: center;
      border-top: 1px solid var(--color-border);
    }
    .np__foot a {
      color: var(--color-accent);
      font-weight: var(--font-weight-semibold);
      text-decoration: none;
    }
    .np__foot a:hover {
      text-decoration: underline;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationPopoverComponent {
  protected readonly center = inject(NotificationCenter);
  protected readonly ref = inject(PopoverRef);
  private readonly answers = inject(ReminderAnswers);
  private readonly toasts = inject(ToastService);
  private readonly auth = inject(AuthService);
  protected readonly now = new Date();
  protected readonly marking = signal(false);
  protected readonly sections = computed(() => bellSections(this.center.recent() ?? []));

  constructor() {
    if (this.auth.isAuthenticated()) {
      void this.center.loadRecent().then(() => {
        if ((this.center.recent() ?? []).some((n) => isFreshnessRow(n))) {
          void this.answers.load();
        }
      });
    }
  }

  protected retry(): void {
    void this.center.loadRecent();
  }

  /** A row was opened: marked read, the popover closes (the link navigates). */
  protected open(notification: NotificationResponse): void {
    void this.center.markRead(notification);
    this.ref.close(false);
  }

  protected async markAll(): Promise<void> {
    this.marking.set(true);
    try {
      await this.center.markAllRead();
      this.toasts.show({ title: 'Everything is marked as read.' });
    } catch (error) {
      this.toasts.show({ title: friendlyMessage(toApiError(error)), tone: 'error' });
    } finally {
      this.marking.set(false);
    }
  }
}
