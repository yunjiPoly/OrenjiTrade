/**
 * Bridge between the React `SessionProvider` and the module-level API client: the provider
 * registers how to read the Firebase ID token and the client's auth middleware calls it for every
 * request. `forceRefresh` bypasses the SDK cache (used once after a 401).
 */
export type IdTokenProvider = (forceRefresh: boolean) => Promise<string | null>;

let provider: IdTokenProvider | null = null;

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
