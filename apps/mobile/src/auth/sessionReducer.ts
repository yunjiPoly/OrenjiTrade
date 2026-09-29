/**
 * Pure session state machine. `SessionProvider` feeds it Firebase `onAuthStateChanged`
 * events; keeping the transitions here makes them unit-testable without React or Firebase.
 */

export type SessionStatus = 'loading' | 'anonymous' | 'authenticated';

/** Minimal, serialisable view of the Firebase user the app needs. */
export interface SessionUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  photoUrl: string | null;
  /** Firebase provider ids, e.g. `password`, `google.com`. */
  providerIds: string[];
}

export interface SessionState {
  status: SessionStatus;
  user: SessionUser | null;
  /** Set when Firebase could not be initialised (missing config, SDK failure). */
  initError: Error | null;
}

export type SessionAction =
  | { type: 'auth-state-changed'; user: SessionUser | null }
  | { type: 'user-refreshed'; user: SessionUser }
  | { type: 'init-failed'; error: Error }
  | { type: 'signed-out' };

export const initialSessionState: SessionState = {
  status: 'loading',
  user: null,
  initError: null,
};

/** Shape of `firebase/auth` `User` that `toSessionUser` reads (kept structural for tests). */
export interface FirebaseUserLike {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  photoURL: string | null;
  providerData: readonly { providerId: string }[];
}

export function toSessionUser(user: FirebaseUserLike): SessionUser {
  return {
    uid: user.uid,
    email: user.email,
    emailVerified: user.emailVerified,
    displayName: user.displayName,
    photoUrl: user.photoURL,
    providerIds: user.providerData.map((entry) => entry.providerId),
  };
}

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'auth-state-changed':
      return action.user
        ? { status: 'authenticated', user: action.user, initError: null }
        : { status: 'anonymous', user: null, initError: state.initError };
    case 'user-refreshed':
      if (state.status !== 'authenticated' || state.user?.uid !== action.user.uid) {
        // A refresh for a user that is no longer signed in (or a different one) is stale.
        return state;
      }
      return { ...state, user: action.user };
    case 'init-failed':
      return { status: 'anonymous', user: null, initError: action.error };
    case 'signed-out':
      return { status: 'anonymous', user: null, initError: state.initError };
    default:
      return state;
  }
}
