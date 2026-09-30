import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import type { AdminTransaction } from '@orenji/api-client';
import { money } from '../../../shared/payments/payment-labels';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';
import { AdminChipComponent } from '../shared/admin-chip.component';
import {
  disputeLabel,
  disputeTone,
  paymentLabel,
  paymentTone,
  tradeLabel,
  transactionMoment,
} from './admin-payment-labels';

/**
 * Protected payments as a table (`AdminTransaction` rows of the transaction and payment lists):
 * the deal, buyer → seller, amount with the fee and the seller's share, payment / trade / dispute
 * statuses and the date that matters now. Each row opens the payment detail.
 */
@Component({
  selector: 'app-admin-transaction-table',
  imports: [
    DatePipe,
    RouterLink,
    MatIconModule,
    MatTableModule,
    AdminChipComponent,
    RelativeTimePipe,
  ],
  template: `
    <div class="table-wrap">
      <table mat-table [dataSource]="rows()" [attr.aria-label]="label()">
        <ng-container matColumnDef="deal">
          <th mat-header-cell *matHeaderCellDef scope="col">Deal</th>
          <td mat-cell *matCellDef="let row">
            <a
              class="deal"
              [routerLink]="['/admin/payments', row.paymentId]"
              [attr.aria-label]="'Payment ' + row.summary + ', ' + paymentLabel(row.paymentStatus)"
              >{{ row.summary }}</a
            >
            <span class="muted">&#64;{{ row.buyer.handle }} → &#64;{{ row.seller.handle }}</span>
          </td>
        </ng-container>
        <ng-container matColumnDef="amount">
          <th mat-header-cell *matHeaderCellDef scope="col">Amount</th>
          <td mat-cell *matCellDef="let row" class="num">
            <strong>{{ money(row.amount, row.currency) }}</strong>
            <span class="muted">
              fee {{ money(row.platformFee, row.currency) }} · seller
              {{ money(row.sellerAmount, row.currency) }}
            </span>
            @if (row.refundedAmount > 0) {
              <span class="muted">refunded {{ money(row.refundedAmount, row.currency) }}</span>
            }
          </td>
        </ng-container>
        <ng-container matColumnDef="status">
          <th mat-header-cell *matHeaderCellDef scope="col">Status</th>
          <td mat-cell *matCellDef="let row">
            <div class="chips">
              <app-admin-chip [tone]="paymentTone(row.paymentStatus)">{{
                paymentLabel(row.paymentStatus)
              }}</app-admin-chip>
              @if (row.tradeStatus) {
                <app-admin-chip tone="neutral"
                  >Trade: {{ tradeLabel(row.tradeStatus) }}</app-admin-chip
                >
              }
              @if (row.disputeStatus) {
                <app-admin-chip [tone]="disputeTone(row.disputeStatus)">
                  Dispute: {{ disputeLabel(row.disputeStatus) }}
                </app-admin-chip>
              }
              @if (row.payoutFrozen) {
                <app-admin-chip tone="warning">Payout frozen</app-admin-chip>
              }
            </div>
          </td>
        </ng-container>
        <ng-container matColumnDef="shipment">
          <th mat-header-cell *matHeaderCellDef scope="col" class="opt">Shipment</th>
          <td mat-cell *matCellDef="let row" class="opt">
            @if (row.shippedAt) {
              {{ row.carrier || 'Shipped' }}
              @if (row.trackingNumber) {
                <span class="muted mono">{{ row.trackingNumber }}</span>
              }
            } @else {
              <span class="muted">Not shipped</span>
            }
          </td>
        </ng-container>
        <ng-container matColumnDef="when">
          <th mat-header-cell *matHeaderCellDef scope="col" class="opt">When</th>
          <td mat-cell *matCellDef="let row" class="opt nowrap">
            @let moment = momentOf(row);
            <span class="muted">{{ moment.label }}</span>
            <time [attr.datetime]="moment.at" [title]="moment.at | date: 'medium'">{{
              moment.at | relativeTime
            }}</time>
          </td>
        </ng-container>
        <tr mat-header-row *matHeaderRowDef="columns"></tr>
        <tr mat-row *matRowDef="let row; columns: columns" data-testid="transaction-row"></tr>
      </table>
    </div>
  `,
  styleUrls: ['../shared/admin-page.scss'],
  styles: `
    .table-wrap {
      overflow-x: auto;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
    }
    table {
      width: 100%;
      --mat-table-background-color: transparent;
    }
    td {
      vertical-align: top;
      padding-top: var(--spacing-2);
      padding-bottom: var(--spacing-2);
    }
    .deal {
      display: block;
      font-weight: var(--font-weight-semibold);
    }
    .muted {
      display: block;
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .num {
      font-variant-numeric: tabular-nums;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .nowrap {
      white-space: nowrap;
    }
    @media (max-width: 719px) {
      .opt {
        display: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminTransactionTableComponent {
  readonly rows = input.required<readonly AdminTransaction[]>();
  readonly label = input('Protected payments');

  protected readonly columns = ['deal', 'amount', 'status', 'shipment', 'when'];
  protected readonly money = money;
  protected readonly paymentLabel = paymentLabel;
  protected readonly paymentTone = paymentTone;
  protected readonly disputeLabel = disputeLabel;
  protected readonly disputeTone = disputeTone;
  protected readonly tradeLabel = tradeLabel;
  protected readonly momentOf = transactionMoment;
}
