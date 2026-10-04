import {
  AuthError,
  GENERIC_AUTH_ERROR,
  authErrorMessage,
  describeAuthError,
  isAuthError,
  toAuthError,
} from '@/src/auth/authErrors';

describe('auth errors', () => {
  it('maps Firebase codes to friendly, non-leaky sentences (web wording)', () => {
    expect(describeAuthError('auth/invalid-credential')).toBe(
      'No account matches these credentials.'
    );
    expect(describeAuthError('auth/email-already-in-use')).toBe(
      'An account already exists for this email. Try signing in instead.'
    );
    expect(describeAuthError('auth/network-request-failed')).toContain('Check your connection');
    expect(describeAuthError('auth/something-new')).toBe(GENERIC_AUTH_ERROR);
  });

  it('normalises anything thrown into an AuthError', () => {
    const firebaseLike = Object.assign(new Error('Firebase: Error (auth/wrong-password).'), {
      code: 'auth/wrong-password',
    });
    const mapped = toAuthError(firebaseLike);
    expect(mapped).toBeInstanceOf(AuthError);
    expect(mapped.code).toBe('auth/wrong-password');
    expect(mapped.message).toBe('No account matches these credentials.');
    expect(mapped.cause).toBe(firebaseLike);

    expect(toAuthError(new Error('boom')).code).toBe('auth/unknown');
    expect(toAuthError({ code: 42 }).message).toBe(GENERIC_AUTH_ERROR);
    const existing = new AuthError('auth/too-many-requests');
    expect(toAuthError(existing)).toBe(existing);
    expect(isAuthError(existing)).toBe(true);
    expect(isAuthError(new Error('x'))).toBe(false);
  });

  it('never shows the raw SDK text', () => {
    expect(authErrorMessage(new Error('Firebase: internal stack trace'))).toBe(GENERIC_AUTH_ERROR);
  });
});
