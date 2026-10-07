import { ApiError } from '../../core/http/api-error';
import { friendlyMessage } from '../../core/http/api-error-messages';

/**
 * Inline wording of the refusals of the offer and trade endpoints (Phase 8 contract and the
 * API's documented deviations): 422 OFFERS_NOT_ACCEPTED, 409 OFFER_ALREADY_OPEN (`offerId`),
 * 409 STALE_OFFER (`latestOfferId` / `currentVersion`), 409 NOT_YOUR_TURN,
 * 409 INVALID_STATE_TRANSITION (`currentStatus`), 409 ITEM_UNAVAILABLE, 403 TRADING_BLOCKED,
 * 403 FORBIDDEN (a seller cannot withdraw), 404, 400 field errors and 429 LIMIT_REACHED.
 */
export interface OfferProblem {
  message: string;
  /** Machine code for tests and styling. */
  code: string;
  /** The open offer on the card (409 OFFER_ALREADY_OPEN). */
  openOfferId: string | null;
  /** The live proposal of the chain (409 STALE_OFFER). */
  latestOfferId: string | null;
  /** The state changed on the server: re-read the offer or trade. */
  reload: boolean;
  /** Per-field messages (400 VALIDATION_FAILED), keyed by form control name. */
  fields: Partial<Record<'cashAmount' | 'cards' | 'message' | 'expiresInHours', string>>;
}

/**
 * A string extension of the Problem Details body (`latestOfferId`, `offerId`, `currentStatus`).
 * The generated `ProblemDetail` does not declare these per-endpoint extensions, so they are read
 * defensively (UUID-like or upper-case tokens only).
 */
export function problemExtension(error: ApiError, key: string): string | null {
  const body = error.problem as Record<string, unknown> | null;
  const value = body?.[key];
  return typeof value === 'string' && /^[\w-]{1,64}$/.test(value) ? value : null;
}

function problem(
  code: string,
  message: string,
  extra: Partial<Omit<OfferProblem, 'code' | 'message'>> = {},
): OfferProblem {
  return {
    code,
    message,
    openOfferId: null,
    latestOfferId: null,
    reload: false,
    fields: {},
    ...extra,
  };
}

const STATUS_WORDS: Record<string, string> = {
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
  CANCELLED: 'withdrawn',
  EXPIRED: 'expired',
  COUNTERED: 'answered with a counter-offer',
  COMPLETED: 'completed',
};

/**
 * The wording of a refused offer or trade request. `other` names the other party; `subject` says
 * whether an offer or a trade was refused (a cancelled offer was withdrawn, a trade cancelled).
 */
export function offerProblem(
  error: ApiError,
  other = 'the other collector',
  subject: 'offer' | 'trade' = 'offer',
): OfferProblem {
  switch (error.errorCode) {
    case 'OFFERS_NOT_ACCEPTED': {
      const base = (error.message || 'This card does not accept this offer').replace(/\.$/, '');
      const hint = /only|mixed/i.test(base) ? ' Try another kind of offer.' : '';
      return problem(error.errorCode, `${base}.${hint}`);
    }
    case 'OFFER_ALREADY_OPEN':
      return problem(
        error.errorCode,
        'You already have an open offer on this card. Answer or withdraw it before making a new one.',
        { openOfferId: problemExtension(error, 'offerId') },
      );
    case 'STALE_OFFER':
      return problem(
        error.errorCode,
        'This offer changed while you were looking at it. Here is the latest version: check it before answering.',
        { latestOfferId: problemExtension(error, 'latestOfferId'), reload: true },
      );
    case 'NOT_YOUR_TURN':
      return problem(error.errorCode, `It is ${other}'s turn to answer this offer.`, {
        reload: true,
      });
    case 'INVALID_STATE_TRANSITION': {
      const status = problemExtension(error, 'currentStatus');
      const words =
        subject === 'trade' && status === 'CANCELLED'
          ? 'cancelled'
          : status
            ? STATUS_WORDS[status]
            : null;
      return problem(
        error.errorCode,
        words
          ? `This can no longer be done: it was already ${words}.`
          : 'This can no longer be done: the status changed in the meantime.',
        { reload: true },
      );
    }
    case 'ITEM_UNAVAILABLE':
      return problem(
        error.errorCode,
        'A card of this deal is no longer available: it left an inventory or every copy is promised in another trade.',
        { reload: true },
      );
    case 'TRADING_BLOCKED':
      return problem(
        error.errorCode,
        `You cannot trade with ${other} right now: one of you blocked the other or an account is inactive.`,
      );
    case 'FORBIDDEN':
      return problem(error.errorCode, error.message || 'You are not allowed to do this.');
    case 'NOT_FOUND':
      return problem(
        error.errorCode,
        'This card or offer is no longer available. It may have been sold, made private or removed.',
      );
    case 'LIMIT_REACHED':
      return problem(
        error.errorCode,
        'You reached the number of offers your plan allows today. It resets soon.',
      );
    case 'VALIDATION_FAILED': {
      const fields: OfferProblem['fields'] = {};
      const cash = error.fieldErrors['cashAmount'];
      if (cash) {
        fields.cashAmount = /counter-offer must change/i.test(cash)
          ? 'A counter-offer must change the amount or the cards.'
          : 'Check the amount (above 0, at most 2 decimals).';
      }
      if (error.fieldErrors['tradeItemIds']) {
        fields.cards = 'Check your cards: they must be yours, with enough copies.';
      }
      if (error.fieldErrors['message']) {
        fields.message = 'Keep the note under 500 characters.';
      }
      if (error.fieldErrors['expiresInHours']) {
        fields.expiresInHours = 'Choose an expiry between 1 hour and 7 days.';
      }
      const first = Object.values(fields)[0];
      return problem(
        error.errorCode,
        first ??
          (error.fieldErrors['reason'] ? 'Keep the reason under 500 characters.' : null) ??
          (error.message || 'Some values are not valid.'),
        { fields },
      );
    }
    default:
      return problem(error.errorCode, friendlyMessage(error));
  }
}
