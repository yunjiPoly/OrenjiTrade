import { useQueryClient } from '@tanstack/react-query';
import type { Auth, User } from 'firebase/auth';
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
import { Platform } from 'react-native';

import { clearAccountSignal } from '@/src/api/accountState';
import { ME_QUERY_KEY } from '@/src/api/queries/keys';

import { AuthError, toAuthError } from './authErrors';
import { getFirebaseAuth, getFirebaseAuthModule, type FirebaseAuthModule } from './firebase';
import {
  initialSessionState,
  sessionReducer,
  toSessionUser,
  type SessionStatus,
  type SessionUser,
} from './sessionReducer';
import { setIdTokenProvider } from './tokenProvider';

export type { SessionStatus, SessionUser };

export interface Session {
  /** `loading` until Firebase restored (or failed to restore) the persisted session. */
  status: SessionStatus;
  user: SessionUser | null;
  /** Set when Firebase could not be initialised; every sign-in method then throws `auth/not-configured`. */
  initError: Error | null;
  /** Firebase ID token for `Authorization: Bearer`, or `null` when signed out. */
  getIdToken: (force?: boolean) => Promise<string | null>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  /** Creates the Firebase user and sets its display name. Consents and `/me` are handled by `completeRegistration`. */
  signUpWithEmail: (email: string, password: string, displayName?: string) => Promise<void>;
  /**
   * Google sign-in through the Firebase popup flow. Web only for now: Expo Go cannot run the
   * native Google SDK and `expo-auth-session` needs native config (see README), so on iOS and
   * Android this rejects with `auth/operation-not-supported-in-this-environment`.
   */
  signInWithGoogle: () => Promise<void>;
  /** `true` where `signInWithGoogle` can succeed (web). Screens disable the button otherwise. */
  googleSignInAvailable: boolean;
  sendPasswordReset: (email: string) => Promise<void>;
  sendEmailVerification: () => Promise<void>;
  /** Re-reads the Firebase user (e.g. after the verification link was opened). */
  reloadUser: () => Promise<void>;
  /** Confirms the password before sensitive actions (account deletion needs a fresh `auth_time`). */
  reauthenticate: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

interface FirebaseHandles {
  auth: Auth;
  sdk: FirebaseAuthModule;
}

async function loadFirebase(): Promise<FirebaseHandles> {
  const [auth, sdk] = await Promise.all([getFirebaseAuth(), getFirebaseAuthModule()]);
  return { auth, sdk };
}

async function requireFirebase(): Promise<FirebaseHandles> {
  try {
    return await loadFirebase();
  } catch (error) {
    throw toAuthError(error);
  }
}

function requireCurrentUser(auth: Auth): User {
  const user = auth.currentUser;
  if (!user) {
    throw new AuthError('auth/no-current-user');
  }
  return user;
}

/** Runs a Firebase call and converts any failure into an `AuthError`. */
async function guarded<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw toAuthError(error);
  }
}

export const GOOGLE_SIGN_IN_AVAILABLE = Platform.OS === 'web';

