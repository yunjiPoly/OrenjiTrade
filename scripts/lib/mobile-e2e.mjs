// npm run test:mobile:e2e — the mobile app's web build driven by Playwright against a REAL local
// stack, without touching what a developer may be running:
//
//   * infrastructure: the shared docker compose containers (PostGIS, Redis, Firebase Auth
//     emulator). Started with `npm run infra:up` only when they are not running; never restarted
//     or reset.
//   * database: an isolated database `orenjitrade_mobile_e2e` on the shared PostgreSQL (created
//     when missing, migrated by Flyway when the API starts, seeded by SeedDataRunner).
//   * API: the API jar on :8090 (profile local) against that database, Redis database 1, its own
//     media and card-image cache directories under .local-dev/mobile-e2e, no on-demand provider
//     downloads.
//   * app: `expo export --platform web` pointed at that API and the Auth emulator, served on
//     :19006 by `expo serve` (CORS already allows localhost:19006).
//
// Then every spec under apps/mobile/e2e runs, and only what this run started is stopped.
// Flags: --reuse-running (use an API on :8090 / a web build on :19006 that are already up),
// --skip-build (reuse the last jar and web export), anything else goes to Playwright.

import fs from 'node:fs';
import path from 'node:path';
import {
  API_DIR,
  IS_WINDOWS,
  LOCAL_DEV_DIR,
  MOBILE_DIR,
  ManagedProcess,
  PORTS,
  assertPortsFree,
  capture,
  childEnv,
  ensureDocker,
  findJava21,
  formatDuration,
  httpStatus,
  infraUp,
  log,
  parseFlags,
  resolvePackageFile,
  run,
  runGradle,
  waitForHttp,
} from './util.mjs';

export const MOBILE_E2E_DB = 'orenjitrade_mobile_e2e';
const CONTAINERS = ['orenjitrade-postgres', 'orenjitrade-redis', 'orenjitrade-firebase-auth'];
const WORK_DIR = path.join(LOCAL_DEV_DIR, 'mobile-e2e');
const WEB_BUILD_DIR = path.join(WORK_DIR, 'web');
const LOGS = path.join(WORK_DIR, 'logs');

const API_URL = `http://localhost:${PORTS.mobileE2eApi}`;
const API_READINESS = `${API_URL}/actuator/health/readiness`;
const WEB_URL = `http://localhost:${PORTS.mobileE2eWeb}`;
const AUTH_EMULATOR_URL = `http://localhost:${PORTS.authEmulator}`;

/** `running`/`healthy` state of each infrastructure container (docker inspect). */
function containerStates() {
  return CONTAINERS.map((name) => {
    const result = capture('docker', [
      'inspect',
      '-f',
      '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}',
      name,
    ]);
    const [status = 'missing', health = 'none'] = result.status === 0 ? result.stdout.trim().split(' ') : [];
    return { name, status, health };
  });
}

