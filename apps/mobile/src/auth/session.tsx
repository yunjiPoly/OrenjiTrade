import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';

import { clearAccountSignal } from '@/src/api/accountSignal';

import { AuthError } from './authErrors';
import { firebaseAuthPort, type AuthPort, type AuthUser } from './authPort';
import type { GoogleCredential } from './googleCredential';
import { useSessionNotice } from './sessionNotice';
import { initialSessionState, sessionReducer, type SessionStatus } from './sessionReducer';
import { setIdTokenProvider, setSignedIn } from './tokenProvider';

export type { AuthUser, SessionStatus };

/** How long Firebase may take to restore a persisted session before the app shows sign-in. */
export const AUTH_READY_TIMEOUT_MS = 8000;

export interface Session {
  /** `loading` until Firebase restored (or ruled out) the persisted session. */
  status: SessionStatus;
  user: AuthUser | null;
  /** Set when Firebase could not be initialised; sign-in then fails with a friendly message. */
  initError: Error | null;
  /** True when every Firebase call goes to the local Auth emulator. */
  usesEmulator: boolean;
  getIdToken: (forceRefresh?: boolean) => Promise<string | null>;
  signIn: (email: string, password: string) => Promise<AuthUser>;
  /** Creates the Firebase user and stores the display name on it. */
  signUp: (email: string, password: string, displayName?: string) => Promise<AuthUser>;
  /** Google sign-in or sign-up (see `googleCredential.ts`); the gate then continues. */
  signInWithGoogle: (credential: GoogleCredential) => Promise<AuthUser>;
  /** True when the signed-in user has a password (otherwise Google proves their identity). */
  hasPasswordProvider: boolean;
  /** True when the signed-in user signed in with Google at least once. */
  hasGoogleProvider: boolean;
  sendPasswordReset: (email: string) => Promise<void>;
  sendEmailVerification: () => Promise<void>;
  /** Re-reads the Firebase user (after the verification link was opened). */
  reloadUser: () => Promise<AuthUser | null>;
  /** Confirms the password before sensitive actions, then refreshes the ID token. */
  reauthenticate: (password: string) => Promise<void>;
  /** Confirms a Google identity before sensitive actions, then refreshes the ID token. */
  reauthenticateWithGoogle: (credential: GoogleCredential) => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

export interface SessionProviderProps {
  children: ReactNode;
  /** The Firebase port; tests pass an in-memory fake. */
  port?: AuthPort;
}

/**
 * Owns the Firebase session: subscribes to auth changes, exposes the account methods, bridges
 * the ID token to the API client and drops cached data when the signed-in user changes.
 */
export function SessionProvider({ children, port = firebaseAuthPort }: SessionProviderProps) {
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(sessionReducer, initialSessionState);
  const lastUid = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = port.subscribe(
      (user) => dispatch({ type: 'auth-state-changed', user }),
      (error) => dispatch({ type: 'init-failed', error })
    );
    const timer = setTimeout(() => dispatch({ type: 'ready-timeout' }), AUTH_READY_TIMEOUT_MS);
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [port]);

  // Cached data belongs to one uid: forget everything on sign-out or when another user signs in.
  const uid = state.status === 'loading' ? undefined : (state.user?.uid ?? null);
  useEffect(() => {
    if (uid === undefined) {
      return;
    }
    const previous = lastUid.current;
    // Anonymous → signed in keeps the cache: user data is keyed by uid, public data stays valid
    // (and removing queries here would orphan the observers that just subscribed to the new uid).
    if (previous !== undefined && previous !== null && previous !== uid) {
      // Signed out or another user: answers may depend on the viewer, drop everything.
      clearAccountSignal();
      queryClient.clear();
    }
    lastUid.current = uid;
  }, [queryClient, uid]);

  const getIdToken = useCallback(
    async (forceRefresh = false) => port.getIdToken(forceRefresh),
    [port]
  );

  useEffect(() => {
    setIdTokenProvider((forceRefresh) => port.getIdToken(forceRefresh));
    return () => setIdTokenProvider(null);
  }, [port]);