/**
 * Owns the Firebase session: subscribes to `onAuthStateChanged`, exposes the sign-in/sign-up
 * methods, bridges `getIdToken` to the API client and invalidates account queries whenever the
 * signed-in user changes. Persistence is AsyncStorage on native and the browser default on web
 * (see `firebase.ts`).
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(sessionReducer, initialSessionState);
  const lastUid = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    loadFirebase()
      .then(({ auth, sdk }) => {
        if (cancelled) {
          return;
        }
        unsubscribe = sdk.onAuthStateChanged(auth, (user) => {
          dispatch({ type: 'auth-state-changed', user: user ? toSessionUser(user) : null });
        });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          dispatch({
            type: 'init-failed',
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  // Cached account data belongs to one uid: drop it on sign-out, refresh it on sign-in.
  useEffect(() => {
    if (state.status === 'loading') {
      return;
    }
    const uid = state.user?.uid ?? null;
    if (lastUid.current === undefined) {
      lastUid.current = uid;
      return;
    }
    if (lastUid.current === uid) {
      return;
    }
    lastUid.current = uid;
    clearAccountSignal();
    if (uid === null) {
      queryClient.removeQueries({ queryKey: ME_QUERY_KEY });
    } else {
      void queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
    }
  }, [queryClient, state.status, state.user?.uid]);

  const getIdToken = useCallback(async (force = false): Promise<string | null> => {
    let handles: FirebaseHandles;
    try {
      handles = await loadFirebase();
    } catch {
      return null;
    }
    // Wait for the persisted session to be restored so the first API calls are not anonymous.
    await handles.auth.authStateReady();
    const user = handles.auth.currentUser;
    return user ? user.getIdToken(force) : null;
  }, []);

  useEffect(() => {
    setIdTokenProvider(() => getIdToken(false));
    return () => setIdTokenProvider(null);
  }, [getIdToken]);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const { auth, sdk } = await requireFirebase();
    await guarded(() => sdk.signInWithEmailAndPassword(auth, email.trim(), password));
  }, []);

  const signUpWithEmail = useCallback(
    async (email: string, password: string, displayName?: string) => {
      const { auth, sdk } = await requireFirebase();
      const credential = await guarded(() =>
        sdk.createUserWithEmailAndPassword(auth, email.trim(), password)
      );
      const name = displayName?.trim();
      if (name) {
        await guarded(() => sdk.updateProfile(credential.user, { displayName: name }));
        dispatch({ type: 'user-refreshed', user: toSessionUser(credential.user) });
      }
    },
    []
  );

  const signInWithGoogle = useCallback(async () => {
    if (!GOOGLE_SIGN_IN_AVAILABLE) {
      throw new AuthError('auth/operation-not-supported-in-this-environment');
    }
    const { auth, sdk } = await requireFirebase();
    await guarded(() => sdk.signInWithPopup(auth, new sdk.GoogleAuthProvider()));
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    const { auth, sdk } = await requireFirebase();
    await guarded(() => sdk.sendPasswordResetEmail(auth, email.trim()));
  }, []);

  const sendEmailVerification = useCallback(async () => {
    const { auth, sdk } = await requireFirebase();
    const user = requireCurrentUser(auth);
    await guarded(() => sdk.sendEmailVerification(user));
  }, []);

  const reloadUser = useCallback(async () => {
    const { auth, sdk } = await requireFirebase();
    const user = requireCurrentUser(auth);
    await guarded(() => sdk.reload(user));
    dispatch({ type: 'user-refreshed', user: toSessionUser(user) });
  }, []);

  const reauthenticate = useCallback(async (password: string) => {
    const { auth, sdk } = await requireFirebase();
    const user = requireCurrentUser(auth);
    if (!user.email) {
      throw new AuthError('auth/operation-not-allowed');
    }
    const credential = sdk.EmailAuthProvider.credential(user.email, password);
    await guarded(() => sdk.reauthenticateWithCredential(user, credential));
  }, []);

  const signOut = useCallback(async () => {
    const { auth, sdk } = await requireFirebase();
    await guarded(() => sdk.signOut(auth));
    dispatch({ type: 'signed-out' });
  }, []);

  const session = useMemo<Session>(
    () => ({
      status: state.status,
      user: state.user,
      initError: state.initError,
      getIdToken,
      signInWithEmail,
      signUpWithEmail,
      signInWithGoogle,
      googleSignInAvailable: GOOGLE_SIGN_IN_AVAILABLE,
      sendPasswordReset,
      sendEmailVerification,
      reloadUser,
      reauthenticate,
      signOut,
    }),
    [
      state,
      getIdToken,
      signInWithEmail,
      signUpWithEmail,
      signInWithGoogle,
      sendPasswordReset,
      sendEmailVerification,
      reloadUser,
      reauthenticate,
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
