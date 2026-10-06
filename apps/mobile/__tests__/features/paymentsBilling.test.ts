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
import {
  billingOutcome,
  donationOutcome,
  isEntitling,
  paymentOutcome,
} from '@/src/features/checkout/useProviderCheckout';
import { disputeFacts } from '@/src/features/disputes/DisputeOverview';
import { disputeClosedText } from '@/src/features/disputes/disputeRules';
import { evidenceViews } from '@/src/features/disputes/EvidenceList';
import {
  checkoutPathname,
  checkoutTarget,
  payTarget,
  payoutReturnPath,
} from '@/src/features/payments/checkoutTargets';
import {
  disputeEventLabel,
  disputeReasonLabel,
  disputeStatusInfo,
  evidencePhotoProblem,
  fileSize,
  isOpenDispute,
  paymentRows,
  paymentStatusInfo,
  providerLabel,
  sellerAccountInfo,
  sellerAccountText,
} from '@/src/features/payments/paymentLabels';
import { paymentProblem } from '@/src/features/payments/paymentProblems';
import {
  descriptionError,
  disputeFormErrors,
  disputeMessageError,
  shipFormErrors,
  statementError,
  toDisputeRequest,
  toShipRequest,
} from '@/src/features/payments/protectedForms';

import { adFixture, disputeFixture } from '../support/paymentFixtures';

function apiError(status: number, errorCode: string, problem: Record<string, unknown> = {}) {
  return new ApiError({
    status,
    errorCode,
    message: 'Refused',
    problem: { errorCode, ...problem },
  });
}

