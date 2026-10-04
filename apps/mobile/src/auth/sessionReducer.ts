import type { AuthUser } from './authPort';

/**
 * Pure session state machine. `SessionProvider` feeds it the auth port's events; keeping the
 * transitions here makes them unit-testable without React or Firebase.
 */
export type SessionStatus = 'loading' | 'anonymous' | 'authenticated';

export interface SessionState {
  status: SessionStatus;
  user: AuthUser | null;
  /** Set when Firebase could not be initialised (bad config, SDK failure). */
  initError: Error | null;
}

export type SessionAction =
  | { type: 'auth-state-changed'; user: AuthUser | null }
  | { type: 'user-refreshed'; user: AuthUser }
  | { type: 'init-failed'; error: Error }
  | { type: 'ready-timeout' };

export const initialSessionState: SessionState = {
  status: 'loading',
  user: null,
  initError: null,
};

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
    case 'ready-timeout':
      // Firebase did not restore the session in time: treat the visitor as anonymous; a late
      // answer still arrives as `auth-state-changed`.
      return state.status === 'loading' ? { ...state, status: 'anonymous' } : state;
    default:
      return state;
  }
}
