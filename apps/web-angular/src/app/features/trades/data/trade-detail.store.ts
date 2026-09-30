import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  Dispute,
  OpenDisputeRequest,
  PaymentsService,
  ProtectedPayment,
  ShipTradeRequest,
  TradeResponse,
  TradesService,
} from '@orenji/api-client';
import { Observable, Subscription, filter, firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { silentErrors } from '../../../core/http/http-context';
import { NotificationCenter } from '../../../core/notifications/notification-center.service';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { offerProblem } from '../../../shared/offers/offer-problems';
import { paymentProblem } from '../../../shared/payments/payment-problems';

export type TradeOperation =
  | 'MARK_MEETUP'
  | 'CONFIRM_COMPLETION'
  | 'CANCEL'
  | 'PAY'
  | 'SHIP'
  | 'CONFIRM_RECEIPT'
  | 'OPEN_DISPUTE';

/** Operations of payment protection (Phase 9): refusals are worded by `paymentProblem`. */
const PROTECTED_OPERATIONS = new Set<TradeOperation>([
  'PAY',
  'SHIP',
  'CONFIRM_RECEIPT',
  'OPEN_DISPUTE',
]);
export type TradePageStatus = 'loading' | 'ready' | 'not-found' | 'error';

export interface TradeNotice {
  tone: 'success' | 'info' | 'warning';
  message: string;
}

/**
 * `/trades/:id`: one trade with its timeline and next action. Operations (mark the meetup,
 * confirm the exchange, cancel with a reason, and with payment protection: pay, ship, confirm
 * receipt, open a dispute) are only offered from `allowedOperations`; a refusal
 * (409 INVALID_STATE_TRANSITION, ITEM_UNAVAILABLE, SELLER_NOT_ONBOARDED, DISPUTE_WINDOW_CLOSED…)
 * is explained and the trade re-read when it changed. Notifications about this trade
 * (TRADE_UPDATE, PAYMENT_UPDATE, SHIPMENT_STATUS, DISPUTE_UPDATE) and realtime reconnections
 * re-read it. Provided by the trade page.
 */
@Injectable()
export class TradeDetailStore {
  private readonly api = inject(TradesService);
  private readonly payments = inject(PaymentsService);
  private readonly center = inject(NotificationCenter);
  private readonly realtime = inject(RealtimeService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly tradeState = signal<TradeResponse | null>(null);
  private readonly statusState = signal<TradePageStatus>('loading');
  private readonly errorState = signal<ApiError | null>(null);
  private readonly busyState = signal<TradeOperation | null>(null);
  private readonly noticeState = signal<TradeNotice | null>(null);

  readonly trade = this.tradeState.asReadonly();
  readonly status = this.statusState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly busy = this.busyState.asReadonly();
  readonly notice = this.noticeState.asReadonly();
  readonly otherName = computed(
    () => this.tradeState()?.counterparty.displayName ?? 'the other collector',
  );
  readonly allowed = computed(() => new Set<string>(this.tradeState()?.allowedOperations ?? []));

  private id: string | null = null;
  private loadSubscription: Subscription | null = null;
  private started = false;

  init(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.center.pushed$
      .pipe(
        filter((notification) => {
          const id = this.tradeState()?.id;
          return !!id && notification.data?.['tradeId'] === id;
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => void this.refresh());
    this.realtime.resync$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.refresh());
    this.destroyRef.onDestroy(() => this.loadSubscription?.unsubscribe());
  }

  load(id: string): void {
    this.loadSubscription?.unsubscribe();
    this.id = id;
    if (this.tradeState()?.id !== id) {
      this.statusState.set('loading');
      this.noticeState.set(null);
    }
    this.errorState.set(null);
    this.loadSubscription = this.read(id).subscribe({
      next: (trade) => this.show(trade),
      error: (error: unknown) => this.fail(toApiError(error)),
    });
  }

  retry(): void {
    if (this.id) {
      this.load(this.id);
    }
  }

  dismissNotice(): void {
    this.noticeState.set(null);
  }

  /** Shows a message about this trade (e.g. after the checkout page sent the buyer back). */
  showNotice(notice: TradeNotice): void {
    this.noticeState.set(notice);
  }

  async refresh(): Promise<void> {
    const id = this.id;
    if (!id || this.statusState() !== 'ready') {
      return;
    }
    try {
      const trade = await firstValueFrom(this.read(id));
      if (id === this.id) {
        this.show(trade);
      }
    } catch {
      // Keep what is on screen.
    }
  }

  markMeetup(): Promise<TradeResponse | null> {
    return this.act('MARK_MEETUP', (trade) =>
      this.api.markTradeMeetup({ id: trade.id }, 'body', false, { context: silentErrors() }),
    );
  }

  confirmCompletion(): Promise<TradeResponse | null> {
    return this.act('CONFIRM_COMPLETION', (trade) =>
      this.api.completeTrade({ id: trade.id }, 'body', false, { context: silentErrors() }),
    );
  }

  cancel(reason: string): Promise<TradeResponse | null> {
    return this.act('CANCEL', (trade) =>
      this.api.cancelTrade({ id: trade.id, cancelTradeRequest: { reason } }, 'body', false, {
        context: silentErrors(),
      }),
    );
  }

  /**
   * Starts (or resumes) the protected checkout; resolves where to pay. The trade stays
   * AWAITING_PAYMENT until the provider secures the payment, so the page moves on to the checkout.
   */
  /**
   * Starts (or resumes) the protected checkout; resolves where to pay. The trade stays
   * AWAITING_PAYMENT until the provider secures the payment, so the page moves on to the checkout.
   */
  pay(): Promise<ProtectedPayment | null> {
    return this.run('PAY', (trade) =>
      firstValueFrom(
        this.payments.payTrade({ id: trade.id }, 'body', false, { context: silentErrors() }),
      ),
    );
  }

  ship(request: ShipTradeRequest): Promise<TradeResponse | null> {
    return this.act('SHIP', (trade) =>
      this.payments.shipTrade({ id: trade.id, shipTradeRequest: request }, 'body', false, {
        context: silentErrors(),
      }),
    );
  }

  confirmReceipt(): Promise<TradeResponse | null> {
    return this.act('CONFIRM_RECEIPT', (trade) =>
      this.payments.confirmTradeReceipt({ id: trade.id }, 'body', false, {
        context: silentErrors(),
      }),
    );
  }

  /** Opens a dispute; resolves it (the page goes to `/disputes/:id`) or `null` when refused. */
  openDispute(request: OpenDisputeRequest): Promise<Dispute | null> {
    return this.run('OPEN_DISPUTE', (trade) =>
      firstValueFrom(
        this.payments.openTradeDispute(
          { id: trade.id, openDisputeRequest: request },
          'body',
          false,
          { context: silentErrors() },
        ),
      ),
    );
  }

  /** An operation answering the updated trade, shown with a success notice. */
  private act(
    operation: TradeOperation,
    call: (trade: TradeResponse) => Observable<TradeResponse>,
  ): Promise<TradeResponse | null> {
    return this.run(operation, async (trade) => {
      const updated = await firstValueFrom(call(trade));
      this.show(updated);
      this.noticeState.set({ tone: 'success', message: this.successMessage(operation, updated) });
      return updated;
    });
  }

  /**
   * Runs one operation at a time: resolves its answer, or `null` when it was refused (the
   * refusal is explained in the notice and the trade re-read when it changed).
   */
  private async run<T>(
    operation: TradeOperation,
    call: (trade: TradeResponse) => Promise<T>,
  ): Promise<T | null> {
    const trade = this.tradeState();
    if (!trade || this.busyState()) {
      return null;
    }
    this.busyState.set(operation);
    this.noticeState.set(null);
    try {
      return await call(trade);
    } catch (error) {
      const apiError = toApiError(error);
      const problem = PROTECTED_OPERATIONS.has(operation)
        ? paymentProblem(apiError, this.otherName())
        : offerProblem(apiError, this.otherName(), 'trade');
      this.noticeState.set({ tone: 'warning', message: problem.message });
      if (problem.reload) {
        await this.refresh();
      }
      return null;
    } finally {
      this.busyState.set(null);
    }
  }

  private successMessage(operation: TradeOperation, trade: TradeResponse): string {
    const other = this.otherName();
    switch (operation) {
      case 'MARK_MEETUP':
        return trade.meetup
          ? 'Meetup agreed: you both chose to meet in person.'
          : `Marked as an in-person meetup. ${other} will be asked to agree.`;
      case 'CONFIRM_COMPLETION':
        return trade.status === 'COMPLETED'
          ? `Trade completed. You can now rate ${other}.`
          : `You confirmed the exchange. Waiting for ${other} to confirm.`;
      case 'CANCEL':
        return `Trade cancelled. ${other} was notified.`;
      case 'SHIP':
        return `Marked as shipped. ${other} was notified and can follow the tracking.`;
      case 'CONFIRM_RECEIPT':
        return trade.status === 'COMPLETED'
          ? `Receipt confirmed: the payout was released to ${other}. You can now rate them.`
          : 'Receipt confirmed. The payout is on its way to the seller.';
      default:
        return 'Done.';
    }
  }

  private read(id: string): Observable<TradeResponse> {
    return this.api.getTrade({ id }, 'body', false, { context: silentErrors() });
  }

  private show(trade: TradeResponse): void {
    this.tradeState.set(trade);
    this.statusState.set('ready');
  }

  private fail(error: ApiError): void {
    if (error.status === 404 || error.errorCode === 'VALIDATION_FAILED') {
      this.tradeState.set(null);
      this.statusState.set('not-found');
    } else {
      this.errorState.set(error);
      this.statusState.set('error');
    }
  }
}
