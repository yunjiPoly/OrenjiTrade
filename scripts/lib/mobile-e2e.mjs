// npm run test:mobile:e2e — the mobile app's web build driven by Playwright against a REAL local
// stack, without touching what a developer may be running:
//
//   * infrastructure: the shared docker compose containers (PostGIS, Redis, Firebase Auth
//     emulator). Started with `npm run infra:up` only when they are not running; never restarted
//     or reset.
//   * database: the isolated database `orenjitrade_mobile_e2e` on the shared PostgreSQL, dropped
//     and recreated each time this harness starts its API (Flyway migrates it, SeedDataRunner
//     seeds it). The developer's database `orenjitrade` is never touched.
//   * API: the API jar on :8090 (profile local) against that database, Redis database 1 with its
//     own realtime channels (e2e-mobile:rt:user:*), its own media, card-image cache and provider
//     directories under .local-dev/mobile-e2e (guarded: start-up refuses directories that resolve
//     to a developer's, see mobile-e2e-guard.mjs), no card provider calls (mock catalog only, no
//     image downloads). It publishes an identity block under /actuator/info so --reuse-running can
//     recognise it.
//   * app: `expo export --platform web` pointed at that API and the Auth emulator, served on
//     :19006 by `expo serve` (CORS allows localhost:19006).
//
// Then every spec under apps/mobile/e2e runs with a run id: the accounts the specs create are
// `m-<run id>-...@mobile-e2e.test` and are deleted from the Auth emulator at the end (best effort,
// only that run's accounts). Only what this run started is stopped.
//
// Flags:
//   --reuse-running  reuse the API / web server a previous `--keep-running` run left on
//                    :8090 / :19006 (never any other API: the developer API on :8080 is refused)
//   --keep-running   leave the API and the web server running afterwards (state in
//                    .local-dev/mobile-e2e/state.json); used by the native Maestro check
//   --stack-only     start (or reuse) the stack and keep it running, without running the specs
//   --stop           stop what an earlier --keep-running / --stack-only run left running
//   --skip-build     reuse the last API jar copy and web export
// Anything else goes to Playwright.

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  API_DIR,
  IS_WINDOWS,
  LOCAL_DEV_DIR,
  MOBILE_DIR,
  PORTS,
  ROOT,
  assertPortsFree,
  capture,
  childEnv,
  ensureDocker,
  findJava21,
  formatDuration,
  httpStatus,
  infraUp,
  isAlive,
  killTree,
  listeningPids,
  log,
  parseFlags,
  portInUse,
  resolvePackageFile,
  run,
  runGradle,
  settlesWithin,
  waitForHttp,
} from './util.mjs';
import { containerHealth, ensureDatabase, psql } from './local-db.mjs';
import {
  MOBILE_E2E_DB,
  assertIsolated,
  assertRecreatable,
  deleteRunAccounts,
  developerDirs,
  identityArgs,
  mobileE2eApiEnv as isolatedApiEnv,
  newRunId,
  reuseRefusal,
} from './mobile-e2e-guard.mjs';

export { MOBILE_E2E_DB };
const CONTAINERS = ['orenjitrade-postgres', 'orenjitrade-redis', 'orenjitrade-firebase-auth'];
export const WORK_DIR = path.join(LOCAL_DEV_DIR, 'mobile-e2e');
const WEB_BUILD_DIR = path.join(WORK_DIR, 'web');
export const LOGS_DIR = path.join(WORK_DIR, 'logs');
const STATE_FILE = path.join(WORK_DIR, 'state.json');
/** Served next to the web export; tells --reuse-running which API the build talks to. */
const BUILD_STAMP = 'mobile-e2e-build.json';
export const FIREBASE_PROJECT_ID = 'orenjitrade-local';

export const API_URL = `http://localhost:${PORTS.mobileE2eApi}`;
const API_READINESS = `${API_URL}/actuator/health/readiness`;
const WEB_URL = `http://localhost:${PORTS.mobileE2eWeb}`;
export const AUTH_EMULATOR_URL = `http://localhost:${PORTS.authEmulator}`;

// --------------------------------------------------------------------------------- state

/** What a --keep-running run left behind: { api?: {pid, instance, port}, web?: {...}, metro?: {...} }. */
export function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

export function writeState(state) {
  fs.mkdirSync(WORK_DIR, { recursive: true });
  const entries = Object.entries(state).filter(([, value]) => value);
  if (entries.length === 0) {
    fs.rmSync(STATE_FILE, { force: true });
    return;
  }
  fs.writeFileSync(STATE_FILE, `${JSON.stringify(Object.fromEntries(entries), null, 2)}\n`);
}

