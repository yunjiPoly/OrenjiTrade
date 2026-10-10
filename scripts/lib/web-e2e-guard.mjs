// Isolation rules of the web E2E harness (npm run test:e2e) and of the test-data purge
// (npm run e2e:purge).
//
// The harness runs its own API next to the developer's `npm run dev`. That API must never write
// into the developer's database, Redis keys or files: on start-up the card image cache is
// reconciled with ITS database and every cached file no row references is deleted, so an E2E API
// pointed at the developer's cache directory would delete the developer's downloaded Yu-Gi-Oh!
// images (ADR 0015). Everything here is pure (paths, env maps, JSON) so it is unit-tested in
// web-e2e-guard.test.mjs; the harness and the purge call it before they touch anything.

import fs from 'node:fs';
import path from 'node:path';

/** The only database the web E2E API may use (recreated by the harness, never the dev one). */
export const E2E_DB = 'orenjitrade_e2e';
/** The developer's database (docker compose default): the E2E harness never touches it. */
export const DEV_DB = 'orenjitrade';
/** Default ports of the E2E stack (E2E_API_PORT / E2E_WEB_PORT override them). */
export const E2E_API_PORT = 8180;
export const E2E_WEB_PORT = 4300;
/** Ports of the developer stack (`npm run dev`). */
export const DEV_API_PORT = 8080;
export const DEV_WEB_PORT = 4200;
/**
 * Ports the E2E stack must never take: the developer stack, the Expo/Metro dev servers and the
 * mobile E2E harness (API :8090, Expo web :19006, Metro :8082).
 */
export const RESERVED_PORTS = Object.freeze({
  [DEV_API_PORT]: 'the developer API (npm run dev)',
  [DEV_WEB_PORT]: 'the developer web server (npm run dev)',
  8081: 'the Expo / Metro dev server',
  8082: 'the mobile E2E Metro server',
  8090: 'the mobile E2E API',
  19006: 'the Expo web dev server / mobile E2E web build',
});
/**
 * Redis logical database of the E2E API: 0 is the developer's (rate limits, discovery cache, presence),
 * 1 the mobile E2E harness's.
 */
export const E2E_REDIS_DB = 2;
/**
 * Prefix of the E2E API's realtime fan-out channels. Redis pub/sub ignores the logical database,
 * so without it a push for a seed account (same id in every database) would reach the developer's
 * browser sessions and the other way round.
 */
export const E2E_REALTIME_CHANNEL_PREFIX = 'e2e-web:rt:user:';
/** Key of the identity block the E2E API publishes under /actuator/info. */
export const INFO_KEY = 'orenjiWebE2e';
/**
 * Email domain of every account the web suites create (`e2e-<run id>-<prefix>-<suffix>@example.test`).
 * Seed accounts use `orenjitrade.test`, the mobile suites `mobile-e2e.test`.
 */
export const E2E_EMAIL_DOMAIN = 'example.test';
export const SEED_EMAIL_DOMAIN = 'orenjitrade.test';
/** Hosts that count as "this machine". */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

const SAME_CASE = process.platform !== 'win32';

/** True for localhost, 127.0.0.1 and ::1 (with or without brackets). */
export function isLocalHost(hostname) {
  return LOCAL_HOSTS.has(String(hostname ?? '').toLowerCase());
}

/** True when `url` is an http(s) URL on this machine. */
export function isLocalUrl(url) {
  try {
    const parsed = new URL(url);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && isLocalHost(parsed.hostname);
  } catch {
    return false;
  }
}

/** Port of an http(s) URL (80/443 when implicit), null when unparsable. */
export function portOf(url) {
  try {
    const parsed = new URL(url);
    if (parsed.port) {
      return Number(parsed.port);
    }
    return parsed.protocol === 'https:' ? 443 : 80;
  } catch {
    return null;
  }
}

/** Absolute, symlink/junction-resolved form of a path that may not exist yet. */
export function realPath(candidate) {
  let current = path.resolve(candidate);
  const missing = [];
  for (;;) {
    try {
      const resolved = fs.realpathSync.native(current);
      return path.join(resolved, ...missing.reverse());
    } catch {
      const parent = path.dirname(current);
      if (parent === current) {
        return path.resolve(candidate);
      }
      missing.push(path.basename(current));
      current = parent;
    }
  }
}

function comparable(candidate) {
  const resolved = realPath(candidate).replace(/[\\/]+$/, '');
  return SAME_CASE ? resolved : resolved.toLowerCase();
}

/** True when both paths name the same directory (after resolving links; case-insensitive on Windows). */
export function samePath(a, b) {
  return comparable(a) === comparable(b);
}

