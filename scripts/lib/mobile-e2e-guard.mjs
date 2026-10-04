// Isolation guards of the mobile E2E harness (npm run test:mobile:e2e, npm run test:mobile:maestro).
//
// The harness runs a second API next to whatever a developer is running. That API must never
// write into the developer's database and never point at the developer's files: on start-up the
// card image cache is reconciled with ITS database and every cached file no row references is
// deleted, so an isolated API pointed at the developer's cache would delete the developer's
// downloaded card images (ADR 0015). Everything here is pure (paths, env maps, JSON) so it is
// unit-tested in mobile-e2e-guard.test.mjs; the harness calls it before starting anything.

import fs from 'node:fs';
import path from 'node:path';

/** The only database the mobile E2E API may use (created by the harness, never the dev one). */
export const MOBILE_E2E_DB = 'orenjitrade_mobile_e2e';
/** The developer's database (docker compose default): never touched by the harness. */
export const DEV_DB = 'orenjitrade';
/** Port of the isolated API; the developer API listens on DEV_API_PORT. */
export const MOBILE_E2E_API_PORT = 8090;
export const DEV_API_PORT = 8080;
/**
 * Email domain of every account the mobile suites create. Not `example.test` (owned by the web
 * suite's purge tool) and not `orenjitrade.test` (seed accounts).
 */
export const MOBILE_E2E_EMAIL_DOMAIN = 'mobile-e2e.test';
/** Key of the identity block the isolated API publishes under /actuator/info. */
export const INFO_KEY = 'orenjiMobileE2e';

const SAME_CASE = process.platform !== 'win32';

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

/** True when `child` is `parent` or lies inside it (after resolving links). */
export function isInside(child, parent) {
  const relative = path.relative(comparable(parent), comparable(child));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/** True when one directory is, contains, or lies inside the other. */
export function overlaps(a, b) {
  return isInside(a, b) || isInside(b, a);
}

/**
 * The media root and card image cache an API started from `apiDir` uses with `env` (same rules
 * as application.yml: STORAGE_LOCAL_ROOT defaults to ./.local-storage, CARD_IMAGE_CACHE_DIR to
 * <STORAGE_LOCAL_ROOT>/card-images, both relative to the API's working directory).
 */
export function storageDirsOf(apiDir, env = {}) {
  const value = (name) => (typeof env[name] === 'string' && env[name].trim() ? env[name].trim() : undefined);
  const mediaRoot = path.resolve(apiDir, value('STORAGE_LOCAL_ROOT') ?? './.local-storage');
  const cardImages = value('CARD_IMAGE_CACHE_DIR')
    ? path.resolve(apiDir, value('CARD_IMAGE_CACHE_DIR'))
    : path.join(mediaRoot, 'card-images');
  return { mediaRoot, cardImages };
}

/**
 * Every directory a developer API of this repository may use: the defaults of each checkout
 * (`apiDirs`: this one and the other git worktrees) and the values of the developer's environment
 * (`.env` + shell), resolved against each checkout.
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

/**
 * Problems that make the isolated API environment unsafe (empty when it is safe):
 * the database must be orenjitrade_mobile_e2e, the port 8090, the media root and card image
 * cache inside `workDir` (.local-dev/mobile-e2e) and apart from every developer directory, and
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
  if (String(env.SERVER_PORT) !== String(MOBILE_E2E_API_PORT)) {
    problems.push(`SERVER_PORT must be ${MOBILE_E2E_API_PORT} (the developer API owns ${DEV_API_PORT}), not ${env.SERVER_PORT}.`);
  }
  for (const [name, label] of [
    ['STORAGE_LOCAL_ROOT', 'media storage directory'],
    ['CARD_IMAGE_CACHE_DIR', 'card image cache directory'],
  ]) {
    const value = env[name];
    if (!value || !path.isAbsolute(value)) {
      problems.push(`${name} (${label}) must be an absolute path under ${workDir}, not "${value ?? ''}".`);
      continue;
    }
    if (!isInside(value, workDir) || comparable(value) === comparable(workDir)) {
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
  if (env.STORAGE_LOCAL_ROOT && env.CARD_IMAGE_CACHE_DIR && comparable(env.STORAGE_LOCAL_ROOT) === comparable(env.CARD_IMAGE_CACHE_DIR)) {
    problems.push('STORAGE_LOCAL_ROOT and CARD_IMAGE_CACHE_DIR must be different directories.');
  }
  if (String(env.CARD_IMAGE_ON_DEMAND_ENABLED) !== 'false') {
    problems.push('CARD_IMAGE_ON_DEMAND_ENABLED must be false (no card image downloads during tests).');
  }
  if (String(env.YGOPRODECK_ENABLED) !== 'false') {
    problems.push('YGOPRODECK_ENABLED must be false (tests never call YGOPRODeck; mock catalog only).');
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
  let port = null;
  try {
    port = Number(new URL(url).port || 80);
  } catch {
    return `${url} is not a valid URL.`;
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

/** A run id usable in email local parts and handles: `r` + 7 base-36 characters. */
export function newRunId(now = Date.now(), random = Math.random) {
  const time = (now % 36 ** 5).toString(36).padStart(5, '0');
  const noise = Math.floor(random() * 36 ** 2)
    .toString(36)
    .padStart(2, '0');
  return `r${time}${noise}`;
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
 * (`m-<runId>-...@mobile-e2e.test`), and nothing else. Uses the emulator's owner credential
 * (local emulator only). Returns the number of deleted accounts.
 */
export async function deleteRunAccounts({ emulatorUrl, projectId, runId, fetchImpl = fetch }) {
  const base = `${emulatorUrl.replace(/\/+$/, '')}/identitytoolkit.googleapis.com/v1/projects/${projectId}`;
  const headers = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
  const ids = [];
  let pageToken;
  do {
    const query = new URLSearchParams({ maxResults: '1000', ...(pageToken ? { nextPageToken: pageToken } : {}) });
    const response = await fetchImpl(`${base}/accounts:batchGet?${query}`, { headers });
    if (!response.ok) {
      throw new Error(`listing emulator accounts failed: HTTP ${response.status}`);
    }
    const body = await response.json();
    for (const user of body.users ?? []) {
      if (isRunAccount(user.email, runId)) {
        ids.push(user.localId);
      }
    }
    pageToken = body.nextPageToken;
  } while (pageToken);
  for (let i = 0; i < ids.length; i += 500) {
    const response = await fetchImpl(`${base}/accounts:batchDelete`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ localIds: ids.slice(i, i + 500), force: true }),
    });
    if (!response.ok) {
      throw new Error(`deleting emulator accounts failed: HTTP ${response.status}`);
    }
  }
  return ids.length;
}
