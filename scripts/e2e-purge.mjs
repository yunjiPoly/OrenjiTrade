#!/usr/bin/env node
// npm run e2e:purge — removes every fictional web E2E test account (`...@example.test`) from a
// LOCAL database (default: the developer database) and the Firebase Auth emulator, through the
// API's existing account-deletion path, exactly like a real deletion: each module purges its rows
// (location, binders, inventory, wishlist, messages, ...), the account row is anonymised, consents
// and audit stay. Seed accounts (`@orenjitrade.test`), other domains (`@mobile-e2e.test`), the card
// catalog and the card image cache are never touched. Details: scripts/lib/e2e-purge.mjs and
// docs/development/local-setup.md ("E2E test data and the purge").
//
//   npm run e2e:purge                 the developer database (DATABASE_URL of .env, default orenjitrade)
//   npm run e2e:purge -- --yes        no confirmation prompt
//   npm run e2e:purge -- --e2e        the E2E database orenjitrade_e2e (with the E2E API's settings)
//   --database <name>                 another local database; --container <name> another PostgreSQL container
//   --jar <path>                      use this API jar instead of building one (gradlew bootJar)
//   --wait-minutes <n>                how long to wait (default 20) while another E2E run uses the
//                                     shared Auth emulator before deleting emulator accounts
//
// The database side runs in the API jar's one-shot maintenance mode (no web server, no Flyway, no
// seed, no scheduled jobs, no event republication, no card image reconciliation; it refuses
// anything but a local/dev profile, a local PostgreSQL and the local Auth emulator). A running API
// is not needed and no endpoint is added. Run it from the checkout whose `npm run dev` you use: its
// apps/api/.local-storage holds the uploaded media (avatars, item photos) the deletion removes.

import fs from 'node:fs';
import path from 'node:path';
import {
  deleteEmulatorTestAccounts,
  emulatorTestAccounts,
  planFromDatabase,
  purgeEnv,
  runPurgeJar,
  targetProblems,
} from './lib/e2e-purge.mjs';
import { parseOptions } from './lib/internal-api.mjs';
import { DB_CONTAINER, containerHealth, databaseExists, dockerEngineIsLocal } from './lib/local-db.mjs';
import {
  API_DIR,
  LOCAL_DEV_DIR,
  LOG_DIR,
  childEnv,
  confirm,
  ensureDocker,
  fail,
  findJava21,
  formatDuration,
  log,
  portInUse,
  runGradle,
  sleep,
  table,
} from './lib/util.mjs';
import { DEV_DB, E2E_API_PORT, E2E_DB, E2E_WEB_PORT, databaseOf, e2eApiEnv } from './lib/web-e2e-guard.mjs';
import { WORK_DIR as E2E_WORK_DIR } from './lib/web-e2e.mjs';

const options = parseOptions(process.argv.slice(2), {
  values: ['database', 'container', 'jar', 'wait-minutes'],
  flags: ['yes', 'e2e', 'help'],
});
if (options.help) {
  console.log('Usage: npm run e2e:purge [-- --yes] [--e2e | --database <name>] [--container <name>] [--jar <path>]');
  process.exit(0);
}

const started = Date.now();
const base = childEnv();
const database = options.database || (options.e2e ? E2E_DB : databaseOf(base.DATABASE_URL) || DEV_DB);
const container = options.container || DB_CONTAINER;
const emulatorUrl = `http://${base.FIREBASE_AUTH_EMULATOR_HOST || 'localhost:9099'}`;

