import {
  isOpenTrade,
  isYourMove,
  nextActionShort,
  nextActionView,
  tradeEventLabel,
  tradeStatusInfo,
  tradeSteps,
  type TradeStepsInput,
} from '@/src/features/trades/tradeLabels';
import { TRADES_PAGE, parseTradesFilter, tradesRequest } from '@/src/features/trades/tradeList';

const names = { SELLER: 'Noé', BUYER: 'Maïka' };

const meetupTrade = (overrides: Partial<TradeStepsInput> = {}): TradeStepsInput => ({
  status: 'AGREED',
  viewerRole: 'BUYER',
  counterpartyName: 'Noé',
  meetup: false,
  buyerMarkedMeetup: false,
  sellerMarkedMeetup: false,
  buyerConfirmedAt: null,
  sellerConfirmedAt: null,
  protectionEnabled: false,
  disputed: false,
  ...overrides,
});

describe('trade labels', () => {
  it('words statuses and the timeline', () => {
    expect(tradeStatusInfo('AGREED')).toMatchObject({ label: 'Agreed', tone: 'live' });
    expect(tradeStatusInfo('COMPLETED').tone).toBe('success');
    expect(tradeStatusInfo('LATER')).toMatchObject({ label: 'LATER', tone: 'info' });
    expect(isOpenTrade('AGREED')).toBe(true);
    expect(isOpenTrade('CANCELLED')).toBe(false);
    expect(tradeEventLabel('CREATED', 'SELLER', 'BUYER', names)).toBe(
      'Noé accepted the offer: the trade is open'
    );
    expect(tradeEventLabel('COMPLETION_CONFIRMED', 'BUYER', 'BUYER', names)).toBe(
      'You confirmed the exchange'
    );
    expect(tradeEventLabel('MEETUP_AGREED', null, 'BUYER', names)).toBe(
      'In-person meetup agreed by both of you'
    );
    expect(tradeEventLabel('SHIPPED', 'SELLER', 'BUYER', names, { carrier: 'Canada Post' })).toBe(
      'Noé shipped the card with Canada Post'
    );
    expect(
      tradeEventLabel('DISPUTE_OPENED', 'BUYER', 'SELLER', names, { reason: 'COUNTERFEIT' })
    ).toBe('Maïka opened a dispute: counterfeit');
    expect(tradeEventLabel('PAYOUT_RELEASED', null, 'BUYER', names)).toBe('Payout released to Noé');
  });

  it('says whose move it is', () => {
    const meet = { actor: 'BUYER' as const, action: 'MEET' };
    expect(nextActionShort('AGREED', meet, 'BUYER', 'Noé')).toBe('Your move: meet and confirm');
    expect(nextActionShort('AGREED', meet, 'SELLER', 'Maïka')).toBe('Waiting for Maïka');
    expect(nextActionShort('COMPLETED', meet, 'BUYER', 'Noé')).toBe('Completed');
    expect(nextActionShort('AGREED', { action: 'NONE' }, 'BUYER', 'Noé')).toBe('Nothing to do');
    expect(isYourMove({ nextAction: meet, viewerRole: 'BUYER' })).toBe(true);
    expect(isYourMove({ nextAction: { action: 'NONE' }, viewerRole: 'BUYER' })).toBe(false);
    expect(
      nextActionView({ status: 'AGREED', nextAction: meet, viewerRole: 'BUYER', other: 'Noé' })
    ).toMatchObject({ tone: 'live', title: 'Your move: meet and exchange the cards' });
    expect(
      nextActionView({ status: 'AGREED', nextAction: meet, viewerRole: 'SELLER', other: 'Maïka' })
        .title
    ).toBe('Waiting for Maïka');
    expect(
      nextActionView({ status: 'COMPLETED', nextAction: meet, viewerRole: 'BUYER', other: 'Noé' })
        .description
    ).toBe('Both of you confirmed the exchange. You can now rate Noé.');
    expect(
      nextActionView({
        status: 'CANCELLED',
        nextAction: { action: 'NONE' },
        viewerRole: 'BUYER',
        other: 'Noé',
        cancelReason: 'Sold elsewhere',
      }).description
    ).toBe('Reason given: “Sold elsewhere”');
    expect(
      nextActionView({
        status: 'AWAITING_PAYMENT',
        nextAction: { actor: 'BUYER', action: 'PAY' },
        viewerRole: 'BUYER',
        other: 'Noé',
        paymentStatus: 'FAILED',
      }).title
    ).toBe('Your payment did not go through');
  });

  it('lays out the meetup steps with both parties’ marks', () => {
    const open = tradeSteps(meetupTrade({ sellerMarkedMeetup: true }));
    expect(open.map((step) => [step.key, step.state])).toEqual([
      ['accepted', 'done'],
      ['meetup', 'current'],
      ['confirmed', 'current'],
      ['completed', 'todo'],
    ]);
    expect(open[1]?.marks).toEqual([
      { who: 'You', done: false },
      { who: 'Noé', done: true },
    ]);
    const confirmed = tradeSteps(
      meetupTrade({ meetup: true, buyerConfirmedAt: '2026-10-05T12:00:00Z' })
    );
    expect(confirmed[1]?.state).toBe('done');
    expect(confirmed[2]?.state).toBe('todo');
    const done = tradeSteps(
      meetupTrade({
        status: 'COMPLETED',
        buyerConfirmedAt: '2026-10-05T12:00:00Z',
        sellerConfirmedAt: '2026-10-05T13:00:00Z',
      })
    );
    expect(done.map((step) => step.state)).toEqual(['done', 'skipped', 'done', 'done']);
    const cancelled = tradeSteps(meetupTrade({ status: 'CANCELLED' }));
    expect(cancelled[3]).toMatchObject({ title: 'Cancelled', state: 'skipped' });
  });

  it('lays out the payment protection steps', () => {
    const steps = tradeSteps(
      meetupTrade({ protectionEnabled: true, status: 'PAID', paymentStatus: 'SECURED' })
    );
    expect(steps.map((step) => [step.key, step.state])).toEqual([
      ['accepted', 'done'],
      ['paid', 'done'],
      ['shipped', 'current'],
      ['received', 'todo'],
      ['completed', 'todo'],
    ]);
    const disputed = tradeSteps(
      meetupTrade({ protectionEnabled: true, status: 'DISPUTED', disputed: true })
    );
    expect(disputed[3]).toMatchObject({ key: 'dispute', state: 'current' });
  });
});

describe('trades list filter', () => {
  it('reads the status filter and builds the request', () => {
    expect(parseTradesFilter(undefined)).toBe('all');
    expect(parseTradesFilter('completed')).toBe('completed');
    expect(parseTradesFilter('weird')).toBe('all');
    expect(tradesRequest('all', null)).toEqual({ limit: TRADES_PAGE });
    expect(tradesRequest('cancelled', 'c2')).toEqual({
      status: ['CANCELLED'],
      cursor: 'c2',
      limit: TRADES_PAGE,
    });
    expect(tradesRequest('active', null).status).toContain('DISPUTED');
  });
});
