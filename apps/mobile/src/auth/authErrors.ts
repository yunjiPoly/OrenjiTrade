/**
 * Friendly, non-leaky messages for Firebase Authentication failures (same wording as the web's
 * `core/auth/auth-errors.ts`). The SDK throws `FirebaseError`s whose `code` is `auth/<reason>`;
 * screens show `AuthError.message`, never the raw SDK text.
 */
export const AUTH_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  'auth/email-already-in-use': 'An account already exists for this email. Try signing in instead.',
  'auth/invalid-email': 'That email address does not look right.',
  'auth/missing-email': 'Enter your email address.',
  'auth/missing-password': 'Enter your password.',
  'auth/weak-password': 'Choose a stronger password (at least 8 characters).',
  'auth/password-does-not-meet-requirements': 'That password does not meet the requirements.',
  'auth/user-not-found': 'No account matches these credentials.',
  'auth/wrong-password': 'No account matches these credentials.',
  'auth/invalid-credential': 'No account matches these credentials.',
  'auth/invalid-login-credentials': 'No account matches these credentials.',
  'auth/user-disabled':
    'This account has been disabled. Contact support if you think this is a mistake.',
  'auth/too-many-requests': 'Too many attempts. Wait a moment, then try again.',
  'auth/network-request-failed':
    'Cannot reach the sign-in service. Check your connection and retry.',
  // The SDK's own timeout (a slow network or a busy emulator), not a wrong password.
  'auth/timeout': 'The sign-in service took too long to answer. Check your connection and retry.',
  'auth/internal-error': 'The sign-in service had a problem. Wait a moment, then try again.',
  'auth/operation-not-allowed': 'This sign-in method is not enabled.',
  'auth/requires-recent-login': 'For your security, sign in again before doing this.',
  'auth/user-token-expired': 'Your session expired. Sign in again.',
  'auth/invalid-action-code': 'This link is invalid or has already been used.',
  'auth/expired-action-code': 'This link has expired. Request a new one.',
  'auth/no-current-user': 'You are not signed in.',
  'auth/invalid-api-key': 'Sign-in is not configured for this environment.',
  'auth/not-configured': 'Sign-in is not configured for this environment.',
  'auth/emulator-config-failed': 'The authentication emulator is not reachable.',
};

export const GENERIC_AUTH_ERROR = 'Something went wrong. Please try again.';

/** Codes that mean "the password is not right" (re-authentication, sign-in). */
export const WRONG_PASSWORD_CODES: ReadonlySet<string> = new Set([
  'auth/wrong-password',
  'auth/invalid-credential',
  'auth/invalid-login-credentials',
]);

export function describeAuthError(code: string): string {
  return AUTH_ERROR_MESSAGES[code] ?? GENERIC_AUTH_ERROR;
}

export class AuthError extends Error {
  override readonly name = 'AuthError';
  readonly code: string;

  constructor(code: string, message: string = describeAuthError(code), cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.code = code;
  }
}

function readCode(error: unknown): string | null {
  if (error !== null && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' && code.startsWith('auth/') ? code : null;
  }
  return null;
}

/** Normalises anything thrown by the Firebase SDK (or by the app) into an `AuthError`. */
export function toAuthError(error: unknown): AuthError {
  if (error instanceof AuthError) {
    return error;
  }
  const code = readCode(error);
  if (code) {
    return new AuthError(code, describeAuthError(code), error);
  }
  return new AuthError('auth/unknown', GENERIC_AUTH_ERROR, error);
}

export function isAuthError(value: unknown): value is AuthError {
  return value instanceof AuthError;
}

/** A sentence safe to show next to a form for anything an auth call threw. */
export function authErrorMessage(error: unknown): string {
  return toAuthError(error).message;
}