log.step(`Purging the fictional E2E test accounts (@example.test) of database ${database}`);
ensureDocker();
const containerState = containerHealth(container);
const problems = targetProblems({
  database,
  emulatorUrl,
  dockerLocal: dockerEngineIsLocal(),
  containerState,
  databaseExists: containerState === 'healthy' ? databaseExists(database, { container }) : undefined,
});
if (problems.length > 0) {
  fail(`Refusing to purge:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
}

// The maintenance jar's environment: the developer's (.env + shell) for the developer database,
// the E2E API's for the E2E database (Redis db 2, files under .local-dev/e2e).
let env;
let cwd;
try {
  if (database === E2E_DB) {
    env = purgeEnv(e2eApiEnv(base, { apiPort: E2E_API_PORT, webPort: E2E_WEB_PORT, workDir: E2E_WORK_DIR }), database);
    cwd = E2E_WORK_DIR;
  } else {
    env = purgeEnv(base, database);
    cwd = API_DIR;
  }
} catch (error) {
  fail(error.message);
}
fs.mkdirSync(cwd, { recursive: true });

const plan = planFromDatabase(database, container);
const emulatorPlan = (await emulatorTestAccounts(emulatorUrl)).length;
log.info(`PostgreSQL container ${container} · Auth emulator ${emulatorUrl} · profile local · no web server`);
console.log(
  `\n${table([
    ['Found', 'Count'],
    ['@example.test accounts in the database (not deleted yet)', plan.accounts],
    ['  active / suspended / deletion requested', `${plan.active} / ${plan.suspended} / ${plan.deletionRequested}`],
    ['  their locations (user_location rows)', plan.locations],
    ['    discoverable (public point set)', plan.discoverable],
    ['  their binders', plan.binders],
    ['  their inventory items', plan.items],
    ['@example.test accounts in the Auth emulator', emulatorPlan],
  ])}\n`,
);
if (plan.accounts === 0 && emulatorPlan === 0) {
  log.ok(`Nothing to purge: no @example.test account in ${database} or in the Auth emulator.`);
  process.exit(0);
}
if (!options.yes) {
  if (!process.stdin.isTTY) {
    fail('Not an interactive terminal; re-run with -- --yes to confirm. Nothing was changed.');
  }
  const ok = await confirm(
    `Delete these ${plan.accounts} account(s) of ${database} through the account-deletion path and ${emulatorPlan} emulator account(s)?`,
  );
  if (!ok) {
    fail('Aborted; nothing was changed.');
  }
}

let removedDb = { accounts: 0, locations: 0, binders: 0, items: 0 };
let report = null;
if (plan.accounts > 0) {
  let jar = options.jar ? path.resolve(options.jar) : null;
  if (!jar) {
    log.step('Building the API jar (gradlew bootJar)');
    if ((await runGradle(['bootJar'], { cwd: API_DIR, env: base })) !== 0) {
      fail('gradlew bootJar failed; nothing was changed.');
    }
    // A copy, so a later Gradle build can overwrite build/libs/app.jar meanwhile.
    jar = path.join(LOCAL_DEV_DIR, 'purge', 'api-purge.jar');
    fs.mkdirSync(path.dirname(jar), { recursive: true });
    fs.copyFileSync(path.join(API_DIR, 'build', 'libs', 'app.jar'), jar);
  }
  const java = findJava21();
  if (!java) {
    fail('No Java 21+ runtime found (ORENJI_JAVA_HOME, JAVA_HOME, PATH, ~/.gradle/jdks); nothing was changed.');
  }
  const logFile = path.join(LOG_DIR, 'e2e-purge.log');
  log.step(`Deleting the accounts in the API's maintenance mode (log ${path.relative(process.cwd(), logFile)})`);
  const result = await runPurgeJar({ java, jar, env, cwd, logFile });
  if (result.report?.refused) {
    fail(`The API refused to purge:\n${result.report.refused.map((reason) => `  - ${reason}`).join('\n')}`);
  }
  report = result.report?.report;
  if (!report) {
    fail(`The purge did not report (exit ${result.code}); see ${logFile}. Its deletions so far are complete ones.`);
  }
  removedDb = {
    accounts: report.deleted,
    locations: report.before.locations - report.after.locations,
    binders: report.before.binders - report.after.binders,
    items: report.before.items - report.after.items,
  };
  if (result.report.pendingEventPublications > 0) {
    log.warn(
      `${result.report.pendingEventPublications} event publication(s) of the purge were still incomplete; ` +
        'the developer API republishes them on its next start.',
    );
  }
}

const afterDb = planFromDatabase(database, container);
console.log(
  `
${table([
    ['Removed from the database', 'Count'],
    ['accounts (deleted through the account-deletion path, rows anonymised)', removedDb.accounts],
    ['locations', removedDb.locations],
    ['binders', removedDb.binders],
    ['inventory items', removedDb.items],
  ])}
`,
);
if (report) {
  log.info(`Open trades between test accounts cancelled first: ${report.cancelledTrades}.`);
  for (const entry of report.blocked) {
    log.warn(`Blocked (kept, taken off the map): ${entry.email} — ${entry.reason}`);
  }
  for (const entry of report.failed) {
    log.warn(`Failed: ${entry.email} — ${entry.reason}`);
  }
}
log.info(`Left in ${database}: ${afterDb.accounts} @example.test account(s), ${afterDb.discoverable} discoverable.`);

// The emulator is shared: never delete @example.test accounts while another E2E run (mobile, or a
// web run when purging the developer database) may be signed in with some of them.
const otherRuns = [
  [8090, 'the mobile E2E API'],
  [19006, 'the mobile E2E web build'],
  [8082, 'the mobile E2E Metro server'],
  ...(database === E2E_DB
    ? []
    : [
        [E2E_API_PORT, 'the web E2E API'],
        [E2E_WEB_PORT, 'the web E2E web server'],
      ]),
];
const waitMs = Number(options['wait-minutes'] ?? 20) * 60_000;
const waitStarted = Date.now();
for (;;) {
  const busy = [];
  for (const [port, label] of otherRuns) {
    if (await portInUse(port)) {
      busy.push(`${label} (:${port})`);
    }
  }
  if (busy.length === 0) {
    break;
  }
  if (Date.now() - waitStarted >= waitMs) {
    fail(
      `Another E2E run still uses the shared Auth emulator (${busy.join(', ')}); the database part is done, ` +
        `the ${emulatorPlan} @example.test emulator account(s) were left. Re-run npm run e2e:purge when it has finished.`,
    );
  }
  log.warn(`Another E2E run is active (${busy.join(', ')}); waiting before deleting emulator accounts (re-checking every minute).`);
  await sleep(60_000);
}
const emulatorRemoved = await deleteEmulatorTestAccounts(emulatorUrl);
const emulatorAfter = (await emulatorTestAccounts(emulatorUrl)).length;
console.log(
  `
${table([
    ['Removed from the Auth emulator', 'Count'],
    ['@example.test accounts (besides those the deletion removed with their accounts)', emulatorRemoved],
  ])}
`,
);
log.info(`Left in the Auth emulator: ${emulatorAfter} @example.test account(s). Took ${formatDuration(Date.now() - started)}.`);
if (afterDb.accounts === 0 && emulatorAfter === 0) {
  log.ok(`Done: no @example.test account left in ${database} or in the Auth emulator.`);
} else if (afterDb.accounts === (report?.blocked.length ?? 0) && afterDb.discoverable === 0 && emulatorAfter === 0) {
  log.ok('Done; the blocked accounts above stay (off the map) until their open obligations end.');
} else {
  process.exit(1);
}
