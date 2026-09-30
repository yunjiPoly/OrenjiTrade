import { ApiError } from '../../core/http/api-error';
import { offerProblem, problemExtension } from './offer-problems';
import { nextActionShort, nextActionView, tradeEventLabel, tradeStatusInfo } from './trade-labels';

function apiError(
  status: number,
  errorCode: string,
  message = '',
  extra: Record<string, unknown> = {},
  fieldErrors: Record<string, string> = {},
): ApiError {
  return new ApiError(
    { errorCode, message, requestId: 'req-1', status, fieldErrors },
    { problem: { errorCode, message, status, ...extra } },
  );
}

describe('offer problems', () => {
  it('links to the open offer on 409 OFFER_ALREADY_OPEN', () => {
    const problem = offerProblem(apiError(409, 'OFFER_ALREADY_OPEN', 'open', { offerId: 'o-7' }));
    expect(problem.message).toContain('You already have an open offer on this card');
    expect(problem.openOfferId).toBe('o-7');
    expect(problem.reload).toBe(false);
  });

  it('moves to the live proposal on 409 STALE_OFFER and re-reads on turn / state conflicts', () => {
    const stale = offerProblem(apiError(409, 'STALE_OFFER', 'stale', { latestOfferId: 'o-9' }));
    expect(stale).toMatchObject({ latestOfferId: 'o-9', reload: true });
    expect(stale.message).toContain('changed while you were looking at it');
    expect(offerProblem(apiError(409, 'NOT_YOUR_TURN'), 'Ada')).toMatchObject({
      message: "It is Ada's turn to answer this offer.",
      reload: true,
    });
    expect(
      offerProblem(apiError(409, 'INVALID_STATE_TRANSITION', '', { currentStatus: 'EXPIRED' }))
        .message,
    ).toBe('This can no longer be done: it was already expired.');
    expect(offerProblem(apiError(409, 'ITEM_UNAVAILABLE')).reload).toBe(true);
  });

  it('explains refused kinds, blocks and field errors', () => {
    expect(
      offerProblem(
        apiError(422, 'OFFERS_NOT_ACCEPTED', 'This collector does not accept mixed offers'),
      ).message,
    ).toBe('This collector does not accept mixed offers. Try another kind of offer.');
    expect(
      offerProblem(apiError(422, 'OFFERS_NOT_ACCEPTED', 'This card does not accept offers'))
        .message,
    ).toBe('This card does not accept offers.');
    expect(offerProblem(apiError(403, 'TRADING_BLOCKED'), 'Ada').message).toContain(
      'You cannot trade with Ada right now',
    );
    const invalid = offerProblem(
      apiError(
        400,
        'VALIDATION_FAILED',
        'Validation failed',
        {},
        {
          cashAmount: 'A counter-offer must change the cash amount or the cards',
        },
      ),
    );
    expect(invalid.fields.cashAmount).toBe('A counter-offer must change the amount or the cards.');
    expect(invalid.message).toBe('A counter-offer must change the amount or the cards.');
  });

  it('reads only safe extension values', () => {
    expect(
      problemExtension(apiError(409, 'X', '', { latestOfferId: 'abc-123' }), 'latestOfferId'),
    ).toBe('abc-123');
    expect(
      problemExtension(apiError(409, 'X', '', { latestOfferId: '../evil' }), 'latestOfferId'),
    ).toBeNull();
    expect(
      problemExtension(apiError(409, 'X', '', { latestOfferId: 7 }), 'latestOfferId'),
    ).toBeNull();
  });
});

describe('trade labels', () => {
  it('words statuses, events and the next action for each side', () => {
    expect(tradeStatusInfo('COMPLETED')).toMatchObject({ label: 'Completed', tone: 'success' });
    const names = { SELLER: 'Ada', BUYER: 'Ben' };
    expect(tradeEventLabel('MEETUP_PROPOSED', 'BUYER', 'SELLER', names)).toBe(
      'Ben marked the trade as an in-person meetup',
    );
    expect(tradeEventLabel('COMPLETION_CONFIRMED', 'SELLER', 'SELLER', names)).toBe(
      'You confirmed the exchange',
    );

    const mine = nextActionView({
      status: 'AGREED',
      nextAction: { actor: 'BUYER', action: 'MEET' },
      viewerRole: 'BUYER',
      other: 'Ada',
    });
    expect(mine).toMatchObject({ tone: 'live', title: 'Your move: meet and exchange the cards' });
    expect(
      nextActionView({
        status: 'AGREED',
        nextAction: { actor: 'SELLER', action: 'MEET' },
        viewerRole: 'BUYER',
        other: 'Ada',
      }).title,
    ).toBe('Waiting for Ada');
    expect(
      nextActionView({
        status: 'CANCELLED',
        nextAction: { actor: null, action: 'NONE' },
        viewerRole: 'BUYER',
        other: 'Ada',
        cancelReason: 'Sold elsewhere',
      }).description,
    ).toBe('Reason given: “Sold elsewhere”');
    expect(nextActionShort('AGREED', { actor: 'SELLER', action: 'MEET' }, 'SELLER', 'Ben')).toBe(
      'Your move: meet and confirm',
    );
    expect(nextActionShort('AGREED', { actor: 'BUYER', action: 'MEET' }, 'SELLER', 'Ben')).toBe(
      'Waiting for Ben',
    );
    expect(nextActionShort('COMPLETED', { action: 'NONE' }, 'SELLER', 'Ben')).toBe('Completed');
  });
});
