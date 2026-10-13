// Isolation guards of the mobile E2E harness (npm run test:mobile:e2e, npm run test:mobile:maestro).
//
// The harness runs a second API next to whatever a developer is running. That API must never
// write into the developer's database and never point at the developer's files: on start-up the
// card image cache is reconciled with ITS database and every cached file no row references is
// deleted, so an isolated API pointed at the developer's cache would delete the developer's
// downloaded card images (ADR 0015). Everything here is pure (paths, env maps, JSON) so it is
// unit-tested in mobile-e2e-guard.test.mjs; the harness calls it before starting anything.

import path from 'node:path';

import { deleteEmulatorAccountsWhere } from './auth-emulator.mjs';
import {
  DEV_API_PORT,
  DEV_DB,
  E2E_REALTIME_CHANNEL_PREFIX as WEB_E2E_REALTIME_CHANNEL_PREFIX,
  E2E_REDIS_DB as WEB_E2E_REDIS_DB,
  databaseHostOf,
  databaseOf,
  developerDirs,
  isInside,
  isLocalHost,
  isLocalUrl,
  newRunId,
  overlaps,
  portOf,
  realPath,
  redisDatabaseOf,
  samePath,
  storageDirsOf,
  withDatabase,
  withRedisDatabase,
} from './web-e2e-guard.mjs';

// Path, storage, URL and run-id rules are shared with the web E2E harness (web-e2e-guard.mjs, one
// implementation for both); this module adds the mobile harness's own database, port, Redis
// database, realtime channels, email domain and identity block.
export { DEV_API_PORT, DEV_DB, databaseOf, developerDirs, isInside, newRunId, overlaps, realPath, storageDirsOf };

/** The only database the mobile E2E API may use (created by the harness, never the dev one). */
export const MOBILE_E2E_DB = 'orenjitrade_mobile_e2e';
/** Port of the isolated API; the developer API listens on DEV_API_PORT. */
export const MOBILE_E2E_API_PORT = 8090;
/** Port of the Expo web build served for the Playwright specs. */
export const MOBILE_E2E_WEB_PORT = 19006;
/**
 * Redis logical database of the mobile E2E API: 0 is the developer's (rate limits, discovery cache,
 * presence), 2 the web E2E harness's.
 */
export const MOBILE_E2E_REDIS_DB = 1;
/**
 * Prefix of the mobile E2E API's realtime fan-out channels. Redis pub/sub ignores the logical
 * database, so without it a push for a seed account (same id in every database) would reach the
 * developer's sessions, or the web E2E run's, and the other way round.
 */
export const MOBILE_E2E_REALTIME_CHANNEL_PREFIX = 'e2e-mobile:rt:user:';
/** The developer API's realtime prefix (application.yml default). */
const DEV_REALTIME_CHANNEL_PREFIX = 'rt:user:';
/**
 * Email domain of every account the mobile suites create. Not `example.test` (owned by the web
 * suite's purge tool) and not `orenjitrade.test` (seed accounts).
 */
export const MOBILE_E2E_EMAIL_DOMAIN = 'mobile-e2e.test';
/** Key of the identity block the isolated API publishes under /actuator/info. */
export const INFO_KEY = 'orenjiMobileE2e';

