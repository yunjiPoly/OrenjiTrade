import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { NotificationResponse, OfferSummary, OffersService } from '@orenji/api-client';
import { Subject, of, throwError } from 'rxjs';
import { NotificationCenter } from '../../../core/notifications/notification-center.service';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { party, publicItem } from '../../../shared/offers/testing/offer-fixtures';
import { INBOX_PAGE, OffersInboxStore, inboxRequest, parseInboxQuery } from './offers-inbox.store';

function summary(id: string, yourTurn = false): OfferSummary {
  return {
    id,
    rootOfferId: id,
    item: publicItem(),
    counterparty: party('buyer-1', 'Ben Buyer'),
    viewerRole: 'SELLER',
    kind: 'CASH',
    cashAmount: 38,
    currency: 'CAD',
    tradeItemCount: 0,
    status: 'OPEN',
    currentTurn: 'SELLER',
    yourTurn,
    allowedActions: yourTurn ? ['ACCEPT', 'COUNTER', 'DECLINE'] : [],
    expiresAt: '2026-10-03T10:00:00Z',
    version: 0,
    tradeId: null,
    createdAt: '2026-09-30T10:00:00Z',
    updatedAt: '2026-09-30T10:00:00Z',
  } as OfferSummary;
}

async function flush(): Promise<void> {
  for (let index = 0; index < 5; index++) {
    await Promise.resolve();
  }
}

describe('offers inbox query', () => {
  it('reads the tab and status filter from the URL with safe defaults', () => {
    expect(parseInboxQuery({})).toEqual({ tab: 'received', filter: 'all' });
    expect(parseInboxQuery({ tab: 'sent', status: 'closed' })).toEqual({
      tab: 'sent',
      filter: 'closed',
    });
    expect(parseInboxQuery({ tab: 'x', status: 'nope' })).toEqual({
      tab: 'received',
      filter: 'all',
    });
  });

  it('maps tabs to roles and filters to statuses', () => {
    expect(inboxRequest({ tab: 'received', filter: 'all' }, null)).toEqual({
      role: 'seller',
      limit: INBOX_PAGE,
    });
    expect(inboxRequest({ tab: 'sent', filter: 'active' }, 'c-2')).toEqual({
      role: 'buyer',
      status: ['OPEN', 'COUNTERED'],
      cursor: 'c-2',
      limit: INBOX_PAGE,
    });
    expect(inboxRequest({ tab: 'sent', filter: 'closed' }, null).status).toEqual([
      'DECLINED',
      'CANCELLED',
      'EXPIRED',
    ]);
  });
});

describe('OffersInboxStore', () => {
  let store: OffersInboxStore;
  let listOffers: ReturnType<typeof vi.fn>;
  let pushed$: Subject<NotificationResponse>;

  beforeEach(() => {
    listOffers = vi.fn(() =>
      of({ items: [summary('a', true), summary('b')], nextCursor: 'next', hasMore: true }),
    );
    pushed$ = new Subject();
    TestBed.configureTestingModule({
      providers: [
        OffersInboxStore,
        { provide: OffersService, useValue: { listOffers } },
        { provide: NotificationCenter, useValue: { pushed$ } },
        { provide: RealtimeService, useValue: { resync$: new Subject<void>() } },
      ],
    });
    store = TestBed.inject(OffersInboxStore);
    store.init();
  });

  it('loads a tab, pages further without duplicates and counts the offers waiting for the caller', () => {
    store.setQuery({ tab: 'received', filter: 'all' });
    expect(store.items().map((offer) => offer.id)).toEqual(['a', 'b']);
    expect(store.yourTurnCount()).toBe(1);
    expect(store.hasMore()).toBe(true);
    listOffers.mockReturnValueOnce(of({ items: [summary('b'), summary('c')], hasMore: false }));
    store.loadMore();
    expect(listOffers).toHaveBeenLastCalledWith(
      { role: 'seller', cursor: 'next', limit: INBOX_PAGE },
      'body',
      false,
      expect.anything(),
    );
    expect(store.items().map((offer) => offer.id)).toEqual(['a', 'b', 'c']);
    expect(store.hasMore()).toBe(false);
    // The same query does not reload.
    store.setQuery({ tab: 'received', filter: 'all' });
    expect(listOffers).toHaveBeenCalledTimes(2);
  });

  it('shows an error with retry and re-reads when an offer notification arrives', async () => {
    listOffers.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 503 })));
    store.setQuery({ tab: 'sent', filter: 'active' });
    expect(store.status()).toBe('error');
    store.load();
    expect(store.status()).toBe('ready');
    listOffers.mockReturnValueOnce(of({ items: [summary('z', true)], hasMore: false }));
    pushed$.next({ type: 'OFFER_COUNTERED', data: {} } as unknown as NotificationResponse);
    await flush();
    expect(store.items().map((offer) => offer.id)).toEqual(['z']);
    pushed$.next({ type: 'MESSAGE', data: {} } as unknown as NotificationResponse);
    await flush();
    expect(listOffers).toHaveBeenCalledTimes(3);
  });
});
