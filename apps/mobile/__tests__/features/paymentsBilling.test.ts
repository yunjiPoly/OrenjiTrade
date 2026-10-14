import { ApiError } from '@/src/api/ApiError';
import { paymentOutcome } from '@/src/features/checkout/useProviderCheckout';
import { disputeFacts } from '@/src/features/disputes/DisputeOverview';
import { disputeClosedText } from '@/src/features/disputes/disputeRules';
import { evidenceViews } from '@/src/features/disputes/EvidenceList';
import {
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

import { disputeFixture } from '../support/paymentFixtures';

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
    // Premium and donations left (stage F1): their old checkout paths are not followed.
    expect(checkoutTarget('/checkout/fake-billing/fake_cs_1')).toBeNull();
    expect(checkoutTarget('/checkout/fake-donation/fake_dn_1')).toBeNull();
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
    expect(payoutReturnPath('/trades/t1')).toBe('/trades/t1');
    expect(payoutReturnPath('/settings')).toBeNull();
    expect(payoutReturnPath('https://evil.example/trades/t1')).toBeNull();
  });

  it('reads how a payment checkout ended', () => {
    expect(paymentOutcome({ status: 'REQUIRES_ACTION' })).toBeNull();
    expect(paymentOutcome({ status: 'SECURED' })).toBe('succeeded');
    expect(paymentOutcome({ status: 'FAILED' })).toBe('failed');
    expect(paymentOutcome({ status: 'REFUNDED' })).toBe('cancelled');
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
