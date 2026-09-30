import { Injectable, computed, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { AppConfigService } from '../config/app-config.service';
import { AuthUser, FIREBASE_AUTH_PORT, NoCurrentUserError } from './firebase-auth.port';

/** `loading` until Firebase restored (or ruled out) a persisted session. */
export type AuthState = 'loading' | 'anonymous' | 'authenticated';

/** Emitted on every identity change (sign-in, sign-out, token refresh). */
export interface AuthChange {
  user: AuthUser | null;
  idToken: string | null;
}

export type ReauthenticationMethod = { kind: 'password'; password: string } | { kind: 'google' };

/**
 * How long to wait for Firebase to restore a persisted session before treating the visitor as
 * anonymous (IndexedDB blocked, SDK stuck). A late answer still updates the state.
 */
export const AUTH_READY_TIMEOUT_MS = 5000;

/**
 * Firebase Authentication facade exposed as signals.
 *
 * - `init()` runs from an app initializer once `/config.json` is loaded: it initialises the SDK,
 *   points it at the emulator when `firebaseAuthEmulatorHost` is set and subscribes to token
 *   changes. When no Firebase configuration exists the service stays `anonymous` and
 *   {@link available} is false (the sign-in pages explain that sign-in is not configured).
 * - `ready()` resolves after the first auth state is known; guards and the interceptor await it.
 * - Tokens are read from the SDK on demand (`getIdToken`); the SDK refreshes them itself.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly appConfig = inject(AppConfigService);
  private readonly port = inject(FIREBASE_AUTH_PORT);

  private readonly userState = signal<AuthUser | null>(null);
  private readonly idTokenState = signal<string | null>(null);
  private readonly authStateState = signal<AuthState>('loading');
  private readonly availableState = signal(true);
  private resolveReady!: () => void;
  private readonly readyPromise = new Promise<void>((resolve) => (this.resolveReady = resolve));
  private initialised = false;

  /** The signed-in Firebase user (subset), or null. */
  readonly user = this.userState.asReadonly();
  /** Last ID token handed to the app; refreshed by the SDK and by {@link getIdToken}. */
  readonly idToken = this.idTokenState.asReadonly();
  readonly authState = this.authStateState.asReadonly();
  /** False when the environment has no Firebase configuration at all. */
  readonly available = this.availableState.asReadonly();
  readonly isAuthenticated = computed(() => this.authStateState() === 'authenticated');
  readonly emailVerified = computed(() => this.userState()?.emailVerified ?? false);
  /** Firebase sign-in providers of the current user (`password`, `google.com`, ...). */
  readonly providerIds = computed(() =>
    (this.userState()?.providerData ?? []).map((provider) => provider.providerId),
  );
  /** True when the user can re-authenticate with a password (otherwise with Google). */
  readonly hasPasswordProvider = computed(() => this.providerIds().includes('password'));
  private readonly usesEmulatorState = signal(false);
  /** True when every Firebase call goes to the local Auth emulator. */
  readonly usesEmulator = this.usesEmulatorState.asReadonly();
  /** Synchronous change feed for services that must react before change detection runs. */
  readonly changes$ = new Subject<AuthChange>();

  /** Initialises the SDK. Idempotent; never rejects (a broken config degrades to anonymous). */
  async init(): Promise<void> {
    if (this.initialised) {
      return;
    }
    this.initialised = true;
    const config = await this.appConfig.whenLoaded();
    const configured = !!config.firebase.apiKey || !!config.firebaseAuthEmulatorHost;
    if (!configured) {
      console.warn('[OrenjiTrade] No Firebase configuration in config.json; sign-in is disabled.');
      this.becomeUnavailable();
      return;
    }
    try {
      await this.port.init(config.firebase, config.firebaseAuthEmulatorHost);
      this.usesEmulatorState.set(!!config.firebaseAuthEmulatorHost);
      this.port.onIdTokenChanged((user) => void this.onIdentityChange(user));
      setTimeout(() => {
        if (this.authStateState() === 'loading') {
          console.warn('[OrenjiTrade] Firebase did not restore the session in time.');
          this.authStateState.set('anonymous');
          this.resolveReady();
        }
      }, AUTH_READY_TIMEOUT_MS);
    } catch (error) {
      console.warn('[OrenjiTrade] Firebase Authentication failed to initialise.', error);
      this.becomeUnavailable();
    }
  }

  /** Resolves once Firebase restored a persisted session or confirmed there is none. */
  ready(): Promise<void> {
    return this.readyPromise;
  }

  async signUpWithEmail(email: string, password: string): Promise<AuthUser> {
    const user = await this.port.signUpWithEmail(email.trim(), password);
    await this.onIdentityChange(user);
    return user;
  }

  async signInWithEmail(email: string, password: string): Promise<AuthUser> {
    const user = await this.port.signInWithEmail(email.trim(), password);
    await this.onIdentityChange(user);
    return user;
  }

  /** Google sign-in through a pop-up. Rejects with `auth/popup-blocked` when blocked. */
  async signInWithGoogle(): Promise<AuthUser> {
    const user = await this.port.signInWithGoogle();
    await this.onIdentityChange(user);
    return user;
  }

  async updateDisplayName(displayName: string): Promise<void> {
    await this.port.updateDisplayName(displayName.trim());
    await this.reloadUser();
  }

  sendEmailVerification(): Promise<void> {
    return this.port.sendEmailVerification();
  }

  sendPasswordReset(email: string): Promise<void> {
    return this.port.sendPasswordReset(email.trim());
  }

  /** Re-proves identity before a sensitive action (account deletion, email change). */
  async reauthenticate(method: ReauthenticationMethod): Promise<void> {
    if (!this.userState()) {
      throw new NoCurrentUserError();
    }
    if (method.kind === 'password') {
      await this.port.reauthenticateWithPassword(method.password);
    } else {
      await this.port.reauthenticateWithGoogle();
    }
    await this.getIdToken(true);
  }

  /** Re-reads the user from Firebase (after email verification, profile updates). */
  async reloadUser(): Promise<AuthUser | null> {
    const user = await this.port.reload();
    await this.onIdentityChange(user);
    return user;
  }

  /** Current ID token; `forceRefresh` bypasses the SDK cache (used after a 401). */
  async getIdToken(forceRefresh = false): Promise<string | null> {
    if (!this.userState()) {
      return null;
    }
    try {
      const token = await this.port.getIdToken(forceRefresh);
      this.idTokenState.set(token);
      return token;
    } catch (error) {
      if (error instanceof NoCurrentUserError) {
        return null;
      }
      throw error;
    }
  }

  async signOut(): Promise<void> {
    if (this.userState() === null && this.authStateState() !== 'loading') {
      return;
    }
    await this.port.signOut();
    await this.onIdentityChange(null);
  }

  private async onIdentityChange(user: AuthUser | null): Promise<void> {
    let token: string | null = null;
    if (user) {
      try {
        token = await this.port.getIdToken(false);
      } catch (error) {
        console.warn('[OrenjiTrade] Could not read the ID token.', error);
      }
    }
    const previousUid = this.userState()?.uid ?? null;
    const previousToken = this.idTokenState();
    // Firebase mutates its user object in place (reload, profile updates): store a copy so the
    // signal notifies its readers.
    this.userState.set(user ? snapshotUser(user) : null);
    this.idTokenState.set(token);
    this.authStateState.set(user ? 'authenticated' : 'anonymous');
    this.resolveReady();
    if (previousUid !== (user?.uid ?? null) || previousToken !== token) {
      this.changes$.next({ user, idToken: token });
    }
  }

  private becomeUnavailable(): void {
    this.availableState.set(false);
    this.authStateState.set('anonymous');
    this.resolveReady();
  }
}

function snapshotUser(user: AuthUser): AuthUser {
  return {
    uid: user.uid,
    email: user.email,
    emailVerified: user.emailVerified,
    displayName: user.displayName,
    photoURL: user.photoURL,
    providerData: user.providerData.map((provider) => ({ providerId: provider.providerId })),
  };
}
