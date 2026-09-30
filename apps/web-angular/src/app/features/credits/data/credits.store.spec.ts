import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { CreditsService, MyCredits, PlansService } from '@orenji/api-client';
import { of, throwError } from 'rxjs';
import { isApiError } from '../../../core/http/api-error';
import { CreditsStore } from './credits.store';

function page(ids: string[], nextCursor: string | null, balance = 300): MyCredits {
  return {
    balance,
    entries: {
      items: ids.map((id) => ({ id, amount: 10, type: 'EARN', reason: 'REFERRAL' })),
      hasMore: !!nextCursor,
      nextCursor,
    },
    products: [
      { key: 'premium_search_day', name: 'Advanced search for a day', cost: 50, active: true },
      { key: 'old_product', name: 'Old', cost: 10, active: false },
    ],
    withdrawable: false,
    transferable: false,
  } as MyCredits;
}

describe('CreditsStore', () => {
  let store: CreditsStore;
  let credits: Record<string, ReturnType<typeof vi.fn>>;
  let plans: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    credits = {
      getMyCredits: vi.fn(() => of(page(['e1', 'e2'], 'c-2'))),
      getMyReferral: vi.fn(() => of({ code: 'ADA1', canRedeem: true, redeemed: false })),
      spendCredits: vi.fn(() =>
        of({ balance: 250, duplicate: false, entitlement: { expiresAt: '2026-10-01T00:00:00Z' } }),
      ),
      redeemReferralCode: vi.fn(() => of({ reward: 50, balance: 350 })),
    };
    plans = {
      getMyPlan: vi.fn(() =>
        of({
          entitlements: [{ id: 'x', featureKey: 'filters.advanced', source: 'CREDIT_PURCHASE' }],
        }),
      ),
    };
    TestBed.configureTestingModule({
      providers: [
        CreditsStore,
        { provide: CreditsService, useValue: credits },
        { provide: PlansService, useValue: plans },
      ],
    });
    store = TestBed.inject(CreditsStore);
  });

  it('loads the balance, active products, the ledger, the referral and boosts', async () => {
    await store.load();
    expect(store.status()).toBe('ready');
    expect(store.balance()).toBe(300);
    expect(store.products().map((product) => product.key)).toEqual(['premium_search_day']);
    expect(store.productNames()['premium_search_day']).toBe('Advanced search for a day');
    expect(store.entries()).toHaveLength(2);
    expect(store.hasMore()).toBe(true);
    expect(store.referral()?.code).toBe('ADA1');
    expect(store.entitlements()).toHaveLength(1);
  });

  it('appends older entries without duplicates', async () => {
    await store.load();
    credits['getMyCredits'].mockReturnValueOnce(of(page(['e2', 'e3'], null)));
    await store.loadMore();
    expect(credits['getMyCredits']).toHaveBeenLastCalledWith(
      { cursor: 'c-2', limit: 20 },
      'body',
      false,
      expect.anything(),
    );
    expect(store.entries().map((entry) => entry.id)).toEqual(['e1', 'e2', 'e3']);
    expect(store.hasMore()).toBe(false);
  });

  it('spends with the given idempotency key and updates the balance', async () => {
    await store.load();
    const result = await store.spend('premium_search_day', 'spend:key-1');
    expect(isApiError(result)).toBe(false);
    expect(credits['spendCredits']).toHaveBeenCalledWith(
      { creditSpendRequest: { featureKey: 'premium_search_day', idempotencyKey: 'spend:key-1' } },
      'body',
      false,
      expect.anything(),
    );
  });

  it('keeps the balance the API reports when credits are insufficient', async () => {
    await store.load();
    credits['spendCredits'].mockReturnValueOnce(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: { errorCode: 'INSUFFICIENT_CREDITS', balance: 20, cost: 50 },
          }),
      ),
    );
    const result = await store.spend('premium_search_day', 'spend:key-2');
    expect(isApiError(result) && result.errorCode).toBe('INSUFFICIENT_CREDITS');
    expect(store.balance()).toBe(20);
  });

  it('redeems a code and re-reads the referral', async () => {
    await store.load();
    const result = await store.redeem('  ada-1 ');
    expect(isApiError(result)).toBe(false);
    expect(credits['redeemReferralCode']).toHaveBeenCalledWith(
      { referralRedeemRequest: { code: 'ada-1' } },
      'body',
      false,
      expect.anything(),
    );
    expect(credits['getMyReferral']).toHaveBeenCalledTimes(2);
  });

  it('shows the error state when the credits cannot load', async () => {
    credits['getMyCredits'].mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 500, error: { errorCode: 'INTERNAL' } })),
    );
    await store.load();
    expect(store.status()).toBe('error');
  });
});
