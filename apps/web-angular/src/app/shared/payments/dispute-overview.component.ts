import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import type { Dispute } from '@orenji/api-client';
import { StatusChipComponent } from '../offers/status-chip.component';
import {
  disputeReasonLabel,
  disputeStatusInfo,
  isOpenDispute,
  money,
  paymentStatusInfo,
} from './payment-labels';

export type DisputeViewer = 'BUYER' | 'SELLER' | 'ADMIN';

interface Fact {
  key: string;
  label: string;
  value: string;
  mono?: boolean;
}

/**
 * The summary of a dispute for its parties and for admins: reason and status, the buyer's
 * description, the parties (handle and display name only), the protected payment (paid, refunded,
 * payout held or released), the shipment and the decision once resolved.
 */
@Component({
  selector: 'app-dispute-overview',
  imports: [DatePipe, MatIconModule, StatusChipComponent],
  template: `
    @let d = dispute();
    <section class="do" aria-labelledby="do-title" data-testid="dispute-overview">
      <header class="do__head">
        <div>
          <p class="do__eyebrow">{{ d.summary }}</p>
          <h2 id="do-title" class="do__title">{{ reason() }}</h2>
        </div>
        <div class="do__chips" data-testid="dispute-chips">
          <app-status-chip [label]="status().label" [icon]="status().icon" [tone]="status().tone" />
          <app-status-chip
            [label]="payment().label"
            [icon]="payment().icon"
            [tone]="payment().tone"
          />
        </div>
      </header>
      <blockquote class="do__description">
        <p>{{ d.description }}</p>
        <footer>
          {{ buyerName() }} · opened
          <time [attr.datetime]="d.openedAt">{{ d.openedAt | date: 'MMM d, y, h:mm a' }}</time>
        </footer>
      </blockquote>

      @if (resolved()) {
        <div class="do__decision" role="status" data-testid="dispute-decision">
          <mat-icon aria-hidden="true">balance</mat-icon>
          <div>
            <p class="do__decision-title">{{ status().label }}</p>
            @if (d.refundAmount) {
              <p>Refund to the buyer: {{ refund() }}</p>
            }
            @if (d.resolutionNote) {
              <p class="do__note">“{{ d.resolutionNote }}”</p>
            }
          </div>
        </div>
      } @else if (d.status === 'FROZEN') {
        <p class="do__hold" role="status">
          <mat-icon aria-hidden="true">ac_unit</mat-icon>
          OrenjiTrade put this dispute on hold while it checks the case. Evidence and messages are
          paused; the payout stays on hold.
        </p>
      } @else if (open() && d.payment.payoutFrozen) {
        <p class="do__hold do__hold--info" role="note">
          <mat-icon aria-hidden="true">pause_circle</mat-icon>
          The payout is on hold until an OrenjiTrade admin decides.
        </p>
      }

      <dl class="do__facts">
        @for (fact of facts(); track fact.key) {
          <div class="do__fact">
            <dt>{{ fact.label }}</dt>
            <dd [class.mono]="fact.mono">{{ fact.value }}</dd>
          </div>
        }
      </dl>
    </section>
  `,
  styles: `
    .do {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-4);
      padding: var(--spacing-5);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
    }
    .do__head {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--spacing-3);
    }
    .do__eyebrow {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .do__title {
      margin: 2px 0 0;
      font-size: var(--font-size-xl);
    }
    .do__chips {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-2);
    }
    .do__description {
      margin: 0;
      padding: var(--spacing-3) var(--spacing-4);
      border-left: 3px solid var(--color-primary);
      border-radius: 0 var(--radius-md) var(--radius-md) 0;
      background: var(--color-surface-variant);
    }
    .do__description p {
      margin: 0 0 var(--spacing-2);
      white-space: pre-line;
      overflow-wrap: anywhere;
    }
    .do__description footer {
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .do__decision,
    .do__hold {
      display: flex;
      gap: var(--spacing-3);
      margin: 0;
      padding: var(--spacing-3) var(--spacing-4);
      border-radius: var(--radius-md);
      font-size: var(--font-size-sm);
    }
    .do__decision {
      background: color-mix(in srgb, var(--color-success) 12%, var(--color-surface));
    }
    .do__decision p {
      margin: 0;
    }
    .do__decision-title {
      font-weight: var(--font-weight-semibold);
    }
    .do__note {
      font-style: italic;
      overflow-wrap: anywhere;
    }
    .do__decision mat-icon {
      flex: 0 0 auto;
      color: var(--color-success);
    }
    .do__hold {
      align-items: center;
      background: color-mix(in srgb, var(--color-warning) 16%, var(--color-surface));
    }
    .do__hold--info {
      background: color-mix(in srgb, var(--color-info) 10%, var(--color-surface));
    }
    .do__hold mat-icon {
      flex: 0 0 auto;
    }
    .do__facts {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: var(--spacing-3);
      margin: 0;
    }
    .do__fact dt {
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-medium);
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }
    .do__fact dd {
      margin: 2px 0 0;
      color: var(--color-ink);
      font-variant-numeric: tabular-nums;
      overflow-wrap: anywhere;
    }
    @media (max-width: 599px) {
      .do {
        padding: var(--spacing-4);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DisputeOverviewComponent {
  readonly dispute = input.required<Dispute>();
  readonly viewer = input<DisputeViewer>('ADMIN');

  protected readonly status = computed(() => disputeStatusInfo(this.dispute().status));
  protected readonly payment = computed(() => paymentStatusInfo(this.dispute().payment.status));
  protected readonly reason = computed(() => disputeReasonLabel(this.dispute().reason));
  protected readonly open = computed(() => isOpenDispute(this.dispute().status));
  protected readonly resolved = computed(() => !this.open() && !!this.dispute().resolvedAt);
  protected readonly refund = computed(() =>
    money(this.dispute().refundAmount, this.dispute().payment.currency),
  );
  protected readonly buyerName = computed(() =>
    this.viewer() === 'BUYER' ? 'You' : this.dispute().buyer.displayName,
  );
  protected readonly facts = computed<Fact[]>(() => {
    const d = this.dispute();
    const viewer = this.viewer();
    const p = d.payment;
    const who = (role: 'BUYER' | 'SELLER', party: { displayName: string; handle: string }) =>
      `${party.displayName} (@${party.handle})${viewer === role ? ' · you' : ''}`;
    const facts: Fact[] = [
      { key: 'buyer', label: 'Buyer', value: who('BUYER', d.buyer) },
      { key: 'seller', label: 'Seller', value: who('SELLER', d.seller) },
      { key: 'paid', label: 'Paid', value: money(p.amount, p.currency) },
    ];
    if (p.refundedAmount > 0) {
      facts.push({
        key: 'refunded',
        label: 'Refunded',
        value: money(p.refundedAmount, p.currency),
      });
    }
    facts.push({
      key: 'payout',
      label: 'Payout',
      value:
        p.payoutAmount !== null && p.payoutAmount !== undefined
          ? `${money(p.payoutAmount, p.currency)} released`
          : p.payoutFrozen
            ? 'On hold'
            : 'Not released',
    });
    if (d.shipment) {
      facts.push({ key: 'carrier', label: 'Carrier', value: d.shipment.carrier || 'Not given' });
      facts.push({
        key: 'tracking',
        label: 'Tracking',
        value: d.shipment.trackingNumber || 'Not given',
        mono: !!d.shipment.trackingNumber,
      });
    } else {
      facts.push({ key: 'shipment', label: 'Shipment', value: 'Not shipped' });
    }
    return facts;
  });
}
