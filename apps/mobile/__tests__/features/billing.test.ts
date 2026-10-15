import { ApiError } from '@/src/api/ApiError';
import { adClickUrl, adImageUrl } from '@/src/features/ads/adLinks';
import { shownAds } from '@/src/features/ads/SponsoredSlot';
import {
  activeEntitlements,
  checkoutProblem,
  creditReasonLabel,
  creditsLabel,
  donationProblem,
  durationLabel,
  entitlementLabel,
  featureLabel,
  formatPlanPrice,
  humanizeKey,
  idempotencyKeyFrom,
  referralCodeError,
  referralProblem,
  signedCredits,
  spendProblem,
  subscriptionStatusInfo,
  supporterMonth,
  usageRows,
} from '@/src/features/billing/billingLabels';
import { subscriptionText } from '@/src/features/billing/PlanCards';
import {
  donationFormErrors,
  donationRequest,
  parseDonationAmount,
} from '@/src/features/billing/donationForm';
import { checkoutPathname, checkoutTarget } from '@/src/features/billing/checkoutTargets';
import {
  billingOutcome,
  donationOutcome,
  isEntitling,
} from '@/src/features/billing/useProviderCheckout';

import { adFixture } from '../support/paymentFixtures';

function apiError(status: number, errorCode: string, problem: Record<string, unknown> = {}) {
  return new ApiError({
    status,
    errorCode,
    message: 'Refused',
    problem: { errorCode, ...problem },
  });
}

describe('checkout targets and outcomes', () => {
  it('follows only the app’s Premium and donation checkouts and https provider pages', () => {
    expect(checkoutTarget('/checkout/fake-billing/fake_cs_1')).toEqual({
      kind: 'app',
      screen: 'billing',
      ref: 'fake_cs_1',
    });
    expect(checkoutTarget('/checkout/fake-donation/fake_dn_1')).toMatchObject({
      screen: 'donation',
    });
    expect(checkoutTarget('https://checkout.stripe.com/c/pay_1')).toEqual({
      kind: 'external',
      url: 'https://checkout.stripe.com/c/pay_1',
    });
    // The protected-payment checkout left the phone with trades (ADR 0018).
    expect(checkoutTarget('/checkout/fake/fake_pi_1')).toBeNull();
    expect(checkoutTarget('http://evil.example/x')).toBeNull();
    expect(checkoutTarget('//evil.example/checkout/fake-billing/x')).toBeNull();
    expect(checkoutTarget('/checkout/fake-billing/../../x')).toBeNull();
    expect(checkoutTarget(null)).toBeNull();
    expect(checkoutPathname('billing')).toBe('/checkout/fake-billing/[ref]');
    expect(checkoutPathname('donation')).toBe('/checkout/fake-donation/[ref]');
  });

  it('reads how each kind of checkout ended', () => {
    expect(isEntitling('PAST_DUE')).toBe(true);
    expect(billingOutcome({ status: 'ACTIVE' }, null)).toBe('succeeded');
    expect(billingOutcome({ status: 'PENDING', failureCode: 'card_declined' }, null)).toBeNull();
    expect(billingOutcome({ status: 'PENDING', failureCode: 'card_declined' }, 'FAILED')).toBe(
      'failed'
    );
    expect(billingOutcome({ status: 'EXPIRED' }, 'SUCCEEDED')).toBe('cancelled');
    expect(donationOutcome({ status: 'PENDING' })).toBeNull();
    expect(donationOutcome({ status: 'SUCCEEDED' })).toBe('succeeded');
  });
});

