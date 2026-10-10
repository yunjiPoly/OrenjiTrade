/** Public Firebase web configuration (safe to ship; restricted by domain in the Firebase console). */
export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
}

export type AppEnvironment = 'local' | 'development' | 'staging' | 'production';

/**
 * Runtime configuration served from `/config.json`.
 * The same build is deployed to every environment; only this file differs
 * (rendered from environment variables by `docker-entrypoint.sh`).
 */
export interface AppConfig {
  /** API origin, e.g. `http://localhost:8080`. Empty string means same-origin. */
  apiBaseUrl: string;
  /** WebSocket endpoint, e.g. `ws://localhost:8080/ws`. */
  wsBaseUrl: string;
  firebase: FirebaseWebConfig;
  /** `host:port` of the Firebase Auth emulator; empty in cloud environments. */
  firebaseAuthEmulatorHost: string;
  environment: AppEnvironment | string;
}

/** Defaults used when `/config.json` is missing or invalid (local development). */
export const DEFAULT_APP_CONFIG: AppConfig = {
  apiBaseUrl: 'http://localhost:8080',
  wsBaseUrl: 'ws://localhost:8080/ws',
  firebase: {
    apiKey: '',
    authDomain: '',
    projectId: '',
    appId: '',
  },
  firebaseAuthEmulatorHost: '',
  environment: 'local',
};

const str = (value: unknown, fallback: string): string =>
  typeof value === 'string' ? value : fallback;

/** Merges an untrusted JSON payload over the defaults, ignoring unknown or malformed fields. */
export function normalizeAppConfig(raw: unknown): AppConfig {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const firebase = (
    input['firebase'] && typeof input['firebase'] === 'object' ? input['firebase'] : {}
  ) as Record<string, unknown>;
  const d = DEFAULT_APP_CONFIG;
  return {
    apiBaseUrl: str(input['apiBaseUrl'], d.apiBaseUrl).replace(/\/+$/, ''),
    wsBaseUrl: str(input['wsBaseUrl'], d.wsBaseUrl),
    firebase: {
      apiKey: str(firebase['apiKey'], d.firebase.apiKey),
      authDomain: str(firebase['authDomain'], d.firebase.authDomain),
      projectId: str(firebase['projectId'], d.firebase.projectId),
      appId: str(firebase['appId'], d.firebase.appId),
    },
    firebaseAuthEmulatorHost: str(input['firebaseAuthEmulatorHost'], d.firebaseAuthEmulatorHost),
    environment: str(input['environment'], d.environment),
  };
}