/** True when the recorded process is still the one listening on its port. */
function recordedRunning(entry) {
  return !!entry && isAlive(entry.pid) && listeningPids(entry.port).has(entry.pid);
}

// ------------------------------------------------------------------------- infrastructure

/** `running`/`healthy` state of each infrastructure container (shared docker inspect helper). */
function containerStates() {
  return CONTAINERS.map((name) => {
    const health = containerHealth(name);
    if (health === 'missing' || health === 'stopped') {
      return { name, status: health, health: 'none' };
    }
    return { name, status: 'running', health };
  });
}

/** Uses the running containers as they are; `npm run infra:up` only when one is not running. */
export async function ensureInfrastructure() {
  ensureDocker();
  const states = containerStates();
  const down = states.filter((state) => state.status !== 'running');
  if (down.length === 0) {
    const unhealthy = states.filter((state) => state.health !== 'healthy' && state.health !== 'none');
    if (unhealthy.length > 0) {
      log.warn(`Containers not healthy yet: ${unhealthy.map((s) => `${s.name} (${s.health})`).join(', ')}; waiting.`);
      const started = Date.now();
      while (Date.now() - started < 120_000) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        if (containerStates().every((state) => state.health === 'healthy' || state.health === 'none')) {
          break;
        }
      }
    }
    log.ok(`Infrastructure already running (${CONTAINERS.join(', ')}); left untouched.`);
    return 0;
  }
  log.info(`Not running: ${down.map((state) => state.name).join(', ')}. Starting the infrastructure (npm run infra:up).`);
  return infraUp();
}

/**
 * Drops and recreates the isolated database (a clean, freshly seeded state per run; Flyway
 * migrates it when the API starts), with the extensions the API expects. Only ever the mobile E2E
 * database (assertRecreatable); uses the shared local-db helpers of the web E2E harness.
 */
function recreateDatabase() {
  try {
    assertRecreatable(MOBILE_E2E_DB);
    psql('postgres', [`DROP DATABASE IF EXISTS ${MOBILE_E2E_DB} WITH (FORCE)`]);
    ensureDatabase(MOBILE_E2E_DB);
  } catch (error) {
    log.error(`Recreating ${MOBILE_E2E_DB} failed: ${error.message}`);
    return false;
  }
  log.ok(`Recreated the isolated database ${MOBILE_E2E_DB} (the developer database is untouched).`);
  return true;
}

// ------------------------------------------------------------------------------- the API

/** Environment of the isolated API (local profile; never the developer's database, port or files). */
export function mobileE2eApiEnv(base) {
  return isolatedApiEnv(base, { workDir: WORK_DIR, webPort: PORTS.mobileE2eWeb });
}

/** API directories of every checkout of this repository (this one and the other worktrees). */
function checkoutApiDirs() {
  const dirs = new Set([API_DIR]);
  const list = capture('git', ['-C', ROOT, 'worktree', 'list', '--porcelain']);
  for (const line of list.stdout.split(/\r?\n/)) {
    if (line.startsWith('worktree ')) {
      dirs.add(path.join(line.slice('worktree '.length).trim(), 'apps', 'api'));
    }
  }
  return [...dirs];
}

/** Throws unless the API environment is isolated from every developer directory and database. */
export function assertApiIsolation(apiEnv, developerEnv) {
  assertIsolated(apiEnv, { workDir: WORK_DIR, devDirs: developerDirs(checkoutApiDirs(), developerEnv) });
}

/** Starts a detached child writing to a log file (it can outlive this process with --keep-running). */
function spawnDetached(name, invocation, { cwd, env, logFile }) {
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const fd = fs.openSync(logFile, 'w');
  let child;
  try {
    child = spawn(invocation.command, invocation.args, {
      cwd,
      env,
      shell: invocation.shell,
      stdio: ['ignore', fd, fd],
      detached: true,
      windowsHide: true,
    });
  } finally {
    fs.closeSync(fd);
  }
  const handle = { name, pid: child.pid, logFile, exitInfo: undefined };
  handle.exited = new Promise((resolve) => {
    child.on('exit', (code, signal) => {
      handle.exitInfo ??= { code, signal };
      resolve(handle.exitInfo);
    });
    child.on('error', (error) => {
      handle.exitInfo ??= { code: 127, signal: null, error: error.message };
      resolve(handle.exitInfo);
    });
  });
  child.unref();
  return handle;
}

