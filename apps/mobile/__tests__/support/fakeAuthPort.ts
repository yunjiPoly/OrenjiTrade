import { AuthError } from '@/src/auth/authErrors';
import type { AuthPort, AuthUser } from '@/src/auth/authPort';
import type { GoogleCredential } from '@/src/auth/googleCredential';

/** A signed-in collector for tests (fictional). */
export function testUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    uid: 'uid-maika',
    email: 'maika@example.test',
    emailVerified: true,
    displayName: 'Maïka Test',
    providerIds: ['password'],
    ...overrides,
  };
}

/**
 * In-memory stand-in for Firebase Authentication. Every method is a jest mock so tests can assert
 * calls or override behaviour (`port.signIn.mockRejectedValueOnce(new AuthError(...))`).
 */
export class FakeAuthPort implements AuthPort {
  readonly usesEmulator = true;
  user: AuthUser | null;
  /** Accounts that `signIn` accepts (email → password). */
  readonly accounts = new Map<string, string>([['maika@example.test', 'correct-password']]);
  private readonly listeners = new Set<(user: AuthUser | null) => void>();
  tokenVersion = 1;

  constructor(user: AuthUser | null = null) {
    this.user = user;
  }

  private emit(user: AuthUser | null): void {
    this.user = user;
    for (const listener of this.listeners) {
      listener(user);
    }
  }

  subscribe = jest.fn((listener: (user: AuthUser | null) => void) => {
    this.listeners.add(listener);
    listener(this.user);
    return () => {
      this.listeners.delete(listener);
    };
  });

  signIn = jest.fn(async (email: string, password: string) => {
    if (this.accounts.get(email) !== password) {
      throw new AuthError('auth/invalid-credential');
    }
    const user = testUser({ email });
    this.emit(user);
    return user;
  });

  signUp = jest.fn(async (email: string, password: string) => {
    if (this.accounts.has(email)) {
      throw new AuthError('auth/email-already-in-use');
    }
    this.accounts.set(email, password);
    const user = testUser({ uid: `uid-${email}`, email, emailVerified: false, displayName: null });
    this.emit(user);
    return user;
  });

  /** Google identities the fake knows (e-mail -> name); a password account of the same e-mail links. */
  readonly googleAccounts = new Map<string, string>();

  signInWithGoogle = jest.fn(async (credential: GoogleCredential) => {
    if (credential.kind !== 'emulator') {
      throw new AuthError('auth/operation-not-allowed');
    }
    const email = credential.email.trim().toLowerCase();
    this.googleAccounts.set(email, credential.displayName);
    const linked = this.accounts.has(email);
    const user = testUser({
      uid: linked ? `uid-${email}` : `uid-google-${email}`,
      email,
      emailVerified: true,
      displayName: credential.displayName,
      providerIds: linked ? ['password', 'google.com'] : ['google.com'],
    });
    this.emit(user);
    return user;
  });

  reauthenticateWithGoogle = jest.fn(async (credential: GoogleCredential) => {
    if (!this.user) {
      throw new AuthError('auth/no-current-user');
    }
    if (credential.kind !== 'emulator' || credential.email.toLowerCase() !== this.user.email) {
      throw new AuthError('auth/user-mismatch');
    }
  });

  updateDisplayName = jest.fn(async (displayName: string) => {
    if (!this.user) {
      throw new AuthError('auth/no-current-user');
    }
    this.user = { ...this.user, displayName };
    return this.user;
  });

  sendEmailVerification = jest.fn(async () => undefined);

  sendPasswordReset = jest.fn(async (_email: string) => undefined);

  reload = jest.fn(async () => this.user);

  reauthenticate = jest.fn(async (password: string) => {
    if (!this.user?.email || this.accounts.get(this.user.email) !== password) {
      throw new AuthError('auth/wrong-password');
    }
  });

  getIdToken = jest.fn(async (forceRefresh: boolean) => {
    if (!this.user) {
      return null;
    }
    if (forceRefresh) {
      this.tokenVersion++;
    }
    return `token-${this.user.uid}-${this.tokenVersion}`;
  });

  signOut = jest.fn(async () => {
    this.emit(null);
  });

  /** Simulates Firebase restoring (or not) a persisted session after the first subscribe. */
  restore(user: AuthUser | null): void {
    this.emit(user);
  }
}
