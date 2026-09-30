import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { AdminPaymentDetail, AdminPaymentsService, RefundPaymentRequest } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import {
  formatDateTime,
  money,
  paymentEventLabel,
  providerLabel,
  refundableOf,
} from '../../../shared/payments/payment-labels';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { AdminChipComponent } from '../shared/admin-chip.component';
import { runAdminAction } from '../shared/admin-actions';
import {
  disputeLabel,
  disputeTone,
  paymentLabel,
  paymentTone,
  tradeLabel,
  webhookLabel,
  webhookTone,
} from './admin-payment-labels';
import { RefundDialogComponent, RefundDialogData } from './refund-dialog.component';

interface Fact {
  label: string;
  value: string;
  mono?: boolean;
}

/**
 * `/admin/payments/:id` (ADMIN): one protected payment with its amounts, parties, shipment and
 * dispute, the payment events, refunds and linked provider webhooks. "Refund" (only when
 * `refundAllowed`: SUPER_ADMIN, or ADMIN under the refund policy, a secured payment without an
 * open dispute) asks for the amount and a reason, then a confirmation. Audited.
 */
@Component({
  selector: 'app-admin-payment-detail-page',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    AdminChipComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    RelativeTimePipe,
    SkeletonComponent,
  ],
  template: `
    <div class="admin-page pd">
      <a class="pd__back" routerLink="/admin/payments">
        <mat-icon aria-hidden="true">arrow_back</mat-icon>
        Payments
      </a>
      @if (error(); as error) {
        @if (error.status === 404) {
          <app-empty-state icon="payments" title="This payment does not exist" />
        } @else {
          <app-error-state
            title="The payment could not load"
            [message]="errorMessage()"
            [requestId]="error.requestId"
            (retry)="load()"
          />
        }
      } @else if (detail(); as d) {
        @let t = d.transaction;
        <header class="pd__head">
          <div>
            <p class="admin-muted">Protected payment · {{ provider() }}</p>
            <h1 class="pd__title">{{ t.summary }}</h1>
            <div class="pd__chips" data-testid="payment-chips">
              <app-admin-chip [tone]="paymentTone(t.paymentStatus)">{{
                paymentLabel(t.paymentStatus)
              }}</app-admin-chip>
              @if (t.tradeStatus) {
                <app-admin-chip tone="neutral"
                  >Trade: {{ tradeLabel(t.tradeStatus) }}</app-admin-chip
                >
              }
              @if (t.payoutFrozen) {
                <app-admin-chip tone="warning">Payout frozen</app-admin-chip>
              }
            </div>
          </div>
          <div class="pd__actions">
            @if (d.refundAllowed) {
              <button matButton="filled" type="button" [disabled]="busy()" (click)="refund()">
                <mat-icon aria-hidden="true">currency_exchange</mat-icon>
                {{ busy() ? 'Refunding…' : 'Refund' }}
              </button>
            } @else {
              <p class="admin-muted pd__why">{{ refundHint() }}</p>
            }
            <a
              matButton
              routerLink="/admin/audit-logs"
              [queryParams]="{ targetType: 'PAYMENT', targetId: t.paymentId }"
            >
              <mat-icon aria-hidden="true">history</mat-icon>
              Audit log
            </a>
          </div>
        </header>

        <section class="admin-card" aria-labelledby="pd-facts">
          <h2 id="pd-facts">Details</h2>
          <dl class="pd__facts">
            @for (fact of facts(); track fact.label) {
              <div>
                <dt>{{ fact.label }}</dt>
                <dd [class.mono]="fact.mono">{{ fact.value }}</dd>
              </div>
            }
          </dl>
          <p class="pd__links">
            <a [routerLink]="['/admin/users', t.buyer.id]">Buyer &#64;{{ t.buyer.handle }}</a>
            <a [routerLink]="['/admin/users', t.seller.id]">Seller &#64;{{ t.seller.handle }}</a>
            @if (t.disputeId) {
              <a [routerLink]="['/admin/disputes', t.disputeId]">
                Dispute
                <app-admin-chip [tone]="disputeTone(t.disputeStatus)">{{
                  disputeLabel(t.disputeStatus)
                }}</app-admin-chip>
              </a>
            }
          </p>
        </section>

        <div class="pd__grid">
          <section class="admin-card" aria-labelledby="pd-events">
            <h2 id="pd-events">Payment events</h2>
            @if (d.events.length === 0) {
              <p class="admin-muted">No events.</p>
            } @else {
              <ol class="pd__list" aria-label="Payment events">
                @for (event of d.events; track event.id) {
                  <li>
                    <strong>{{ eventLabel(event.event) }}</strong>
                    <time class="admin-muted" [title]="event.createdAt | date: 'medium'">{{
                      event.createdAt | relativeTime
                    }}</time>
                  </li>
                }
              </ol>
            }
          </section>
          <section class="admin-card" aria-labelledby="pd-refunds">
            <h2 id="pd-refunds">Refunds</h2>
            @if (d.refunds.length === 0) {
              <p class="admin-muted">No refunds.</p>
            } @else {
              <ol class="pd__list" aria-label="Refunds">
                @for (refund of d.refunds; track refund.id) {
                  <li data-testid="refund-row">
                    <strong>{{ money(refund.amount, refund.currency) }}</strong>
                    <app-admin-chip [tone]="refund.status === 'SUCCEEDED' ? 'success' : 'info'">{{
                      refund.status
                    }}</app-admin-chip>
                    <span class="admin-muted">{{ refund.source }} · “{{ refund.reason }}”</span>
                    <time class="admin-muted">{{ refund.createdAt | date: 'MMM d, h:mm a' }}</time>
                  </li>
                }
              </ol>
            }
          </section>
          <section class="admin-card" aria-labelledby="pd-webhooks">
            <h2 id="pd-webhooks">Provider webhooks</h2>
            @if (d.webhooks.length === 0) {
              <p class="admin-muted">No webhooks for this payment.</p>
            } @else {
              <ol class="pd__list" aria-label="Webhooks">
                @for (hook of d.webhooks; track hook.id) {
                  <li>
                    <span class="mono">{{ hook.type }}</span>
                    <app-admin-chip [tone]="webhookTone(hook.status)">{{
                      webhookLabel(hook.status)
                    }}</app-admin-chip>
                    <time class="admin-muted">{{ hook.receivedAt | relativeTime }}</time>
                  </li>
                }
              </ol>
            }
          </section>
        </div>
      } @else {
        <div aria-busy="true">
          <span class="visually-hidden">Loading the payment</span>
          <app-skeleton height="96px" />
          <app-skeleton variant="list" lines="6" />
        </div>
      }
    </div>
  `,
  styleUrls: ['../shared/admin-page.scss'],
  styles: `
    .pd {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-4);
    }
    .pd__back {
      display: inline-flex;
      align-items: center;
      gap: var(--spacing-1);
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
      text-decoration: none;
    }
    .pd__head {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--spacing-3);
    }
    .pd__title {
      margin: 2px 0 var(--spacing-2);
      font-size: var(--font-size-2xl);
    }
    .pd__chips,
    .pd__actions,
    .pd__links {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--spacing-2);
    }
    .pd__why {
      max-width: 320px;
    }
    .pd__facts {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: var(--spacing-3);
      margin: 0 0 var(--spacing-3);
    }
    .pd__facts dt {
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .pd__facts dd {
      margin: 2px 0 0;
      font-variant-numeric: tabular-nums;
      overflow-wrap: anywhere;
    }
    .pd__links {
      gap: var(--spacing-4);
      margin: 0;
    }
    .pd__grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: var(--spacing-4);
      align-items: start;
    }
    .pd__list {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .pd__list li {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--spacing-2);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminPaymentDetailPageComponent {
  private readonly api = inject(AdminPaymentsService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  readonly id = input.required<string>();

  protected readonly detail = signal<AdminPaymentDetail | null>(null);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly busy = signal(false);
  protected readonly errorMessage = computed(() => {
    const error = this.error();
    return error ? friendlyMessage(error) : '';
  });
  protected readonly provider = computed(() => providerLabel(this.detail()?.transaction.provider));
  protected readonly facts = computed<Fact[]>(() => {
    const t = this.detail()?.transaction;
    if (!t) {
      return [];
    }
    const date = (value: string | null | undefined) => formatDateTime(value) || '—';
    return [
      { label: 'Amount', value: money(t.amount, t.currency) },
      { label: `Platform fee (${t.feePercent}%)`, value: money(t.platformFee, t.currency) },
      { label: 'Seller share', value: money(t.sellerAmount, t.currency) },
      { label: 'Refunded', value: money(t.refundedAmount, t.currency) },
      {
        label: 'Payout',
        value:
          t.payoutAmount !== null && t.payoutAmount !== undefined
            ? money(t.payoutAmount, t.currency)
            : '—',
      },
      { label: 'Secured', value: date(t.securedAt) },
      { label: 'Shipped', value: date(t.shippedAt) },
      { label: 'Carrier', value: t.carrier ?? '—' },
      { label: 'Tracking', value: t.trackingNumber ?? '—', mono: !!t.trackingNumber },
      { label: 'Dispute window ends', value: date(t.disputeWindowEndsAt) },
      { label: 'Payout released', value: date(t.payoutReleasedAt) },
      { label: 'Payment id', value: t.paymentId, mono: true },
      { label: 'Trade id', value: t.tradeId, mono: true },
    ];
  });
  protected readonly refundHint = computed(() => {
    const t = this.detail()?.transaction;
    if (!t) {
      return '';
    }
    if (t.disputeStatus && ['OPEN', 'UNDER_REVIEW', 'FROZEN'].includes(t.disputeStatus)) {
      return 'An open dispute holds this payment: resolve the dispute instead.';
    }
    if (t.paymentStatus === 'REFUNDED' || refundableOf(t) <= 0) {
      return 'Nothing is left to refund.';
    }
    if (
      !['SECURED', 'PAID_OUT', 'PARTIALLY_REFUNDED', 'PAYOUT_PENDING'].includes(t.paymentStatus)
    ) {
      return 'Only secured payments can be refunded.';
    }
    return 'Refunds need a super admin, or the admin refund policy in Payments → Settings.';
  });

  protected readonly paymentLabel = paymentLabel;
  protected readonly paymentTone = paymentTone;
  protected readonly disputeLabel = disputeLabel;
  protected readonly disputeTone = disputeTone;
  protected readonly webhookLabel = webhookLabel;
  protected readonly webhookTone = webhookTone;
  protected readonly tradeLabel = tradeLabel;
  protected readonly eventLabel = paymentEventLabel;
  protected readonly money = money;

  constructor() {
    effect(() => {
      this.id();
      untracked(() => void this.load());
    });
  }

  protected async load(): Promise<void> {
    this.error.set(null);
    try {
      this.detail.set(
        await firstValueFrom(
          this.api.getAdminPayment({ id: this.id() }, 'body', false, { context: silentErrors() }),
        ),
      );
    } catch (error) {
      this.error.set(toApiError(error));
    }
  }

  protected async refund(): Promise<void> {
    const t = this.detail()?.transaction;
    if (!t) {
      return;
    }
    const request = await firstValueFrom(
      this.dialog
        .open<RefundDialogComponent, RefundDialogData, RefundPaymentRequest>(
          RefundDialogComponent,
          {
            data: {
              summary: t.summary,
              buyerHandle: t.buyer.handle,
              currency: t.currency,
              refundable: refundableOf(t),
              paidOut: !!t.payoutReleasedAt,
            },
            panelClass: 'app-dialog--md',
          },
        )
        .afterClosed(),
    );
    if (!request) {
      return;
    }
    this.busy.set(true);
    const updated = await runAdminAction(
      this.snackBar,
      this.api.refundAdminPayment(
        { id: t.paymentId, refundPaymentRequest: request },
        'body',
        false,
        { context: silentErrors() },
      ),
      `Refunded ${money(request.amount, t.currency)} to @${t.buyer.handle}.`,
      'This payment cannot be refunded any more: it changed meanwhile.',
    );
    this.busy.set(false);
    if (updated) {
      this.detail.set(updated);
    } else {
      await this.load();
    }
  }
}
