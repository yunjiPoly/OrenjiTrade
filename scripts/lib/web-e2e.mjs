// npm run test:e2e — the web Playwright suite on its OWN local stack, isolated from `npm run dev`:
//
//   database  orenjitrade_e2e (dropped and recreated per run; Flyway + local seed, mock catalog only)
//   API       the bootJar on :8180 (E2E_API_PORT), Redis db 2, own realtime channels, media and card
//             image cache under .local-dev/e2e/, no card image downloads, YGOPRODeck disabled
//   web       ng serve --configuration e2e on :4300 (E2E_WEB_PORT), whose config.json points at it
//   shared    the docker compose containers (never restarted) and the Firebase Auth emulator: the
//             run's accounts (e2e-<run id>-...@example.test) are deleted from it at the end
//
// Options (after `--`):
//   --reuse-running   reuse the stack a previous `--keep-running` run left (never the developer API)
//   --keep-running    leave the API and the web server running after the run (state in .local-dev/e2e)
//   --stack-only      start the stack and leave it running without running Playwright
//   --stop            stop a stack left by --keep-running / --stack-only
//   --keep-db         do not recreate the E2E database (default: fresh database per run)
//   anything else     passed to Playwright (spec files, --headed, --retries=0, ...)

import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { deleteEmulatorAccountsWhere } from './auth-emulator.mjs';
import { containerHealth, dockerEngineIsLocal, ensureDatabase, recreateDatabase } from './local-db.mjs';
import {
  API_DIR,
  IS_WINDOWS,
  LOCAL_DEV_DIR,
  LOG_DIR,
  ROOT,
  WEB_DIR,
  capture,
  childEnv,
  describePortOwner,
  ensureDocker,
  findJava21,
  formatDuration,
  httpStatus,
  infraUp,
  isAlive,
  killTree,
  listeningPids,
  loadDotEnv,
  log,
  ngInvocation,
  processName,
  parseFlags,
  playwrightInvocation,
  portInUse,
  run,
  runGradle,
  runNpm,
  settlesWithin,
  table,
  waitForHttp,
} from './util.mjs';
import {
  DEV_API_PORT,
  E2E_API_PORT,
  E2E_DB,
  E2E_REDIS_DB,
  E2E_WEB_PORT,
  INFO_KEY,
  assertIsolated,
  developerDirs,
  e2eApiEnv,
  identityArgs,
  isRunAccount,
  newRunId,
  portProblem,
  redisDatabaseOf,
  reuseRefusal,
  webReuseRefusal,
  webRuntimeConfig,
} from './web-e2e-guard.mjs';

export const WORK_DIR = path.join(LOCAL_DEV_DIR, 'e2e');
const STATE_FILE = path.join(WORK_DIR, 'state.json');
/** config.json served by `ng serve --configuration e2e` (angular.json, git-ignored). */
export const WEB_RUNTIME_CONFIG = path.join(WEB_DIR, 'e2e', '.runtime', 'config.json');
const REDIS_CONTAINER = 'orenjitrade-redis';
const INFRA_CONTAINERS = ['orenjitrade-postgres', REDIS_CONTAINER, 'orenjitrade-firebase-auth'];

// ------------------------------------------------------------------------------- settings

function settings() {
  const env = { ...loadDotEnv(), ...process.env };
  const apiPort = Number(env.E2E_API_PORT || E2E_API_PORT);
  const webPort = Number(env.E2E_WEB_PORT || E2E_WEB_PORT);
  const emulatorHost = env.FIREBASE_AUTH_EMULATOR_HOST || 'localhost:9099';
  return {
    apiPort,
    webPort,
    apiUrl: `http://localhost:${apiPort}`,
    webUrl: `http://localhost:${webPort}`,
    emulatorHost,
    emulatorUrl: `http://${emulatorHost}`,
  };
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function writeState(state) {
  fs.mkdirSync(WORK_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
}

function clearState() {
  fs.rmSync(STATE_FILE, { force: true });
}

/** apps/api of this checkout and of every other git worktree of the repository. */
function apiDirsOfAllCheckouts() {
  const dirs = new Set([API_DIR]);
  const { status, stdout } = capture('git', ['-C', ROOT, 'worktree', 'list', '--porcelain']);
  if (status === 0) {
    for (const line of stdout.split(/\r?\n/)) {
      if (line.startsWith('worktree ')) {
        dirs.add(path.join(path.resolve(line.slice('worktree '.length).trim()), 'apps', 'api'));
      }
    }
  }
  return [...dirs];
}

async function fetchJson(url, timeoutMs = 3000) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) {
      await response.body?.cancel();
      return { status: response.status, body: null };
    }
    return { status: response.status, body: await response.json() };
  } catch {
    return { status: 0, body: null };
  }
}

