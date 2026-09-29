import { Platform } from 'react-native';

import type { FirebaseApp, FirebaseOptions } from 'firebase/app';
import type { Auth, Persistence } from 'firebase/auth';

/**
 * `getReactNativePersistence` ships in the React Native build of `@firebase/auth` (selected by
 * Metro through the `react-native` export condition) but the package's `types` condition wins in
 * TypeScript, so the public typings omit it. This narrow type documents the runtime contract.
 */
export type FirebaseAuthModule = typeof import('firebase/auth') & {
  getReactNativePersistence: (storage: unknown) => Persistence;
};

/**
 * Lazy Firebase bootstrap. Nothing here runs at import time: the SDK is loaded with dynamic
 * imports the first time `getFirebaseAuth()` is awaited, which keeps startup fast and keeps
 * unit tests free of Firebase (they mock `firebase/app` and `firebase/auth`).
 */

export interface FirebaseEnvConfig extends FirebaseOptions {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId?: string;
}

/** The raw `EXPO_PUBLIC_FIREBASE_*` values, before validation. */
export interface FirebaseEnvInput {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  appId?: string;
  authEmulatorHost?: string;
}

export class FirebaseConfigError extends Error {
  readonly name = 'FirebaseConfigError';
}

/**
 * Expo inlines `process.env.EXPO_PUBLIC_*` only when the member expression is written out
 * literally (babel-preset-expo `inline-env-vars`), so every variable is read here, once, and
 * never through an `env.X` alias.
 */
export function readFirebaseEnv(): FirebaseEnvInput {
  return {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
    authEmulatorHost: process.env.EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST,
  };
}

export function readFirebaseConfig(env: FirebaseEnvInput = readFirebaseEnv()): FirebaseEnvConfig {
  const apiKey = env.apiKey?.trim();
  const authDomain = env.authDomain?.trim();
  const projectId = env.projectId?.trim();
  const appId = env.appId?.trim();

  const missing = [
    ['EXPO_PUBLIC_FIREBASE_API_KEY', apiKey],
    ['EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN', authDomain],
    ['EXPO_PUBLIC_FIREBASE_PROJECT_ID', projectId],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0 || !apiKey || !authDomain || !projectId) {
    throw new FirebaseConfigError(
      `Firebase is not configured. Missing: ${missing.join(', ')}. Copy .env.example to .env.`
    );
  }

  return { apiKey, authDomain, projectId, ...(appId ? { appId } : {}) };
}

/**
 * `host:port` of the Auth emulator when `EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST` is set.
 * On a physical device this must be the LAN address of the machine running `docker compose`
 * (for example `192.168.1.20:9099`); `localhost` would point at the phone itself. Android
 * emulators reach the host through `10.0.2.2:9099`.
 */
export function readAuthEmulatorHost(env: FirebaseEnvInput = readFirebaseEnv()): string | null {
  const value = env.authEmulatorHost?.trim();
  return value ? value.replace(/^https?:\/\//, '').replace(/\/+$/, '') : null;
}

let appPromise: Promise<FirebaseApp> | null = null;
let authModulePromise: Promise<FirebaseAuthModule> | null = null;
let authPromise: Promise<Auth> | null = null;

export function getFirebaseApp(): Promise<FirebaseApp> {
  if (appPromise === null) {
    appPromise = (async () => {
      const { getApps, getApp, initializeApp } = await import('firebase/app');
      return getApps().length > 0 ? getApp() : initializeApp(readFirebaseConfig());
    })().catch((error: unknown) => {
      appPromise = null;
      throw error;
    });
  }
  return appPromise;
}

/** The `firebase/auth` module (loaded once). Exposed so the session can call SDK functions. */
export function getFirebaseAuthModule(): Promise<FirebaseAuthModule> {
  if (authModulePromise === null) {
    authModulePromise = import('firebase/auth')
      .then((module) => module as unknown as FirebaseAuthModule)
      .catch((error: unknown) => {
        authModulePromise = null;
        throw error;
      });
  }
  return authModulePromise;
}

export function getFirebaseAuth(): Promise<Auth> {
  if (authPromise === null) {
    authPromise = (async () => {
      const app = await getFirebaseApp();
      const authModule = await getFirebaseAuthModule();

      let auth: Auth;
      if (Platform.OS === 'web') {
        // Browser persistence (IndexedDB/localStorage) is the SDK default on web.
        auth = authModule.getAuth(app);
      } else {
        const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
        auth = authModule.initializeAuth(app, {
          persistence: authModule.getReactNativePersistence(AsyncStorage),
        });
      }

      const emulatorHost = readAuthEmulatorHost();
      if (emulatorHost) {
        authModule.connectAuthEmulator(auth, `http://${emulatorHost}`, { disableWarnings: true });
      }
      return auth;
    })().catch((error: unknown) => {
      authPromise = null;
      throw error;
    });
  }
  return authPromise;
}

/** Test-only: forget the cached instances. */
export function __resetFirebaseForTests(): void {
  appPromise = null;
  authModulePromise = null;
  authPromise = null;
}
