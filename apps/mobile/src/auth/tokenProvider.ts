/**
 * Bridge between the React `SessionProvider` and the module-level API client: the provider
 * registers how to read the Firebase ID token and the client's auth middleware calls it for every
 * request. `forceRefresh` bypasses the SDK cache (used once after a 401).
 */
export type IdTokenProvider = (forceRefresh: boolean) => Promise<string | null>;

let provider: IdTokenProvider | null = null;
let signedIn = false;

/** The session has a Firebase user (set by `SessionProvider`). */
export function setSignedIn(value: boolean): void {
  signedIn = value;
}

/** True while a Firebase user is signed in: a 401 then means the session itself ended. */
export function isSignedIn(): boolean {
  return signedIn;
}

export function setIdTokenProvider(next: IdTokenProvider | null): void {
  provider = next;
}

export async function getIdToken(forceRefresh = false): Promise<string | null> {
  if (provider === null) {
    return null;
  }
  try {
    return await provider(forceRefresh);
  } catch {
    // A failing token refresh must not crash a request; the API answers 401 and the UI reacts.
    return null;
  }
}