/** Resolves when `pid` is gone (polling), or after `ms`. */
async function deathOf(pid, ms) {
  const started = Date.now();
  while (isAlive(pid) && Date.now() - started < ms) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

/** Stops a process tree: SIGTERM first on Unix (graceful Spring shutdown), then a hard kill. */
export async function stopProcess(pid, exited) {
  if (!pid || !isAlive(pid)) {
    return;
  }
  const gone = (ms) => (exited ? settlesWithin(exited, ms) : deathOf(pid, ms).then(() => !isAlive(pid)));
  if (!IS_WINDOWS) {
    try {
      process.kill(-pid, 'SIGTERM');
    } catch {
      // already gone
    }
    if (await gone(15_000)) {
      return;
    }
  }
  killTree(pid);
  await gone(10_000);
}

function expoCli(args) {
  const cli = resolvePackageFile(MOBILE_DIR, '@expo/cli', path.join('build', 'bin', 'cli'));
  return { command: process.execPath, args: [cli, ...args], shell: false };
}

function playwright(args) {
  const cli = resolvePackageFile(MOBILE_DIR, '@playwright/test', 'cli.js');
  return { command: process.execPath, args: [cli, ...args], shell: false };
}

async function fetchJson(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

/**
 * Null when the API on :8090 is the one a previous --keep-running run started (identity block
 * and instance id from the state file), else the reason it must not be reused.
 */
export async function apiReuseRefusal() {
  if ((await httpStatus(API_READINESS)) !== 200) {
    return `no ready API on ${API_URL}`;
  }
  const state = readState();
  const info = await fetchJson(`${API_URL}/actuator/info`);
  return reuseRefusal(API_URL, info, state.api?.instance ?? '(no state file)');
}

/**
 * Starts the isolated API on :8090 against a freshly recreated orenjitrade_mobile_e2e. Returns
 * the process handle (with its instance id), or null after logging why it could not start.
 */
export async function startIsolatedApi({ skipBuild }) {
  const developerEnv = childEnv();
  const apiEnv = mobileE2eApiEnv(developerEnv);
  try {
    assertApiIsolation(apiEnv, developerEnv);
  } catch (error) {
    log.error(error.message);
    return null;
  }
  fs.mkdirSync(WORK_DIR, { recursive: true });
  const jar = path.join(WORK_DIR, 'api-mobile-e2e.jar');
  if (!(skipBuild && fs.existsSync(jar))) {
    log.step('Building the API jar (gradlew bootJar)');
    const code = await runGradle(['bootJar'], { cwd: API_DIR, env: developerEnv });
    if (code !== 0) {
      return null;
    }
    // A copy, so later Gradle builds can overwrite build/libs/app.jar while this API runs.
    fs.copyFileSync(path.join(API_DIR, 'build', 'libs', 'app.jar'), jar);
  }
  const java = findJava21();
  if (!java) {
    log.error('No Java 21+ runtime found (ORENJI_JAVA_HOME, JAVA_HOME, PATH, ~/.gradle/jdks).');
    return null;
  }
  if (!recreateDatabase()) {
    return null;
  }
  const instance = randomUUID();
  log.step(
    `Starting the API jar on :${PORTS.mobileE2eApi} (profile local, database ${MOBILE_E2E_DB}, log .local-dev/mobile-e2e/logs/api.log)`,
  );
  const handle = spawnDetached(
    'mobile-e2e-api',
    { command: java, args: ['-jar', jar, ...identityArgs(instance)], shell: false },
    { cwd: WORK_DIR, env: apiEnv, logFile: path.join(LOGS_DIR, 'api.log') },
  );
  handle.instance = instance;
  handle.port = PORTS.mobileE2eApi;
  try {
    const waited = await waitForHttp(API_READINESS, {
      timeoutMs: 10 * 60_000,
      abortIf: () => (handle.exitInfo ? `the API exited (code ${handle.exitInfo.code}); see ${handle.logFile}` : null),
    });
    log.ok(`API ready on ${API_URL} (${formatDuration(waited)}).`);
  } catch (error) {
    log.error(error.message);
    await stopProcess(handle.pid, handle.exited);
    return null;
  }
  const refusal = reuseRefusal(API_URL, await fetchJson(`${API_URL}/actuator/info`), instance);
  if (refusal) {
    log.error(`The API on ${API_URL} does not identify as the one just started: ${refusal}`);
    await stopProcess(handle.pid, handle.exited);
    return null;
  }
  return handle;
}

// ---------------------------------------------------------------------------- the web app

/** Public build-time values of the web export (the app talks to the isolated API only). */
export function mobileE2eWebEnv(base) {
  return {
    ...base,
    EXPO_PUBLIC_API_BASE_URL: API_URL,
    EXPO_PUBLIC_FIREBASE_API_KEY: 'demo-local-key',
    EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: 'orenjitrade-local.firebaseapp.com',
    EXPO_PUBLIC_FIREBASE_PROJECT_ID: FIREBASE_PROJECT_ID,
    EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST: `localhost:${PORTS.authEmulator}`,
    EXPO_NO_TELEMETRY: '1',
    CI: base.CI ?? '1',
  };
}

async function webReuseRefusal() {
  if ((await httpStatus(`${WEB_URL}/`)) !== 200) {
    return `nothing serves ${WEB_URL}`;
  }
  const state = readState();
  const stamp = await fetchJson(`${WEB_URL}/${BUILD_STAMP}`);
  if (!stamp || stamp.apiBaseUrl !== API_URL || !state.web || stamp.instance !== state.web.instance) {
    return `the app on ${WEB_URL} is not a mobile E2E build for ${API_URL} started by this harness`;
  }
  return null;
}

async function startWeb({ skipBuild }) {
  const webEnv = mobileE2eWebEnv(childEnv());
  const instance = randomUUID();
  if (!(skipBuild && fs.existsSync(path.join(WEB_BUILD_DIR, 'index.html')))) {
    log.step(`Exporting the Expo web build for ${API_URL} (expo export --platform web)`);
    fs.rmSync(WEB_BUILD_DIR, { recursive: true, force: true });
    const code = await run(expoCli(['export', '--platform', 'web', '--output-dir', WEB_BUILD_DIR, '--clear']), {
      cwd: MOBILE_DIR,
      env: webEnv,
    });
    if (code !== 0) {
      return null;
    }
  }
  fs.writeFileSync(path.join(WEB_BUILD_DIR, BUILD_STAMP), `${JSON.stringify({ apiBaseUrl: API_URL, instance })}\n`);
  log.step(`Serving the web build on :${PORTS.mobileE2eWeb} (expo serve, log .local-dev/mobile-e2e/logs/web.log)`);
  const handle = spawnDetached('mobile-e2e-web', expoCli(['serve', WEB_BUILD_DIR, '--port', String(PORTS.mobileE2eWeb)]), {
    cwd: MOBILE_DIR,
    env: webEnv,
    logFile: path.join(LOGS_DIR, 'web.log'),
  });
  handle.instance = instance;
  handle.port = PORTS.mobileE2eWeb;
  try {
    const waited = await waitForHttp(`${WEB_URL}/`, {
      timeoutMs: 5 * 60_000,
      abortIf: () => (handle.exitInfo ? `the web server exited (code ${handle.exitInfo.code}); see ${handle.logFile}` : null),
    });
    log.ok(`Web build served on ${WEB_URL} (${formatDuration(waited)}).`);
  } catch (error) {
    log.error(error.message);
    await stopProcess(handle.pid, handle.exited);
    return null;
  }
  return handle;
}

// ----------------------------------------------------------------------------------- stop

/** Stops what earlier --keep-running runs recorded (only processes still listening on their port). */
export async function stopRecorded(kinds = ['metro', 'web', 'api']) {
  const state = readState();
  for (const kind of kinds) {
    const entry = state[kind];
    if (!entry) {
      continue;
    }
    if (recordedRunning(entry)) {
      log.step(`Stopping the kept mobile ${kind} (PID ${entry.pid}, port ${entry.port})`);
      await stopProcess(entry.pid);
    } else {
      log.info(`The recorded mobile ${kind} (PID ${entry.pid}) is no longer running.`);
    }
    delete state[kind];
  }
  writeState(state);
  return 0;
}

// ---------------------------------------------------------------------------------- suite

/** Ensures the isolated API (reused or started). Returns { handle, reused } or null. */
export async function ensureIsolatedApi({ reuse, skipBuild }) {
  if (reuse) {
    const refusal = await apiReuseRefusal();
    if (!refusal) {
      log.info(`Reusing the mobile E2E API on ${API_URL} (instance ${readState().api.instance}).`);
      return { handle: null, reused: true };
    }
    if (await portInUse(PORTS.mobileE2eApi)) {
      log.error(`--reuse-running: ${refusal}`);
      return null;
    }
    log.info(`--reuse-running: ${refusal}; starting a new isolated API.`);
    if (await portInUse(PORTS.api)) {
      log.info(
        `The developer API on :${PORTS.api} is left alone: the mobile suites never use it (database orenjitrade).`,
      );
    }
  }
  await assertPortsFree([['Mobile E2E API', PORTS.mobileE2eApi]]);
  const handle = await startIsolatedApi({ skipBuild });
  return handle ? { handle, reused: false } : null;
}

export async function testMobileE2e(argv) {
  const { flags, rest } = parseFlags(argv, {
    reuse: ['--reuse-running'],
    skipBuild: ['--skip-build'],
    keep: ['--keep-running'],
    stackOnly: ['--stack-only'],
    stop: ['--stop'],
  });
  if (flags.stop) {
    return stopRecorded(['web', 'api']);
  }
  const keep = flags.keep || flags.stackOnly;
  if ((await ensureInfrastructure()) !== 0) {
    return 1;
  }
  fs.mkdirSync(LOGS_DIR, { recursive: true });

  const started = [];
  let interrupted = false;
  const stopStarted = async () => {
    for (const handle of [...started].reverse()) {
      await stopProcess(handle.pid, handle.exited);
    }
  };
  const onSignal = () => {
    if (interrupted) {
      return;
    }
    interrupted = true;
    log.warn('Interrupted: stopping the API and the web server started for the mobile E2E run.');
    void stopStarted().then(() => process.exit(130));
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  if (IS_WINDOWS) {
    process.on('SIGBREAK', onSignal);
  }

  const runId = process.env.E2E_RUN_ID || newRunId();
  let stackReady = false;
  try {
    const api = await ensureIsolatedApi({ reuse: flags.reuse, skipBuild: flags.skipBuild });
    if (!api) {
      return 1;
    }
    if (api.handle) {
      started.push(api.handle);
    }

    let webReused = false;
    if (flags.reuse) {
      const refusal = await webReuseRefusal();
      webReused = !refusal;
      if (webReused) {
        log.info(`Reusing the mobile web build on ${WEB_URL}.`);
      } else if (await portInUse(PORTS.mobileE2eWeb)) {
        log.error(`--reuse-running: ${refusal}; refusing to run against it.`);
        return 1;
      }
    }
    if (!webReused) {
      await assertPortsFree([['Mobile E2E web server', PORTS.mobileE2eWeb]]);
      const web = await startWeb({ skipBuild: flags.skipBuild });
      if (!web) {
        return 1;
      }
      started.push(web);
    }

    if (keep) {
      const state = readState();
      for (const handle of started) {
        state[handle.name === 'mobile-e2e-api' ? 'api' : 'web'] = {
          pid: handle.pid,
          port: handle.port,
          instance: handle.instance,
          startedAt: new Date().toISOString(),
        };
      }
      writeState(state);
    }
    stackReady = true;
    if (flags.stackOnly) {
      log.ok(`Mobile E2E stack running: API ${API_URL} (database ${MOBILE_E2E_DB}), web ${WEB_URL}.`);
      return 0;
    }

    log.step('Ensuring the Playwright Chromium browser is installed');
    const install = await run(playwright(['install', 'chromium']), { cwd: MOBILE_DIR, env: childEnv() });
    if (install !== 0) {
      return install;
    }

    const playwrightArgs = rest.some((arg) => arg.startsWith('--retries')) ? rest : ['--retries=1', ...rest];
    log.step(`Playwright: every spec under apps/mobile/e2e (run ${runId}, ${playwrightArgs.join(' ')})`);
    return await run(playwright(['test', ...playwrightArgs]), {
      cwd: MOBILE_DIR,
      env: {
        ...childEnv(),
        E2E_BASE_URL: WEB_URL,
        E2E_API_URL: API_URL,
        E2E_AUTH_EMULATOR_URL: AUTH_EMULATOR_URL,
        E2E_REQUIRE_STACK: '1',
        E2E_RUN_ID: runId,
      },
    });
  } catch (error) {
    log.error(error.message);
    return 1;
  } finally {
    if (!flags.stackOnly) {
      // Playwright's global teardown already deletes the run's accounts; this is the fallback when
      // it could not run (best effort, only m-<run id>-...@mobile-e2e.test).
      try {
        const deleted = await deleteRunAccounts({ emulatorUrl: AUTH_EMULATOR_URL, projectId: FIREBASE_PROJECT_ID, runId });
        log.info(`Auth emulator: ${deleted} leftover account(s) of run ${runId} deleted.`);
      } catch (error) {
        log.warn(`Could not delete the emulator accounts of run ${runId}: ${error.message}`);
      }
    }
    if (started.length > 0 && !interrupted && !(keep && stackReady)) {
      log.step('Stopping the API and the web server started for the mobile E2E run');
      await stopStarted();
      const state = readState();
      for (const handle of started) {
        delete state[handle.name === 'mobile-e2e-api' ? 'api' : 'web'];
      }
      writeState(state);
    } else if (keep && stackReady) {
      log.ok('Left the mobile E2E stack running (--keep-running); stop it with `npm run test:mobile:e2e -- --stop`.');
    }
  }
}
