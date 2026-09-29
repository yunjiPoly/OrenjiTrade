import { InjectionToken } from '@angular/core';
import { FirebaseApp, initializeApp } from 'firebase/app';
import {
  Auth,
  EmailAuthProvider,
  GoogleAuthProvider,
  User,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  onIdTokenChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
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
  /** Initialises the SDK. `emulatorHost` (host:port) routes every call to the local emulator. */
  init(config: FirebaseWebConfig, emulatorHost: string): void;
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

/** Production implementation backed by the Firebase JS SDK (v12, modular API). */
export class SdkFirebaseAuthPort implements FirebaseAuthPort {
  private app: FirebaseApp | null = null;
  private auth: Auth | null = null;

  init(config: FirebaseWebConfig, emulatorHost: string): void {
    if (this.auth) {
      return;
    }
    this.app = initializeApp({
      // The emulator accepts any non-empty key; a real project needs the console value.
      apiKey: config.apiKey || (emulatorHost ? 'emulator' : ''),
      authDomain: config.authDomain || undefined,
      projectId: config.projectId || undefined,
      appId: config.appId || undefined,
    });
    this.auth = getAuth(this.app);
    if (emulatorHost) {
      const url = /^https?:\/\//.test(emulatorHost) ? emulatorHost : `http://${emulatorHost}`;
      connectAuthEmulator(this.auth, url, { disableWarnings: true });
    }
  }

  onIdTokenChanged(listener: (user: AuthUser | null) => void): () => void {
    return onIdTokenChanged(this.requireAuth(), (user) => listener(user));
  }

  currentUser(): AuthUser | null {
    return this.auth?.currentUser ?? null;
  }

  async signUpWithEmail(email: string, password: string): Promise<AuthUser> {
    const credential = await createUserWithEmailAndPassword(this.requireAuth(), email, password);
    return credential.user;
  }

  async signInWithEmail(email: string, password: string): Promise<AuthUser> {
    const credential = await signInWithEmailAndPassword(this.requireAuth(), email, password);
    return credential.user;
  }

  async signInWithGoogle(): Promise<AuthUser> {
    const credential = await signInWithPopup(this.requireAuth(), this.googleProvider());
    return credential.user;
  }

  updateDisplayName(displayName: string): Promise<void> {
    return updateProfile(this.requireUser(), { displayName });
  }

  sendEmailVerification(): Promise<void> {
    return sendEmailVerification(this.requireUser());
  }

  sendPasswordReset(email: string): Promise<void> {
    return sendPasswordResetEmail(this.requireAuth(), email);
  }

  async reauthenticateWithPassword(password: string): Promise<void> {
    const user = this.requireUser();
    if (!user.email) {
      throw new NoCurrentUserError();
    }
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
  }

  async reauthenticateWithGoogle(): Promise<void> {
    await reauthenticateWithPopup(this.requireUser(), this.googleProvider());
  }

  async reload(): Promise<AuthUser | null> {
    const user = this.auth?.currentUser ?? null;
    if (!user) {
      return null;
    }
    await reload(user);
    return this.auth?.currentUser ?? null;
  }

  getIdToken(forceRefresh: boolean): Promise<string> {
    return this.requireUser().getIdToken(forceRefresh);
  }

  signOut(): Promise<void> {
    return signOut(this.requireAuth());
  }

  private googleProvider(): GoogleAuthProvider {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    return provider;
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
