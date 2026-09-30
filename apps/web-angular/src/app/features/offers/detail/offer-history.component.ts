import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import type { OfferEvent } from '@orenji/api-client';
import {
  OFFER_EVENT_ICONS,
  OfferRole,
  offerEventLabel,
  offerTermsText,
} from '../../../shared/offers/offer-labels';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';

interface HistoryEntry {
  id: string;
  icon: string;
  label: string;
  terms: string | null;
  reason: string | null;
  note: string | null;
  at: string;
  tone: 'buyer' | 'seller' | 'system';
  mine: boolean;
}

/**
 * The negotiation's history (the whole counter chain, oldest first): who did what, the terms of
 * every proposal and the reasons given. Only the other party's latest "viewed" entry is shown.
 */
@Component({
  selector: 'app-offer-history',
  imports: [DatePipe, MatIconModule, RelativeTimePipe],
  template: `
    <ol class="timeline" aria-label="Offer history">
      @for (entry of entries(); track entry.id) {
        <li class="step" [attr.data-tone]="entry.tone" [class.step--mine]="entry.mine">
          <span class="step__dot" aria-hidden="true"
            ><mat-icon>{{ entry.icon }}</mat-icon></span
          >
          <div class="step__body">
            <p class="step__label">{{ entry.label }}</p>
            @if (entry.terms) {
              <p class="step__terms">{{ entry.terms }}</p>
            }
            @if (entry.note) {
              <p class="step__quote">“{{ entry.note }}”</p>
            }
            @if (entry.reason) {
              <p class="step__quote">Reason: “{{ entry.reason }}”</p>
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
      position: relative;
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
      top: 32px;
      bottom: 0;
      left: 15px;
      width: 2px;
      background: var(--color-border);
      content: '';
    }
    .step__dot {
      display: grid;
      flex: 0 0 auto;
      place-items: center;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: var(--color-surface-variant);
      color: var(--color-text-muted);
    }
    .step__dot mat-icon {
      width: 18px;
      height: 18px;
      font-size: 18px;
    }
    .step[data-tone='buyer'] .step__dot {
      background: color-mix(in srgb, var(--color-accent) 16%, var(--color-surface));
      color: var(--color-accent);
    }
    .step[data-tone='seller'] .step__dot {
      background: color-mix(in srgb, var(--color-primary) 16%, var(--color-surface));
      color: var(--color-primary);
    }
    .step:last-child .step__dot {
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 25%, transparent);
    }
    .step__body {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
      padding-top: 5px;
    }
    .step__label {
      margin: 0;
      color: var(--color-ink);
      font-weight: var(--font-weight-semibold);
    }
    .step__terms {
      margin: 0;
      color: var(--color-ink);
      font-size: var(--font-size-sm);
    }
    .step__quote {
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
export class OfferHistoryComponent {
  readonly history = input.required<readonly OfferEvent[]>();
  readonly viewerRole = input.required<OfferRole>();
  readonly sellerName = input.required<string>();
  readonly buyerName = input.required<string>();

  protected readonly entries = computed<HistoryEntry[]>(() => {
    const names = { SELLER: this.sellerName(), BUYER: this.buyerName() };
    const viewer = this.viewerRole();
    // "Viewed" matters only when the other party saw a proposal: keep their latest view.
    const events = this.history();
    let lastViewed = -1;
    events.forEach((event, index) => {
      if ((event.event as string) === 'VIEWED' && (event.actorRole as string) !== viewer) {
        lastViewed = index;
      }
    });
    return events
      .filter((event, index) => (event.event as string) !== 'VIEWED' || index === lastViewed)
      .map((event) => {
        const proposal = event.event === 'CREATED' || event.event === 'COUNTERED';
        const actor = event.actorRole ?? null;
        return {
          id: event.id,
          icon: OFFER_EVENT_ICONS[event.event] ?? 'info',
          label: offerEventLabel(event.event, actor, viewer, names),
          terms: proposal
            ? offerTermsText({
                kind: event.terms.kind,
                cashAmount: event.terms.cashAmount,
                currency: event.terms.currency,
                cards: event.terms.tradeItems,
              }) + this.cardNames(event)
            : null,
          reason: event.reason ?? null,
          note: proposal ? (event.terms.message ?? null) : null,
          at: event.createdAt,
          tone: actor === 'BUYER' ? 'buyer' : actor === 'SELLER' ? 'seller' : 'system',
          mine: actor === viewer,
        };
      });
  });

  private cardNames(event: OfferEvent): string {
    const names = event.terms.tradeItems.map((line) =>
      line.quantity > 1 ? `${line.cardName} ×${line.quantity}` : line.cardName,
    );
    return names.length > 0 ? ` (${names.join(', ')})` : '';
  }
}
