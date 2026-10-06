import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { authErrorMessage, isGoogleDismissed, toAuthError } from '@/src/auth/authErrors';
import type { GoogleCredential } from '@/src/auth/googleCredential';
import { requestGoogleIdToken } from '@/src/auth/googleNative';
import { useSession } from '@/src/auth/session';
import { appConfig } from '@/src/config/env';

import { googleStrategy, type GoogleStrategy } from './googleStrategy';

export type GoogleMode = 'sign-in' | 'reauthenticate';

export interface SimulatedAccountDialogState {
  visible: boolean;
  /** Re-authentication: the simulated account must be the signed-in one (its e-mail is fixed). */
  lockedEmail: string | null;
  onSubmit: (email: string, displayName: string) => void;
  onCancel: () => void;
}

export interface GoogleSignIn {
  /**
   * Runs the Google flow of this build (`strategy`). Resolves `true` once Firebase signed the
   * collector in (or re-authenticated them), `false` when they dismissed it (nothing to show),
   * and rejects with an `AuthError` for a real failure (`authErrorMessage` words it).
   */
  start: () => Promise<boolean>;
  busy: boolean;
  strategy: GoogleStrategy;
  /** The simulated-account dialog of the emulator strategy (rendered by the screen). */
  dialog: SimulatedAccountDialogState;
}

/**
 * "Continue with Google" (web: `AuthService.signInWithGoogle` + the pages' `google()`): the
 * strategy of this build decides where the Google identity comes from (`googleStrategy`), the
 * session signs in with it and the auth gate takes over (consent for a Google sign-up, onboarding,
 * the tabs). With `mode: 'reauthenticate'` the same identity re-proves the signed-in collector
 * before a sensitive action (account deletion of an account without a password).
 */
export function useGoogleSignIn(mode: GoogleMode = 'sign-in'): GoogleSignIn {
  const session = useSession();
  const [busy, setBusy] = useState(false);
  const [dialogVisible, setDialogVisible] = useState(false);
  const pending = useRef<{ resolve: (done: boolean) => void; reject: (e: unknown) => void } | null>(
    null
  );
  const strategy = googleStrategy(session.usesEmulator, Platform.OS, appConfig.googleClientIds);
  const lockedEmail = mode === 'reauthenticate' ? (session.user?.email ?? null) : null;

  const complete = useCallback(
    async (credential: GoogleCredential): Promise<boolean> => {
      setBusy(true);
      try {
        if (mode === 'reauthenticate') {
          await session.reauthenticateWithGoogle(credential);
        } else {
          await session.signInWithGoogle(credential);
        }
        return true;
      } catch (error) {
        // A closed window is not a failure; a blocked pop-up is explained like the web.
        if (isGoogleDismissed(error) && toAuthError(error).code !== 'auth/popup-blocked') {
          return false;
        }
        throw toAuthError(error);
      } finally {
        setBusy(false);
      }
    },
    [mode, session]
  );

  const start = useCallback(async (): Promise<boolean> => {
    switch (strategy) {
      case 'emulator':
        return new Promise<boolean>((resolve, reject) => {
          pending.current = { resolve, reject };
          setDialogVisible(true);
        });
      case 'popup':
        return complete({ kind: 'popup' });
      case 'native': {
        let tokens;
        try {
          tokens = await requestGoogleIdToken();
        } catch (error) {
          if (isGoogleDismissed(error)) {
            return false;
          }
          throw toAuthError(error);
        }
        return complete({
          kind: 'id-token',
          idToken: tokens.idToken,
          accessToken: tokens.accessToken,
        });
      }
      default:
        throw toAuthError({ code: 'auth/google-not-configured' });
    }
  }, [complete, strategy]);

  const onSubmit = useCallback(
    (email: string, displayName: string) => {
      setDialogVisible(false);
      const waiter = pending.current;
      pending.current = null;
      // A failure rejects the pending start(): the screen words it.
      complete({ kind: 'emulator', email, displayName }).then(
        (done) => waiter?.resolve(done),
        (error: unknown) => waiter?.reject(error)
      );
    },
    [complete]
  );

  const onCancel = useCallback(() => {
    setDialogVisible(false);
    const waiter = pending.current;
    pending.current = null;
    waiter?.resolve(false);
  }, []);

  return {
    start,
    busy,
    strategy,
    dialog: { visible: dialogVisible, lockedEmail, onSubmit, onCancel },
  };
}

/** The sentence a screen shows for a failed Google flow (never raw SDK text). */
export function googleErrorMessage(error: unknown): string {
  return authErrorMessage(error);
}
