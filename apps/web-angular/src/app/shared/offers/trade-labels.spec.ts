import { nextActionShort, nextActionView, tradeEventLabel } from './trade-labels';

const NAMES = { BUYER: 'Ben', SELLER: 'Ada' };

describe('trade labels with payment protection', () => {
  it('words the payment, shipping and dispute steps of the timeline', () => {
    expect(tradeEventLabel('PAYMENT_STARTED', 'BUYER', 'BUYER', NAMES)).toBe(
      'You started the protected payment',
    );
    expect(tradeEventLabel('PAYMENT_SECURED', null, 'SELLER', NAMES)).toBe(
      'Payment secured: the payment provider holds the money',
    );
    expect(
      tradeEventLabel('SHIPPED', 'SELLER', 'BUYER', NAMES, {
        carrier: 'Canada Post',
        trackingNumber: 'X1',
      }),
    ).toBe('Ada shipped the card with Canada Post');
    expect(tradeEventLabel('RECEIPT_CONFIRMED', null, 'SELLER', NAMES, { automatic: true })).toBe(
      'Receipt confirmed automatically: the dispute window ended',
    );
    expect(tradeEventLabel('PAYOUT_RELEASED', null, 'SELLER', NAMES)).toBe(
      'Payout released to you',
    );
    expect(tradeEventLabel('PAYOUT_RELEASED', null, 'BUYER', NAMES)).toBe('Payout released to Ada');
    expect(
      tradeEventLabel('DISPUTE_OPENED', 'BUYER', 'SELLER', NAMES, { reason: 'NOT_RECEIVED' }),
    ).toBe('Ben opened a dispute: the card never arrived');
    expect(tradeEventLabel('DISPUTE_RESOLVED', null, 'BUYER', NAMES, { outcome: 'BUYER' })).toBe(
      'OrenjiTrade resolved the dispute for the buyer',
    );
    expect(tradeEventLabel('REFUNDED', null, 'BUYER', NAMES)).toBe('Refund issued to you');
  });

  it('tells each side what happens next', () => {
    const base = { viewerRole: 'BUYER' as const, other: 'Ada', protectionEnabled: true };
    expect(
      nextActionView({
        ...base,
        status: 'AWAITING_PAYMENT',
        nextAction: { actor: 'BUYER', action: 'PAY' },
      }),
    ).toMatchObject({ tone: 'live', title: 'Your move: pay with payment protection' });
    expect(
      nextActionView({
        ...base,
        status: 'AWAITING_PAYMENT',
        nextAction: { actor: 'BUYER', action: 'PAY' },
        paymentStatus: 'FAILED',
      }).title,
    ).toBe('Your payment did not go through');
    expect(
      nextActionView({
        ...base,
        viewerRole: 'SELLER',
        other: 'Ben',
        status: 'PAID',
        nextAction: { actor: 'SELLER', action: 'SHIP' },
      }).title,
    ).toBe('Your move: ship the card');
    const confirm = nextActionView({
      ...base,
      status: 'SHIPPED',
      nextAction: { actor: 'BUYER', action: 'CONFIRM_RECEIPT' },
      windowEndsAt: 'Oct 6, 2026',
    });
    expect(confirm.title).toBe('Your move: confirm you received the card');
    expect(confirm.description).toContain('Open a dispute before Oct 6, 2026 instead');
    expect(
      nextActionView({ ...base, status: 'DISPUTED', nextAction: { action: 'NONE' } }).title,
    ).toBe('A dispute is open');
    expect(
      nextActionView({
        ...base,
        viewerRole: 'SELLER',
        other: 'Ben',
        status: 'COMPLETED',
        nextAction: { action: 'NONE' },
      }).description,
    ).toBe('Ben received the card and your payout was released. You can now rate Ben.');
    const text = JSON.stringify([confirm]).toLowerCase();
    expect(text).not.toContain('escrow');
  });

  it('shortens the next step for the list', () => {
    expect(nextActionShort('PAID', { actor: 'SELLER', action: 'SHIP' }, 'SELLER', 'Ben')).toBe(
      'Your move: ship the card',
    );
    expect(
      nextActionShort('AWAITING_PAYMENT', { actor: 'BUYER', action: 'PAY' }, 'BUYER', 'Ada'),
    ).toBe('Your move: pay');
    expect(nextActionShort('DISPUTED', { action: 'NONE' }, 'SELLER', 'Ben')).toBe('Dispute open');
  });
});
