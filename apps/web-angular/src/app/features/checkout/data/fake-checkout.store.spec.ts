import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { FakeCheckout, PaymentsService } from '@orenji/api-client';
import { of, throwError } from 'rxjs';
import { FakeCheckoutStore, checkoutOutcome } from './fake-checkout.store';

function checkout(status: string): FakeCheckout {
  return {
    ref: 'fake_pi_1',
    paymentId: 'pay-1',
    tradeId: 'trade-1',
    status,
    amount: 40,
    currency: 'CAD',
    summary: '40.00 CAD for Lantern Fox Spirit',
  } as FakeCheckout;
}

describe('FakeCheckoutStore', () => {
  let store: FakeCheckoutStore;
  let api: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    api = {
      getFakeCheckout: vi.fn(() => of(checkout('REQUIRES_ACTION'))),
      confirmFakeCheckout: vi.fn(() => of({ received: true, duplicate: false })),
    };
    TestBed.configureTestingModule({
      providers: [FakeCheckoutStore, { provide: PaymentsService, useValue: api }],
    });
    store = TestBed.inject(FakeCheckoutStore);
    store.pollDelayMs = 0;
  });

  it('maps payment statuses to how the checkout ended', () => {
    expect(checkoutOutcome('REQUIRES_ACTION')).toBeNull();
    expect(checkoutOutcome('SECURED')).toBe('secured');
    expect(checkoutOutcome('PAID_OUT')).toBe('secured');
    expect(checkoutOutcome('FAILED')).toBe('failed');
    expect(checkoutOutcome('CANCELLED')).toBe('cancelled');
  });

  it('pays and waits until the provider secured the payment', async () => {
    await store.load('fake_pi_1');
    expect(store.status()).toBe('ready');
    api['getFakeCheckout']
      .mockReturnValueOnce(of(checkout('REQUIRES_ACTION')))
      .mockReturnValueOnce(of(checkout('SECURED')));
    const outcome = await store.confirm('SUCCEEDED');
    expect(outcome).toBe('secured');
    expect(api['confirmFakeCheckout']).toHaveBeenCalledWith(
      { ref: 'fake_pi_1', fakeCheckoutConfirmRequest: { outcome: 'SUCCEEDED' } },
      'body',
      false,
      expect.anything(),
    );
    expect(store.status()).toBe('done');
    expect(store.checkout()?.status).toBe('SECURED');
  });

  it('simulates a failed payment', async () => {
    await store.load('fake_pi_1');
    api['getFakeCheckout'].mockReturnValueOnce(of(checkout('FAILED')));
    expect(await store.confirm('FAILED')).toBe('failed');
    expect(store.outcome()).toBe('failed');
  });

  it('reads how a checkout ended when it was no longer waiting (409)', async () => {
    await store.load('fake_pi_1');
    api['confirmFakeCheckout'].mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 409, error: { errorCode: 'CONFLICT' } })),
    );
    api['getFakeCheckout'].mockReturnValueOnce(of(checkout('SECURED')));
    expect(await store.confirm('SUCCEEDED')).toBe('secured');
  });

  it('gives up waiting after the last poll and says so', async () => {
    store.maxPolls = 2;
    await store.load('fake_pi_1');
    expect(await store.confirm('SUCCEEDED')).toBe('pending');
    expect(store.status()).toBe('done');
  });

  it('shows an already paid checkout as done and a stranger the not-found state', async () => {
    api['getFakeCheckout'].mockReturnValueOnce(of(checkout('SECURED')));
    await store.load('fake_pi_1');
    expect(store.status()).toBe('done');
    expect(store.outcome()).toBe('secured');
    expect(await store.confirm('SUCCEEDED')).toBeNull();

    api['getFakeCheckout'].mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 404, error: { errorCode: 'NOT_FOUND' } })),
    );
    await store.load('fake_pi_other');
    expect(store.status()).toBe('not-found');
  });
});
