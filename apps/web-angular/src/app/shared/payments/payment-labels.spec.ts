import {
  PROTECTION_COPY,
  disputeEventLabel,
  disputeReasonLabel,
  disputeStatusInfo,
  evidenceFileKind,
  fileSize,
  isOpenDispute,
  money,
  paymentStatusInfo,
  providerLabel,
  refundableOf,
  sellerAccountInfo,
} from './payment-labels';

const NAMES = { BUYER: 'Ben Buyer', SELLER: 'Ada Seller' };

describe('payment labels', () => {
  it('words payment protection without ever calling it escrow', () => {
    const copy = JSON.stringify(PROTECTION_COPY).toLowerCase();
    expect(copy).toContain('payment provider');
    expect(copy).toContain('intermediary');
    expect(copy).not.toContain('escrow');
  });

  it('names statuses with a tone and falls back for unknown values', () => {
    expect(paymentStatusInfo('SECURED')).toMatchObject({ label: 'Payment secured', tone: 'info' });
    expect(paymentStatusInfo('PAID_OUT').tone).toBe('success');
    expect(paymentStatusInfo('SOMETHING_NEW').label).toBe('SOMETHING_NEW');
    expect(disputeStatusInfo('FROZEN').label).toBe('On hold');
    expect(disputeStatusInfo('RESOLVED_BUYER').label).toBe('Resolved for the buyer');
    expect(sellerAccountInfo('ACTIVE').label).toBe('Ready for payouts');
    expect(sellerAccountInfo(undefined).label).toBe('Not set up');
    expect(disputeReasonLabel('NOT_AS_DESCRIBED')).toBe('Not as described');
    expect(providerLabel('fake')).toBe('Local test provider');
  });

  it('knows which disputes still wait for a decision', () => {
    expect(isOpenDispute('OPEN')).toBe(true);
    expect(isOpenDispute('UNDER_REVIEW')).toBe(true);
    expect(isOpenDispute('FROZEN')).toBe(true);
    expect(isOpenDispute('RESOLVED_SPLIT')).toBe(false);
    expect(isOpenDispute('CLOSED')).toBe(false);
  });

  it('computes what is still refundable to the cent', () => {
    expect(refundableOf({ amount: 35, refundedAmount: 0 })).toBe(35);
    expect(refundableOf({ amount: 40.1, refundedAmount: 10.05 })).toBe(30.05);
    expect(refundableOf({ amount: 10, refundedAmount: 12 })).toBe(0);
    expect(money(52.25, 'CAD')).toBe('$52.25');
    expect(money(null, 'CAD')).toBe('—');
  });

  it('words the dispute timeline for each reader', () => {
    expect(
      disputeEventLabel(
        { event: 'OPENED', actorRole: 'BUYER', details: { reason: 'DAMAGED' } },
        'BUYER',
        NAMES,
      ),
    ).toBe('You opened the dispute: Damaged in transit');
    expect(
      disputeEventLabel(
        { event: 'EVIDENCE_ADDED', actorRole: 'SELLER', details: { kind: 'IMAGE' } },
        'BUYER',
        NAMES,
      ),
    ).toBe('Ada Seller added evidence (photo)');
    expect(disputeEventLabel({ event: 'MESSAGE_POSTED', actorRole: 'ADMIN' }, 'BUYER', NAMES)).toBe(
      'OrenjiTrade posted a message',
    );
    expect(disputeEventLabel({ event: 'FROZEN', actorRole: 'ADMIN' }, null, NAMES)).toBe(
      'OrenjiTrade put the dispute on hold',
    );
    expect(
      disputeEventLabel(
        { event: 'RESOLVED', actorRole: 'ADMIN', details: { outcome: 'BUYER', refundAmount: 35 } },
        'SELLER',
        NAMES,
        'CAD',
      ),
    ).toBe('OrenjiTrade decided for the buyer with a refund of $35.00');
    expect(
      disputeEventLabel(
        { event: 'RESOLVED', actorRole: 'ADMIN', details: { outcome: 'SELLER', refundAmount: 0 } },
        'SELLER',
        NAMES,
        'CAD',
      ),
    ).toBe('OrenjiTrade decided for the seller: the payout is released');
  });

  it('accepts photos up to 8 MB and PDFs up to 10 MB as evidence', () => {
    expect(evidenceFileKind({ type: 'image/png', size: 2048 })).toEqual({ kind: 'IMAGE' });
    expect(evidenceFileKind({ type: 'application/pdf', size: 9 * 1024 * 1024 })).toEqual({
      kind: 'DOCUMENT',
    });
    expect(evidenceFileKind({ type: 'image/jpeg', size: 9 * 1024 * 1024 })).toEqual({
      error: 'Photos can be at most 8 MB.',
    });
    expect(evidenceFileKind({ type: 'application/pdf', size: 11 * 1024 * 1024 })).toEqual({
      error: 'PDF documents can be at most 10 MB.',
    });
    expect(evidenceFileKind({ type: 'video/mp4', size: 100 })).toEqual({
      error: 'Use a photo (JPEG, PNG or WebP) or a PDF document.',
    });
    expect(evidenceFileKind({ type: 'image/png', size: 0 })).toEqual({
      error: 'That file is empty.',
    });
    expect(fileSize(512)).toBe('512 B');
    expect(fileSize(2048)).toBe('2 KB');
    expect(fileSize(3.5 * 1024 * 1024)).toBe('3.5 MB');
  });
});
