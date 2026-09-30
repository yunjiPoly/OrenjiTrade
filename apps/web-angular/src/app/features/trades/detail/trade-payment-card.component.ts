import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import type { PaymentSummary } from '@orenji/api-client';
import type { OfferRole } from '../../../shared/offers/offer-labels';
import { StatusChipComponent } from '../../../shared/offers/status-chip.component';
import { money, paymentStatusInfo, providerLabel } from '../../../shared/payments/payment-labels';
import { ProtectionExplainerComponent } from '../../../shared/payments/protection-explainer.component';

interface Row {
  key: string;
  label: string;
  value: string;
  strong?: boolean;
}

/**
 * The protected payment of a trade (Phase 9 `PaymentSummary`): its status, what the buyer pays,
 * the platform fee, what the seller receives, refunds and the released payout, the end of the
 * dispute window and whether a dispute holds the payout. Worded for the viewer's side.
 */
@Component({
  selector: 'app-trade-payment-card',
  imports: [DatePipe, MatIconModule, ProtectionExplainerComponent, StatusChipComponent],
  template: `
    @let p = payment();
    <section class="pc" aria-labelledby="pc-title" data-testid="payment-card">
      <header class="pc__head">
        <h2 id="pc-title" class="pc__title">
          <mat-icon aria-hidden="true">verified_user</mat-icon>
          Payment protection
        </h2>
        <app-status-chip [label]="status().label" [icon]="status().icon" [tone]="status().tone" />
      </header>
      <dl class="pc__rows">
        @for (row of rows(); track row.key) {
          <div
            class="pc__row"
            [class.pc__row--strong]="row.strong"
            [attr.data-testid]="'payment-' + row.key"
          >
            <dt>{{ row.label }}</dt>
            <dd>{{ row.value }}</dd>
          </div>
        }
      </dl>
      @if (p.payoutFrozen) {
        <p class="pc__hold" role="note">
          <mat-icon aria-hidden="true">ac_unit</mat-icon>
          The payout is on hold while a dispute is reviewed.
        </p>
      } @else if (p.disputeWindowEndsAt && !p.payoutReleasedAt && !p.refundedAt) {
        <p class="pc__window">
          <mat-icon aria-hidden="true">event</mat-icon>
          <span>
            Dispute window ends
            <time [attr.datetime]="p.disputeWindowEndsAt">{{
              p.disputeWindowEndsAt | date: 'MMM d, h:mm a'
            }}</time>
          </span>
        </p>
      }
      <p class="pc__provider">
        Processed by {{ provider() }}. OrenjiTrade never sees card details.
      </p>
      <app-protection-explainer collapsed />
    </section>
  `,
  styles: `
    .pc {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-3);
      padding: var(--spacing-4);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
    }
    .pc__head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-2);
    }
    .pc__title {
      display: inline-flex;
      align-items: center;
      gap: var(--spacing-2);
      margin: 0;
      font-size: var(--font-size-lg);
    }
    .pc__title mat-icon {
      color: var(--color-success);
    }
    .pc__rows {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-1);
      margin: 0;
    }
    .pc__row {
      display: flex;
      justify-content: space-between;
      gap: var(--spacing-3);
      font-size: var(--font-size-sm);
    }
    .pc__row dt {
      color: var(--color-text-muted);
    }
    .pc__row dd {
      margin: 0;
      color: var(--color-ink);
      font-variant-numeric: tabular-nums;
    }
    .pc__row--strong {
      padding-top: var(--spacing-1);
      border-top: 1px dashed var(--color-border);
      font-weight: var(--font-weight-semibold);
    }
    .pc__row--strong dt {
      color: var(--color-ink);
    }
    .pc__hold,
    .pc__window {
      display: flex;
      align-items: center;
      gap: var(--spacing-2);
      margin: 0;
      padding: var(--spacing-2) var(--spacing-3);
      border-radius: var(--radius-md);
      font-size: var(--font-size-sm);
    }
    .pc__hold {
      background: color-mix(in srgb, var(--color-warning) 16%, var(--color-surface));
    }
    .pc__window {
      background: var(--color-surface-variant);
    }
    .pc__hold mat-icon,
    .pc__window mat-icon {
      flex: 0 0 auto;
      width: 18px;
      height: 18px;
      font-size: 18px;
    }
    .pc__provider {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TradePaymentCardComponent {
  readonly payment = input.required<PaymentSummary>();
  readonly viewerRole = input.required<OfferRole>();

  protected readonly status = computed(() => paymentStatusInfo(this.payment().status));
  protected readonly provider = computed(() => providerLabel(this.payment().provider));
  protected readonly rows = computed<Row[]>(() => {
    const p = this.payment();
    const seller = this.viewerRole() === 'SELLER';
    const rows: Row[] = [
      {
        key: 'amount',
        label: seller ? 'Buyer pays' : 'You pay',
        value: money(p.amount, p.currency),
      },
    ];
    // Nothing is paid out of a refunded, cancelled or failed payment: no fee, no seller share.
    const settledWithoutPayout = ['REFUNDED', 'CANCELLED', 'FAILED'].includes(p.status);
    if (p.platformFee !== undefined && !settledWithoutPayout) {
      rows.push({
        key: 'fee',
        label: 'Platform fee (from the payout)',
        value: money(p.platformFee, p.currency),
      });
    }
    if ((p.refundedAmount ?? 0) > 0) {
      rows.push({
        key: 'refunded',
        label: seller ? 'Refunded to the buyer' : 'Refunded to you',
        value: money(p.refundedAmount, p.currency),
      });
    }
    if (p.payoutReleasedAt && p.payoutAmount !== null && p.payoutAmount !== undefined) {
      rows.push({
        key: 'payout',
        label: seller ? 'Payout released to you' : 'Payout released to the seller',
        value: money(p.payoutAmount, p.currency),
        strong: true,
      });
    } else if (p.sellerAmount !== undefined && !settledWithoutPayout) {
      rows.push({
        key: 'seller-amount',
        label: seller ? 'You receive' : 'Seller receives',
        value: money(p.sellerAmount, p.currency),
        strong: true,
      });
    }
    return rows;
  });
}
