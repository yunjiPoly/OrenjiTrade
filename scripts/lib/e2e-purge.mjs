// Removal of the fictional web E2E test accounts (`...@example.test`) from a LOCAL database and the
// Auth emulator (npm run e2e:purge). The database side runs inside the API jar in a one-shot
// maintenance mode (TestAccountPurgeCommand: no web server, no Flyway, no seed, no scheduled jobs,
// no event republication, no card image reconciliation), so it uses the API's own account-deletion
// path exactly like a real deletion and needs no running API and no new endpoint:
//
//   1. per account: open trades with another test account are cancelled (TradeService), then a
//      deletion request is created (AccountDeletionService.request: blockers checked, off the map,
//      sessions revoked, audited) and processed at once (AccountDeletionService.processNow: every
//      module's DeletionParticipant purges its rows, the account row is anonymised, its emulator
//      user deleted; consents and audit kept); an account still blocked is taken off the map;
//   2. the remaining @example.test Auth emulator accounts (no database row) are deleted here.
//
// The pure rules below are unit-tested in e2e-purge.test.mjs; the jar enforces its own checks.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { deleteEmulatorAccounts, listEmulatorAccounts } from './auth-emulator.mjs';
import { psql } from './local-db.mjs';
import { databaseOf, isLocalHost, isLocalUrl, isTestDataEmail, withDatabase } from './web-e2e-guard.mjs';

/** Prefix of the report line the jar prints (TestAccountPurgeCommand.REPORT_PREFIX). */
export const REPORT_PREFIX = 'ORENJI_PURGE_REPORT ';

/**
 * Command-line arguments of the jar's maintenance mode: the purge itself, and everything else the
 * API would start switched off (the jar refuses to run unless all of them hold).
 */
export const PURGE_ARGS = Object.freeze([
  '--orenji.maintenance.purge-test-accounts=true',
  '--spring.main.web-application-type=none',
  '--spring.flyway.enabled=false',
  '--orenji.seed.enabled=false',
  '--orenji.scheduling.enabled=false',
  '--spring.modulith.events.republish-outstanding-events-on-restart=false',
  '--orenji.card-images.cache.reconcile-on-startup=false',
]);

/** Pure checks of a purge target (empty list = safe). */
export function targetProblems({ database, emulatorUrl, dockerLocal, containerState, databaseExists }) {
  const problems = [];
  if (!/^[a-z0-9_]+$/.test(String(database ?? ''))) {
    problems.push(`Invalid database name "${database}".`);
  }
  if (!dockerLocal) {
    problems.push('The Docker CLI does not talk to a local engine; the database must be the local docker compose PostgreSQL.');
  }
  if (containerState !== 'healthy') {
    problems.push(`The PostgreSQL container is ${containerState}; start the infrastructure first (npm run infra:up).`);
  }
  if (containerState === 'healthy' && databaseExists === false) {
    problems.push(`The database ${database} does not exist.`);
  }
  if (!isLocalUrl(emulatorUrl)) {
    problems.push(`The Auth emulator ${emulatorUrl} is not on this machine (localhost only).`);
  }
  return problems;
}

/**
 * Environment of the maintenance jar on top of `base` (the developer's `.env` + shell, or the E2E
 * API's environment): the target database, the local profile, the local emulator, and no card
 * provider. Refuses a non-local database or emulator host.
 */