/** True when `child` is `parent` or lies inside it (after resolving links). */
export function isInside(child, parent) {
  const relative = path.relative(comparable(parent), comparable(child));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/** True when one directory is, contains, or lies inside the other. */
export function overlaps(a, b) {
  return isInside(a, b) || isInside(b, a);
}

function valueOf(env, name) {
  const value = env?.[name];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/**
 * The media root and card image cache an API started in `cwd` uses with `env` (same rules as
 * application.yml: STORAGE_LOCAL_ROOT defaults to ./.local-storage, CARD_IMAGE_CACHE_DIR to
 * <STORAGE_LOCAL_ROOT>/card-images, both relative to the API's working directory).
 */
export function storageDirsOf(cwd, env = {}) {
  const mediaRoot = path.resolve(cwd, valueOf(env, 'STORAGE_LOCAL_ROOT') ?? './.local-storage');
  const cardImages = valueOf(env, 'CARD_IMAGE_CACHE_DIR')
    ? path.resolve(cwd, valueOf(env, 'CARD_IMAGE_CACHE_DIR'))
    : path.join(mediaRoot, 'card-images');
  return { mediaRoot, cardImages };
}

/**
 * Every directory a developer API of this repository may use: the defaults of each checkout
 * (`apiDirs`: this one and the other git worktrees, as `npm run dev` runs the API in apps/api) and
 * the values of the developer's environment (`.env` + shell), resolved against each checkout.
 */
export function developerDirs(apiDirs, devEnv = {}) {
  const dirs = new Set();
  for (const apiDir of apiDirs) {
    for (const dir of Object.values(storageDirsOf(apiDir, {}))) {
      dirs.add(dir);
    }
    for (const dir of Object.values(storageDirsOf(apiDir, devEnv))) {
      dirs.add(dir);
    }
  }
  return [...dirs];
}

/** Database name of a `jdbc:postgresql://host:port/<db>?...` URL (null when unparsable). */
export function databaseOf(jdbcUrl) {
  const match = /^jdbc:postgresql:\/\/[^/]+\/([^?;/]+)/i.exec(String(jdbcUrl ?? '').trim());
  return match ? match[1] : null;
}

/** Host of a `jdbc:postgresql://host:port/<db>` URL (null when unparsable). */
export function databaseHostOf(jdbcUrl) {
  const match = /^jdbc:postgresql:\/\/(\[[^\]]+\]|[^/:]+)/i.exec(String(jdbcUrl ?? '').trim());
  return match ? match[1] : null;
}

/** Logical database of a `redis://host:port/<db>` URL (0 when absent, null when unparsable). */
export function redisDatabaseOf(redisUrl) {
  try {
    const parsed = new URL(String(redisUrl ?? ''));
    if (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') {
      return null;
    }
    const segment = parsed.pathname.replace(/^\/+/, '');
    if (segment === '') {
      return 0;
    }
    return /^\d+$/.test(segment) ? Number(segment) : null;
  } catch {
    return null;
  }
}

/** Why `port` cannot be used by the E2E stack (null when it can). */
export function portProblem(label, port) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    return `${label} port must be a number between 1024 and 65535, not "${port}".`;
  }
  const owner = RESERVED_PORTS[port];
  return owner ? `${label} port ${port} belongs to ${owner}; the E2E stack never uses it.` : null;
}

/**
 * `jdbcUrl` with its database replaced by `database` (host, port and parameters kept); the docker
 * compose default when `jdbcUrl` is empty or unparsable.
 */
export function withDatabase(jdbcUrl, database) {
  const match = /^(jdbc:postgresql:\/\/[^/]+\/)[^?;/]+(.*)$/i.exec(String(jdbcUrl ?? '').trim());
  return match ? `${match[1]}${database}${match[2]}` : `jdbc:postgresql://localhost:5432/${database}`;
}

/** `redisUrl` with its logical database replaced by `db`; the docker compose default when empty. */
export function withRedisDatabase(redisUrl, db) {
  try {
    const parsed = new URL(String(redisUrl ?? ''));
    if (parsed.protocol === 'redis:' || parsed.protocol === 'rediss:') {
      parsed.pathname = `/${db}`;
      return parsed.toString();
    }
  } catch {
    // fall through to the default
  }
  return `redis://localhost:6379/${db}`;
}

/**
 * The environment of the E2E API jar on top of `base` (the developer's `.env` + shell): every
 * isolation-relevant variable is set explicitly so nothing from the developer's environment leaks
 * in (only the host and port of PostgreSQL and Redis are taken from it, for moved compose ports).
 */
