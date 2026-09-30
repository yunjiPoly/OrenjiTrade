import { ApiError } from '../../core/http/api-error';
import { friendlyMessage } from '../../core/http/api-error-messages';
import { OfferProblem, offerProblem } from '../offers/offer-problems';
import { formatDateTime } from './payment-labels';

/**
 * Inline wording of the refusals of the payment-protection endpoints (Phase 9 contract and the
 * API's deviations): 409 SELLER_NOT_ONBOARDED, 409 DISPUTE_WINDOW_CLOSED
 * (`disputeWindowEndsAt`), 409 EVIDENCE_LIMIT_REACHED (`limit`), 404 FEATURE_DISABLED,
 * 413 PAYLOAD_TOO_LARGE, 415 UNSUPPORTED_MEDIA_TYPE and 403 FORBIDDEN; everything else is worded
 * like the Phase 8 trade refusals (409 INVALID_STATE_TRANSITION re-reads the trade).
 */
export function paymentProblem(error: ApiError, other = 'the other collector'): OfferProblem {
  const base = {
    code: error.errorCode,
    openOfferId: null,
    latestOfferId: null,
    reload: false,
    fields: {},
  };
  switch (error.errorCode) {
    case 'SELLER_NOT_ONBOARDED':
      return {
        ...base,
        message: `${other} has not set up payouts yet, so the payment cannot start. They were asked to finish it; you can pay as soon as they do.`,
      };
    case 'DISPUTE_WINDOW_CLOSED': {
      const raw = (error.problem as Record<string, unknown> | null)?.['disputeWindowEndsAt'];
      const ended = typeof raw === 'string' ? formatDateTime(raw) : '';
      const when = ended ? ` on ${ended}` : '';
      return {
        ...base,
        message: `The dispute window closed${when}. Message ${other} or contact OrenjiTrade support if something is wrong.`,
        reload: true,
      };
    }
    case 'EVIDENCE_LIMIT_REACHED': {
      const body = error.problem as Record<string, unknown> | null;
      const limit = typeof body?.['limit'] === 'number' ? body['limit'] : 10;
      return {
        ...base,
        message: `You already added ${limit} pieces of evidence, the most allowed per collector.`,
        reload: true,
      };
    }
    case 'FEATURE_DISABLED':
      return {
        ...base,
        message: 'Payment protection is not available right now. Please try again later.',
      };
    case 'PAYLOAD_TOO_LARGE':
      return {
        ...base,
        message: 'That file is too large: photos up to 8 MB, PDF documents up to 10 MB.',
      };
    case 'UNSUPPORTED_MEDIA_TYPE':
      return { ...base, message: 'Use a photo (JPEG, PNG or WebP) or a PDF document.' };
    case 'FORBIDDEN':
      return { ...base, message: error.message || friendlyMessage(error) };
    default:
      return offerProblem(error, other, 'trade');
  }
}