export function purgeEnv(base, database) {
  const env = {
    ...base,
    SPRING_PROFILES_ACTIVE: 'local',
    ORENJI_ENV: 'local',
    DATABASE_URL: withDatabase(base.DATABASE_URL, database),
    FIREBASE_AUTH_EMULATOR_HOST: base.FIREBASE_AUTH_EMULATOR_HOST || 'localhost:9099',
    CARD_IMAGE_ON_DEMAND_ENABLED: 'false',
    YGOPRODECK_ENABLED: 'false',
    YGOPRODECK_API_BASE_URL: 'http://127.0.0.1:9/api/v7/',
    YGOPRODECK_IMAGE_BASE_URL: 'http://127.0.0.1:9/images/cards/',
  };
  const dbHost = /^jdbc:postgresql:\/\/(\[[^\]]+\]|[^/:?;]+)/i.exec(env.DATABASE_URL)?.[1];
  if (!isLocalHost(dbHost) || databaseOf(env.DATABASE_URL) !== database) {
    throw new Error(`Refusing to purge: DATABASE_URL ${env.DATABASE_URL} is not the local database ${database}.`);
  }
  if (!isLocalHost(env.FIREBASE_AUTH_EMULATOR_HOST.replace(/:\d+$/, ''))) {
    throw new Error(`Refusing to purge: FIREBASE_AUTH_EMULATOR_HOST ${env.FIREBASE_AUTH_EMULATOR_HOST} is not local.`);
  }
  return env;
}

/** The report line of the jar's output (null when absent). */
export function parseReport(output) {
  const line = String(output ?? '')
    .split(/\r?\n/)
    .reverse()
    .find((candidate) => candidate.startsWith(REPORT_PREFIX));
  if (!line) {
    return null;
  }
  try {
    return JSON.parse(line.slice(REPORT_PREFIX.length));
  } catch {
    return null;
  }
}

/** What the purge would remove (read-only psql counts). */
export function planFromDatabase(database, container) {
  const [row] = psql(
    database,
    `WITH t AS (SELECT id, status FROM user_account WHERE lower(email) LIKE '%@example.test' AND status <> 'DELETED')
     SELECT (SELECT count(*) FROM t),
            (SELECT count(*) FROM t WHERE status = 'ACTIVE'),
            (SELECT count(*) FROM t WHERE status = 'SUSPENDED'),
            (SELECT count(*) FROM t WHERE status = 'DELETION_REQUESTED'),
            (SELECT count(*) FROM user_location WHERE user_id IN (SELECT id FROM t)),
            (SELECT count(*) FROM user_location WHERE user_id IN (SELECT id FROM t) AND public_point IS NOT NULL),
            (SELECT count(*) FROM binder WHERE owner_id IN (SELECT id FROM t)),
            (SELECT count(*) FROM inventory_item WHERE owner_id IN (SELECT id FROM t) AND deleted_at IS NULL)`,
    { container },
  );
  const [accounts, active, suspended, deletionRequested, locations, discoverable, binders, items] = row.map(Number);
  return { accounts, active, suspended, deletionRequested, locations, discoverable, binders, items };
}

/** The @example.test accounts of the Auth emulator. */
export async function emulatorTestAccounts(emulatorUrl) {
  return (await listEmulatorAccounts({ emulatorUrl })).filter((account) => isTestDataEmail(account.email));
}

/** Deletes every remaining @example.test Auth emulator account; returns how many. */
export async function deleteEmulatorTestAccounts(emulatorUrl) {
  const accounts = await emulatorTestAccounts(emulatorUrl);
  await deleteEmulatorAccounts({ emulatorUrl, localIds: accounts.map((account) => account.localId) });
  return accounts.length;
}

/**
 * Runs the jar's maintenance mode and resolves with `{ code, report, output }`; the complete output
 * goes to `logFile`.
 */
export function runPurgeJar({ java, jar, env, cwd, logFile }) {
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const log = fs.createWriteStream(logFile, { flags: 'w' });
  return new Promise((resolve) => {
    let output = '';
    const child = spawn(java, ['-jar', jar, ...PURGE_ARGS], {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const collect = (chunk) => {
      const text = chunk.toString('utf8');
      output += text;
      log.write(text);
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('error', (error) => {
      log.end();
      resolve({ code: 127, report: null, output: `${output}\n${error.message}` });
    });
    child.on('exit', (code) => {
      log.end();
      resolve({ code: code ?? 1, report: parseReport(output), output });
    });
  });
}