describe('billing labels', () => {
  it('words plans, credits and entitlements', () => {
    expect(humanizeKey('binder.views.per_day')).toBe('Binder views per day');
    expect(featureLabel('ads.enabled', false)).toBe('No ads');
    expect(formatPlanPrice(0, 'CAD')).toBe('Free');
    expect(formatPlanPrice(4.99, 'CAD', false)).toBe('$4.99');
    expect(subscriptionStatusInfo('PENDING').label).toBe('Checkout open');
    expect(creditsLabel(1)).toBe('1 credit');
    expect(creditsLabel(1250)).toBe('1,250 credits');
    expect(signedCredits(100)).toBe('+100');
    expect(signedCredits(-50)).toBe('−50');
    expect(durationLabel(24)).toBe('24 hours');
    expect(durationLabel(48)).toBe('2 days');
    expect(creditReasonLabel('FEATURE_UNLOCK', 'Unlimited binder views')).toBe(
      'Unlimited binder views'
    );
    expect(creditReasonLabel('REFERRAL')).toBe('Referral reward');
    expect(supporterMonth('2026-03')).toBe('March 2026');
    expect(supporterMonth('nope')).toBe('');
    expect(idempotencyKeyFrom('spend', 'a b/c-1')).toBe('spend:abc-1');
    const now = Date.parse('2026-10-05T12:00:00Z');
    expect(
      activeEntitlements(
        [
          { expiresAt: '2026-10-05T11:00:00Z' },
          { expiresAt: null },
          { expiresAt: '2026-10-06T00:00:00Z' },
        ],
        now
      )
    ).toHaveLength(2);
  });

  it('turns limits into usage rows', () => {
    const rows = usageRows(
      [
        { key: 'binders.max', kind: 'COUNTER', limit: 5, used: 5, allowed: false },
        { key: 'wishlist.items.max', kind: 'CAP', limit: 25 },
        {
          key: 'binder.views.per_day',
          kind: 'COUNTER',
          used: 3,
          resetsAt: '2026-10-06T00:00:00Z',
          overridden: true,
        },
      ],
      humanizeKey
    );
    expect(rows.map((row) => [row.value, row.percent, row.full, row.boosted])).toEqual([
      ['5 / 5', 100, true, false],
      ['Up to 25', null, false, false],
      ['3 used · Unlimited', null, false, true],
    ]);
  });

  it('words subscription states', () => {
    expect(subscriptionText({ status: 'PENDING' })).toMatch(/Finish paying to start Premium/);
    expect(subscriptionText({ status: 'ACTIVE', cancelAtPeriodEnd: true })).toMatch(
      /Premium stays until the end of the paid period/
    );
    expect(subscriptionText({ status: 'EXPIRED' })).toBe('This subscription has ended.');
  });

  it('words the billing, credit, referral and donation refusals', () => {
    expect(
      checkoutProblem(apiError(409, 'ALREADY_SUBSCRIBED', { currentStatus: 'ACTIVE' }))
    ).toMatch(/You already have a subscription \(active\)/);
    expect(checkoutProblem(apiError(404, 'FEATURE_DISABLED'))).toMatch(/not available right now/);
    expect(spendProblem(apiError(409, 'INSUFFICIENT_CREDITS'))).toBe(
      'You do not have enough credits for this.'
    );
    expect(referralProblem(apiError(404, 'NOT_FOUND'))).toMatch(/This code does not exist/);
    expect(
      referralProblem(apiError(409, 'REFERRAL_NOT_ALLOWED', { reason: 'ALREADY_REDEEMED' }))
    ).toMatch(/already redeemed/);
    expect(referralCodeError('ab')).toMatch(/3 to 32/);
    expect(referralCodeError('NOE-2026')).toBeNull();
    const donation = donationProblem(
      new ApiError({
        status: 400,
        errorCode: 'VALIDATION_FAILED',
        message: 'Invalid',
        fieldErrors: { amount: 'must be between 2.00 and 500.00' },
      })
    );
    expect(donation).toEqual({
      message: 'Check the amount and the currency.',
      amount: 'The amount must be between 2.00 and 500.00.',
      currency: null,
    });
  });
});

describe('donation form', () => {
  it('parses amounts and builds the checkout request', () => {
    expect(parseDonationAmount('7')).toBe(7);
    expect(parseDonationAmount('7,5')).toBe(7.5);
    expect(parseDonationAmount('7.555')).toBeNull();
    expect(parseDonationAmount('-3')).toBeNull();
    expect(parseDonationAmount('0')).toBeNull();
    const base = { preset: '10', custom: '', currency: 'CAD', message: '', publicThanks: false };
    expect(donationRequest(base)).toEqual({ amount: 10, currency: 'CAD', publicThanks: false });
    expect(
      donationRequest({ ...base, preset: 'other', custom: '12.50', message: ' Thanks ' })
    ).toEqual({
      amount: 12.5,
      currency: 'CAD',
      message: 'Thanks',
      publicThanks: false,
    });
    expect(donationRequest({ ...base, preset: 'other' })).toBeNull();
    expect(donationFormErrors({ ...base, preset: 'other' })).toEqual({
      custom: 'Enter an amount.',
    });
    expect(donationFormErrors({ ...base, message: 'x'.repeat(281) })).toEqual({
      message: 'Keep it under 280 characters.',
    });
  });
});

describe('sponsored links', () => {
  it('follows only the API click route or https pages, and API or https images', () => {
    expect(adClickUrl('/api/v1/ads/abc/click?token=t-1')).toBe(
      'http://localhost:8080/api/v1/ads/abc/click?token=t-1'
    );
    expect(adClickUrl('https://maple.example/sleeves')).toBe('https://maple.example/sleeves');
    expect(adClickUrl('javascript:alert(1)')).toBeNull();
    expect(adClickUrl('/settings')).toBeNull();
    expect(adImageUrl('/api/v1/public/media/ads/a.jpg')).toBe(
      'http://localhost:8080/api/v1/public/media/ads/a.jpg'
    );
    expect(adImageUrl('http://insecure.example/a.jpg')).toBeNull();
    expect(
      shownAds([adFixture(), adFixture({ headline: '' }), adFixture({ clickUrl: 'ftp://x' })])
    ).toHaveLength(1);
  });
});