export function e2eApiEnv(base, { apiPort, webPort, workDir }) {
  return {
    ...base,
    SPRING_PROFILES_ACTIVE: 'local',
    ORENJI_ENV: 'local',
    SERVER_PORT: String(apiPort),
    DATABASE_URL: withDatabase(valueOf(base, 'DATABASE_URL'), E2E_DB),
    DATABASE_USERNAME: 'orenjitrade',
    DATABASE_PASSWORD: 'orenjitrade_local',
    REDIS_URL: withRedisDatabase(valueOf(base, 'REDIS_URL'), E2E_REDIS_DB),
    REALTIME_CHANNEL_PREFIX: E2E_REALTIME_CHANNEL_PREFIX,
    STORAGE_PROVIDER: 'local',
    STORAGE_LOCAL_ROOT: path.join(workDir, 'media'),
    STORAGE_PUBLIC_BASE_URL: '',
    CARD_IMAGE_CACHE_DIR: path.join(workDir, 'card-images'),
    PROVIDER_DATA_DIR: path.join(workDir, 'provider-data'),
    // Mock catalog only: no card image downloads, no YGOPRODeck call (ADR 0015).
    CARD_IMAGE_ON_DEMAND_ENABLED: 'false',
    YGOPRODECK_ENABLED: 'false',
    YGOPRODECK_API_BASE_URL: 'http://127.0.0.1:9/api/v7/',
    YGOPRODECK_IMAGE_BASE_URL: 'http://127.0.0.1:9/images/cards/',
    CORS_ALLOWED_ORIGINS: `http://localhost:${webPort}`,
    ADS_WEB_BASE_URL: `http://localhost:${webPort}`,
    FIREBASE_PROJECT_ID: 'orenjitrade-local',
    FIREBASE_AUTH_EMULATOR_HOST: valueOf(base, 'FIREBASE_AUTH_EMULATOR_HOST') ?? 'localhost:9099',
    EVENTS_TRANSPORT: 'local',
    PAYMENT_PROVIDER: 'fake',
    BILLING_PROVIDER: 'fake',
    DONATION_PROVIDER: 'fake',
    PUSH_PROVIDER: 'log',
    EMAIL_PROVIDER: 'log',
  };
}

/**
 * Problems that make the E2E API environment unsafe (empty when it is safe): the database must be
 * orenjitrade_e2e on this machine, Redis a non-developer logical database, the port none of the
 * reserved ones, the media root and card image cache inside `workDir` (.local-dev/e2e) and apart
 * from every developer directory, and no card provider may be called (mock catalog only).
 */
export function isolationProblems(env, { workDir, devDirs }) {
  const problems = [];
  const database = databaseOf(env.DATABASE_URL);
  if (database !== E2E_DB) {
    problems.push(`DATABASE_URL must point at the E2E database ${E2E_DB}, not ${database ?? `"${env.DATABASE_URL}"`}.`);
  }
  const databaseHost = databaseHostOf(env.DATABASE_URL);
  if (database && !isLocalHost(databaseHost)) {
    problems.push(`DATABASE_URL must point at the local PostgreSQL (localhost), not ${databaseHost}.`);
  }
  const redisDb = redisDatabaseOf(env.REDIS_URL);
  if (redisDb === null || redisDb === 0) {
    problems.push(
      `REDIS_URL must select a Redis database other than the developer's 0 (e.g. redis://localhost:6379/${E2E_REDIS_DB}), not "${env.REDIS_URL ?? ''}".`,
    );
  } else if (!isLocalHost(new URL(env.REDIS_URL).hostname)) {
    problems.push(`REDIS_URL must point at the local Redis (localhost), not ${new URL(env.REDIS_URL).hostname}.`);
  }
  if (!valueOf(env, 'REALTIME_CHANNEL_PREFIX') || env.REALTIME_CHANNEL_PREFIX === 'rt:user:') {
    problems.push('REALTIME_CHANNEL_PREFIX must differ from the developer API\'s "rt:user:" (Redis pub/sub is shared by every database).');
  }
  const portIssue = portProblem('SERVER_PORT', Number(env.SERVER_PORT));
  if (portIssue) {
    problems.push(portIssue);
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
          'start-up reconciliation would delete the files the developer database references.',
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
      `Refusing to start the E2E API: it would not be isolated from the developer's stack.\n` +
        problems.map((problem) => `  - ${problem}`).join('\n'),
    );
  }
}

/** The database the harness may drop and recreate: only the E2E one. */
export function assertRecreatable(database) {
  if (database !== E2E_DB || database === DEV_DB) {
    throw new Error(`Refusing to drop database "${database}": only ${E2E_DB} is recreated by the E2E harness.`);
  }
}

/** Spring command-line arguments publishing the identity block under /actuator/info. */
export function identityArgs(instance) {
  return [
    '--management.info.env.enabled=true',
    `--info.${INFO_KEY}.database=${E2E_DB}`,
    `--info.${INFO_KEY}.instance=${instance}`,
  ];
}

