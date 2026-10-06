import { ApiError, NETWORK_ERROR_CODE, isApiError } from './ApiError';

/** A user-facing title + sentence for an API failure. */
export interface FriendlyError {
  title: string;
  message: string;
}

/**
 * Maps an {@link ApiError} to wording that is safe and helpful to show to collectors (mirror of
 * `friendlyError` in apps/web-angular/src/app/core/http/api-error-messages.ts). Server messages
 * are safe by contract (docs/api/README.md) and are kept when they carry specifics; transport and
 * infrastructure failures always get a generic sentence.
 */
export function friendlyError(error: ApiError): FriendlyError {
  switch (error.errorCode) {
    case NETWORK_ERROR_CODE:
      return {
        title: 'You seem to be offline',
        message: 'We could not reach OrenjiTrade. Check your connection and try again.',
      };
    case 'RATE_LIMITED': {
      const seconds = error.problem?.retryAfterSeconds;
      return {
        title: 'Slow down a little',
        message: seconds
          ? `Too many requests in a short time. Try again in ${seconds} seconds.`
          : 'Too many requests in a short time. Try again in a moment.',
      };
    }
    case 'LIMIT_REACHED':
      // No Premium pitch here: the limit notice names the upgrade only while the flag is on.
      return {
        title: 'Plan limit reached',
        message: 'You reached a limit of your plan. It resets soon.',
      };
    case 'FEATURE_DISABLED':
      return {
        title: 'Not available right now',
        message: 'This feature is currently turned off. Please try again later.',
      };
    case 'UNAUTHENTICATED':
      return { title: 'Please sign in', message: 'Your session has ended. Sign in to continue.' };
    case 'REAUTHENTICATION_REQUIRED':
      return {
        title: 'Confirm it is you',
        message: 'For your security, enter your password again to continue.',
      };
    case 'ACCOUNT_SUSPENDED':
      return { title: 'Account unavailable', message: error.message };
    case 'AGE_CONFIRMATION_REQUIRED':
      // The onboarding flow records the confirmation; the account gate takes the collector there.
      return {
        title: 'Age confirmation required',
        message:
          'Please confirm that you are 18 years of age or older to be shown on the map, message, post or make offers. We will take you to the confirmation.',
      };
    case 'FORBIDDEN':
      return {
        title: 'Not allowed',
        message: error.message || 'You do not have permission to do this.',
      };
    case 'NOT_FOUND':
      return { title: 'Not found', message: 'This item does not exist or is no longer available.' };
    case 'MESSAGING_BLOCKED':
      return {
        title: 'Messaging unavailable',
        message:
          'You cannot message this collector. They may have blocked messages or you blocked them.',
      };
    case 'MESSAGE_BLOCKED':
      return {
        title: 'Message not sent',
        message:
          'This message breaks the community guidelines, so it was not sent. Please rephrase it.',
      };
    case 'HANDLE_TAKEN':
      return { title: 'Handle unavailable', message: 'That handle is already taken.' };
    case 'VALIDATION_FAILED':
      return {
        title: 'Check the highlighted fields',
        message: error.message || 'Some values are not valid.',
      };
    case 'CONFLICT':
    case 'DELETION_BLOCKED':
      return { title: 'Cannot do that right now', message: error.message };
    case 'PAYLOAD_TOO_LARGE':
      return { title: 'File too large', message: 'Choose an image smaller than 5 MB.' };
    case 'UNSUPPORTED_MEDIA_TYPE':
      return { title: 'Unsupported file', message: 'Use a JPEG, PNG or WebP image.' };
    case 'TERMS_ACCEPTANCE_REQUIRED':
      return {
        title: 'Updated terms',
        message: 'Please review and accept the current terms to continue.',
      };
    default:
      if (error.isServerError || error.status === 0) {
        return {
          title: 'Something went wrong on our side',
          message: 'Please try again in a moment.',
        };
      }
      return { title: 'Something went wrong', message: error.message || 'Please try again.' };
  }
}

/** Shorthand for inline messages: only the sentence. */
export function friendlyMessage(error: ApiError): string {
  return friendlyError(error).message;
}

/** A sentence for anything thrown (API errors get their friendly wording). */
export function messageOf(
  error: unknown,
  fallback = 'Something went wrong. Please try again.'
): string {
  if (isApiError(error)) {
    return friendlyMessage(error);
  }
  return fallback;
}
