import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { AdminDispute } from '@orenji/api-client';
import { tradeEventLabel } from '../../../shared/offers/trade-labels';
import { money, paymentEventLabel } from '../../../shared/payments/payment-labels';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';
import { AdminChipComponent } from '../shared/admin-chip.component';
import { webhookLabel, webhookTone } from '../payments/admin-payment-labels';

/** The money trail of an admin dispute: trade timeline, payment events, refunds and webhooks. */
@Component({
  selector: 'app-admin-dispute-history',
  imports: [DatePipe, AdminChipComponent, RelativeTimePipe],
  template: `
    @let d = detail();
    <section class="admin-card" aria-labelledby="adh-trade">
      <h2 id="adh-trade">Trade timeline</h2>
      <ol class="rows" aria-label="Trade timeline">
        @for (entry of tradeEntries(); track entry.id) {
          <li>
            <span>{{ entry.label }}</span>
            <time class="admin-muted" [title]="entry.at | date: 'medium'">{{
              entry.at | relativeTime
            }}</time>
          </li>
        }
      </ol>
    </section>
    <section class="admin-card" aria-labelledby="adh-payment">
      <h2 id="adh-payment">Payment events</h2>
      @if (d.paymentEvents.length === 0) {
        <p class="admin-muted">No events.</p>
      } @else {
        <ol class="rows" aria-label="Payment events">
          @for (event of d.paymentEvents; track event.id) {
            <li>
              <span>{{ eventLabel(event.event) }}</span>
              <time class="admin-muted">{{ event.createdAt | relativeTime }}</time>
            </li>
          }
        </ol>
      }
    </section>
    <section class="admin-card" aria-labelledby="adh-refunds">
      <h2 id="adh-refunds">Refunds</h2>
      @if (d.refunds.length === 0) {
        <p class="admin-muted">No refunds.</p>
      } @else {
        <ol class="rows" aria-label="Refunds">
          @for (refund of d.refunds; track refund.id) {
            <li>
              <strong>{{ money(refund.amount, refund.currency) }}</strong>
              <span class="admin-muted">{{ refund.status }} · {{ refund.source }}</span>
            </li>
          }
        </ol>
      }
    </section>
    <section class="admin-card" aria-labelledby="adh-webhooks">
      <h2 id="adh-webhooks">Provider webhooks</h2>
      @if (d.webhooks.length === 0) {
        <p class="admin-muted">No webhooks.</p>
      } @else {
        <ol class="rows" aria-label="Webhooks">
          @for (hook of d.webhooks; track hook.id) {
            <li>
              <span class="mono">{{ hook.type }}</span>
              <app-admin-chip [tone]="hookTone(hook.status)">{{
                hookLabel(hook.status)
              }}</app-admin-chip>
            </li>
          }
        </ol>
      }
    </section>
  `,
  styleUrls: ['../shared/admin-page.scss'],
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-3);
    }
    .admin-card {
      padding: var(--spacing-4);
    }
    .rows {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-2);
      margin: 0;
      padding: 0;
      list-style: none;
      font-size: var(--font-size-sm);
    }
    .rows li {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-2);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDisputeHistoryComponent {
  readonly detail = input.required<AdminDispute>();

  protected readonly money = money;
  protected readonly eventLabel = paymentEventLabel;
  protected readonly hookLabel = webhookLabel;
  protected readonly hookTone = webhookTone;
  protected readonly tradeEntries = computed(() => {
    const d = this.detail();
    const names = { BUYER: d.dispute.buyer.displayName, SELLER: d.dispute.seller.displayName };
    return d.tradeTimeline.map((event) => ({
      id: event.id,
      label: tradeEventLabel(event.event, event.actorRole ?? null, null, names, event.details),
      at: event.createdAt,
    }));
  });
}
