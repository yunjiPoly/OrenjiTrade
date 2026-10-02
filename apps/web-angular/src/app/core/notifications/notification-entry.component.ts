import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import type { NotificationResponse } from '@orenji/api-client';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import { isUnread, notificationCard, notificationKind } from './notification-kinds';
import { CardImageComponent } from '../../shared/ui/card-image/card-image.component';

/**
 * One notification as content (the bell menu wraps it in a menu item, the notifications page in a
 * link): a tinted icon per type, category and time, title, body and an unread dot.
 */
@Component({
  selector: 'app-notification-entry',
  imports: [CardImageComponent, MatIconModule, RelativeTimePipe],
  template: `
    @let n = notification();
    @if (card(); as card) {
      <span class="ne__card" data-testid="notification-card-image">
        <app-card-image size="xs" [src]="card.imageUrl" [alt]="card.name" [game]="card.game" />
        <span class="ne__badge" [attr.data-tone]="kind().tone" aria-hidden="true">
          <mat-icon>{{ kind().icon }}</mat-icon>
        </span>
      </span>
    } @else {
      <span class="ne__icon" [attr.data-tone]="kind().tone" aria-hidden="true">
        <mat-icon>{{ kind().icon }}</mat-icon>
      </span>
    }
    <span class="ne__text">
      <span class="ne__meta">
        <span class="ne__label">{{ kind().label }}</span>
        <span aria-hidden="true">·</span>
        <time [attr.datetime]="n.createdAt">{{ n.createdAt | relativeTime }}</time>
      </span>
      <span class="ne__title">{{ n.title }}</span>
      <span class="ne__body" [class.ne__body--clamp]="compact()">{{ n.body }}</span>
    </span>
    @if (unread()) {
      <span class="ne__dot" data-testid="notification-unread-dot" aria-hidden="true"></span>
      <span class="visually-hidden">Unread</span>
    }
  `,
  styles: `
    :host {
      display: flex;
      align-items: flex-start;
      gap: var(--spacing-3);
      width: 100%;
      min-width: 0;
      text-align: left;
    }
    .ne__icon {
      display: grid;
      flex: 0 0 auto;
      place-items: center;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: var(--ne-tone-bg, var(--color-surface-variant));
      color: var(--ne-tone, var(--color-text-muted));
    }
    .ne__icon mat-icon {
      margin: 0;
      font-size: 22px;
      width: 22px;
      height: 22px;
    }
    .ne__card {
      position: relative;
      flex: 0 0 auto;
      width: 40px;
    }
    .ne__card app-card-image {
      --card-image-width: 40px;
    }
    .ne__badge {
      position: absolute;
      right: -6px;
      bottom: -4px;
      display: grid;
      place-items: center;
      width: 22px;
      height: 22px;
      border: 2px solid var(--color-surface);
      border-radius: 50%;
      background: var(--ne-tone-bg, var(--color-surface-variant));
      color: var(--ne-tone, var(--color-text-muted));
    }
    .ne__badge mat-icon {
      margin: 0;
      font-size: 13px;
      width: 13px;
      height: 13px;
    }
    [data-tone='match'] {
      --ne-tone: var(--color-primary);
      --ne-tone-bg: var(--color-primary-container);
    }
    [data-tone='message'] {
      --ne-tone: var(--color-accent);
      --ne-tone-bg: var(--color-accent-container);
    }
    [data-tone='offer'],
    [data-tone='trade'] {
      --ne-tone: var(--color-success);
      --ne-tone-bg: color-mix(in srgb, var(--color-success) 14%, var(--color-surface));
    }
    .ne__icon[data-tone='warning'],
    .ne__badge[data-tone='warning'] {
      --ne-tone: var(--color-warning);
      --ne-tone-bg: color-mix(in srgb, var(--color-warning) 16%, var(--color-surface));
    }
    .ne__text {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .ne__meta {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .ne__label {
      font-weight: var(--font-weight-semibold);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .ne__title {
      color: var(--color-ink);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      line-height: 1.35;
    }
    .ne__body {
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
      line-height: 1.4;
    }
    .ne__body--clamp {
      display: -webkit-box;
      overflow: hidden;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }
    .ne__dot {
      flex: 0 0 auto;
      width: 10px;
      height: 10px;
      margin-top: 6px;
      border-radius: 50%;
      background: var(--color-primary);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 20%, transparent);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationEntryComponent {
  readonly notification = input.required<NotificationResponse>();
  /** Clamp the body to two lines (menu). */
  readonly compact = input(false, { transform: booleanAttribute });

  protected readonly kind = computed(() => notificationKind(this.notification()));
  /** The card the payload carries (wishlist alerts, offers), shown instead of the icon. */
  protected readonly card = computed(() => notificationCard(this.notification()));
  protected readonly unread = computed(() => isUnread(this.notification()));
}