describe('payment protection labels', () => {
  it('words statuses, reasons and providers, never "escrow"', () => {
    expect(paymentStatusInfo('SECURED').label).toBe('Payment secured');
    expect(paymentStatusInfo('PAID_OUT').tone).toBe('success');
    expect(paymentStatusInfo('NEW_STATUS').label).toBe('NEW_STATUS');
    expect(disputeStatusInfo('FROZEN').label).toBe('On hold');
    expect(isOpenDispute('UNDER_REVIEW')).toBe(true);
    expect(isOpenDispute('RESOLVED_SPLIT')).toBe(false);
    expect(disputeReasonLabel('NOT_RECEIVED')).toBe('The card never arrived');
    expect(providerLabel('fake')).toBe('Local test provider');
    expect(sellerAccountInfo('ACTIVE').label).toBe('Ready for payouts');
    expect(sellerAccountText('PENDING').action).toBe('Continue the setup');
    expect(sellerAccountText('ACTIVE').action).toBeNull();
    const everything = JSON.stringify([
      paymentStatusInfo('SECURED'),
      sellerAccountText('NOT_STARTED'),
      disputeEventLabel(
        { event: 'RESOLVED', details: { outcome: 'BUYER', refundAmount: 40 } },
        'BUYER',
        { BUYER: 'B', SELLER: 'S' },
        'CAD'
      ),
    ]);
    expect(everything).not.toMatch(/escrow/i);
  });

  it('builds the payment card rows for each side and settlement', () => {
    const secured = {
      status: 'SECURED',
      amount: 40,
      currency: 'CAD',
      platformFee: 2,
      sellerAmount: 38,
      refundedAmount: 0,
    };
    expect(paymentRows(secured, 'BUYER').map((row) => [row.key, row.label, row.value])).toEqual([
      ['amount', 'You pay', '$40.00'],
      ['fee', 'Platform fee (from the payout)', '$2.00'],
      ['seller-amount', 'Seller receives', '$38.00'],
    ]);
    expect(
      paymentRows(
        {
          ...secured,
          status: 'PAID_OUT',
          payoutAmount: 38,
          payoutReleasedAt: '2026-10-06T10:00:00Z',
        },
        'SELLER'
      ).map((row) => row.label)
    ).toEqual(['Buyer pays', 'Platform fee (from the payout)', 'Payout released to you']);
    expect(
      paymentRows({ ...secured, status: 'REFUNDED', refundedAmount: 40 }, 'BUYER').map(
        (row) => row.key
      )
    ).toEqual(['amount', 'refunded']);
  });

  it('words the dispute timeline from the reader’s side', () => {
    const names = { BUYER: 'Maïka', SELLER: 'Noé' };
    expect(
      disputeEventLabel(
        { event: 'OPENED', actorRole: 'BUYER', details: { reason: 'DAMAGED' } },
        'SELLER',
        names
      )
    ).toBe('Maïka opened the dispute: Damaged in transit');
    expect(
      disputeEventLabel(
        { event: 'EVIDENCE_ADDED', actorRole: 'SELLER', details: { kind: 'IMAGE' } },
        'SELLER',
        names
      )
    ).toBe('You added evidence (photo)');
    expect(disputeEventLabel({ event: 'FROZEN', actorRole: 'ADMIN' }, 'BUYER', names)).toBe(
      'OrenjiTrade put the dispute on hold'
    );
    expect(
      disputeEventLabel(
        { event: 'RESOLVED', details: { outcome: 'SPLIT', refundAmount: 15 } },
        'BUYER',
        names,
        'CAD'
      )
    ).toBe('OrenjiTrade split the payment with a refund of $15.00');
    expect(disputeEventLabel({ event: 'SOMETHING_NEW' }, 'BUYER', names)).toBe('something new');
  });

  it('checks evidence photos and sizes before uploading', () => {
    expect(evidencePhotoProblem({ mimeType: 'image/png', size: 1000 })).toBeNull();
    expect(evidencePhotoProblem({ mimeType: 'image/gif', size: 1000 })).toMatch(
      /JPEG, PNG or WebP/
    );
    expect(evidencePhotoProblem({ mimeType: 'image/jpeg', size: 9 * 1024 * 1024 })).toMatch(/8 MB/);
    expect(evidencePhotoProblem({ mimeType: 'image/jpeg', size: 0 })).toMatch(/empty/);
    expect(fileSize(512)).toBe('512 B');
    expect(fileSize(240_000)).toBe('234 KB');
    expect(fileSize(3 * 1024 * 1024)).toBe('3.0 MB');
  });

  it('words the payment refusals', () => {
    expect(paymentProblem(apiError(409, 'SELLER_NOT_ONBOARDED'), 'Noé').message).toMatch(
      /Noé has not set up payouts yet/
    );
    const closed = paymentProblem(
      apiError(409, 'DISPUTE_WINDOW_CLOSED', { disputeWindowEndsAt: '2026-10-12T14:00:00Z' }),
      'Noé'
    );
    expect(closed.message).toMatch(/The dispute window closed on .+\. Message Noé/);
    expect(closed.reload).toBe(true);
    expect(paymentProblem(apiError(409, 'EVIDENCE_LIMIT_REACHED', { limit: 10 })).message).toMatch(
      /10 pieces of evidence/
    );
    expect(paymentProblem(apiError(404, 'FEATURE_DISABLED')).message).toMatch(
      /Payment protection is not available right now/
    );
    expect(paymentProblem(apiError(413, 'PAYLOAD_TOO_LARGE')).message).toMatch(/8 MB/);
    // Phase 8 refusals keep their wording.
    expect(
      paymentProblem(apiError(409, 'INVALID_STATE_TRANSITION', { currentStatus: 'CANCELLED' }))
        .message
    ).toMatch(/already cancelled/);
  });
});

describe('protected forms', () => {
  it('validates the shipping form and trims its body', () => {
    expect(shipFormErrors({ carrier: 'x'.repeat(81), trackingNumber: '', notes: '' })).toEqual({
      carrier: 'Keep the carrier under 80 characters.',
    });
    expect(
      toShipRequest({ carrier: ' Canada Post ', trackingNumber: '', notes: ' fragile ' })
    ).toEqual({
      carrier: 'Canada Post',
      notes: 'fragile',
    });
    expect(toShipRequest({ carrier: '', trackingNumber: '', notes: '' })).toEqual({});
  });

  it('validates the dispute form', () => {
    expect(disputeFormErrors({ reason: null, description: '' })).toEqual({
      reason: 'Choose what went wrong.',
      description: 'Describe what is wrong so an admin can review it.',
    });
    expect(descriptionError('too short')).toMatch(/at least 10 characters/);
    expect(descriptionError('x'.repeat(2001))).toMatch(/under 2000/);
    expect(
      toDisputeRequest({ reason: 'COUNTERFEIT', description: '  The hologram is missing.  ' })
    ).toEqual({ reason: 'COUNTERFEIT', description: 'The hologram is missing.' });
    expect(statementError('  ')).toMatch(/Write what you want/);
    expect(disputeMessageError('ok')).toBeNull();
  });
});

