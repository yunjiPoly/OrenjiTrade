import type { User } from 'firebase/auth';

import { appConfig } from '@/src/config/env';

import { AuthError, toAuthError } from './authErrors';
import { getFirebaseAuth, getFirebaseAuthModule } from './firebase';
import { emulatorGoogleIdToken, type GoogleCredential } from './googleCredential';

/** The subset of the Firebase user the app needs (serialisable, copied on every change). */
export interface AuthUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  /** Firebase provider ids, e.g. `password`. */
  providerIds: string[];
}

/**
 * Everything the app asks of Firebase Authentication. The session provider only talks to this
 * port: production uses {@link firebaseAuthPort}; unit tests pass an in-memory fake. Every method
 * rejects with an {@link AuthError} (`code` is the Firebase `auth/...` code).
 */
export interface AuthPort {
  /** True when every call goes to the local Auth emulator. */
  readonly usesEmulator: boolean;
  /**
   * Starts the SDK and reports the signed-in user now (restored from persistence) and after every
   * sign-in/sign-out. Rejects the listener with `onError` when the SDK cannot start.
   */
  subscribe(
    listener: (user: AuthUser | null) => void,
    onError: (error: AuthError) => void
  ): () => void;
  signIn(email: string, password: string): Promise<AuthUser>;
  signUp(email: string, password: string): Promise<AuthUser>;
  /**
   * Google sign-in or sign-up (see `googleCredential.ts`): the pop-up on web, an OAuth ID token on
   * a device, a simulated account against the emulator. An existing e-mail/password account of the
   * same (verified) e-mail is linked, like the web.
   */
  signInWithGoogle(credential: GoogleCredential): Promise<AuthUser>;
  updateDisplayName(displayName: string): Promise<AuthUser>;
  sendEmailVerification(): Promise<void>;
  sendPasswordReset(email: string): Promise<void>;
  /** Re-reads the user (after the verification link was opened). */
  reload(): Promise<AuthUser | null>;
  /** Re-proves the password before sensitive actions (the API wants a recent `auth_time`). */
  reauthenticate(password: string): Promise<void>;
  /** Re-proves a Google identity (accounts without a password) before sensitive actions. */
  reauthenticateWithGoogle(credential: GoogleCredential): Promise<void>;
  /** Current ID token (`forceRefresh` bypasses the SDK cache), or null when signed out. */
  getIdToken(forceRefresh: boolean): Promise<string | null>;
  signOut(): Promise<void>;
}

export function toAuthUser(
  user: Pick<User, 'uid' | 'email' | 'emailVerified' | 'displayName' | 'providerData'>
): AuthUser {
  return {
    uid: user.uid,
    email: user.email,
    emailVerified: user.emailVerified,
    displayName: user.displayName,
    providerIds: user.providerData.map((entry) => entry.providerId),
  };
}

async function guarded<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw toAuthError(error);
  }
}

async function handles() {
  return guarded(async () => {
    const [auth, sdk] = await Promise.all([getFirebaseAuth(), getFirebaseAuthModule()]);
    return { auth, sdk };
  });
}

async function currentUser(): Promise<{
  user: User;
  sdk: Awaited<ReturnType<typeof handles>>['sdk'];
}> {
  const { auth, sdk } = await handles();
  const user = auth.currentUser;
  if (!user) {
    throw new AuthError('auth/no-current-user');
  }
  return { user, sdk };
}

type Sdk = Awaited<ReturnType<typeof handles>>['sdk'];

/** Firebase's `select_account` prompt, like the web's Google provider. */
function googleProvider(sdk: Sdk) {
  const provider = new sdk.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
}

/** The `AuthCredential` of a non-pop-up Google identity (see `googleCredential.ts`). */
function googleAuthCredential(sdk: Sdk, credential: Exclude<GoogleCredential, { kind: 'popup' }>) {
  if (credential.kind === 'emulator') {
    return sdk.GoogleAuthProvider.credential(
      emulatorGoogleIdToken(credential.email, credential.displayName)
    );
  }
  return sdk.GoogleAuthProvider.credential(credential.idToken, credential.accessToken ?? undefined);
}

