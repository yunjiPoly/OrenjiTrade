import { initialSessionState, sessionReducer } from '@/src/auth/sessionReducer';

import { testUser } from '../support/fakeAuthPort';

describe('sessionReducer', () => {
  it('starts loading and follows Firebase auth changes', () => {
    expect(initialSessionState.status).toBe('loading');
    const user = testUser();
    const signedIn = sessionReducer(initialSessionState, { type: 'auth-state-changed', user });
    expect(signedIn).toEqual({ status: 'authenticated', user, initError: null });
    const signedOut = sessionReducer(signedIn, { type: 'auth-state-changed', user: null });
    expect(signedOut).toEqual({ status: 'anonymous', user: null, initError: null });
  });

  it('applies refreshes only to the signed-in user', () => {
    const user = testUser();
    const state = sessionReducer(initialSessionState, { type: 'auth-state-changed', user });
    const verified = sessionReducer(state, {
      type: 'user-refreshed',
      user: { ...user, emailVerified: true, displayName: 'New' },
    });
    expect(verified.user?.displayName).toBe('New');
    const stale = sessionReducer(state, {
      type: 'user-refreshed',
      user: testUser({ uid: 'someone-else' }),
    });
    expect(stale).toBe(state);
    expect(sessionReducer(initialSessionState, { type: 'user-refreshed', user })).toBe(
      initialSessionState
    );
  });

  it('treats an SDK failure or a slow restore as signed out', () => {
    const error = new Error('no config');
    expect(sessionReducer(initialSessionState, { type: 'init-failed', error })).toEqual({
      status: 'anonymous',
      user: null,
      initError: error,
    });
    expect(sessionReducer(initialSessionState, { type: 'ready-timeout' }).status).toBe('anonymous');
    const signedIn = sessionReducer(initialSessionState, {
      type: 'auth-state-changed',
      user: testUser(),
    });
    expect(sessionReducer(signedIn, { type: 'ready-timeout' })).toBe(signedIn);
  });
});
