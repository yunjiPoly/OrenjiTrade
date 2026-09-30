import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { NotificationResponse, TradesService } from '@orenji/api-client';
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
    pushed$ = new Subject();
    TestBed.configureTestingModule({
      providers: [
        TradeDetailStore,
        { provide: TradesService, useValue: api },
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

  it('shows the not-found state for strangers', () => {
    api['getTrade'].mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 404, error: { errorCode: 'NOT_FOUND' } })),
    );
    store.load('trade-x');
    expect(store.status()).toBe('not-found');
  });
});