async function ensureInfrastructure() {
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

function psql(sql, database = 'postgres') {
  return capture('docker', [
    'exec',
    'orenjitrade-postgres',
    'psql',
    '-U',
    'orenjitrade',
    '-d',
    database,
    '-v',
    'ON_ERROR_STOP=1',
    '-tAc',
    sql,
  ]);
}

/** Creates the isolated database when missing (Flyway migrates it when the API starts). */
function ensureDatabase() {
  const exists = psql(`SELECT 1 FROM pg_database WHERE datname = '${MOBILE_E2E_DB}'`);
  if (exists.status !== 0) {
    log.error(`Cannot query PostgreSQL in orenjitrade-postgres: ${exists.stderr.trim()}`);
    return false;
  }
  if (exists.stdout.trim() === '1') {
    log.info(`Database ${MOBILE_E2E_DB} exists; the API migrates it on start.`);
    return true;
  }
  const created = psql(`CREATE DATABASE ${MOBILE_E2E_DB} OWNER orenjitrade`);
  if (created.status !== 0) {
    log.error(`CREATE DATABASE ${MOBILE_E2E_DB} failed: ${created.stderr.trim()}`);
    return false;
  }
  log.ok(`Created the isolated database ${MOBILE_E2E_DB}.`);
  return true;
}

/** Environment of the isolated API (local profile; never the developer's database or ports). */
export function mobileE2eApiEnv(base) {
  return {
    ...base,
    SPRING_PROFILES_ACTIVE: 'local',
    SERVER_PORT: String(PORTS.mobileE2eApi),
    DATABASE_URL: `jdbc:postgresql://localhost:${PORTS.postgres}/${MOBILE_E2E_DB}`,
    DATABASE_USERNAME: 'orenjitrade',
    DATABASE_PASSWORD: base.DATABASE_PASSWORD ?? 'orenjitrade_local',
    // Redis database 1: rate-limit counters and caches never mix with the developer's API (db 0).
    REDIS_URL: `redis://localhost:${PORTS.redis}/1`,
    FIREBASE_AUTH_EMULATOR_HOST: `localhost:${PORTS.authEmulator}`,
    FIREBASE_PROJECT_ID: base.FIREBASE_PROJECT_ID ?? 'orenjitrade-local',
    STORAGE_PROVIDER: 'local',
    STORAGE_LOCAL_ROOT: path.join(WORK_DIR, 'storage'),
    CARD_IMAGE_CACHE_DIR: path.join(WORK_DIR, 'card-images'),
    CARD_IMAGE_ON_DEMAND_ENABLED: 'false',
    CORS_ALLOWED_ORIGINS: `${WEB_URL},http://127.0.0.1:${PORTS.mobileE2eWeb}`,
    EVENTS_TRANSPORT: 'local',
    PAYMENT_PROVIDER: 'fake',
    BILLING_PROVIDER: 'fake',
    DONATION_PROVIDER: 'fake',
    PUSH_PROVIDER: 'log',
    EMAIL_PROVIDER: 'log',
  };
}

/** Public build-time values of the web export (the app talks to the isolated API only). */
export function mobileE2eWebEnv(base) {
  return {
    ...base,
    EXPO_PUBLIC_API_BASE_URL: API_URL,
    EXPO_PUBLIC_FIREBASE_API_KEY: 'demo-local-key',
    EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: 'orenjitrade-local.firebaseapp.com',
    EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'orenjitrade-local',
    EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST: `localhost:${PORTS.authEmulator}`,
    EXPO_NO_TELEMETRY: '1',
    CI: base.CI ?? '1',
  };
}

function expoCli(args) {
  const cli = resolvePackageFile(MOBILE_DIR, '@expo/cli', path.join('build', 'bin', 'cli'));
  return { command: process.execPath, args: [cli, ...args], shell: false };
}

function playwright(args) {
  const cli = resolvePackageFile(MOBILE_DIR, '@playwright/test', 'cli.js');
  return { command: process.execPath, args: [cli, ...args], shell: false };
}

export async function testMobileE2e(argv) {
  const { flags, rest } = parseFlags(argv, { reuse: ['--reuse-running'], skipBuild: ['--skip-build'] });
  ensureDocker();
  if ((await ensureInfrastructure()) !== 0) {
    return 1;
  }
  if (!ensureDatabase()) {
    return 1;
  }
  fs.mkdirSync(LOGS, { recursive: true });

  const started = [];
  let interrupted = false;
  const stopAll = async () => {
    for (const child of [...started].reverse()) {
      await child.stop({ graceful: !IS_WINDOWS, graceMs: 15_000 });
    }
  };
  const onSignal = () => {
    if (interrupted) {
      return;
    }
    interrupted = true;
    log.warn('Interrupted: stopping the API and the web server started for the mobile E2E run.');
    void stopAll().then(() => process.exit(130));
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  if (IS_WINDOWS) {
    process.on('SIGBREAK', onSignal);
  }

  try {
    const base = childEnv();
    const apiUp = flags.reuse && (await httpStatus(API_READINESS)) === 200;
    const webUp = flags.reuse && (await httpStatus(`${WEB_URL}/`)) === 200;
    await assertPortsFree([
      ...(apiUp ? [] : [['Mobile E2E API', PORTS.mobileE2eApi]]),
      ...(webUp ? [] : [['Mobile E2E web server', PORTS.mobileE2eWeb]]),
    ]);

    if (apiUp) {
      log.info(`Reusing the API already running on ${API_URL} (--reuse-running).`);
    } else {
      const jar = path.join(WORK_DIR, 'api-mobile-e2e.jar');
      if (!(flags.skipBuild && fs.existsSync(jar))) {
        log.step('Building the API jar (gradlew bootJar)');
        const code = await runGradle(['bootJar'], { cwd: API_DIR, env: base });
        if (code !== 0) {
          return code;
        }
        // A copy, so later Gradle builds can overwrite build/libs/app.jar while this API runs.
        fs.copyFileSync(path.join(API_DIR, 'build', 'libs', 'app.jar'), jar);
      }
      const java = findJava21();
      if (!java) {
        log.error('No Java 21+ runtime found (ORENJI_JAVA_HOME, JAVA_HOME, PATH, ~/.gradle/jdks).');
        return 1;
      }
      log.step(
        `Starting the API jar on :${PORTS.mobileE2eApi} (profile local, database ${MOBILE_E2E_DB}, log .local-dev/mobile-e2e/logs/api.log)`,
      );
      started.push(
        new ManagedProcess('mobile-e2e-api', { command: java, args: ['-jar', jar], shell: false }, {
          cwd: WORK_DIR,
          env: mobileE2eApiEnv(base),
          echo: false,
          logFile: path.join(LOGS, 'api.log'),
        }).start(),
      );
    }

    if (webUp) {
      log.info(`Reusing the web build already served on ${WEB_URL} (--reuse-running).`);
    } else {
      const webEnv = mobileE2eWebEnv(base);
      if (!(flags.skipBuild && fs.existsSync(path.join(WEB_BUILD_DIR, 'index.html')))) {
        log.step(`Exporting the Expo web build for ${API_URL} (expo export --platform web)`);
        fs.rmSync(WEB_BUILD_DIR, { recursive: true, force: true });
        const code = await run(
          expoCli(['export', '--platform', 'web', '--output-dir', WEB_BUILD_DIR, '--clear']),
          { cwd: MOBILE_DIR, env: webEnv },
        );
        if (code !== 0) {
          return code;
        }
      }
      log.step(`Serving the web build on :${PORTS.mobileE2eWeb} (expo serve, log .local-dev/mobile-e2e/logs/web.log)`);
      started.push(
        new ManagedProcess(
          'mobile-e2e-web',
          expoCli(['serve', WEB_BUILD_DIR, '--port', String(PORTS.mobileE2eWeb)]),
          { cwd: MOBILE_DIR, env: webEnv, echo: false, logFile: path.join(LOGS, 'web.log') },
        ).start(),
      );
    }

    const exitedReason = (name) => () => {
      const child = started.find((candidate) => candidate.name === name);
      return child && !child.running
        ? `${name} exited (code ${child.exitInfo.code}); see ${child.logFile}`
        : null;
    };
    log.step('Waiting for the API readiness and the web root');
    const [apiWait, webWait] = await Promise.all([
      waitForHttp(API_READINESS, { timeoutMs: 10 * 60_000, abortIf: exitedReason('mobile-e2e-api') }),
      waitForHttp(`${WEB_URL}/`, { timeoutMs: 5 * 60_000, abortIf: exitedReason('mobile-e2e-web') }),
    ]);
    log.ok(`API ready (${formatDuration(apiWait)}), web ready (${formatDuration(webWait)}).`);

    log.step('Ensuring the Playwright Chromium browser is installed');
    const install = await run(playwright(['install', 'chromium']), { cwd: MOBILE_DIR, env: base });
    if (install !== 0) {
      return install;
    }

    const playwrightArgs = rest.some((arg) => arg.startsWith('--retries')) ? rest : ['--retries=1', ...rest];
    log.step(`Playwright: every spec under apps/mobile/e2e (${playwrightArgs.join(' ')})`);
    return await run(playwright(['test', ...playwrightArgs]), {
      cwd: MOBILE_DIR,
      env: {
        ...base,
        E2E_BASE_URL: WEB_URL,
        E2E_API_URL: API_URL,
        E2E_AUTH_EMULATOR_URL: AUTH_EMULATOR_URL,
        E2E_REQUIRE_STACK: '1',
      },
    });
  } catch (error) {
    log.error(error.message);
    return 1;
  } finally {
    if (started.length > 0 && !interrupted) {
      log.step('Stopping the API and the web server started for the mobile E2E run');
      await stopAll();
    }
  }
}

