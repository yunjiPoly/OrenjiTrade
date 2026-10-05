import { Platform } from 'react-native';

import type { FirebaseApp } from 'firebase/app';
import type { Auth, Persistence } from 'firebase/auth';

import { appConfig, type AppConfig } from '@/src/config/env';

/**
 * `getReactNativePersistence` ships in the React Native build of `@firebase/auth` (selected by
 * Metro through the `react-native` export condition) but the package's `types` condition wins in
 * TypeScript, so the public typings omit it. This narrow type documents the runtime contract.
 */
export type FirebaseAuthModule = typeof import('firebase/auth') & {
  getReactNativePersistence?: (storage: unknown) => Persistence;
};

/**
 * Lazy Firebase bootstrap. Nothing runs at import time: the SDK is loaded with dynamic imports
 * the first time `getFirebaseAuth()` is awaited, which keeps start-up fast, keeps the static web
 * render free of browser APIs and keeps unit tests free of Firebase (they use a fake port).
 *
 * Persistence: see `authPersistence` (AsyncStorage on iOS/Android, IndexedDB then localStorage on
 * web). With `authEmulatorHost` set, every call goes to the
 * local Firebase Auth emulator (`docker compose`), never to Google.
 */

type PersistenceSdk = Pick<
  FirebaseAuthModule,
  | 'indexedDBLocalPersistence'
  | 'browserLocalPersistence'
  | 'inMemoryPersistence'
  | 'getReactNativePersistence'
>;

/**
 * The persistence `initializeAuth` gets on a platform:
 * - web: IndexedDB, then localStorage, WITHOUT a popup/redirect resolver (the app only signs in
 *   with email and password, and `getAuth()` would load Google's gapi iframe on every start, even
 *   against the local emulator);
 * - iOS/Android: AsyncStorage through `getReactNativePersistence`, so the session survives a
 *   restart. Browser storage does not exist there: if the React Native build of `@firebase/auth`
 *   was not resolved (a bundler misconfiguration), the session is kept in memory (signed out on
 *   the next launch) instead of crashing on IndexedDB.
 */
export function authPersistence(
  platform: string,
  sdk: PersistenceSdk,
  storage: unknown
): Persistence | Persistence[] {
  if (platform === 'web') {
    return [sdk.indexedDBLocalPersistence, sdk.browserLocalPersistence];
  }
  if (sdk.getReactNativePersistence && storage) {
    return sdk.getReactNativePersistence(storage);
  }
  console.warn(
    '[OrenjiTrade] Firebase Auth has no React Native persistence in this build; the session is kept in memory only.'
  );
  return sdk.inMemoryPersistence;
}

let appPromise: Promise<FirebaseApp> | null = null;
let authModulePromise: Promise<FirebaseAuthModule> | null = null;
let authPromise: Promise<Auth> | null = null;

export function getFirebaseApp(config: AppConfig = appConfig): Promise<FirebaseApp> {
  if (appPromise === null) {
    appPromise = (async () => {
      const { getApps, getApp, initializeApp } = await import('firebase/app');
      return getApps().length > 0 ? getApp() : initializeApp(config.firebase);
    })().catch((error: unknown) => {
      appPromise = null;
      throw error;
    });
  }
  return appPromise;
}

/** The `firebase/auth` module (loaded once). */
export function getFirebaseAuthModule(): Promise<FirebaseAuthModule> {
  if (authModulePromise === null) {
    authModulePromise = import('firebase/auth')
      .then((module) => module as FirebaseAuthModule)
      .catch((error: unknown) => {
        authModulePromise = null;
        throw error;
      });
  }
  return authModulePromise;
}

export function getFirebaseAuth(config: AppConfig = appConfig): Promise<Auth> {
  if (authPromise === null) {
    authPromise = (async () => {
      const app = await getFirebaseApp(config);
      const sdk = await getFirebaseAuthModule();

      const storage =
        Platform.OS === 'web'
          ? null
          : (await import('@react-native-async-storage/async-storage')).default;
      const auth: Auth = sdk.initializeAuth(app, {
        persistence: authPersistence(Platform.OS, sdk, storage),
      });

      if (config.authEmulatorHost) {
        sdk.connectAuthEmulator(auth, `http://${config.authEmulatorHost}`, {
          disableWarnings: true,
        });
      }
      return auth;
    })().catch((error: unknown) => {
      authPromise = null;
      throw error;
    });
  }
  return authPromise;
}