/** The production port: the Firebase JS SDK, loaded lazily (see `firebase.ts`). */
export const firebaseAuthPort: AuthPort = {
  usesEmulator: appConfig.authEmulatorHost !== null,

  subscribe(listener, onError) {
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;
    handles()
      .then(({ auth, sdk }) => {
        if (!cancelled) {
          unsubscribe = sdk.onAuthStateChanged(auth, (user) =>
            listener(user ? toAuthUser(user) : null)
          );
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          onError(toAuthError(error));
        }
      });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  },

  async signIn(email, password) {
    const { auth, sdk } = await handles();
    const credential = await guarded(() => sdk.signInWithEmailAndPassword(auth, email, password));
    return toAuthUser(credential.user);
  },

  async signUp(email, password) {
    const { auth, sdk } = await handles();
    const credential = await guarded(() =>
      sdk.createUserWithEmailAndPassword(auth, email, password)
    );
    return toAuthUser(credential.user);
  },

  async signInWithGoogle(credential) {
    const { auth, sdk } = await handles();
    if (credential.kind === 'emulator' && !appConfig.authEmulatorHost) {
      // A simulated account only ever exists against the local emulator.
      throw new AuthError('auth/operation-not-allowed');
    }
    const result = await guarded(() =>
      credential.kind === 'popup'
        ? // `initializeAuth` left the resolver out (it would load Google's iframe on every start);
          // the pop-up gets it explicitly, like the web.
          sdk.signInWithPopup(auth, googleProvider(sdk), sdk.browserPopupRedirectResolver)
        : sdk.signInWithCredential(auth, googleAuthCredential(sdk, credential))
    );
    return toAuthUser(result.user);
  },

  async updateDisplayName(displayName) {
    const { user, sdk } = await currentUser();
    await guarded(() => sdk.updateProfile(user, { displayName }));
    return toAuthUser(user);
  },

  async sendEmailVerification() {
    const { user, sdk } = await currentUser();
    await guarded(() => sdk.sendEmailVerification(user));
  },

  async sendPasswordReset(email) {
    const { auth, sdk } = await handles();
    await guarded(() => sdk.sendPasswordResetEmail(auth, email));
  },

  async reload() {
    const { auth, sdk } = await handles();
    const user = auth.currentUser;
    if (!user) {
      return null;
    }
    await guarded(() => sdk.reload(user));
    return toAuthUser(user);
  },

  async reauthenticate(password) {
    const { user, sdk } = await currentUser();
    if (!user.email) {
      throw new AuthError('auth/operation-not-allowed');
    }
    const credential = sdk.EmailAuthProvider.credential(user.email, password);
    await guarded(() => sdk.reauthenticateWithCredential(user, credential));
  },

  async reauthenticateWithGoogle(credential) {
    const { user, sdk } = await currentUser();
    if (credential.kind === 'emulator' && !appConfig.authEmulatorHost) {
      throw new AuthError('auth/operation-not-allowed');
    }
    await guarded(() =>
      credential.kind === 'popup'
        ? sdk.reauthenticateWithPopup(user, googleProvider(sdk), sdk.browserPopupRedirectResolver)
        : sdk.reauthenticateWithCredential(user, googleAuthCredential(sdk, credential))
    );
  },

  async getIdToken(forceRefresh) {
    const { auth } = await handles();
    // The first API calls after a cold start must wait for the persisted session.
    await auth.authStateReady();
    const user = auth.currentUser;
    return user ? guarded(() => user.getIdToken(forceRefresh)) : null;
  },

  async signOut() {
    const { auth, sdk } = await handles();
    await guarded(() => sdk.signOut(auth));
  },
};
