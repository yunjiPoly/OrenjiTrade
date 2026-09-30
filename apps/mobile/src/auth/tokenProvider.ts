/**
 * Bridge between the React `SessionProvider` and the module-level API client: the provider
 * registers its `getIdToken` here and the client's middleware reads it for every request.
 */
export type IdTokenProvider = () => Promise<string | null>;

let provider: IdTokenProvider | null = null;

export function setIdTokenProvider(next: IdTokenProvider | null): void {
  provider = next;
}

export async function getIdToken(): Promise<string | null> {
  if (provider === null) {
    return null;
  }
  try {
    return await provider();
  } catch {
    // A failing token refresh must not turn into a crash; the API answers 401 and the UI reacts.
    return null;
  }
}
