import { ApiError } from '../../core/http/api-error';
import { friendlyMessage } from '../../core/http/api-error-messages';

/** Inline problem shown in the report dialog. `alreadyOpen` keeps the reason picker disabled. */
export interface ReportProblem {
  message: string;
  alreadyOpen: boolean;
}

/**
 * Wording of the answers `POST /reports/collectors` can refuse with: 409 REPORT_ALREADY_OPEN,
 * 422 CANNOT_REPORT_SELF, 404 (the collector is gone), 400 (a context that is not the reporter's),
 * 429 (five reports a day). Anything else falls back to the shared friendly wording.
 */
export function reportProblem(error: ApiError, displayName: string): ReportProblem {
  if (error.status === 409 || error.errorCode === 'REPORT_ALREADY_OPEN') {
    return {
      message:
        `You already reported ${displayName}. Our moderation team is reviewing it, and you ` +
        'will be notified when it is decided. You can follow it in Settings → My reports.',
      alreadyOpen: true,
    };
  }
  if (error.errorCode === 'CANNOT_REPORT_SELF') {
    return { message: 'You cannot report yourself.', alreadyOpen: false };
  }
  if (error.status === 404) {
    return {
      message: `${displayName} is no longer available on OrenjiTrade.`,
      alreadyOpen: false,
    };
  }
  if (error.status === 429) {
    return {
      message:
        'You sent several reports today. Please try again tomorrow, or block the collector ' +
        'in the meantime.',
      alreadyOpen: false,
    };
  }
  if (error.status === 400 && error.errorCode === 'VALIDATION_FAILED') {
    return {
      message: error.fieldErrors['details']
        ? 'The details are too long (1,000 characters at most).'
        : 'This report could not be sent from here. Report the collector from their profile.',
      alreadyOpen: false,
    };
  }
  return { message: friendlyMessage(error), alreadyOpen: false };
}
