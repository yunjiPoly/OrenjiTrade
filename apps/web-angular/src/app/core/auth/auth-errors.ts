/**
 * Friendly messages for Firebase Authentication error codes (`auth/...`) and the port's own
 * codes. Anything unknown falls back to a generic sentence so raw SDK text never reaches users.
 */
const MESSAGES: Record<string, string> = {
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
  'auth/popup-blocked':
    'Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.',
  'auth/popup-closed-by-user': 'The Google sign-in window was closed before finishing.',
  'auth/cancelled-popup-request': 'Another sign-in window is already open.',
  'auth/unauthorized-domain': 'Google sign-in is not enabled for this address yet.',
  'auth/operation-not-allowed': 'This sign-in method is not enabled.',
  'auth/account-exists-with-different-credential':
    'An account already exists for this email with a different sign-in method.',
  'auth/requires-recent-login': 'For your security, sign in again before doing this.',
  'auth/user-token-expired': 'Your session expired. Sign in again.',
  'auth/invalid-action-code': 'This link is invalid or has already been used.',
  'auth/expired-action-code': 'This link has expired. Request a new one.',
  'auth/no-current-user': 'You are not signed in.',
  'auth/invalid-api-key': 'Sign-in is not configured for this environment.',
  'auth/emulator-config-failed': 'The authentication emulator is not reachable.',
};

export const GENERIC_AUTH_ERROR = 'Something went wrong. Please try again.';

/** Extracts the `auth/...` code from anything the SDK or the port throws. */
export function authErrorCode(error: unknown): string | null {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : null;
  }
  return null;
}

/** Maps an error to a sentence safe to display next to the form. */
export function authErrorMessage(error: unknown): string {
  const code = authErrorCode(error);
  if (code && MESSAGES[code]) {
    return MESSAGES[code];
  }
  return GENERIC_AUTH_ERROR;
}

/** True when a Google pop-up could not open or was dismissed (not a real failure). */
export function isPopupDismissed(error: unknown): boolean {
  const code = authErrorCode(error);
  return (
    code === 'auth/popup-blocked' ||
    code === 'auth/popup-closed-by-user' ||
    code === 'auth/cancelled-popup-request'
  );
}
