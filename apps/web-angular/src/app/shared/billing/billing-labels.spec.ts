import { ApiError } from '../../core/http/api-error';
import {
  checkoutProblem,
  checkoutTarget,
  creditReasonLabel,
  creditsLabel,
  donationProblem,
  donationStatusInfo,
  durationLabel,
  entitlementLabel,
  isEntitling,
  newIdempotencyKey,
  referralProblem,
  signedCredits,
  spendProblem,
  subscriptionStatusInfo,
} from './billing-labels';

function apiError(
  status: number,
  errorCode: string,
  extra: Record<string, unknown> = {},
  fieldErrors: Record<string, string> = {},
): ApiError {
  return new ApiError(
    { errorCode, message: 'server says no', requestId: 'req-1', status, fieldErrors },
    { problem: { errorCode, status, ...extra } },
  );
}

describe('billing labels', () => {
  it('describes subscription and donation statuses', () => {
    expect(subscriptionStatusInfo('ACTIVE')).toMatchObject({ label: 'Active', tone: 'success' });
    expect(subscriptionStatusInfo('PENDING').label).toBe('Checkout open');
    expect(subscriptionStatusInfo('NEW_ONE').label).toBe('NEW_ONE');
    expect(isEntitling('PAST_DUE')).toBe(true);
    expect(isEntitling('PENDING')).toBe(false);
    expect(isEntitling('CANCELLED')).toBe(false);
    expect(donationStatusInfo('SUCCEEDED').label).toBe('Thank you');
  });

  it('formats credits, durations and ledger reasons', () => {
    expect(signedCredits(100)).toBe('+100');
    expect(signedCredits(-50)).toBe('−50');
    expect(signedCredits(0)).toBe('0');
    expect(creditsLabel(1)).toBe('1 credit');
    expect(creditsLabel(1250)).toBe('1,250 credits');
    expect(durationLabel(24)).toBe('24 hours');
    expect(durationLabel(72)).toBe('3 days');
    expect(durationLabel(1)).toBe('1 hour');
    expect(creditReasonLabel('REFERRAL')).toBe('Referral reward');
    expect(creditReasonLabel('FEATURE_UNLOCK', 'Wider map for a day')).toBe('Wider map for a day');
    expect(creditReasonLabel('SOMETHING_NEW')).toBe('Something new');
  });

  it('names entitlements', () => {
    expect(entitlementLabel('filters.advanced', 'true')).toBe('Advanced search filters');
    expect(entitlementLabel('binder.views.per_day', 'unlimited')).toBe('Unlimited binder views');
    expect(entitlementLabel('map.radius.max_km', '100')).toBe('Map radius up to 100 km');
    expect(entitlementLabel('saved_searches.max', '10')).toBe('Saved searches max: 10');
  });

  it('explains checkout refusals', () => {
    expect(checkoutProblem(apiError(409, 'ALREADY_SUBSCRIBED', { currentStatus: 'ACTIVE' }))).toBe(
      'You already have a subscription (active). Manage it below instead of starting another one.',
    );
    expect(checkoutProblem(apiError(404, 'FEATURE_DISABLED'))).toContain('not available');
  });

  it('explains credit spends and referral refusals', () => {
    expect(spendProblem(apiError(409, 'INSUFFICIENT_CREDITS', { balance: 20, cost: 50 }))).toBe(
      'You have 20 credits and this costs 50 credits.',
    );
    expect(spendProblem(apiError(409, 'INSUFFICIENT_CREDITS'))).toBe(
      'You do not have enough credits for this.',
    );
    expect(referralProblem(apiError(404, 'NOT_FOUND'))).toContain('does not exist');
    expect(referralProblem(apiError(409, 'REFERRAL_NOT_ALLOWED', { reason: 'SELF' }))).toContain(
      'your own code',
    );
    expect(
      referralProblem(apiError(409, 'REFERRAL_NOT_ALLOWED', { reason: 'ALREADY_REDEEMED' })),
    ).toContain('already redeemed');
    expect(
      referralProblem(apiError(409, 'REFERRAL_NOT_ALLOWED', { reason: 'ACCOUNT_TOO_OLD' })),
    ).toContain('window has closed');
    expect(
      referralProblem(apiError(409, 'REFERRAL_NOT_ALLOWED', { reason: 'REFERRER_LIMIT' })),
    ).toContain('limit');
  });

  it('maps donation field errors from the API', () => {
    const problem = donationProblem(
      apiError(
        400,
        'VALIDATION_FAILED',
        {},
        { amount: 'must be between 2.00 and 500.00', currency: 'must be one of CAD, USD' },
      ),
    );
    expect(problem.amount).toBe('The amount must be between 2.00 and 500.00.');
    expect(problem.currency).toBe('The currency must be one of CAD, USD.');
  });

  it('only follows local fake checkouts and https provider pages', () => {
    expect(checkoutTarget('/checkout/fake-billing/fake_cs_1')).toEqual({
      kind: 'app',
      path: '/checkout/fake-billing/fake_cs_1',
    });
    expect(checkoutTarget('/checkout/fake-donation/fake_dn_1')?.kind).toBe('app');
    expect(checkoutTarget('https://checkout.stripe.com/c/pay/cs_1')?.kind).toBe('external');
    expect(checkoutTarget('http://evil.example/x')).toBeNull();
    expect(checkoutTarget('javascript:alert(1)')).toBeNull();
    expect(checkoutTarget('/admin')).toBeNull();
    expect(checkoutTarget(null)).toBeNull();
  });

  it('creates valid idempotency keys', () => {
    const key = newIdempotencyKey('spend');
    expect(key).toMatch(/^spend:[A-Za-z0-9._:-]+$/);
    expect(key.length).toBeLessThanOrEqual(100);
    expect(newIdempotencyKey()).not.toBe(newIdempotencyKey());
  });
});
