import { isApiError } from '@/src/api/ApiError';
import { friendlyMessage } from '@/src/api/errorMessages';

import { UNAVAILABLE_COPY } from './accountCopy';

export interface UnavailableContent {
  /** The session ended (a 401): "Please sign in again". */
  expired: boolean;
  title: string;
  text: string;
  /** `{errorCode} · {requestId}` for an answer of the API (the support reference), else null. */
  reference: string | null;
}

/**
 * What 46 Could not load says for the error `GET /me` failed with (stage R12's review fix 1, as
 * the `ErrorState` it replaced): the mockup's words when the phone could not reach OrenjiTrade,
 * "No answer from OrenjiTrade" when it timed out, and for an answer of the API (a server error, a
 * rate limit, an ended session) its own sentence with the error code and the request id.
 */
export function unavailableContent(error: unknown): UnavailableContent {
  const apiError = isApiError(error) ? error : null;
  if (!apiError || (apiError.isNetworkError && !apiError.isTimeout)) {
    return {
      expired: false,
      title: UNAVAILABLE_COPY.title,
      text: UNAVAILABLE_COPY.text,
      reference: null,
    };
  }
  if (apiError.isTimeout) {
    return {
      expired: false,
      title: UNAVAILABLE_COPY.timeoutTitle,
      text: friendlyMessage(apiError),
      reference: null,
    };
  }
  const reference = apiError.requestId
    ? `${apiError.errorCode} · ${apiError.requestId}`
    : apiError.errorCode;
  if (apiError.status === 401) {
    return {
      expired: true,
      title: UNAVAILABLE_COPY.expiredTitle,
      text: UNAVAILABLE_COPY.expiredText,
      reference,
    };
  }
  return {
    expired: false,
    title: UNAVAILABLE_COPY.title,
    text: friendlyMessage(apiError),
    reference,
  };
}
