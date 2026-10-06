import type { AppConfig } from '@/src/config/env';

/**
 * How "Continue with Google" reaches Firebase on this build (see `src/auth/googleCredential.ts`):
 * - `emulator`: the local Auth emulator, a simulated Google account chosen in the app;
 * - `popup`: the web build against a real Firebase project (Firebase's pop-up);
 * - `native`: a device against a real project, through the system browser (expo-auth-session),
 *   which needs the platform's OAuth client id;
 * - `unavailable`: a device without a client id for its platform (the button explains it).
 */
export type GoogleStrategy = 'emulator' | 'popup' | 'native' | 'unavailable';

export function googleStrategy(
  usesEmulator: boolean,
  platform: string,
  ids: AppConfig['googleClientIds']
): GoogleStrategy {
  if (usesEmulator) {
    return 'emulator';
  }
  if (platform === 'web') {
    return 'popup';
  }
  const clientId = platform === 'ios' ? ids.ios : ids.android;
  return clientId ? 'native' : 'unavailable';
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SimulatedAccountErrors {
  email: string | null;
  displayName: string | null;
}

/** Validation of the simulated Google account form (emulator only). */
export function validateSimulatedAccount(email: string, displayName: string) {
  const address = email.trim();
  const name = displayName.trim();
  const errors: SimulatedAccountErrors = {
    email: !address
      ? 'Enter the e-mail of the simulated Google account.'
      : EMAIL_PATTERN.test(address)
        ? null
        : 'That email address does not look right.',
    displayName: !name ? 'Enter a name for the simulated Google account.' : null,
  };
  return { errors, valid: errors.email === null && errors.displayName === null };
}
