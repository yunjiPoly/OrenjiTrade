import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AppConfigService } from '../config/app-config.service';
import { AuthChange, AuthService } from './auth.service';
import { FIREBASE_AUTH_PORT } from './firebase-auth.port';
import { FakeFirebaseAuthPort } from './testing/fake-firebase-auth.port';

describe('AuthService', () => {
  let port: FakeFirebaseAuthPort;
  let config: AppConfigService;

  function setup(): AuthService {
    port = new FakeFirebaseAuthPort();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: FIREBASE_AUTH_PORT, useValue: port },
      ],
    });
    config = TestBed.inject(AppConfigService);
    return TestBed.inject(AuthService);
  }

  it('initialises against the emulator and resolves ready as anonymous', async () => {
    const auth = setup();
    config.set({
      firebase: { apiKey: 'demo', authDomain: '', projectId: 'orenjitrade-local', appId: '' },
      firebaseAuthEmulatorHost: 'localhost:9099',
    });
    await auth.init();
    await auth.ready();

    expect(port.initCalls).toEqual([
      {
        config: { apiKey: 'demo', authDomain: '', projectId: 'orenjitrade-local', appId: '' },
        emulatorHost: 'localhost:9099',
      },
    ]);
    expect(auth.usesEmulator()).toBe(true);
    expect(auth.available()).toBe(true);
    expect(auth.authState()).toBe('anonymous');
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('stays unavailable (and anonymous) without any Firebase configuration', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const auth = setup();
    config.set({});
    await auth.init();
    await auth.ready();

    expect(auth.available()).toBe(false);
    expect(auth.authState()).toBe('anonymous');
    expect(port.initCalls).toEqual([]);
    warn.mockRestore();
  });

  it('signs in, exposes the user and token, emits one change per identity and signs out', async () => {
    const auth = setup();
    config.set({ firebaseAuthEmulatorHost: 'localhost:9099' });
    await auth.init();
    await auth.ready();
    const changes: AuthChange[] = [];
    auth.changes$.subscribe((change) => changes.push(change));

    await auth.signInWithEmail(' maika@example.test ', 'secret-pass');

    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.user()?.email).toBe('maika@example.test');
    expect(auth.hasPasswordProvider()).toBe(true);
    expect(auth.idToken()).toBe('token-uid-maika@example.test-0');
    expect(changes.map((c) => c.user?.uid)).toEqual(['uid-maika@example.test']);

    expect(await auth.getIdToken(true)).toBe('token-uid-maika@example.test-1');
    expect(port.forcedRefreshes).toBe(1);

    await auth.signOut();
    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.user()).toBeNull();
    expect(await auth.getIdToken()).toBeNull();
    expect(changes.at(-1)?.user).toBeNull();
  });

  it('re-authenticates with the password and refreshes the token', async () => {
    const auth = setup();
    config.set({ firebaseAuthEmulatorHost: 'localhost:9099' });
    await auth.init();
    await auth.signInWithEmail('maika@example.test', 'secret-pass');

    await auth.reauthenticate({ kind: 'password', password: 'secret-pass' });

    expect(port.reauthCalls).toEqual(['password:secret-pass']);
    expect(port.forcedRefreshes).toBe(1);
  });

  it('rejects re-authentication when nobody is signed in', async () => {
    const auth = setup();
    config.set({ firebaseAuthEmulatorHost: 'localhost:9099' });
    await auth.init();
    await expect(auth.reauthenticate({ kind: 'google' })).rejects.toMatchObject({
      code: 'auth/no-current-user',
    });
  });
});
