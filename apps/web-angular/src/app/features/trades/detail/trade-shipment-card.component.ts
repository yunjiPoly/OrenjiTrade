import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import type { ShipmentSummary } from '@orenji/api-client';

/** The seller's shipping confirmation of a protected trade: carrier, tracking and notes. */
@Component({
  selector: 'app-trade-shipment-card',
  imports: [DatePipe, MatIconModule],
  template: `
    @let s = shipment();
    <section class="sc" aria-labelledby="sc-title" data-testid="shipment-card">
      <h2 id="sc-title" class="sc__title">
        <mat-icon aria-hidden="true">local_shipping</mat-icon>
        Shipment
      </h2>
      <dl class="sc__rows">
        <div class="sc__row">
          <dt>Shipped</dt>
          <dd>
            <time [attr.datetime]="s.shippedAt">{{ s.shippedAt | date: 'MMM d, h:mm a' }}</time>
          </dd>
        </div>
        <div class="sc__row">
          <dt>Carrier</dt>
          <dd>{{ s.carrier || 'Not given' }}</dd>
        </div>
        <div class="sc__row">
          <dt>Tracking number</dt>
          <dd class="mono" data-testid="shipment-tracking">
            {{ s.trackingNumber || 'Not given' }}
          </dd>
        </div>
        @if (s.deliveredAt) {
          <div class="sc__row">
            <dt>Delivered</dt>
            <dd>{{ s.deliveredAt | date: 'MMM d, h:mm a' }}</dd>
          </div>
        }
      </dl>
      @if (s.sellerNotes) {
        <p class="sc__notes">“{{ s.sellerNotes }}”</p>
      }
    </section>
  `,
  styles: `
    .sc {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-3);
      padding: var(--spacing-4);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
    }
    .sc__title {
      display: inline-flex;
      align-items: center;
      gap: var(--spacing-2);
      margin: 0;
      font-size: var(--font-size-lg);
    }
    .sc__title mat-icon {
      color: var(--color-info);
    }
    .sc__rows {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-1);
      margin: 0;
    }
    .sc__row {
      display: flex;
      justify-content: space-between;
      gap: var(--spacing-3);
      font-size: var(--font-size-sm);
    }
    .sc__row dt {
      color: var(--color-text-muted);
    }
    .sc__row dd {
      margin: 0;
      overflow-wrap: anywhere;
      text-align: right;
    }
    .sc__notes {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
      font-style: italic;
      overflow-wrap: anywhere;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TradeShipmentCardComponent {
  readonly shipment = input.required<ShipmentSummary>();
}
