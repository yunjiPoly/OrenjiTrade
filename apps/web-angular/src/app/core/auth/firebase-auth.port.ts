import { InjectionToken } from '@angular/core';
import type { Auth, GoogleAuthProvider, User } from 'firebase/auth';
import { FirebaseWebConfig } from '../config/app-config.model';

/**
 * The slice of a Firebase user the application reads. Firebase's `User` satisfies it
 * structurally, and tests build plain objects.
 */
export interface AuthUser {
  readonly uid: string;
  readonly email: string | null;
  readonly emailVerified: boolean;
  readonly displayName: string | null;
  readonly photoURL: string | null;
  readonly providerData: readonly { readonly providerId: string }[];
}

/**
 * Thin, injectable wrapper around the Firebase Authentication SDK. `AuthService` only talks to
 * this port so unit tests can replace the SDK with an in-memory fake (Angular's Vitest runner
 * pre-bundles specs, which makes module mocking unreliable). Methods that act on the current
 * user throw `auth/no-current-user` when nobody is signed in.
 */
export interface FirebaseAuthPort {
  /**
   * Loads and initialises the SDK. `emulatorHost` (host:port) routes every call to the local
   * emulator. Every other method may only be called after this promise resolved.
   */
  init(config: FirebaseWebConfig, emulatorHost: string): Promise<void>;
  /** Fires on sign-in, sign-out and token refresh. Returns the unsubscribe function. */
  onIdTokenChanged(listener: (user: AuthUser | null) => void): () => void;
  currentUser(): AuthUser | null;
  signUpWithEmail(email: string, password: string): Promise<AuthUser>;
  signInWithEmail(email: string, password: string): Promise<AuthUser>;
  signInWithGoogle(): Promise<AuthUser>;
  updateDisplayName(displayName: string): Promise<void>;
  sendEmailVerification(): Promise<void>;
  sendPasswordReset(email: string): Promise<void>;
  reauthenticateWithPassword(password: string): Promise<void>;
  reauthenticateWithGoogle(): Promise<void>;
  reload(): Promise<AuthUser | null>;
  getIdToken(forceRefresh: boolean): Promise<string>;
  signOut(): Promise<void>;
}

/** Error thrown by the port when an operation needs a signed-in user and there is none. */
export class NoCurrentUserError extends Error {
  readonly code = 'auth/no-current-user';
  constructor() {
    super('No user is signed in.');
    this.name = 'NoCurrentUserError';
  }
}

type AuthSdk = typeof import('firebase/auth');

/**
 * Production implementation backed by the Firebase JS SDK (v12, modular API). The SDK is loaded
 * with dynamic imports in {@link init} so it stays out of the initial bundle.
 */
export class SdkFirebaseAuthPort implements FirebaseAuthPort {
  private sdk: AuthSdk | null = null;
  private auth: Auth | null = null;

  async init(config: FirebaseWebConfig, emulatorHost: string): Promise<void> {
    if (this.auth) {
      return;
    }
    const [{ initializeApp }, sdk] = await Promise.all([
      import('firebase/app'),
      import('firebase/auth'),
    ]);
    const app = initializeApp({
      // The emulator accepts any non-empty key; a real project needs the console value.
      apiKey: config.apiKey || (emulatorHost ? 'emulator' : ''),
      authDomain: config.authDomain || undefined,
      projectId: config.projectId || undefined,
      appId: config.appId || undefined,
    });
    const auth = sdk.getAuth(app);
    if (emulatorHost) {
      const url = /^https?:\/\//.test(emulatorHost) ? emulatorHost : `http://${emulatorHost}`;
      sdk.connectAuthEmulator(auth, url, { disableWarnings: true });
    }
    this.sdk = sdk;
    this.auth = auth;
  }

  onIdTokenChanged(listener: (user: AuthUser | null) => void): () => void {
    return this.requireSdk().onIdTokenChanged(this.requireAuth(), (user) => listener(user));
  }

  currentUser(): AuthUser | null {
    return this.auth?.currentUser ?? null;
  }

  async signUpWithEmail(email: string, password: string): Promise<AuthUser> {
    const credential = await this.requireSdk().createUserWithEmailAndPassword(
      this.requireAuth(),
      email,
      password,
    );
    return credential.user;
  }

  async signInWithEmail(email: string, password: string): Promise<AuthUser> {
    const credential = await this.requireSdk().signInWithEmailAndPassword(
      this.requireAuth(),
      email,
      password,
    );
    return credential.user;
  }

  async signInWithGoogle(): Promise<AuthUser> {
    const credential = await this.requireSdk().signInWithPopup(
      this.requireAuth(),
      this.googleProvider(),
    );
    return credential.user;
  }

  updateDisplayName(displayName: string): Promise<void> {
    return this.requireSdk().updateProfile(this.requireUser(), { displayName });
  }

  sendEmailVerification(): Promise<void> {
    return this.requireSdk().sendEmailVerification(this.requireUser());
  }

  sendPasswordReset(email: string): Promise<void> {
    return this.requireSdk().sendPasswordResetEmail(this.requireAuth(), email);
  }

  async reauthenticateWithPassword(password: string): Promise<void> {
    const sdk = this.requireSdk();
    const user = this.requireUser();
    if (!user.email) {
      throw new NoCurrentUserError();
    }
    await sdk.reauthenticateWithCredential(
      user,
      sdk.EmailAuthProvider.credential(user.email, password),
    );
  }

  async reauthenticateWithGoogle(): Promise<void> {
    await this.requireSdk().reauthenticateWithPopup(this.requireUser(), this.googleProvider());
  }

  async reload(): Promise<AuthUser | null> {
    const user = this.auth?.currentUser ?? null;
    if (!user) {
      return null;
    }
    await this.requireSdk().reload(user);
    return this.auth?.currentUser ?? null;
  }

  getIdToken(forceRefresh: boolean): Promise<string> {
    return this.requireUser().getIdToken(forceRefresh);
  }

  signOut(): Promise<void> {
    return this.requireSdk().signOut(this.requireAuth());
  }

  private googleProvider(): GoogleAuthProvider {
    const provider = new (this.requireSdk().GoogleAuthProvider)();
    provider.setCustomParameters({ prompt: 'select_account' });
    return provider;
  }

  private requireSdk(): AuthSdk {
    if (!this.sdk) {
      throw new Error('Firebase Authentication is not initialised (AuthService.init not run).');
    }
    return this.sdk;
  }

  private requireAuth(): Auth {
    if (!this.auth) {
      throw new Error('Firebase Authentication is not initialised (AuthService.init not run).');
    }
    return this.auth;
  }

  private requireUser(): User {
    const user = this.requireAuth().currentUser;
    if (!user) {
      throw new NoCurrentUserError();
    }
    return user;
  }
}

/** Injection token for the port; tests override it with a fake. */
export const FIREBASE_AUTH_PORT = new InjectionToken<FirebaseAuthPort>('FIREBASE_AUTH_PORT', {
  providedIn: 'root',
  factory: () => new SdkFirebaseAuthPort(),
});