  // The API client tells whether a 401 means the session itself ended.
  const authenticated = state.status === 'authenticated';
  useEffect(() => {
    setSignedIn(authenticated);
    return () => setSignedIn(false);
  }, [authenticated]);

  // The session ended on its own (the Auth account is gone, the API refuses every token): sign
  // out so the gate routes to sign-in, which explains it, instead of leaving every screen on
  // "Your session has ended".
  const sessionEnded = useSessionNotice((store) => store.ended);
  useEffect(() => {
    if (!sessionEnded || !authenticated) {
      return;
    }
    port.signOut().catch(() => undefined);
    dispatch({ type: 'auth-state-changed', user: null });
  }, [authenticated, port, sessionEnded]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const user = await port.signIn(email.trim(), password);
      useSessionNotice.getState().clear();
      dispatch({ type: 'auth-state-changed', user });
      return user;
    },
    [port]
  );

  const signUp = useCallback(
    async (email: string, password: string, displayName?: string) => {
      let user = await port.signUp(email.trim(), password);
      useSessionNotice.getState().clear();
      dispatch({ type: 'auth-state-changed', user });
      const name = displayName?.trim();
      if (name) {
        user = await port.updateDisplayName(name);
        dispatch({ type: 'user-refreshed', user });
        // The first API call provisions the account from the token's `name` claim: refresh the
        // token so it already carries the display name the collector just chose.
        await port.getIdToken(true);
      }
      return user;
    },
    [port]
  );

  const signInWithGoogle = useCallback(
    async (credential: GoogleCredential) => {
      const user = await port.signInWithGoogle(credential);
      useSessionNotice.getState().clear();
      dispatch({ type: 'auth-state-changed', user });
      // The first API call provisions a new account from the token's claims (Google's name and
      // verified e-mail): a fresh token carries them for sure.
      await port.getIdToken(true);
      return user;
    },
    [port]
  );

  const sendPasswordReset = useCallback(
    (email: string) => port.sendPasswordReset(email.trim()),
    [port]
  );

  const sendEmailVerification = useCallback(() => port.sendEmailVerification(), [port]);

  const reloadUser = useCallback(async () => {
    const user = await port.reload();
    if (user) {
      dispatch({ type: 'user-refreshed', user });
      // A verified email changes the token's claims; the API reads `email_verified` from it.
      await port.getIdToken(true);
    }
    return user;
  }, [port]);

  const reauthenticate = useCallback(
    async (password: string) => {
      if (!state.user) {
        throw new AuthError('auth/no-current-user');
      }
      await port.reauthenticate(password);
      await port.getIdToken(true);
    },
    [port, state.user]
  );

  const reauthenticateWithGoogle = useCallback(
    async (credential: GoogleCredential) => {
      if (!state.user) {
        throw new AuthError('auth/no-current-user');
      }
      await port.reauthenticateWithGoogle(credential);
      await port.getIdToken(true);
    },
    [port, state.user]
  );

  const signOut = useCallback(async () => {
    await port.signOut();
    dispatch({ type: 'auth-state-changed', user: null });
  }, [port]);

  const session = useMemo<Session>(
    () => ({
      status: state.status,
      user: state.user,
      initError: state.initError,
      usesEmulator: port.usesEmulator,
      getIdToken,
      signIn,
      signUp,
      signInWithGoogle,
      hasPasswordProvider: state.user?.providerIds.includes('password') ?? false,
      hasGoogleProvider: state.user?.providerIds.includes('google.com') ?? false,
      sendPasswordReset,
      sendEmailVerification,
      reloadUser,
      reauthenticate,
      reauthenticateWithGoogle,
      signOut,
    }),
    [
      state,
      port.usesEmulator,
      getIdToken,
      signIn,
      signUp,
      signInWithGoogle,
      sendPasswordReset,
      sendEmailVerification,
      reloadUser,
      reauthenticate,
      reauthenticateWithGoogle,
      signOut,
    ]
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
