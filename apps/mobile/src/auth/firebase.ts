import { Platform } from 'react-native';

import type { FirebaseApp, FirebaseOptions } from 'firebase/app';
import type { Auth, Persistence } from 'firebase/auth';

/**
 * `getReactNativePersistence` ships in the React Native build of `@firebase/auth` (selected by
 * Metro through the `react-native` export condition) but the package's `types` condition wins in
 * TypeScript, so the public typings omit it. This narrow type documents the runtime contract.
 */
type ReactNativeAuthModule = typeof import('firebase/auth') & {
  getReactNativePersistence: (storage: unknown) => Persistence;
};

/**
 * Lazy Firebase bootstrap. Nothing here runs at import time: the SDK is loaded with dynamic
 * imports the first time `getFirebaseAuth()` is awaited, which keeps startup fast and keeps
 * unit tests free of Firebase.
 */

export interface FirebaseEnvConfig extends FirebaseOptions {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId?: string;
}

export class FirebaseConfigError extends Error {
  readonly name = 'FirebaseConfigError';
}

export function readFirebaseConfig(env: NodeJS.ProcessEnv = process.env): FirebaseEnvConfig {
  const apiKey = env.EXPO_PUBLIC_FIREBASE_API_KEY?.trim();
  const authDomain = env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim();
  const projectId = env.EXPO_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  const appId = env.EXPO_PUBLIC_FIREBASE_APP_ID?.trim();

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

/** `host:port` of the Auth emulator when `EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST` is set. */
export function readAuthEmulatorHost(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = env.EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST?.trim();
  return value ? value : null;
}

let appPromise: Promise<FirebaseApp> | null = null;
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

export function getFirebaseAuth(): Promise<Auth> {
  if (authPromise === null) {
    authPromise = (async () => {
      const app = await getFirebaseApp();
      const authModule = (await import('firebase/auth')) as unknown as ReactNativeAuthModule;

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
  authPromise = null;
}
