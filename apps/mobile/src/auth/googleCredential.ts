/**
 * Google sign-in vocabulary of the auth port (web: `signInWithGoogle` of `firebase-auth.port.ts`,
 * which only knows the pop-up). On mobile a Google identity reaches Firebase in one of three ways,
 * all ending in the same Firebase user (`google.com` in `providerIds`):
 *
 * - `popup`: the web build, Firebase's own pop-up (`signInWithPopup`), like the web app;
 * - `id-token`: a device, the ID token obtained through the system browser (expo-auth-session,
 *   Google's OAuth client of the platform) handed to `signInWithCredential`;
 * - `emulator`: the local Auth emulator, which has no OAuth client: a simulated Google account
 *   (e-mail and name chosen in the app) as the emulator's fake OAuth ID token (a JSON object with
 *   `sub`, `email`, `email_verified` and `name`), also through `signInWithCredential`.
 *
 * The emulator path is the only one that works locally end to end (no Firebase project, no OAuth
 * client ids); it is never offered against a real project.
 */
export type GoogleCredential =
  | { kind: 'popup' }
  | { kind: 'id-token'; idToken: string; accessToken?: string | null }
  | { kind: 'emulator'; email: string; displayName: string };

/** Stable `sub` claim of a simulated Google account: the same e-mail is the same Google user. */
export function emulatorGoogleSubject(email: string): string {
  const text = email.trim().toLowerCase();
  // djb2: short, deterministic, dependency-free; only ever used against the local emulator.
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return `emulator-google-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * The fake OAuth ID token the Auth emulator accepts in place of Google's: a JSON object (not a
 * JWT). The e-mail is verified, as Google's always is, so the emulator links the identity to an
 * existing e-mail/password account of the same address exactly like Firebase does in production.
 */
export function emulatorGoogleIdToken(email: string, displayName: string): string {
  const address = email.trim().toLowerCase();
  return JSON.stringify({
    sub: emulatorGoogleSubject(address),
    email: address,
    email_verified: true,
    name: displayName.trim() || address.split('@')[0],
  });
}
