import { ApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';

/** The words of "We could not load your account" (the phone's R12 `UNAVAILABLE_COPY`). */
export const UNAVAILABLE_COPY = {
  title: 'We could not load your account',
  text: 'Check your connection, then try again. Nothing on your account changed.',
  timeoutTitle: 'No answer from OrenjiTrade',
  expiredTitle: 'Please sign in again',
  expiredText: 'Your session ended. Sign in again to keep using OrenjiTrade.',
} as const;

export interface UnavailableContent {
  /** The session ended (a 401): "Please sign in again", Sign out leads. */
  expired: boolean;
  title: string;
  text: string;
  /** `{errorCode} · {requestId}` of an answer of the API (the support reference), else null. */
  reference: string | null;
}

/**
 * What the account state says for the error `GET /me` failed with (the phone's R12
 * `unavailableContent`): the plain words when OrenjiTrade could not be reached, "No answer from
 * OrenjiTrade" for a timeout, "Please sign in again" for an ended session, and an answer of the
 * API's own sentence with its error code and request id.
 */
export function unavailableContent(error: ApiError | null): UnavailableContent {
  if (!error || error.status === 0) {
    return {
      expired: false,
      title: UNAVAILABLE_COPY.title,
      text: UNAVAILABLE_COPY.text,
      reference: null,
    };
  }
  if (error.status === 408 || error.status === 504) {
    return {
      expired: false,
      title: UNAVAILABLE_COPY.timeoutTitle,
      text: friendlyMessage(error),
      reference: null,
    };
  }
  const reference = error.requestId ? `${error.errorCode} · ${error.requestId}` : error.errorCode;
  if (error.status === 401) {
    return {
      expired: true,
      title: UNAVAILABLE_COPY.expiredTitle,
      text: UNAVAILABLE_COPY.expiredText,
      reference,
    };
  }
  return { expired: false, title: UNAVAILABLE_COPY.title, text: friendlyMessage(error), reference };
}
