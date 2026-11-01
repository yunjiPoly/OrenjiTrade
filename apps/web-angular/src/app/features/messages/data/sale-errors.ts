import { ApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { COMPOSER_COPY, MARK_SOLD_COPY } from './chat-copy';

/**
 * Mark as sold's and the undo's refusals in plain words, by `errorCode` (stage R4's codes). A
 * refusal for a collector who cannot take part reads like any inactive participant's (owner
 * decision of 2026-10-28): it never tells a block apart.
 */
export function saleErrorMessage(error: ApiError, other: string): string {
  switch (error.errorCode) {
    case 'NOTHING_LEFT_TO_SELL':
      return MARK_SOLD_COPY.nothingLeft;
    case 'SUBJECT_CHANGED':
      return MARK_SOLD_COPY.subjectChanged(other);
    case 'SALE_UNDO_CLOSED':
      return MARK_SOLD_COPY.undoClosed;
    case 'SALE_ALREADY_RATED':
      return MARK_SOLD_COPY.undoRated;
    case 'MESSAGING_BLOCKED':
      return `${COMPOSER_COPY.cannotSend}.`;
    default:
      return friendlyMessage(error);
  }
}
