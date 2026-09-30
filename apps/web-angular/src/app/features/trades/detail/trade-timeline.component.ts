import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import type { TradeEvent } from '@orenji/api-client';
import type { OfferRole } from '../../../shared/offers/offer-labels';
import { TRADE_EVENT_ICONS, tradeEventLabel } from '../../../shared/offers/trade-labels';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';

interface TimelineEntry {
  id: string;
  icon: string;
  label: string;
  reason: string | null;
  at: string;
}

/** The trade's timeline, oldest first (who did what, the cancel reason). */
@Component({
  selector: 'app-trade-timeline',
  imports: [DatePipe, MatIconModule, RelativeTimePipe],
  template: `
    <ol class="timeline" aria-label="Trade timeline">
      @for (entry of entries(); track entry.id) {
        <li class="step">
          <span class="step__dot" aria-hidden="true"
            ><mat-icon>{{ entry.icon }}</mat-icon></span
          >
          <div class="step__body">
            <p class="step__label">{{ entry.label }}</p>
            @if (entry.reason) {
              <p class="step__reason">Reason: “{{ entry.reason }}”</p>
            }
            <time class="step__time" [attr.datetime]="entry.at" [title]="entry.at | date: 'medium'">
              {{ entry.at | relativeTime }}
            </time>
          </div>
        </li>
      }
    </ol>
  `,
  styles: `
    .timeline {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .step {
      position: relative;
      display: flex;
      gap: var(--spacing-3);
      padding-bottom: var(--spacing-4);
    }
    .step:not(:last-child)::before {
      position: absolute;
      top: 30px;
      bottom: 0;
      left: 14px;
      width: 2px;
      background: var(--color-border);
      content: '';
    }
    .step__dot {
      display: grid;
      flex: 0 0 auto;
      place-items: center;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      background: var(--color-surface-variant);
      color: var(--color-text-muted);
    }
    .step:last-child .step__dot {
      background: var(--color-primary-container);
      color: var(--color-on-primary-container);
    }
    .step__dot mat-icon {
      width: 16px;
      height: 16px;
      font-size: 16px;
    }
    .step__body {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding-top: 4px;
      min-width: 0;
    }
    .step__label {
      margin: 0;
      color: var(--color-ink);
      font-weight: var(--font-weight-medium);
    }
    .step__reason {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
      font-style: italic;
      overflow-wrap: anywhere;
    }
    .step__time {
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TradeTimelineComponent {
  readonly timeline = input.required<readonly TradeEvent[]>();
  readonly viewerRole = input.required<OfferRole>();
  readonly sellerName = input.required<string>();
  readonly buyerName = input.required<string>();

  protected readonly entries = computed<TimelineEntry[]>(() => {
    const names = { SELLER: this.sellerName(), BUYER: this.buyerName() };
    return this.timeline().map((event) => {
      const reason = event.details?.['reason'];
      return {
        id: event.id,
        icon: TRADE_EVENT_ICONS[event.event] ?? 'info',
        label: tradeEventLabel(event.event, event.actorRole ?? null, this.viewerRole(), names),
        reason: typeof reason === 'string' ? reason : null,
        at: event.createdAt,
      };
    });
  });
}