describe('checkout targets and outcomes', () => {
  it('follows only the app’s fake checkouts and https provider pages', () => {
    expect(checkoutTarget('/checkout/fake/fake_pi_1')).toEqual({
      kind: 'app',
      screen: 'payment',
      ref: 'fake_pi_1',
    });
    expect(checkoutTarget('/checkout/fake-billing/fake_cs_1')).toMatchObject({ screen: 'billing' });
    expect(checkoutTarget('/checkout/fake-donation/fake_dn_1')).toMatchObject({
      screen: 'donation',
    });
    expect(checkoutTarget('https://checkout.stripe.com/c/pay_1')).toEqual({
      kind: 'external',
      url: 'https://checkout.stripe.com/c/pay_1',
    });
    expect(checkoutTarget('http://evil.example/x')).toBeNull();
    expect(checkoutTarget('//evil.example/checkout/fake/x')).toBeNull();
    expect(checkoutTarget('/checkout/fake/../../x')).toBeNull();
    expect(checkoutTarget(null)).toBeNull();
    expect(payTarget({ checkoutUrl: '/checkout/fake-billing/x' })).toBeNull();
    expect(payTarget({ checkoutUrl: '/checkout/fake/x' })).toMatchObject({ ref: 'x' });
    expect(checkoutPathname('billing')).toBe('/checkout/fake-billing/[ref]');
    expect(payoutReturnPath('/trades/t1')).toBe('/trades/t1');
    expect(payoutReturnPath('/settings')).toBeNull();
    expect(payoutReturnPath('https://evil.example/trades/t1')).toBeNull();
  });

  it('reads how each kind of checkout ended', () => {
    expect(paymentOutcome({ status: 'REQUIRES_ACTION' })).toBeNull();
    expect(paymentOutcome({ status: 'SECURED' })).toBe('succeeded');
    expect(paymentOutcome({ status: 'FAILED' })).toBe('failed');
    expect(paymentOutcome({ status: 'REFUNDED' })).toBe('cancelled');
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

describe('disputes', () => {
  it('lists facts by name and handle only, and says why posting is closed', () => {
    const dispute = disputeFixture();
    const facts = disputeFacts(dispute);
    expect(facts.map((fact) => fact.key)).toEqual([
      'buyer',
      'seller',
      'paid',
      'payout',
      'carrier',
      'tracking',
    ]);
    expect(JSON.stringify(facts)).not.toMatch(/lat|lng|email/i);
    expect(facts.find((fact) => fact.key === 'payout')?.value).toBe('On hold');
    expect(disputeClosedText(dispute)).toBeNull();
    expect(disputeClosedText({ ...dispute, status: 'FROZEN' })).toMatch(/on hold/);
    expect(disputeClosedText({ ...dispute, status: 'CLOSED' })).toMatch(/decided/);
    expect(disputeClosedText({ ...dispute, canAddEvidence: false, evidenceLeft: 0 })).toMatch(
      /most evidence allowed/
    );
  });

  it('words evidence and follows https tracking links only', () => {
    const views = evidenceViews(
      [
        { id: 'a', kind: 'IMAGE', role: 'SELLER', createdAt: '2026-10-05T12:00:00Z' },
        {
          id: 'b',
          kind: 'TRACKING',
          role: 'BUYER',
          url: 'javascript:alert(1)',
          createdAt: '2026-10-05T12:00:00Z',
        },
        {
          id: 'c',
          kind: 'TRACKING',
          role: 'ADMIN',
          url: 'https://tracking.example/CP1',
          createdAt: '2026-10-05T12:00:00Z',
        },
      ],
      'BUYER',
      { BUYER: 'Maïka', SELLER: 'Noé' }
    );
    expect(views.map((view) => [view.kind, view.who, view.link])).toEqual([
      ['Photo', 'Noé', null],
      ['Tracking', 'You', null],
      ['Tracking', 'OrenjiTrade', 'https://tracking.example/CP1'],
    ]);
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
    expect(creditReasonLabel('FEATURE_UNLOCK', 'Wider map for a day')).toBe('Wider map for a day');
    expect(creditReasonLabel('REFERRAL')).toBe('Referral reward');
    expect(entitlementLabel('map.radius.max_km', '100')).toBe('Map radius up to 100 km');
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
        { key: 'map.radius.max_km', kind: 'CAP', limit: 25 },
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
      ['Up to 25 km', null, false, false],
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
