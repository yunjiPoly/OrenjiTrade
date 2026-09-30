import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import type { DisputeEvent } from '@orenji/api-client';
import { RelativeTimePipe } from '../pipes/relative-time.pipe';
import { DISPUTE_EVENT_ICONS, disputeEventLabel } from './payment-labels';

/** A dispute's timeline, oldest first (who opened it, evidence, messages, holds, the decision). */
@Component({
  selector: 'app-dispute-timeline',
  imports: [DatePipe, MatIconModule, RelativeTimePipe],
  template: `
    <ol class="tl" aria-label="Dispute timeline">
      @for (entry of entries(); track entry.id) {
        <li class="tl__step">
          <span class="tl__dot" aria-hidden="true"
            ><mat-icon>{{ entry.icon }}</mat-icon></span
          >
          <div class="tl__body">
            <p class="tl__label">{{ entry.label }}</p>
            <time class="tl__time" [attr.datetime]="entry.at" [title]="entry.at | date: 'medium'">
              {{ entry.at | relativeTime }}
            </time>
          </div>
        </li>
      }
    </ol>
  `,
  styles: `
    .tl {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .tl__step {
      position: relative;
      display: flex;
      gap: var(--spacing-3);
      padding-bottom: var(--spacing-4);
    }
    .tl__step:not(:last-child)::before {
      position: absolute;
      top: 30px;
      bottom: 0;
      left: 14px;
      width: 2px;
      background: var(--color-border);
      content: '';
    }
    .tl__dot {
      display: grid;
      flex: 0 0 auto;
      place-items: center;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      background: var(--color-surface-variant);
      color: var(--color-text-muted);
    }
    .tl__step:last-child .tl__dot {
      background: var(--color-primary-container);
      color: var(--color-on-primary-container);
    }
    .tl__dot mat-icon {
      width: 16px;
      height: 16px;
      font-size: 16px;
    }
    .tl__body {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding-top: 4px;
      min-width: 0;
    }
    .tl__label {
      margin: 0;
      color: var(--color-ink);
      font-weight: var(--font-weight-medium);
    }
    .tl__time {
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DisputeTimelineComponent {
  readonly timeline = input.required<readonly DisputeEvent[]>();
  /** The reader's side (`null` for admins). */
  readonly viewer = input<string | null>(null);
  readonly buyerName = input.required<string>();
  readonly sellerName = input.required<string>();
  readonly currency = input<string | null>(null);

  protected readonly entries = computed(() => {
    const names = { BUYER: this.buyerName(), SELLER: this.sellerName() };
    return this.timeline().map((event) => ({
      id: event.id,
      icon: DISPUTE_EVENT_ICONS[event.event] ?? 'info',
      label: disputeEventLabel(event, this.viewer(), names, this.currency()),
      at: event.createdAt,
    }));
  });
}
