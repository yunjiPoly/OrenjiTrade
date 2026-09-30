import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import {
  NotificationResponse,
  OpenDisputeRequestReasonEnum as Reason,
  PaymentsService,
  TradesService,
} from '@orenji/api-client';
import { Subject, of, throwError } from 'rxjs';
import { NotificationCenter } from '../../../core/notifications/notification-center.service';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { tradeResponse } from '../../../shared/offers/testing/offer-fixtures';
import { TradeDetailStore } from './trade-detail.store';
import { parseTradesFilter, tradesRequest } from './trades-list.store';

async function flush(): Promise<void> {
  for (let index = 0; index < 8; index++) {
    await Promise.resolve();
  }
}

describe('trades list query', () => {
  it('maps the status filter of the URL to trade statuses', () => {
    expect(parseTradesFilter('completed')).toBe('completed');
    expect(parseTradesFilter('bogus')).toBe('all');
    expect(tradesRequest('all', null)).toEqual({ limit: 20 });
    expect(tradesRequest('cancelled', 'c-1')).toEqual({
      status: ['CANCELLED'],
      cursor: 'c-1',
      limit: 20,
    });
  });
});

describe('TradeDetailStore', () => {
  let store: TradeDetailStore;
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let payments: Record<string, ReturnType<typeof vi.fn>>;
  let pushed$: Subject<NotificationResponse>;

  beforeEach(() => {
    api = {
      getTrade: vi.fn(() => of(tradeResponse())),
      markTradeMeetup: vi.fn(() =>
        of(
          tradeResponse({
            buyerMarkedMeetup: true,
            allowedOperations: ['CONFIRM_COMPLETION', 'CANCEL'],
          }),
        ),
      ),
      completeTrade: vi.fn(() =>
        of(
          tradeResponse({
            status: 'COMPLETED',
            allowedOperations: [],
            nextAction: { actor: null, action: 'NONE' },
          }),
        ),
      ),
      cancelTrade: vi.fn(),
    };
    payments = {
      payTrade: vi.fn(() =>
        of({
          paymentId: 'pay-1',
          tradeId: 'trade-1',
          provider: 'fake',
          status: 'REQUIRES_ACTION',
          amount: 38,
          currency: 'CAD',
          platformFee: 1.9,
          sellerAmount: 36.1,
          checkoutUrl: '/checkout/fake/fake_pi_1',
        }),
      ),
      shipTrade: vi.fn(),
      confirmTradeReceipt: vi.fn(),
      openTradeDispute: vi.fn(),
    };
    pushed$ = new Subject();
    TestBed.configureTestingModule({
      providers: [
        TradeDetailStore,
        { provide: TradesService, useValue: api },
        { provide: PaymentsService, useValue: payments },
        { provide: NotificationCenter, useValue: { pushed$ } },
        { provide: RealtimeService, useValue: { resync$: new Subject<void>() } },
      ],
    });
    store = TestBed.inject(TradeDetailStore);
    store.init();
    store.load('trade-1');
  });

  it('offers only the allowed operations and confirms each step', async () => {
    expect(store.status()).toBe('ready');
    expect([...store.allowed()]).toEqual(['MARK_MEETUP', 'CONFIRM_COMPLETION', 'CANCEL']);
    await store.markMeetup();
    expect(store.notice()?.message).toBe(
      'Marked as an in-person meetup. Ada Seller will be asked to agree.',
    );
    expect(store.allowed().has('MARK_MEETUP')).toBe(false);
    await store.confirmCompletion();
    expect(store.trade()?.status).toBe('COMPLETED');
    expect(store.notice()?.message).toBe('Trade completed. You can now rate Ada Seller.');
  });

  it('explains a refused step and re-reads the trade', async () => {
    api['completeTrade'].mockReturnValueOnce(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: { errorCode: 'INVALID_STATE_TRANSITION', currentStatus: 'CANCELLED' },
          }),
      ),
    );
    api['getTrade'].mockReturnValueOnce(
      of(tradeResponse({ status: 'CANCELLED', allowedOperations: [], cancelReason: 'Sold' })),
    );
    await store.confirmCompletion();
    expect(store.notice()).toEqual({
      tone: 'warning',
      message: 'This can no longer be done: it was already cancelled.',
    });
    expect(store.trade()?.status).toBe('CANCELLED');
  });

  it('cancels with the reason and re-reads on a notification of this trade only', async () => {
    api['cancelTrade'].mockReturnValueOnce(of(tradeResponse({ status: 'CANCELLED' })));
    await store.cancel('Found it elsewhere');
    expect(api['cancelTrade']).toHaveBeenCalledWith(
      { id: 'trade-1', cancelTradeRequest: { reason: 'Found it elsewhere' } },
      'body',
      false,
      expect.anything(),
    );
    api['getTrade'].mockClear();
    pushed$.next({
      type: 'TRADE_UPDATE',
      data: { tradeId: 'other' },
    } as unknown as NotificationResponse);
    await flush();
    expect(api['getTrade']).not.toHaveBeenCalled();
    pushed$.next({
      type: 'TRADE_UPDATE',
      data: { tradeId: 'trade-1' },
    } as unknown as NotificationResponse);
    await flush();
    expect(api['getTrade']).toHaveBeenCalledTimes(1);
  });

  it('starts the protected checkout and explains a seller without payouts', async () => {
    const payment = await store.pay();
    expect(payment?.checkoutUrl).toBe('/checkout/fake/fake_pi_1');
    expect(payments['payTrade']).toHaveBeenCalledWith(
      { id: 'trade-1' },
      'body',
      false,
      expect.anything(),
    );
    expect(store.busy()).toBeNull();

    payments['payTrade'].mockReturnValueOnce(
      throwError(
        () => new HttpErrorResponse({ status: 409, error: { errorCode: 'SELLER_NOT_ONBOARDED' } }),
      ),
    );
    expect(await store.pay()).toBeNull();
    expect(store.notice()).toEqual({
      tone: 'warning',
      message: expect.stringContaining('Ada Seller has not set up payouts yet'),
    });
  });

  it('ships, confirms receipt and re-reads when the dispute window closed', async () => {
    payments['shipTrade'].mockReturnValueOnce(
      of(tradeResponse({ status: 'SHIPPED', protectionEnabled: true, allowedOperations: [] })),
    );
    await store.ship({ carrier: 'Canada Post', trackingNumber: 'E2E123' });
    expect(payments['shipTrade']).toHaveBeenCalledWith(
      { id: 'trade-1', shipTradeRequest: { carrier: 'Canada Post', trackingNumber: 'E2E123' } },
      'body',
      false,
      expect.anything(),
    );
    expect(store.notice()?.message).toBe(
      'Marked as shipped. Ada Seller was notified and can follow the tracking.',
    );

    payments['confirmTradeReceipt'].mockReturnValueOnce(
      of(tradeResponse({ status: 'COMPLETED', protectionEnabled: true, allowedOperations: [] })),
    );
    await store.confirmReceipt();
    expect(store.trade()?.status).toBe('COMPLETED');
    expect(store.notice()?.message).toBe(
      'Receipt confirmed: the payout was released to Ada Seller. You can now rate them.',
    );

    api['getTrade'].mockClear();
    payments['openTradeDispute'].mockReturnValueOnce(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: {
              errorCode: 'DISPUTE_WINDOW_CLOSED',
              disputeWindowEndsAt: '2026-10-06T15:44:16Z',
            },
          }),
      ),
    );
    const dispute = await store.openDispute({
      reason: Reason.Damaged,
      description: 'Bent corner.',
    });
    expect(dispute).toBeNull();
    expect(store.notice()?.message).toMatch(/^The dispute window closed on Oct 6, 2026/);
    expect(api['getTrade']).toHaveBeenCalledTimes(1);
  });

  it('opens a dispute and hands it to the page', async () => {
    payments['openTradeDispute'].mockReturnValueOnce(of({ id: 'dispute-1', tradeId: 'trade-1' }));
    const dispute = await store.openDispute({
      reason: Reason.NotAsDescribed,
      description: 'The card has a crease.',
    });
    expect(dispute?.id).toBe('dispute-1');
    expect(payments['openTradeDispute']).toHaveBeenCalledWith(
      {
        id: 'trade-1',
        openDisputeRequest: { reason: 'NOT_AS_DESCRIBED', description: 'The card has a crease.' },
      },
      'body',
      false,
      expect.anything(),
    );
  });

  it('re-reads on a payment notification of this trade', async () => {
    api['getTrade'].mockClear();
    pushed$.next({
      type: 'PAYMENT_UPDATE',
      data: { tradeId: 'trade-1' },
    } as unknown as NotificationResponse);
    await flush();
    expect(api['getTrade']).toHaveBeenCalledTimes(1);
  });

  it('shows the not-found state for strangers', () => {
    api['getTrade'].mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 404, error: { errorCode: 'NOT_FOUND' } })),
    );
    store.load('trade-x');
    expect(store.status()).toBe('not-found');
  });
});
