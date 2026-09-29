import { ApiError, NETWORK_ERROR_CODE } from './api-error';

/** A user-facing title + sentence for an API failure. */
export interface FriendlyError {
  title: string;
  message: string;
}

/**
 * Maps an {@link ApiError} to wording that is safe and helpful to show to collectors.
 * Server messages are safe by contract (docs/api/README.md) and are preferred when they carry
 * specifics (conflicts, validation); infrastructure failures always get a generic sentence.
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
    case 'UNAUTHENTICATED':
      return { title: 'Please sign in', message: 'Your session has ended. Sign in to continue.' };
    case 'REAUTHENTICATION_REQUIRED':
      return {
        title: 'Confirm it is you',
        message: 'For your security, enter your password again to continue.',
      };
    case 'ACCOUNT_SUSPENDED':
      return { title: 'Account unavailable', message: error.message };
    case 'FORBIDDEN':
      return {
        title: 'Not allowed',
        message: error.message || 'You do not have permission to do this.',
      };
    case 'NOT_FOUND':
      return { title: 'Not found', message: 'This item does not exist or is no longer available.' };
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
