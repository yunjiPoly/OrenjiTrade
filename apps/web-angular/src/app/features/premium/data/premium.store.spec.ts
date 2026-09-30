import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { MyPlan, PlansService, SubscriptionsService } from '@orenji/api-client';
import { of, throwError } from 'rxjs';
import { isApiError } from '../../../core/http/api-error';
import { usageRows } from '../usage-meters';
import { PremiumStore } from './premium.store';

const FREE_PLAN = { plan: { code: 'FREE', name: 'Free' }, limits: [] } as MyPlan;

describe('PremiumStore', () => {
  let store: PremiumStore;
  let plans: Record<string, ReturnType<typeof vi.fn>>;
  let subscriptions: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    plans = { getMyPlan: vi.fn(() => of(FREE_PLAN)) };
    subscriptions = {
      startSubscriptionCheckout: vi.fn(() =>
        of({ url: '/checkout/fake-billing/fake_cs_1', resumed: false }),
      ),
      cancelSubscription: vi.fn(() => of({ id: 's-1', status: 'CANCELLED' })),
    };
    TestBed.configureTestingModule({
      providers: [
        PremiumStore,
        { provide: PlansService, useValue: plans },
        { provide: SubscriptionsService, useValue: subscriptions },
      ],
    });
    store = TestBed.inject(PremiumStore);
  });

  it('loads the plan and its live subscription', async () => {
    plans['getMyPlan'].mockReturnValueOnce(
      of({ ...FREE_PLAN, subscription: { id: 's-1', status: 'PENDING', planCode: 'PREMIUM' } }),
    );
    await store.load();
    expect(store.planCode()).toBe('FREE');
    expect(store.subscription()?.status).toBe('PENDING');
  });

  it('opens a checkout and returns the local fake checkout path', async () => {
    const result = await store.startCheckout('PREMIUM');
    expect(result).toEqual({
      ok: true,
      target: { kind: 'app', path: '/checkout/fake-billing/fake_cs_1' },
      resumed: false,
    });
    expect(subscriptions['startSubscriptionCheckout']).toHaveBeenCalledWith(
      { subscriptionCheckoutRequest: { planCode: 'PREMIUM' } },
      'body',
      false,
      expect.anything(),
    );
    expect(store.busy()).toBeNull();
  });

  it('refuses unexpected checkout URLs', async () => {
    subscriptions['startSubscriptionCheckout'].mockReturnValueOnce(
      of({ url: 'javascript:alert(1)' }),
    );
    const result = await store.startCheckout('PREMIUM');
    expect(result.ok).toBe(false);
  });

  it('explains 409 ALREADY_SUBSCRIBED and reloads the plan', async () => {
    subscriptions['startSubscriptionCheckout'].mockReturnValueOnce(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: { errorCode: 'ALREADY_SUBSCRIBED', currentStatus: 'ACTIVE' },
          }),
      ),
    );
    const result = await store.startCheckout('PREMIUM');
    expect(result).toMatchObject({ ok: false, alreadySubscribed: true });
    expect(result.ok ? '' : result.message).toContain('(active)');
    expect(plans['getMyPlan']).toHaveBeenCalled();
  });

  it('cancels at the period end or at once and reloads', async () => {
    const result = await store.cancel(false);
    expect(isApiError(result)).toBe(false);
    expect(subscriptions['cancelSubscription']).toHaveBeenCalledWith(
      { subscriptionCancelRequest: { atPeriodEnd: false } },
      'body',
      false,
      expect.anything(),
    );
    expect(plans['getMyPlan']).toHaveBeenCalledTimes(1);

    subscriptions['cancelSubscription'].mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 404, error: { errorCode: 'NOT_FOUND' } })),
    );
    const missing = await store.cancel(true);
    expect(isApiError(missing) && missing.status).toBe(404);
  });
});

describe('usageRows', () => {
  it('shows counters with bars, caps as values and unlimited limits', () => {
    const rows = usageRows(
      [
        { key: 'binders.max', kind: 'COUNTER', limit: 5, used: 5, allowed: false },
        { key: 'map.radius.max_km', kind: 'CAP', limit: 25, used: 0, allowed: true },
        { key: 'binder.views.per_day', kind: 'COUNTER', used: 3, overridden: true },
        { key: 'saved_searches.max', kind: 'COUNTER', limit: 0, used: 0, allowed: false },
      ] as never,
      (key) => key.toUpperCase(),
    );
    expect(rows[0]).toMatchObject({
      label: 'BINDERS.MAX',
      value: '5 / 5',
      percent: 100,
      full: true,
    });
    expect(rows[1]).toMatchObject({ value: 'Up to 25 km', percent: null });
    expect(rows[2]).toMatchObject({ value: '3 used · Unlimited', percent: null, boosted: true });
    expect(rows[3]).toMatchObject({ value: '0 / 0', percent: null });
  });
});
