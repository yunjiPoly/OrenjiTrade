import { AuthError } from '@/src/auth/authErrors';
import { emulatorGoogleIdToken, emulatorGoogleSubject } from '@/src/auth/googleCredential';
import { GOOGLE_SCOPES, googleClientIdFor, requestGoogleIdToken } from '@/src/auth/googleNative';
import { googleStrategy, validateSimulatedAccount } from '@/src/features/auth/googleStrategy';

jest.mock('expo-auth-session', () => {
  class AuthRequest {
    readonly clientId: string;
    readonly redirectUri: string;
    readonly scopes: string[];
    readonly responseType: string;
    readonly usePKCE: boolean;
    readonly extraParams: Record<string, string>;
    codeVerifier = 'verifier-1';
    constructor(config: Record<string, unknown>) {
      this.clientId = config.clientId as string;
      this.redirectUri = config.redirectUri as string;
      this.scopes = config.scopes as string[];
      this.responseType = config.responseType as string;
      this.usePKCE = config.usePKCE as boolean;
      this.extraParams = config.extraParams as Record<string, string>;
    }
    promptAsync = jest.fn();
  }
  return {
    AuthRequest,
    ResponseType: { Code: 'code', IdToken: 'id_token', Token: 'token' },
    makeRedirectUri: ({ native }: { native: string }) => native,
    exchangeCodeAsync: jest.fn(async (config: { code: string }) =>
      config.code === 'good-code'
        ? { idToken: 'google-id-token', accessToken: 'google-access-token' }
        : { idToken: null, accessToken: null }
    ),
  };
});

describe('emulator Google credential', () => {
  it('is the fake OAuth ID token the Auth emulator accepts: a JSON object with a verified e-mail', () => {
    const token = JSON.parse(emulatorGoogleIdToken(' Maika@Example.test ', ' Maïka Test '));
    expect(token).toEqual({
      sub: emulatorGoogleSubject('maika@example.test'),
      email: 'maika@example.test',
      email_verified: true,
      name: 'Maïka Test',
    });
  });

  it('keeps the same Google subject for the same e-mail, whatever the name or case', () => {
    expect(emulatorGoogleSubject('Maika@Example.test')).toBe(
      emulatorGoogleSubject('maika@example.test')
    );
    expect(emulatorGoogleSubject('a@example.test')).not.toBe(
      emulatorGoogleSubject('b@example.test')
    );
    expect(emulatorGoogleSubject('x@example.test')).toMatch(/^emulator-google-[0-9a-f]{8}$/);
  });

  it('falls back to the mailbox name when no name was given', () => {
    expect(JSON.parse(emulatorGoogleIdToken('fresh@example.test', '  ')).name).toBe('fresh');
  });
});

describe('googleStrategy', () => {
  const ids = { web: null, android: null, ios: null };

  it('simulates Google against the emulator on every platform', () => {
    expect(googleStrategy(true, 'web', ids)).toBe('emulator');
    expect(googleStrategy(true, 'android', ids)).toBe('emulator');
    expect(googleStrategy(true, 'ios', { ...ids, ios: 'ios-id' })).toBe('emulator');
  });

  it('uses the Firebase pop-up on the web build and the system browser on a configured device', () => {
    expect(googleStrategy(false, 'web', ids)).toBe('popup');
    expect(googleStrategy(false, 'android', { ...ids, android: 'android-id' })).toBe('native');
    expect(googleStrategy(false, 'ios', { ...ids, ios: 'ios-id' })).toBe('native');
    expect(googleStrategy(false, 'android', { ...ids, ios: 'ios-id' })).toBe('unavailable');
    expect(googleStrategy(false, 'ios', ids)).toBe('unavailable');
  });

  it('validates the simulated account', () => {
    expect(validateSimulatedAccount('', '')).toEqual({
      valid: false,
      errors: {
        email: 'Enter the e-mail of the simulated Google account.',
        displayName: 'Enter a name for the simulated Google account.',
      },
    });
    expect(validateSimulatedAccount('nope', 'Name').errors.email).toBe(
      'That email address does not look right.'
    );
    expect(validateSimulatedAccount(' ok@example.test ', ' Name ')).toEqual({
      valid: true,
      errors: { email: null, displayName: null },
    });
  });
});

describe('requestGoogleIdToken (device flow)', () => {
  const ids = { web: 'web-id', android: 'android-id', ios: 'ios-id' };

  it('picks the client id of the platform', () => {
    expect(googleClientIdFor('android', ids)).toBe('android-id');
    expect(googleClientIdFor('ios', ids)).toBe('ios-id');
    expect(googleClientIdFor('web', ids)).toBe('web-id');
    expect(googleClientIdFor('android', { ...ids, android: null })).toBeNull();
  });

  it('refuses without a client id (nothing is opened)', async () => {
    const prompt = jest.fn();
    await expect(requestGoogleIdToken(null, prompt)).rejects.toMatchObject({
      code: 'auth/google-not-configured',
    });
    expect(prompt).not.toHaveBeenCalled();
  });

  it('asks for a code with PKCE on the installed-app redirect and exchanges it for the ID token', async () => {
    const prompt = jest.fn(async (request: { clientId: string }) => {
      expect(request).toMatchObject({
        clientId: 'android-id',
        redirectUri: 'com.orenjitrade.app:/oauthredirect',
        scopes: GOOGLE_SCOPES,
        responseType: 'code',
        usePKCE: true,
        extraParams: { prompt: 'select_account' },
      });
      return { type: 'success', params: { code: 'good-code' } };
    });
    await expect(requestGoogleIdToken('android-id', prompt as never)).resolves.toEqual({
      idToken: 'google-id-token',
      accessToken: 'google-access-token',
    });
    const { exchangeCodeAsync } = jest.requireMock('expo-auth-session') as {
      exchangeCodeAsync: jest.Mock;
    };
    expect(exchangeCodeAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 'android-id',
        code: 'good-code',
        extraParams: { code_verifier: 'verifier-1' },
      }),
      expect.objectContaining({ tokenEndpoint: 'https://oauth2.googleapis.com/token' })
    );
  });

  it('treats a closed browser as cancelled and a tokenless answer as a failure', async () => {
    await expect(
      requestGoogleIdToken('ios-id', async () => ({ type: 'dismiss' }) as never)
    ).rejects.toMatchObject({ code: 'auth/google-cancelled' });
    await expect(
      requestGoogleIdToken('ios-id', async () => ({ type: 'cancel' }) as never)
    ).rejects.toMatchObject({ code: 'auth/google-cancelled' });
    await expect(
      requestGoogleIdToken(
        'ios-id',
        async () => ({ type: 'error', params: {}, error: null }) as never
      )
    ).rejects.toBeInstanceOf(AuthError);
    await expect(
      requestGoogleIdToken(
        'ios-id',
        async () => ({ type: 'success', params: { code: 'bad-code' } }) as never
      )
    ).rejects.toMatchObject({ code: 'auth/google-no-token' });
  });
});
