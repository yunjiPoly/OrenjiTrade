import {
  AuthRequest,
  ResponseType,
  exchangeCodeAsync,
  makeRedirectUri,
  type AuthSessionResult,
} from 'expo-auth-session';
import { Platform } from 'react-native';

import { appConfig, type AppConfig } from '@/src/config/env';

import { AuthError } from './authErrors';

/** Google's OpenID Connect endpoints (the same values as expo-auth-session's Google provider). */
export const GOOGLE_DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
  userInfoEndpoint: 'https://openidconnect.googleapis.com/v1/userinfo',
};

/** Application id of the native builds (app.config.ts: iOS bundle id and Android package). */
export const APPLICATION_ID = 'com.orenjitrade.app';

/** Scopes Firebase needs to build the user (the provider's minimum scopes). */
export const GOOGLE_SCOPES = ['openid', 'profile', 'email'];

/** The OAuth client id of this platform (`null` when the build has none). */
export function googleClientIdFor(
  platform: string,
  ids: AppConfig['googleClientIds'] = appConfig.googleClientIds
): string | null {
  switch (platform) {
    case 'android':
      return ids.android;
    case 'ios':
      return ids.ios;
    default:
      return ids.web;
  }
}

export interface GoogleTokens {
  idToken: string;
  accessToken: string | null;
}

/**
 * Google sign-in on a device through the system browser (expo-auth-session): an authorization
 * code with PKCE on the platform's OAuth client (redirect `<application id>:/oauthredirect`, the
 * installed-app flow Google expects), exchanged for the ID token Firebase verifies. Never used
 * against the local Auth emulator (which has no Google) and never on the web build (Firebase's
 * pop-up). Rejects with `auth/google-not-configured` without a client id, `auth/google-cancelled`
 * when the browser was closed, `auth/google-no-token` when Google answered without a token.
 */
export async function requestGoogleIdToken(
  clientId: string | null = googleClientIdFor(Platform.OS),
  prompt: (request: AuthRequest) => Promise<AuthSessionResult> = (request) =>
    request.promptAsync(GOOGLE_DISCOVERY)
): Promise<GoogleTokens> {
  if (!clientId) {
    throw new AuthError('auth/google-not-configured');
  }
  const redirectUri = makeRedirectUri({ native: `${APPLICATION_ID}:/oauthredirect` });
  const request = new AuthRequest({
    clientId,
    redirectUri,
    scopes: GOOGLE_SCOPES,
    responseType: ResponseType.Code,
    usePKCE: true,
    extraParams: { prompt: 'select_account' },
  });
  const result = await prompt(request);
  if (result.type === 'cancel' || result.type === 'dismiss' || result.type === 'locked') {
    throw new AuthError('auth/google-cancelled');
  }
  if (result.type !== 'success' || !result.params.code) {
    throw new AuthError('auth/google-no-token');
  }
  const tokens = await exchangeCodeAsync(
    {
      clientId,
      redirectUri,
      code: result.params.code,
      extraParams: { code_verifier: request.codeVerifier ?? '' },
    },
    GOOGLE_DISCOVERY
  );
  if (!tokens.idToken) {
    throw new AuthError('auth/google-no-token');
  }
  return { idToken: tokens.idToken, accessToken: tokens.accessToken ?? null };
}
