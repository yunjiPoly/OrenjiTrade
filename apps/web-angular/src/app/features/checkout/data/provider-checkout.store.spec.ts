import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import {
  DonationsService,
  FakeBillingCheckout,
  FakeDonationCheckout,
  SubscriptionsService,
} from '@orenji/api-client';
import { of, throwError } from 'rxjs';
import { FakeBillingCheckoutStore, billingOutcome } from './fake-billing-checkout.store';
import { FakeDonationCheckoutStore, donationOutcome } from './fake-donation-checkout.store';

function billing(status: string, failureCode?: string): FakeBillingCheckout {
  return {
    ref: 'fake_cs_1',
    subscriptionId: 'sub-1',
    planCode: 'PREMIUM',
    planName: 'Premium',
    amount: 4.99,
    currency: 'CAD',
    status,
    failureCode,
    summary: 'Test checkout: no money moves.',
  } as FakeBillingCheckout;
}

function donation(status: string): FakeDonationCheckout {
  return { ref: 'fake_dn_1', amount: 10, currency: 'CAD', status } as FakeDonationCheckout;
}

describe('billingOutcome / donationOutcome', () => {
  it('reads how a subscription checkout ended', () => {
    expect(billingOutcome(billing('PENDING'), null)).toBeNull();
    expect(billingOutcome(billing('PENDING', 'card_declined'), null)).toBeNull();
    expect(billingOutcome(billing('PENDING', 'card_declined'), 'FAILED')).toBe('failed');
    expect(billingOutcome(billing('PENDING', 'card_declined'), 'SUCCEEDED')).toBeNull();
    expect(billingOutcome(billing('ACTIVE'), 'SUCCEEDED')).toBe('succeeded');
    expect(billingOutcome(billing('TRIAL'), null)).toBe('succeeded');
    expect(billingOutcome(billing('CANCELLED'), null)).toBe('cancelled');
  });

  it('reads how a donation checkout ended', () => {
    expect(donationOutcome(donation('PENDING'))).toBeNull();
    expect(donationOutcome(donation('SUCCEEDED'))).toBe('succeeded');
    expect(donationOutcome(donation('FAILED'))).toBe('failed');
    expect(donationOutcome(donation('REFUNDED'))).toBe('cancelled');
  });
});

describe('FakeBillingCheckoutStore', () => {
  let store: FakeBillingCheckoutStore;
  let api: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    api = {
      getFakeBillingCheckout: vi.fn(() => of(billing('PENDING'))),
      confirmFakeBillingCheckout: vi.fn(() => of({ received: true, duplicate: false })),
    };
    TestBed.configureTestingModule({
      providers: [FakeBillingCheckoutStore, { provide: SubscriptionsService, useValue: api }],
    });
    store = TestBed.inject(FakeBillingCheckoutStore);
    store.pollDelayMs = 0;
  });

  it('pays and waits until the webhook activated the subscription', async () => {
    await store.load('fake_cs_1');
    expect(store.status()).toBe('ready');
    api['getFakeBillingCheckout']
      .mockReturnValueOnce(of(billing('PENDING')))
      .mockReturnValueOnce(of(billing('ACTIVE')));
    expect(await store.confirm('SUCCEEDED')).toBe('succeeded');
    expect(api['confirmFakeBillingCheckout']).toHaveBeenCalledWith(
      { ref: 'fake_cs_1', fakeBillingConfirmRequest: { outcome: 'SUCCEEDED' } },
      'body',
      false,
      expect.anything(),
    );
    expect(store.status()).toBe('done');
  });

  it('keeps a declined checkout open for another attempt', async () => {
    await store.load('fake_cs_1');
    api['getFakeBillingCheckout'].mockReturnValueOnce(of(billing('PENDING', 'card_declined')));
    expect(await store.confirm('FAILED')).toBe('failed');
    store.tryAgain();
    expect(store.status()).toBe('ready');
    expect(store.outcome()).toBeNull();
  });

  it('shows the error inline when the confirmation fails, and not-found for strangers', async () => {
    await store.load('fake_cs_1');
    api['confirmFakeBillingCheckout'].mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 500, error: { errorCode: 'INTERNAL' } })),
    );
    expect(await store.confirm('SUCCEEDED')).toBeNull();
    expect(store.status()).toBe('ready');
    expect(store.error()?.status).toBe(500);

    api['getFakeBillingCheckout'].mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 404, error: { errorCode: 'NOT_FOUND' } })),
    );
    await store.load('fake_cs_other');
    expect(store.status()).toBe('not-found');
  });

  it('gives up waiting after the last poll', async () => {
    store.maxPolls = 2;
    await store.load('fake_cs_1');
    expect(await store.confirm('SUCCEEDED')).toBe('pending');
  });
});

describe('FakeDonationCheckoutStore', () => {
  it('confirms a donation', async () => {
    const api = {
      getFakeDonationCheckout: vi
        .fn()
        .mockReturnValueOnce(of(donation('PENDING')))
        .mockReturnValue(of(donation('SUCCEEDED'))),
      confirmFakeDonationCheckout: vi.fn(() => of({ received: true, duplicate: false })),
    };
    TestBed.configureTestingModule({
      providers: [FakeDonationCheckoutStore, { provide: DonationsService, useValue: api }],
    });
    const store = TestBed.inject(FakeDonationCheckoutStore);
    store.pollDelayMs = 0;
    await store.load('fake_dn_1');
    expect(store.status()).toBe('ready');
    expect(await store.confirm('SUCCEEDED')).toBe('succeeded');
    expect(api.confirmFakeDonationCheckout).toHaveBeenCalledWith(
      { ref: 'fake_dn_1', fakeDonationConfirmRequest: { outcome: 'SUCCEEDED' } },
      'body',
      false,
      expect.anything(),
    );
  });
});
