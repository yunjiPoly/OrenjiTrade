import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';

import { setIdTokenProvider } from './tokenProvider';

/** Minimal user shape the app needs; filled from the Firebase user in Phase 1. */
export interface SessionUser {
  uid: string;
  email: string | null;
  displayName: string | null;
}

export interface Session {
  /** `null` until Firebase auth is wired (Phase 1). */
  user: SessionUser | null;
  status: 'anonymous' | 'authenticated';
  /** Firebase ID token for `Authorization: Bearer`, or `null` when signed out. */
  getIdToken: () => Promise<string | null>;
}

const SessionContext = createContext<Session | null>(null);

/**
 * Placeholder session: always anonymous. It already exposes the contract the API client and
 * screens rely on (`user`, `status`, `getIdToken`) so wiring Firebase later touches one file.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const getIdToken = useCallback(async (): Promise<string | null> => null, []);

  useEffect(() => {
    setIdTokenProvider(getIdToken);
    return () => setIdTokenProvider(null);
  }, [getIdToken]);

  const session = useMemo<Session>(
    () => ({ user: null, status: 'anonymous', getIdToken }),
    [getIdToken]
  );

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (session === null) {
    throw new Error('useSession() must be used within <SessionProvider>.');
  }
  return session;
}
