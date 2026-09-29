import { FirebaseWebConfig } from '../../config/app-config.model';
import { AuthUser, FirebaseAuthPort, NoCurrentUserError } from '../firebase-auth.port';

/** In-memory {@link FirebaseAuthPort} for unit tests (no SDK, no network). */
export class FakeFirebaseAuthPort implements FirebaseAuthPort {
  initCalls: { config: FirebaseWebConfig; emulatorHost: string }[] = [];
  user: AuthUser | null = null;
  tokenCounter = 0;
  forcedRefreshes = 0;
  failNextSignIn: unknown = null;
  reauthCalls: string[] = [];
  private listener: ((user: AuthUser | null) => void) | null = null;

  async init(config: FirebaseWebConfig, emulatorHost: string): Promise<void> {
    this.initCalls.push({ config, emulatorHost });
  }

  onIdTokenChanged(listener: (user: AuthUser | null) => void): () => void {
    this.listener = listener;
    queueMicrotask(() => listener(this.user));
    return () => (this.listener = null);
  }

  currentUser(): AuthUser | null {
    return this.user;
  }

  async signUpWithEmail(email: string): Promise<AuthUser> {
    return this.become(fakeUser(email));
  }

  async signInWithEmail(email: string): Promise<AuthUser> {
    if (this.failNextSignIn) {
      const error = this.failNextSignIn;
      this.failNextSignIn = null;
      throw error;
    }
    return this.become(fakeUser(email));
  }

  async signInWithGoogle(): Promise<AuthUser> {
    return this.become(fakeUser('google@example.test', 'google.com'));
  }

  async updateDisplayName(): Promise<void> {
    this.requireUser();
  }

  async sendEmailVerification(): Promise<void> {
    this.requireUser();
  }

  async sendPasswordReset(): Promise<void> {
    // no-op
  }

  async reauthenticateWithPassword(password: string): Promise<void> {
    this.requireUser();
    this.reauthCalls.push(`password:${password}`);
  }

  async reauthenticateWithGoogle(): Promise<void> {
    this.requireUser();
    this.reauthCalls.push('google');
  }

  async reload(): Promise<AuthUser | null> {
    return this.user;
  }

  async getIdToken(forceRefresh: boolean): Promise<string> {
    const user = this.requireUser();
    if (forceRefresh) {
      this.forcedRefreshes++;
      this.tokenCounter++;
    }
    return `token-${user.uid}-${this.tokenCounter}`;
  }

  async signOut(): Promise<void> {
    this.user = null;
    this.listener?.(null);
  }

  /** Simulates Firebase restoring (or switching) the session from the outside. */
  emit(user: AuthUser | null): void {
    this.user = user;
    this.listener?.(user);
  }

  private become(user: AuthUser): AuthUser {
    this.user = user;
    this.listener?.(user);
    return user;
  }

  private requireUser(): AuthUser {
    if (!this.user) {
      throw new NoCurrentUserError();
    }
    return this.user;
  }
}

export function fakeUser(email: string, providerId = 'password'): AuthUser {
  return {
    uid: `uid-${email}`,
    email,
    emailVerified: false,
    displayName: null,
    photoURL: null,
    providerData: [{ providerId }],
  };
}
