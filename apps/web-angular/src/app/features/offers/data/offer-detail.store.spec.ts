import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { NotificationResponse, OffersService } from '@orenji/api-client';
import { Subject, of, throwError } from 'rxjs';
import { NotificationCenter } from '../../../core/notifications/notification-center.service';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { offerResponse } from '../../../shared/offers/testing/offer-fixtures';
import { OfferDetailStore } from './offer-detail.store';

async function flush(): Promise<void> {
  for (let index = 0; index < 8; index++) {
    await Promise.resolve();
  }
}

function failure(status: number, errorCode: string, extra: Record<string, unknown> = {}) {
  return throwError(
    () =>
      new HttpErrorResponse({ status, error: { errorCode, status, message: errorCode, ...extra } }),
  );
}

describe('OfferDetailStore', () => {
  let store: OfferDetailStore;
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let navigate: ReturnType<typeof vi.fn>;
  let pushed$: Subject<NotificationResponse>;

  beforeEach(() => {
    api = {
      getOffer: vi.fn(() => of(offerResponse())),
      acceptOffer: vi.fn(() =>
        of(
          offerResponse({ status: 'ACCEPTED', allowedActions: [], tradeId: 'trade-1', version: 1 }),
        ),
      ),
      declineOffer: vi.fn(() => of(offerResponse({ status: 'DECLINED', allowedActions: [] }))),
      cancelOffer: vi.fn(),
    };
    navigate = vi.fn(async () => true);
    pushed$ = new Subject();
    TestBed.configureTestingModule({
      providers: [
        OfferDetailStore,
        { provide: OffersService, useValue: api },
        { provide: Router, useValue: { navigate } },
        { provide: NotificationCenter, useValue: { pushed$ } },
        { provide: RealtimeService, useValue: { resync$: new Subject<void>() } },
      ],
    });
    store = TestBed.inject(OfferDetailStore);
    store.init();
  });

  it('loads a proposal and knows whose turn it is', () => {
    store.load('offer-1');
    expect(store.status()).toBe('ready');
    expect(store.yourTurn()).toBe(true);
    expect(store.waiting()).toBe(false);
    expect(store.otherName()).toBe('Ben Buyer');
  });

  it('shows the not-found state for strangers (404)', () => {
    api['getOffer'].mockReturnValueOnce(failure(404, 'NOT_FOUND'));
    store.load('offer-x');
    expect(store.status()).toBe('not-found');
  });

  it('accepts with the version on screen and confirms', async () => {
    store.load('offer-1');
    const accepted = await store.accept();
    expect(api['acceptOffer']).toHaveBeenCalledWith(
      { id: 'offer-1', acceptOfferRequest: { version: 0 } },
      'body',
      false,
      expect.anything(),
    );
    expect(accepted?.tradeId).toBe('trade-1');
    expect(store.offer()?.status).toBe('ACCEPTED');
    expect(store.notice()).toMatchObject({ tone: 'success' });
    expect(store.notice()?.message).toContain('Offer accepted');
  });

  it('moves to the live proposal when the answer is stale (409 STALE_OFFER)', async () => {
    store.load('offer-1');
    api['declineOffer'].mockReturnValueOnce(
      failure(409, 'STALE_OFFER', { latestOfferId: 'offer-2' }),
    );
    expect(await store.decline('Too low')).toBeNull();
    expect(api['declineOffer']).toHaveBeenCalledWith(
      { id: 'offer-1', closeOfferRequest: { reason: 'Too low', version: 0 } },
      'body',
      false,
      expect.anything(),
    );
    expect(navigate).toHaveBeenCalledWith(['/offers', 'offer-2'], { replaceUrl: true });
    expect(store.notice()).toMatchObject({ tone: 'warning' });
    expect(store.notice()?.message).toContain('changed while you were looking at it');
  });

  it('re-reads the offer on a turn conflict', async () => {
    store.load('offer-1');
    api['acceptOffer'].mockReturnValueOnce(failure(409, 'NOT_YOUR_TURN'));
    api['getOffer'].mockReturnValueOnce(
      of(offerResponse({ currentTurn: 'BUYER', allowedActions: [] })),
    );
    await store.accept();
    expect(store.notice()?.message).toBe("It is Ben Buyer's turn to answer this offer.");
    expect(store.waiting()).toBe(true);
  });

  it('follows the negotiation when a notification of the chain arrives', async () => {
    store.load('offer-1');
    api['getOffer'].mockReturnValueOnce(
      of(offerResponse({ superseded: true, latestOfferId: 'offer-3', status: 'COUNTERED' })),
    );
    pushed$.next({
      id: 'n-1',
      type: 'OFFER_COUNTERED',
      title: 'Counter-offer',
      body: '',
      data: { rootOfferId: 'offer-1', offerId: 'offer-3' },
      createdAt: '2026-09-30T10:00:00Z',
      readAt: null,
    } as NotificationResponse);
    await flush();
    expect(navigate).toHaveBeenCalledWith(['/offers', 'offer-3'], { replaceUrl: true });

    // Notifications of other negotiations are ignored.
    api['getOffer'].mockClear();
    pushed$.next({
      id: 'n-2',
      type: 'OFFER_RECEIVED',
      title: 'Offer',
      body: '',
      data: { rootOfferId: 'other', offerId: 'other' },
      createdAt: '2026-09-30T10:00:00Z',
      readAt: null,
    } as NotificationResponse);
    await flush();
    expect(api['getOffer']).not.toHaveBeenCalled();
  });

  it('goes to the new proposal after a counter-offer', async () => {
    store.load('offer-1');
    await store.countered({ offer: offerResponse({ id: 'offer-2', status: 'COUNTERED' }) });
    expect(navigate).toHaveBeenCalledWith(['/offers', 'offer-2'], { replaceUrl: true });
    expect(store.notice()?.message).toContain('Counter-offer sent');
  });
});