// --------------------------------------------------------------------------- processes

/**
 * Starts a child whose output goes straight to `logFile` (no pipe through this process, so a
 * --keep-running child survives this process). Own process group, no console window.
 */
function startLogged(name, invocation, { cwd, env, logFile }) {
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const fd = fs.openSync(logFile, 'w');
  const child = spawn(invocation.command, invocation.args, {
    cwd,
    env,
    shell: invocation.shell,
    stdio: ['ignore', fd, fd],
    detached: true,
    windowsHide: true,
  });
  fs.closeSync(fd);
  const handle = { name, pid: child.pid, logFile, child, exitInfo: undefined };
  handle.exited = new Promise((resolve) => {
    child.on('exit', (code, signal) => {
      handle.exitInfo = { code, signal };
      resolve(handle.exitInfo);
    });
    child.on('error', (error) => {
      fs.appendFileSync(logFile, `spawn error: ${error.message}\n`);
      handle.exitInfo = { code: 127, signal: null };
      resolve(handle.exitInfo);
    });
  });
  return handle;
}

async function stopHandle(handle) {
  if (handle.exitInfo !== undefined) {
    return;
  }
  killTree(handle.pid);
  await settlesWithin(handle.exited, 15_000);
}

/**
 * Stops a recorded PID, but only while it is still ours: it listens on its recorded port (java
 * and `node ng.js serve` are spawned directly, so the recorded process is the listener) or it is
 * still the expected program. A recycled PID is never killed.
 */
function stopRecorded(pid, port, label, expectedImage) {
  if (!pid || !isAlive(pid)) {
    return false;
  }
  const ours = listeningPids(port).has(pid) || expectedImage.test(processName(pid));
  if (!ours) {
    log.warn(`${label} (PID ${pid}) is no longer the process this harness started; leaving it alone.`);
    return false;
  }
  killTree(pid);
  return true;
}

// ----------------------------------------------------------------------- infrastructure

/**
 * Ensures PostgreSQL, Redis and the Auth emulator are up. When the containers are already healthy
 * nothing is touched: `docker compose up` from another checkout or worktree would recreate the
 * developer's containers (the bind-mounted init directory is part of their configuration).
 */
async function ensureInfrastructure() {
  const health = INFRA_CONTAINERS.map((name) => [name, containerHealth(name)]);
  if (health.every(([, state]) => state === 'healthy')) {
    log.ok(`Infrastructure already running (${INFRA_CONTAINERS.join(', ')} healthy); not touching it.`);
    return 0;
  }
  log.info(`Infrastructure state: ${health.map(([name, state]) => `${name}=${state}`).join(', ')}`);
  return infraUp();
}

/** FLUSHDB of the E2E Redis logical database (refuses any other). */
function flushE2eRedis(redisUrl) {
  const db = redisDatabaseOf(redisUrl);
  if (db !== E2E_REDIS_DB) {
    throw new Error(`Refusing to flush Redis db ${db}: only the E2E db ${E2E_REDIS_DB} is flushed.`);
  }
  const result = capture('docker', ['exec', REDIS_CONTAINER, 'redis-cli', '-n', String(db), 'FLUSHDB']);
  if (result.status !== 0 || !/OK/.test(result.stdout)) {
    log.warn(`Could not flush the E2E Redis db ${db} (cached pages expire within a minute anyway).`);
  }
}

// ------------------------------------------------------------------------------ guards

function runGuardTests() {
  log.step('Isolation guard tests (node --test scripts/lib/web-e2e-guard.test.mjs)');
  return run(
    { command: process.execPath, args: ['--test', '--test-reporter=dot', path.join(ROOT, 'scripts', 'lib', 'web-e2e-guard.test.mjs')], shell: false },
    { cwd: ROOT },
  );
}

async function refuseDevStackMessage(s) {
  const devUp = (await httpStatus(`http://localhost:${DEV_API_PORT}/actuator/health/readiness`)) === 200;
  return devUp
    ? ` The API answering on :${DEV_API_PORT} is the developer API (database orenjitrade); the E2E suite never uses it.`
    : '';
}

// ----------------------------------------------------------------------------- stop

