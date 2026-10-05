import { Platform } from 'react-native';

/**
 * The one typed configuration module of the app. Every value is PUBLIC: `EXPO_PUBLIC_*`
 * variables are inlined into the JS bundle at build time (CLAUDE.md: never put secrets in a
 * frontend bundle). Defaults target the local stack (`docker compose up -d` + the API on :8080):
 *
 * - the Android emulator reaches the development machine at `10.0.2.2`;
 * - the iOS simulator and the web build use `localhost`;
 * - a physical device needs the machine's LAN address in `.env` (see `.env.example`).
 *
 * Expo only inlines `process.env.EXPO_PUBLIC_X` when the member expression is written out
 * literally, so every variable is read here, once, and never through an alias.
 */

export type RuntimePlatform = 'ios' | 'android' | 'web' | (string & {});

/** Raw `EXPO_PUBLIC_*` values before validation (all optional). */
export interface RawEnv {
  apiBaseUrl?: string;
  firebaseApiKey?: string;
  firebaseAuthDomain?: string;
  firebaseProjectId?: string;
  firebaseAppId?: string;
  /** `host:port`, or `off` to talk to the real Firebase project. */
  authEmulatorHost?: string;
  /** The project's own Google Maps Android key (public, app-restricted), baked into a build. */
  googleMapsApiKey?: string;
}

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId?: string;
}

export interface AppConfig {
  /** API origin without a trailing slash, e.g. `http://localhost:8080`. */
  apiBaseUrl: string;
  firebase: FirebaseWebConfig;
  /** `host:port` of the Firebase Auth emulator, or `null` for the real Firebase project. */
  authEmulatorHost: string | null;
  /**
   * Whether the build carries the project's own Google Maps Android key (app.config.ts). Without
   * it, Android maps use the Leaflet + OpenStreetMap fallback (src/components/map/mapEngine.ts).
   */
  googleMapsKeyConfigured: boolean;
}

/** Public values of the local Firebase project used with the Auth emulator. */
export const LOCAL_FIREBASE: FirebaseWebConfig = {
  apiKey: 'demo-local-key',
  authDomain: 'orenjitrade-local.firebaseapp.com',
  projectId: 'orenjitrade-local',
};

export const API_PORT = 8080;
export const AUTH_EMULATOR_PORT = 9099;

/** Host of the development machine as seen from the platform's emulator/simulator/browser. */
export function devHostFor(platform: RuntimePlatform): string {
  return platform === 'android' ? '10.0.2.2' : 'localhost';
}

const DISABLED = new Set(['off', 'none', 'false', 'disabled']);

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function readRawEnv(): RawEnv {
  return {
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
    firebaseApiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    firebaseAuthDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    firebaseProjectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    firebaseAppId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
    authEmulatorHost: process.env.EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST,
    googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
  };
}

/** Resolves the configuration for a platform; pure, so every default is unit-tested. */
export function resolveConfig(raw: RawEnv, platform: RuntimePlatform): AppConfig {
  const host = devHostFor(platform);
  const apiBaseUrl = (clean(raw.apiBaseUrl) ?? `http://${host}:${API_PORT}`).replace(/\/+$/, '');

  const projectId = clean(raw.firebaseProjectId) ?? LOCAL_FIREBASE.projectId;
  const appId = clean(raw.firebaseAppId);
  const firebase: FirebaseWebConfig = {
    apiKey: clean(raw.firebaseApiKey) ?? LOCAL_FIREBASE.apiKey,
    authDomain: clean(raw.firebaseAuthDomain) ?? `${projectId}.firebaseapp.com`,
    projectId,
    ...(appId ? { appId } : {}),
  };

  const emulatorRaw = clean(raw.authEmulatorHost);
  let authEmulatorHost: string | null;
  if (emulatorRaw === undefined) {
    // No explicit value: the local project always runs against the emulator.
    authEmulatorHost =
      firebase.projectId === LOCAL_FIREBASE.projectId ? `${host}:${AUTH_EMULATOR_PORT}` : null;
  } else if (DISABLED.has(emulatorRaw.toLowerCase())) {
    authEmulatorHost = null;
  } else {
    authEmulatorHost = emulatorRaw.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  }

  return {
    apiBaseUrl,
    firebase,
    authEmulatorHost,
    googleMapsKeyConfigured: clean(raw.googleMapsApiKey) !== undefined,
  };
}

/** The configuration of this build. */
export const appConfig: AppConfig = resolveConfig(readRawEnv(), Platform.OS);