/** The identity block of an /actuator/info body (null when absent). */
export function identityOf(info) {
  const identity = info && typeof info === 'object' ? info[INFO_KEY] : undefined;
  return identity && typeof identity === 'object' ? identity : null;
}

/**
 * Whether the API answering on `url` with `/actuator/info` body `info` may be reused: only an E2E
 * API on the E2E database, and when `expectedInstance` is given the one recorded in the harness
 * state file. Returns null when it may, else the reason.
 */
export function reuseRefusal(url, info, expectedInstance) {
  const port = portOf(url);
  if (port === null) {
    return `${url} is not a valid URL.`;
  }
  if (!isLocalUrl(url)) {
    return `${url} is not on this machine; the E2E suite only runs against a local stack.`;
  }
  if (port === DEV_API_PORT) {
    return (
      `${url} is the developer API (port ${DEV_API_PORT}, database ${DEV_DB}); the E2E suite never uses it. ` +
      `--reuse-running only reuses a stack started by \`npm run test:e2e -- --keep-running\` (API :${E2E_API_PORT}, database ${E2E_DB}).`
    );
  }
  const identity = identityOf(info);
  if (!identity) {
    return (
      `The API on ${url} was not started by the E2E harness (no ${INFO_KEY} block in /actuator/info); ` +
      `refusing to use it, it may write into the developer database. Start the E2E stack with \`npm run test:e2e -- --keep-running\`.`
    );
  }
  if (identity.database !== E2E_DB) {
    return `The API on ${url} uses the database ${identity.database}, not ${E2E_DB}; refusing to use it.`;
  }
  if (expectedInstance !== undefined && identity.instance !== expectedInstance) {
    return (
      `The API on ${url} is an E2E API but not the one recorded in .local-dev/e2e/state.json ` +
      `(instance ${identity.instance}); refusing to reuse it.`
    );
  }
  return null;
}

/**
 * Whether the web server on `webUrl`, whose `/config.json` is `config`, may be reused: it must
 * send the browser to `apiUrl` (the E2E API), never to the developer API.
 */
export function webReuseRefusal(webUrl, config, apiUrl) {
  const port = portOf(webUrl);
  if (port === DEV_WEB_PORT) {
    return `${webUrl} is the developer web server (port ${DEV_WEB_PORT}); the E2E suite never uses it.`;
  }
  const configured = config && typeof config === 'object' ? config.apiBaseUrl : undefined;
  if (typeof configured !== 'string' || configured.replace(/\/+$/, '') !== apiUrl.replace(/\/+$/, '')) {
    return (
      `The web server on ${webUrl} sends the browser to ${configured ?? 'an unknown API'}, not to the E2E API ${apiUrl}; ` +
      'refusing to reuse it.'
    );
  }
  return null;
}

/** `/config.json` of the E2E web dev server (served by `ng serve --configuration e2e`). */
export function webRuntimeConfig({ apiUrl, emulatorHost = 'localhost:9099' }) {
  const api = apiUrl.replace(/\/+$/, '');
  return {
    apiBaseUrl: api,
    wsBaseUrl: `${api.replace(/^http/, 'ws')}/ws`,
    firebase: {
      apiKey: 'demo-local-key',
      authDomain: 'orenjitrade-local.firebaseapp.com',
      projectId: 'orenjitrade-local',
      appId: '',
    },
    firebaseAuthEmulatorHost: emulatorHost,
    environment: 'local',
  };
}

/** A run id usable in email local parts and handles: `r` + 7 base-36 characters. */
export function newRunId(now = Date.now(), random = Math.random) {
  const time = (now % 36 ** 5).toString(36).padStart(5, '0');
  const noise = Math.floor(random() * 36 ** 2)
    .toString(36)
    .padStart(2, '0');
  return `r${time}${noise}`;
}

/** Prefix of the local part of every account email of one web E2E run. */
export function runEmailPrefix(runId) {
  if (!/^r[a-z0-9]{3,15}$/.test(String(runId))) {
    throw new Error(`Invalid run id "${runId}" (r + 3-15 lowercase letters or digits).`);
  }
  return `e2e-${runId}-`;
}

function normalisedEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

/** True for an address of the web suites' test domain (and never a seed account). */
export function isTestDataEmail(email) {
  const value = normalisedEmail(email);
  const at = value.lastIndexOf('@');
  return at > 0 && value.slice(at + 1) === E2E_EMAIL_DOMAIN && !value.endsWith(`@${SEED_EMAIL_DOMAIN}`);
}

/** True only for an account created by the web E2E run `runId`. */
export function isRunAccount(email, runId) {
  return isTestDataEmail(email) && normalisedEmail(email).startsWith(runEmailPrefix(runId));
}