async function stopKept() {
  const state = readState();
  if (!state) {
    log.info('No E2E stack recorded in .local-dev/e2e/state.json; nothing to stop.');
    return 0;
  }
  const stoppedApi = stopRecorded(state.apiPid, state.apiPort, 'E2E API', /^java(\.exe)?$/i);
  const stoppedWeb = stopRecorded(state.webPid, state.webPort, 'E2E web server', /^node(\.exe)?$/i);
  clearState();
  log.ok(
    `Stopped the kept E2E stack (API ${stoppedApi ? 'stopped' : 'not running'}, web ${stoppedWeb ? 'stopped' : 'not running'}).`,
  );
  return 0;
}

// ------------------------------------------------------------------------------- main

export async function runWebE2e(argv) {
  const { flags, rest } = parseFlags(argv, {
    reuse: ['--reuse-running'],
    keep: ['--keep-running'],
    stackOnly: ['--stack-only'],
    stop: ['--stop'],
    keepDb: ['--keep-db'],
  });
  if (flags.stop) {
    return stopKept();
  }
  const s = settings();
  for (const [label, port] of [
    ['E2E_API_PORT', s.apiPort],
    ['E2E_WEB_PORT', s.webPort],
  ]) {
    const problem = portProblem(label, port);
    if (problem) {
      log.error(`${problem}${await refuseDevStackMessage(s)}`);
      return 1;
    }
  }
  const keep = flags.keep || flags.stackOnly;

  if ((await runGuardTests()) !== 0) {
    log.error('The isolation guard tests failed; not starting anything.');
    return 1;
  }

  ensureDocker();
  if (!dockerEngineIsLocal()) {
    log.error('The Docker CLI does not talk to a local engine; the E2E suite only runs against a local stack.');
    return 1;
  }
  if ((await ensureInfrastructure()) !== 0) {
    return 1;
  }

  const runId = process.env.E2E_RUN_ID || newRunId();
  const started = [];
  let interrupted = false;
  let cleanedUp = false;

  const cleanupAccounts = async () => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;
    try {
      const deleted = await deleteEmulatorAccountsWhere({
        emulatorUrl: s.emulatorUrl,
        predicate: (email) => isRunAccount(email, runId),
      });
      log.ok(`Deleted ${deleted.length} Auth emulator account(s) created by run ${runId} (e2e-${runId}-...@example.test).`);
    } catch (error) {
      log.warn(`Could not delete the run's Auth emulator accounts (best effort): ${error.message}`);
    }
  };
  const stopStarted = async () => {
    for (const handle of [...started].reverse()) {
      await stopHandle(handle);
    }
    if (started.length > 0) {
      const state = readState();
      if (state && started.some((handle) => handle.pid === state.apiPid || handle.pid === state.webPid)) {
        clearState();
      }
    }
  };
  const onSignal = () => {
    if (interrupted) {
      return;
    }
    interrupted = true;
    log.warn('Interrupted: deleting the run\'s emulator accounts and stopping what this run started.');
    void cleanupAccounts()
      .then(stopStarted)
      .then(() => process.exit(130));
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  if (IS_WINDOWS) {
    process.on('SIGBREAK', onSignal);
  }

  let stackReady = false;
  try {
    const env = childEnv();
    if (flags.reuse) {
      const state = readState();
      const info = await fetchJson(`${s.apiUrl}/actuator/info`);
      if (info.status === 0) {
        log.error(
          `--reuse-running: no API answers on ${s.apiUrl}. Start the E2E stack with \`npm run test:e2e -- --keep-running\` ` +
            `(or --stack-only) first.${await refuseDevStackMessage(s)}`,
        );
        return 1;
      }
      const refusal =
        reuseRefusal(s.apiUrl, info.body, state?.instance ?? '') ??
        (state ? null : 'no stack recorded in .local-dev/e2e/state.json by this checkout; start one with --keep-running.');
      if (refusal) {
        log.error(`--reuse-running: ${refusal}`);
        return 1;
      }
      const config = await fetchJson(`${s.webUrl}/config.json`);
      const webRefusal = config.status === 0 ? `no web server answers on ${s.webUrl}.` : webReuseRefusal(s.webUrl, config.body, s.apiUrl);
      if (webRefusal) {
        log.error(`--reuse-running: ${webRefusal}`);
        return 1;
      }
      log.ok(`Reusing the E2E stack (API ${s.apiUrl}, database ${E2E_DB}, instance ${state.instance}; web ${s.webUrl}).`);
      stackReady = true;
    } else {
      const busy = [];
      for (const [label, port] of [
        ['E2E API', s.apiPort],
        ['E2E web server', s.webPort],
      ]) {
        if (await portInUse(port)) {
          busy.push(`  - ${label} port ${port} is used by ${describePortOwner(port)}`);
        }
      }
      if (busy.length > 0) {
        log.error(
          `Ports of the E2E stack are busy:\n${busy.join('\n')}\n` +
            (readState()
              ? 'A stack kept by an earlier --keep-running run is probably still up: reuse it (-- --reuse-running) or stop it (-- --stop).'
              : 'Stop the other process, or move the E2E stack with E2E_API_PORT / E2E_WEB_PORT.'),
        );
        return 1;
      }

      // The API's environment: every isolation-relevant variable set explicitly, then verified.
      const instance = crypto.randomUUID();
      const apiEnv = e2eApiEnv(env, { apiPort: s.apiPort, webPort: s.webPort, workDir: WORK_DIR });
      const devDirs = developerDirs(apiDirsOfAllCheckouts(), { ...loadDotEnv(), ...process.env });
      assertIsolated(apiEnv, { workDir: WORK_DIR, devDirs });

      if (flags.keepDb) {
        log.step(`Ensuring the E2E database ${E2E_DB} exists (--keep-db)`);
        ensureDatabase(E2E_DB);
      } else {
        log.step(`Recreating the E2E database ${E2E_DB} (fresh schema and seed for every run)`);
        recreateDatabase(E2E_DB);
        // Files and cached pages of the previous database would only be stale; start empty. Only
        // the E2E logical database is flushed, never the developer's db 0 or the mobile db 1.
        for (const dir of [apiEnv.STORAGE_LOCAL_ROOT, apiEnv.CARD_IMAGE_CACHE_DIR]) {
          fs.rmSync(dir, { recursive: true, force: true });
        }
        flushE2eRedis(apiEnv.REDIS_URL);
      }
      for (const dir of [apiEnv.STORAGE_LOCAL_ROOT, apiEnv.CARD_IMAGE_CACHE_DIR, apiEnv.PROVIDER_DATA_DIR]) {
        fs.mkdirSync(dir, { recursive: true });
      }

      log.step('Building the API jar (gradlew bootJar)');
      const buildCode = await runGradle(['bootJar'], { cwd: API_DIR, env });
      if (buildCode !== 0) {
        return buildCode;
      }
      // Run a copy so later Gradle builds can overwrite build/libs/app.jar while the E2E API runs.
      fs.mkdirSync(WORK_DIR, { recursive: true });
      const jar = path.join(WORK_DIR, 'api-e2e.jar');
      fs.copyFileSync(path.join(API_DIR, 'build', 'libs', 'app.jar'), jar);
      const java = findJava21();
      if (!java) {
        log.error(
          'No Java 21+ runtime found (checked ORENJI_JAVA_HOME, JAVA_HOME, PATH and ~/.gradle/jdks). ' +
            'Run `npm run api:dev` once so Gradle provisions JDK 21, or set ORENJI_JAVA_HOME.',
        );
        return 1;
      }

      log.step('Building design tokens and writing the E2E web config.json');
      if ((await runNpm(['run', 'build:tokens'], { env })) !== 0) {
        return 1;
      }
      fs.mkdirSync(path.dirname(WEB_RUNTIME_CONFIG), { recursive: true });
      fs.writeFileSync(
        WEB_RUNTIME_CONFIG,
        `${JSON.stringify(webRuntimeConfig({ apiUrl: s.apiUrl, emulatorHost: s.emulatorHost }), null, 2)}\n`,
      );

      log.step(
        `Starting the E2E API on :${s.apiPort} (database ${E2E_DB}, Redis db ${new URL(apiEnv.REDIS_URL).pathname.slice(1)}, ` +
          `files under .local-dev/e2e; log .local-dev/logs/e2e-api.log) and ng serve on :${s.webPort} (log .local-dev/logs/e2e-web.log)`,
      );
      log.info(`java: ${java}`);
      started.push(
        startLogged('api', { command: java, args: ['-jar', jar, ...identityArgs(instance)], shell: false }, {
          // The API's relative defaults (./.local-storage, ./.local-dev/provider-data) resolve inside
          // .local-dev/e2e as well, never in apps/api.
          cwd: WORK_DIR,
          env: apiEnv,
          logFile: path.join(LOG_DIR, 'e2e-api.log'),
        }),
      );
      started.push(
        startLogged('web', ngInvocation(['serve', '--configuration', 'e2e', '--port', String(s.webPort)]), {
          cwd: WEB_DIR,
          // CI=true turns off Angular's persistent build cache for this dev server, so it never
          // shares .angular/cache with the developer's `ng serve`.
          env: { ...env, CI: 'true' },
          logFile: path.join(LOG_DIR, 'e2e-web.log'),
        }),
      );
      writeState({
        instance,
        database: E2E_DB,
        apiUrl: s.apiUrl,
        apiPort: s.apiPort,
        apiPid: started[0].pid,
        webUrl: s.webUrl,
        webPort: s.webPort,
        webPid: started[1].pid,
        startedAt: new Date().toISOString(),
      });

      const exitedReason = (name) => () => {
        const handle = started.find((candidate) => candidate.name === name);
        return handle && handle.exitInfo !== undefined
          ? `${name} exited (code ${handle.exitInfo.code}); see ${handle.logFile}`
          : null;
      };
      log.step('Waiting for the API readiness and the web root');
      const [apiWait, webWait] = await Promise.all([
        waitForHttp(`${s.apiUrl}/actuator/health/readiness`, { timeoutMs: 10 * 60_000, abortIf: exitedReason('api') }),
        waitForHttp(`${s.webUrl}/`, { timeoutMs: 10 * 60_000, abortIf: exitedReason('web') }),
      ]);
      const info = await fetchJson(`${s.apiUrl}/actuator/info`);
      const refusal = reuseRefusal(s.apiUrl, info.body, instance);
      if (refusal) {
        throw new Error(`The API on ${s.apiUrl} is not the one just started: ${refusal}`);
      }
      const config = await fetchJson(`${s.webUrl}/config.json`);
      const webRefusal = webReuseRefusal(s.webUrl, config.body, s.apiUrl);
      if (webRefusal) {
        throw new Error(webRefusal);
      }
      log.ok(
        `E2E API ready (${formatDuration(apiWait)}; /actuator/info ${INFO_KEY}.database=${info.body[INFO_KEY].database}), ` +
          `web ready (${formatDuration(webWait)}; config.json → ${config.body.apiBaseUrl}).`,
      );
      stackReady = true;
    }

    if (flags.stackOnly) {
      printStack(s, runId);
      return 0;
    }

    log.step('Ensuring the Playwright Chromium browser is installed');
    const install = await run(playwrightInvocation(['install', 'chromium']), { cwd: WEB_DIR, env });
    if (install !== 0) {
      return install;
    }

    // One retry, like CI (which retries twice): a spec that fails and then passes is reported as
    // "flaky" in the summary instead of failing the whole local run. Pass --retries=0 to disable.
    const playwrightArgs = rest.some((arg) => arg.startsWith('--retries')) ? rest : ['--retries=1', ...rest];
    log.step(`Playwright: every spec under apps/web-angular/e2e (${playwrightArgs.join(' ')}; run ${runId})`);
    const code = await run(playwrightInvocation(['test', ...playwrightArgs]), {
      cwd: WEB_DIR,
      env: {
        ...env,
        E2E_BASE_URL: s.webUrl,
        E2E_API_URL: s.apiUrl,
        E2E_AUTH_EMULATOR_URL: s.emulatorUrl,
        E2E_DB_NAME: E2E_DB,
        E2E_RUN_ID: runId,
        E2E_HARNESS: '1',
        // A stack that went down mid-run fails the run instead of skipping specs.
        E2E_REQUIRE_STACK: '1',
      },
    });
    return code;
  } catch (error) {
    log.error(error.message);
    return 1;
  } finally {
    if (!interrupted) {
      await cleanupAccounts();
      if (keep && stackReady && started.length > 0) {
        for (const handle of started) {
          handle.child.unref();
        }
        if (!flags.stackOnly) {
          printStack(s, runId);
        }
      } else if (started.length > 0) {
        log.step('Stopping the E2E API and web server started for this run');
        await stopStarted();
      }
    }
  }
}

function printStack(s, runId) {
  console.log(
    `\n${table([
      ['E2E stack', 'Where'],
      ['Web app', s.webUrl],
      ['API', `${s.apiUrl}  (database ${E2E_DB}, Redis db 2)`],
      ['Files', path.relative(ROOT, WORK_DIR)],
      ['Logs', `${path.join('.local-dev', 'logs', 'e2e-api.log')}, ${path.join('.local-dev', 'logs', 'e2e-web.log')}`],
      ['Run id', runId],
    ])}\n\nLeft running: \`npm run test:e2e -- --reuse-running [specs]\` reuses it, \`npm run test:e2e -- --stop\` stops it.\n`,
  );
}

