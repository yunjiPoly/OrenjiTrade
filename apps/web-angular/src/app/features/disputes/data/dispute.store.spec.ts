import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Dispute, DisputesService, NotificationResponse } from '@orenji/api-client';
import { Subject, of, throwError } from 'rxjs';
import { NotificationCenter } from '../../../core/notifications/notification-center.service';
import { RealtimeService } from '../../../core/realtime/realtime.service';
import { DisputeStore } from './dispute.store';

function dispute(overrides: Partial<Dispute> = {}): Dispute {
  return {
    id: 'dispute-1',
    tradeId: 'trade-1',
    status: 'OPEN',
    reason: 'NOT_AS_DESCRIBED',
    description: 'The card has a crease.',
    openedAt: '2026-09-30T10:00:00Z',
    updatedAt: '2026-09-30T10:00:00Z',
    viewerRole: 'BUYER',
    buyer: { id: 'b', handle: 'ben', displayName: 'Ben Buyer' },
    seller: { id: 's', handle: 'ada', displayName: 'Ada Seller' },
    payment: {
      id: 'pay-1',
      status: 'SECURED',
      amount: 35,
      currency: 'CAD',
      refundedAmount: 0,
      payoutFrozen: true,
    },
    summary: '35.00 CAD for Everdusk Lich',
    evidence: [],
    timeline: [],
    messages: [],
    canAddEvidence: true,
    canPostMessage: true,
    evidenceLeft: 10,
    ...overrides,
  } as Dispute;
}

async function flush(): Promise<void> {
  for (let index = 0; index < 8; index++) {
    await Promise.resolve();
  }
}

describe('DisputeStore', () => {
  let store: DisputeStore;
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let pushed$: Subject<NotificationResponse>;

  beforeEach(() => {
    api = {
      getDispute: vi.fn(() => of(dispute())),
      addDisputeEvidence: vi.fn(() => of({ id: 'ev-1', kind: 'IMAGE' })),
      postDisputeMessage: vi.fn(() =>
        of({
          id: 'm-1',
          authorRole: 'BUYER',
          authorName: 'Ben Buyer',
          body: 'Photos attached.',
          createdAt: '2026-09-30T11:00:00Z',
        }),
      ),
    };
    pushed$ = new Subject();
    TestBed.configureTestingModule({
      providers: [
        DisputeStore,
        { provide: DisputesService, useValue: api },
        { provide: NotificationCenter, useValue: { pushed$ } },
        { provide: RealtimeService, useValue: { resync$: new Subject<void>() } },
      ],
    });
    store = TestBed.inject(DisputeStore);
    store.init();
    store.load('dispute-1');
  });

  it('loads the dispute and names the other side', () => {
    expect(store.status()).toBe('ready');
    expect(store.otherName()).toBe('Ada Seller');
  });

  it('uploads a photo with its caption and re-reads the dispute', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'crease.png', { type: 'image/png' });
    api['getDispute'].mockClear();
    expect(await store.addEvidence(file, 'IMAGE', '  Under a lamp  ')).toBe(true);
    expect(api['addDisputeEvidence']).toHaveBeenCalledWith(
      { id: 'dispute-1', file, kind: 'IMAGE', body: 'Under a lamp' },
      'body',
      false,
      expect.anything(),
    );
    expect(api['getDispute']).toHaveBeenCalledTimes(1);
    expect(store.notice()?.message).toBe('Photo added. Ada Seller and OrenjiTrade can see it.');
  });

  it('explains the evidence limit and a dispute on hold', async () => {
    const file = new File([new Uint8Array([1])], 'doc.pdf', { type: 'application/pdf' });
    api['addDisputeEvidence'].mockReturnValueOnce(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: { errorCode: 'EVIDENCE_LIMIT_REACHED', limit: 10 },
          }),
      ),
    );
    expect(await store.addEvidence(file, 'DOCUMENT', '')).toBe(false);
    expect(store.notice()?.message).toContain('the most allowed per collector');

    api['postDisputeMessage'].mockReturnValueOnce(
      throwError(
        () =>
          new HttpErrorResponse({ status: 409, error: { errorCode: 'INVALID_STATE_TRANSITION' } }),
      ),
    );
    expect(await store.postMessage('Hello?')).toBe(false);
    expect(store.notice()?.message).toContain('on hold or already decided');
  });

  it('posts a message and shows it at once', async () => {
    api['getDispute'].mockReturnValue(new Subject<Dispute>());
    expect(await store.postMessage('  Photos attached.  ')).toBe(true);
    expect(api['postDisputeMessage']).toHaveBeenCalledWith(
      { id: 'dispute-1', disputeMessageRequest: { body: 'Photos attached.' } },
      'body',
      false,
      expect.anything(),
    );
    expect(store.dispute()?.messages.map((message) => message.id)).toEqual(['m-1']);
    expect(await store.postMessage('   ')).toBe(false);
  });

  it('re-reads on a notification of this dispute only', async () => {
    api['getDispute'].mockClear();
    pushed$.next({
      type: 'DISPUTE_UPDATE',
      data: { disputeId: 'other' },
    } as unknown as NotificationResponse);
    await flush();
    expect(api['getDispute']).not.toHaveBeenCalled();
    pushed$.next({
      type: 'DISPUTE_UPDATE',
      data: { disputeId: 'dispute-1' },
    } as unknown as NotificationResponse);
    await flush();
    expect(api['getDispute']).toHaveBeenCalledTimes(1);
  });

  it('shows the not-found state for anybody else', () => {
    api['getDispute'].mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 404, error: { errorCode: 'NOT_FOUND' } })),
    );
    store.load('dispute-x');
    expect(store.status()).toBe('not-found');
  });
});