function valueOf(env, name) {
  const value = env?.[name];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/**
 * The environment of the isolated API jar on top of `base` (the developer's `.env` + shell): every
 * isolation-relevant variable is set explicitly so nothing from the developer's environment leaks
 * in (only the host and port of PostgreSQL and Redis are taken from it, for moved compose ports;
 * the guard then insists on this machine). Files live under `workDir` (.local-dev/mobile-e2e).
 */
export function mobileE2eApiEnv(base, { workDir, webPort = MOBILE_E2E_WEB_PORT }) {
  return {
    ...base,
    SPRING_PROFILES_ACTIVE: 'local',
    ORENJI_ENV: 'local',
    SERVER_PORT: String(MOBILE_E2E_API_PORT),
    DATABASE_URL: withDatabase(valueOf(base, 'DATABASE_URL'), MOBILE_E2E_DB),
    DATABASE_USERNAME: 'orenjitrade',
    DATABASE_PASSWORD: valueOf(base, 'DATABASE_PASSWORD') ?? 'orenjitrade_local',
    // Redis database 1 and its own realtime channels: rate-limit counters, caches and pushes never
    // mix with the developer's API (db 0) or the web E2E API (db 2).
    REDIS_URL: withRedisDatabase(valueOf(base, 'REDIS_URL'), MOBILE_E2E_REDIS_DB),
    REALTIME_CHANNEL_PREFIX: MOBILE_E2E_REALTIME_CHANNEL_PREFIX,
    FIREBASE_PROJECT_ID: 'orenjitrade-local',
    FIREBASE_AUTH_EMULATOR_HOST: valueOf(base, 'FIREBASE_AUTH_EMULATOR_HOST') ?? 'localhost:9099',
    STORAGE_PROVIDER: 'local',
    STORAGE_LOCAL_ROOT: path.join(workDir, 'storage'),
    // Media URLs are built from the request origin (this API), never from a developer setting.
    STORAGE_PUBLIC_BASE_URL: '',
    CARD_IMAGE_CACHE_DIR: path.join(workDir, 'card-images'),
    PROVIDER_DATA_DIR: path.join(workDir, 'provider-data'),
    // Mock catalog only (ADR 0015): no YGOPRODeck provider, no image downloads; the provider URLs
    // point at a closed local port so even an unexpected call never leaves the machine.
    CARD_IMAGE_ON_DEMAND_ENABLED: 'false',
    YGOPRODECK_ENABLED: 'false',
    YGOPRODECK_API_BASE_URL: 'http://127.0.0.1:9/api/v7/',
    YGOPRODECK_IMAGE_BASE_URL: 'http://127.0.0.1:9/images/cards/',
    CORS_ALLOWED_ORIGINS: `http://localhost:${webPort},http://127.0.0.1:${webPort}`,
    ADS_WEB_BASE_URL: `http://localhost:${webPort}`,
    EVENTS_TRANSPORT: 'local',
    PAYMENT_PROVIDER: 'fake',
    BILLING_PROVIDER: 'fake',
    DONATION_PROVIDER: 'fake',
    PUSH_PROVIDER: 'log',
    EMAIL_PROVIDER: 'log',
  };
}

/**
 * Problems that make the isolated API environment unsafe (empty when it is safe): the database
 * must be orenjitrade_mobile_e2e on this machine, the port 8090, Redis the mobile logical database
 * 1 on this machine with its own realtime channels, the media root, card image cache and provider
 * snapshots inside `workDir` (.local-dev/mobile-e2e) and apart from every developer directory, and
 * no card provider may be called (mock catalog only, ADR 0015).
 */
export function isolationProblems(env, { workDir, devDirs }) {
  const problems = [];
  const database = databaseOf(env.DATABASE_URL);
  if (database !== MOBILE_E2E_DB) {
    problems.push(
      `DATABASE_URL must point at the isolated database ${MOBILE_E2E_DB}, not ${database ?? `"${env.DATABASE_URL}"`}.`,
    );
  }
  const databaseHost = databaseHostOf(env.DATABASE_URL);
  if (database && !isLocalHost(databaseHost)) {
    problems.push(`DATABASE_URL must point at the local PostgreSQL (localhost), not ${databaseHost}.`);
  }
  if (String(env.SERVER_PORT) !== String(MOBILE_E2E_API_PORT)) {
    problems.push(`SERVER_PORT must be ${MOBILE_E2E_API_PORT} (the developer API owns ${DEV_API_PORT}), not ${env.SERVER_PORT}.`);
  }
  const redisDb = redisDatabaseOf(env.REDIS_URL);
  if (redisDb !== MOBILE_E2E_REDIS_DB) {
    problems.push(
      `REDIS_URL must select the mobile E2E Redis database ${MOBILE_E2E_REDIS_DB} (0 is the developer's, ` +
        `${WEB_E2E_REDIS_DB} the web E2E suite's), not "${env.REDIS_URL ?? ''}".`,
    );
  } else if (!isLocalHost(new URL(env.REDIS_URL).hostname)) {
    problems.push(`REDIS_URL must point at the local Redis (localhost), not ${new URL(env.REDIS_URL).hostname}.`);
  }
  const prefix = typeof env.REALTIME_CHANNEL_PREFIX === 'string' ? env.REALTIME_CHANNEL_PREFIX.trim() : '';
  if (!prefix || prefix === DEV_REALTIME_CHANNEL_PREFIX || prefix === WEB_E2E_REALTIME_CHANNEL_PREFIX) {
    problems.push(
      `REALTIME_CHANNEL_PREFIX must be the mobile E2E prefix (e.g. "${MOBILE_E2E_REALTIME_CHANNEL_PREFIX}"), not ` +
        `"${prefix}": Redis pub/sub is shared by every database, the developer API uses "${DEV_REALTIME_CHANNEL_PREFIX}" ` +
        `and the web E2E API "${WEB_E2E_REALTIME_CHANNEL_PREFIX}".`,
    );
  }
  for (const [name, label] of [
    ['STORAGE_LOCAL_ROOT', 'media storage directory'],
    ['CARD_IMAGE_CACHE_DIR', 'card image cache directory'],
    ['PROVIDER_DATA_DIR', 'provider snapshot directory'],
  ]) {
    const value = env[name];
    if (!value || !path.isAbsolute(value)) {
      problems.push(`${name} (${label}) must be an absolute path under ${workDir}, not "${value ?? ''}".`);
      continue;
    }
    if (!isInside(value, workDir) || samePath(value, workDir)) {
      problems.push(`${name} (${label}) ${realPath(value)} is not inside ${workDir}.`);
    }
    const clash = devDirs.find((dir) => overlaps(value, dir));
    if (clash) {
      problems.push(
        `${name} (${label}) ${realPath(value)} resolves to the developer's ${realPath(clash)}; ` +
          'start-up reconciliation would delete files the developer database references.',
      );
    }
  }
  if (env.STORAGE_LOCAL_ROOT && env.CARD_IMAGE_CACHE_DIR && samePath(env.STORAGE_LOCAL_ROOT, env.CARD_IMAGE_CACHE_DIR)) {
    problems.push('STORAGE_LOCAL_ROOT and CARD_IMAGE_CACHE_DIR must be different directories.');
  }
  if (String(env.CARD_IMAGE_ON_DEMAND_ENABLED) !== 'false') {
    problems.push('CARD_IMAGE_ON_DEMAND_ENABLED must be false (no card image downloads during tests).');
  }
  if (String(env.YGOPRODECK_ENABLED) !== 'false') {
    problems.push('YGOPRODECK_ENABLED must be false (tests never call YGOPRODeck; mock catalog only).');
  }
  for (const name of ['YGOPRODECK_API_BASE_URL', 'YGOPRODECK_IMAGE_BASE_URL']) {
    if (!isLocalUrl(env[name])) {
      problems.push(`${name} must point at a closed local port, not "${env[name] ?? ''}".`);
    }
  }
  return problems;
}

/** Throws when the environment is not isolated (see isolationProblems). */
export function assertIsolated(env, options) {
  const problems = isolationProblems(env, options);
  if (problems.length > 0) {
    throw new Error(
      `Refusing to start the mobile E2E API: it would not be isolated from the developer's stack.\n` +
        problems.map((problem) => `  - ${problem}`).join('\n'),
    );
  }
}

/** The only database the mobile harness may drop and recreate: orenjitrade_mobile_e2e. */
export function assertRecreatable(database) {
  if (database !== MOBILE_E2E_DB || database === DEV_DB) {
    throw new Error(`Refusing to drop database "${database}": only ${MOBILE_E2E_DB} is recreated by the mobile E2E harness.`);
  }
}

/**
 * The Redis logical database the mobile harness may FLUSHDB when it recreates its database: only
 * the mobile E2E one (1) on the local Redis. Cached rows of the dropped database (games are cached
 * for 60 s with their ids) would otherwise reach the new API: a run started right after another
 * one failed its catalog seed on a game id the new database does not have. Returns the database.
 */
export function assertFlushableRedis(redisUrl) {
  const db = redisDatabaseOf(redisUrl);
  if (db !== MOBILE_E2E_REDIS_DB) {
    throw new Error(`Refusing to flush Redis db ${db}: only the mobile E2E db ${MOBILE_E2E_REDIS_DB} is flushed.`);
  }
  if (!isLocalHost(new URL(redisUrl).hostname)) {
    throw new Error(`Refusing to flush a Redis that is not local (${new URL(redisUrl).hostname}).`);
  }
  return db;
}

/** Spring command-line arguments publishing the identity block under /actuator/info. */
export function identityArgs(instance) {
  return [
    '--management.info.env.enabled=true',
    `--info.${INFO_KEY}.database=${MOBILE_E2E_DB}`,
    `--info.${INFO_KEY}.instance=${instance}`,
  ];
}

/**
 * Whether an API answering on `url` with `/actuator/info` body `info` may be reused: only the
 * isolated API this harness started (its instance id is in the state file) on the mobile E2E
 * database. Returns null when it may, else the reason.
 */
export function reuseRefusal(url, info, expectedInstance) {
  const port = portOf(url);
  if (port === null) {
    return `${url} is not a valid URL.`;
  }
  if (!isLocalUrl(url)) {
    return `${url} is not on this machine; the mobile suites only run against a local stack.`;
  }
  if (port === DEV_API_PORT) {
    return (
      `${url} is the developer API (port ${DEV_API_PORT}, database ${DEV_DB}); the mobile suites never use it. ` +
      `They only reuse an API they started themselves on :${MOBILE_E2E_API_PORT} (npm run test:mobile:e2e -- --keep-running).`
    );
  }
  const identity = info && typeof info === 'object' ? info[INFO_KEY] : undefined;
  if (!identity) {
    return (
      `The API on ${url} was not started by the mobile E2E harness (no ${INFO_KEY} block in /actuator/info); ` +
      'refusing to reuse it, it may write into another database.'
    );
  }
  if (identity.database !== MOBILE_E2E_DB) {
    return `The API on ${url} uses the database ${identity.database}, not ${MOBILE_E2E_DB}; refusing to reuse it.`;
  }
  if (expectedInstance !== undefined && identity.instance !== expectedInstance) {
    return (
      `The API on ${url} is a mobile E2E API but not the one recorded in the harness state file ` +
      `(instance ${identity.instance}); refusing to reuse it.`
    );
  }
  return null;
}

/** Prefix of the local part of every account email of one run. */
export function runEmailPrefix(runId) {
  if (!/^[a-z0-9]{3,16}$/.test(runId)) {
    throw new Error(`Invalid run id "${runId}" (3-16 lowercase letters or digits).`);
  }
  return `m-${runId}-`;
}

/** True only for an account created by the run `runId` (never seeds, never other suites). */
export function isRunAccount(email, runId) {
  const value = String(email ?? '').toLowerCase();
  return value.startsWith(runEmailPrefix(runId)) && value.endsWith(`@${MOBILE_E2E_EMAIL_DOMAIN}`);
}

/**
 * Deletes, best effort, the Firebase Auth emulator accounts created by the run `runId`
 * (`m-<runId>-...@mobile-e2e.test`), and nothing else. Uses the emulator's owner credential through
 * the shared helper (local emulator URLs only). Returns the number of deleted accounts.
 */
export async function deleteRunAccounts({ emulatorUrl, projectId, runId, fetchImpl = fetch }) {
  runEmailPrefix(runId);
  const deleted = await deleteEmulatorAccountsWhere({
    emulatorUrl,
    projectId,
    predicate: (email) => isRunAccount(email, runId),
    fetchImpl,
  });
  return deleted.length;
}
