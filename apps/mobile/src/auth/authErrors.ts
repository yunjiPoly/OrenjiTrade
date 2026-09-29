/**
 * Friendly, non-leaky messages for Firebase Authentication failures. The SDK throws
 * `FirebaseError` instances whose `code` is `auth/<reason>`; screens show `AuthError.message`
 * and never the raw SDK text.
 */

export const AUTH_ERROR_MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'The email or password is incorrect.',
  'auth/invalid-login-credentials': 'The email or password is incorrect.',
  'auth/wrong-password': 'The email or password is incorrect.',
  'auth/user-not-found': 'The email or password is incorrect.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/missing-email': 'Enter your email address.',
  'auth/missing-password': 'Enter your password.',
  'auth/email-already-in-use': 'An account already exists for this email. Try signing in instead.',
  'auth/weak-password': 'Choose a stronger password (at least 8 characters).',
  'auth/password-does-not-meet-requirements':
    'Choose a stronger password (at least 8 characters).',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/too-many-requests': 'Too many attempts. Wait a moment and try again.',
  'auth/network-request-failed': 'Could not reach the sign-in service. Check your connection.',
  'auth/requires-recent-login': 'Please sign in again to confirm it is you.',
  'auth/popup-closed-by-user': 'The Google sign-in window was closed before finishing.',
  'auth/cancelled-popup-request': 'The Google sign-in window was closed before finishing.',
  'auth/popup-blocked': 'Your browser blocked the Google sign-in window.',
  'auth/operation-not-allowed': 'This sign-in method is not enabled.',
  'auth/operation-not-supported-in-this-environment':
    'Google sign-in is not available in this build yet. Use your email and password.',
  'auth/no-current-user': 'You are not signed in.',
  'auth/not-configured': 'Sign-in is not configured for this build.',
  'auth/unknown': 'Something went wrong while signing in. Please try again.',
};

const UNKNOWN_MESSAGE = 'Something went wrong while signing in. Please try again.';

export class AuthError extends Error {
  readonly name = 'AuthError';
  readonly code: string;

  constructor(code: string, message: string = describeAuthError(code), cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.code = code;
  }
}

export function describeAuthError(code: string): string {
  return AUTH_ERROR_MESSAGES[code] ?? UNKNOWN_MESSAGE;
}

function readCode(error: unknown): string | null {
  if (error !== null && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' && code.length > 0 ? code : null;
  }
  return null;
}

/** Normalises anything thrown by the Firebase SDK (or by us) into an `AuthError`. */
export function toAuthError(error: unknown): AuthError {
  if (error instanceof AuthError) {
    return error;
  }
  const code = readCode(error);
  if (code) {
    return new AuthError(code, describeAuthError(code), error);
  }
  if (error instanceof Error && error.name === 'FirebaseConfigError') {
    return new AuthError('auth/not-configured', describeAuthError('auth/not-configured'), error);
  }
  return new AuthError('auth/unknown', UNKNOWN_MESSAGE, error);
}

export function isAuthError(value: unknown): value is AuthError {
  return value instanceof AuthError;
}
