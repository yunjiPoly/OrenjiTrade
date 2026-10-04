#!/usr/bin/env node
// Test entry points (run from the repository root):
//   npm run test:api      apps/api: gradlew check, tests always re-executed (Spotless + unit + Testcontainers
//                         integration tests; Docker required)
//   npm run test:web      apps/web-angular: lint + unit tests (Vitest)
//   npm run test:mobile   apps/mobile: typecheck + lint + jest
//   npm run test:mobile:e2e  apps/mobile web build + Playwright against an isolated real stack: the
//                         running infrastructure (infra:up only when it is down, never restarted),
//                         database orenjitrade_mobile_e2e, the API jar on :8090, expo export + serve
//                         on :19006; stops only what it started (--reuse-running, --skip-build)
//   npm run test:e2e      Playwright suite against the real local stack: ensures the infrastructure,
//                         builds and starts the API jar on :8080 (no on-demand card image
//                         downloads from providers) and ng serve on :4200, runs every
//                         spec, then stops what it started. Extra args go to Playwright, e.g.
//                         npm run test:e2e -- e2e/map.spec.ts   (--reuse-running: use an API/web already up)
//   npm run test:all      api + web + mobile + e2e + mobile:e2e, then a summary with timings
//   npm run test:ml       optional: apps/ml pytest with apps/ml/.venv when present (Phase 11 is on hold)

import fs from 'node:fs';
import path from 'node:path';
import {
  API_DIR,
  IS_WINDOWS,
  LOCAL_DEV_DIR,
  LOG_DIR,
  ML_DIR,
  ManagedProcess,
  PORTS,
  URLS,
  WEB_DIR,
  assertPortsFree,
  capture,
  childEnv,
  ensureDocker,
  findJava21,
  formatDuration,
  httpStatus,
  infraUp,
  log,
  ngInvocation,
  paint,
  parseFlags,
  playwrightInvocation,
  run,
  runGradle,
  runNpm,
  table,
  waitForHttp,
} from './lib/util.mjs';
import { testMobileE2e } from './lib/mobile-e2e.mjs';

const [suite, ...argv] = process.argv.slice(2);

// ------------------------------------------------------------------------------- suites

async function testApi() {
  ensureDocker();
  log.step('API: gradlew check (Spotless, unit and integration tests with Testcontainers)');
  // `test --rerun`: always execute the suite (Gradle would otherwise report it UP-TO-DATE when the
  // inputs did not change since the last run); compilation stays incremental.
  return runGradle(['test', '--rerun', 'check'], { cwd: API_DIR });
}

async function sequence(steps) {
  for (const [title, invocation] of steps) {
    log.step(title);
    const code = await invocation();
    if (code !== 0) {
      log.error(`${title} failed (exit ${code}).`);
      return code;
    }
  }
  return 0;
}

function testWeb() {
  return sequence([
    ['Web: lint (ng lint)', () => runNpm(['run', 'lint', '-w', 'apps/web-angular'])],
    ['Web: unit tests (ng test)', () => runNpm(['run', 'test', '-w', 'apps/web-angular'])],
  ]);
}

function testMobile() {
  return sequence([
    ['Mobile: typecheck (tsc --noEmit)', () => runNpm(['run', 'typecheck', '-w', 'apps/mobile'])],
    ['Mobile: lint (expo lint)', () => runNpm(['run', 'lint', '-w', 'apps/mobile'])],
    ['Mobile: unit tests (jest)', () => runNpm(['run', 'test', '-w', 'apps/mobile'])],
  ]);
}

async function testE2e(args) {
  const { flags, rest } = parseFlags(args, { reuse: ['--reuse-running'] });
  ensureDocker();
  if ((await infraUp()) !== 0) {
    return 1;
  }

  const started = [];
  let interrupted = false;
  const stopAll = async () => {
    for (const child of started.reverse()) {
      await child.stop({ graceful: !IS_WINDOWS, graceMs: 15_000 });
    }
  };
  const onSignal = () => {
    if (interrupted) {
      return;
    }
    interrupted = true;
    log.warn('Interrupted: stopping the API and the web dev server started for the E2E run.');
    void stopAll().then(() => process.exit(130));
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  if (IS_WINDOWS) {
    process.on('SIGBREAK', onSignal);
  }

  try {
    const env = childEnv({ SPRING_PROFILES_ACTIVE: 'local' });
    const apiUp = flags.reuse && (await httpStatus(URLS.apiReadiness)) === 200;
    const webUp = flags.reuse && (await httpStatus(`${URLS.web}/`)) === 200;
    await assertPortsFree([
      ...(apiUp ? [] : [['API', PORTS.api]]),
      ...(webUp ? [] : [['Web dev server', PORTS.web]]),
    ]);

    if (apiUp) {
      log.info(`Reusing the API already running on ${URLS.api} (--reuse-running).`);
    } else {
      log.step('Building the API jar (gradlew bootJar)');
      const buildCode = await runGradle(['bootJar'], { cwd: API_DIR, env });
      if (buildCode !== 0) {
        return buildCode;
      }
      // Run a copy so later Gradle builds can overwrite build/libs/app.jar while the E2E API runs.
      const jarDir = path.join(LOCAL_DEV_DIR, 'e2e');
      fs.mkdirSync(jarDir, { recursive: true });
      const jar = path.join(jarDir, 'api-e2e.jar');
      fs.copyFileSync(path.join(API_DIR, 'build', 'libs', 'app.jar'), jar);
      const java = findJava21();
      if (!java) {
        log.error(
          'No Java 21+ runtime found (checked ORENJI_JAVA_HOME, JAVA_HOME, PATH and ~/.gradle/jdks). ' +
            'Run `npm run api:dev` once so Gradle provisions JDK 21, or set ORENJI_JAVA_HOME.',
        );
        return 1;
      }
      log.step(`Starting the API jar on :${PORTS.api} (profile local, log .local-dev/logs/e2e-api.log)`);
      log.info(`java: ${java}`);
      started.push(
        new ManagedProcess('api', { command: java, args: ['-jar', jar], shell: false }, {
          cwd: API_DIR,
          // No on-demand card image downloads: when the real Yu-Gi-Oh! catalog is imported locally
          // (npm run catalog:import), pages showing uncached real cards would otherwise fetch
          // artworks from the provider during the run; they get placeholders instead (ADR 0015).
          env: { ...env, SERVER_PORT: String(PORTS.api), CARD_IMAGE_ON_DEMAND_ENABLED: 'false' },
          echo: false,
          logFile: path.join(LOG_DIR, 'e2e-api.log'),
        }).start(),
      );
    }

    if (webUp) {
      log.info(`Reusing the web app already served on ${URLS.web} (--reuse-running).`);
    } else {
      log.step('Building design tokens and starting ng serve on :4200 (log .local-dev/logs/e2e-web.log)');
      const tokens = await runNpm(['run', 'build:tokens'], { env });
      if (tokens !== 0) {
        return tokens;
      }
      started.push(
        new ManagedProcess('web', ngInvocation(['serve', '--port', String(PORTS.web)]), {
          cwd: WEB_DIR,
          env,
          echo: false,
          logFile: path.join(LOG_DIR, 'e2e-web.log'),
        }).start(),
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
      waitForHttp(URLS.apiReadiness, { timeoutMs: 10 * 60_000, abortIf: exitedReason('api') }),
      waitForHttp(`${URLS.web}/`, { timeoutMs: 10 * 60_000, abortIf: exitedReason('web') }),
    ]);
    log.ok(`API ready (${formatDuration(apiWait)}), web ready (${formatDuration(webWait)}).`);

    log.step('Ensuring the Playwright Chromium browser is installed');
    const install = await run(playwrightInvocation(['install', 'chromium']), { cwd: WEB_DIR, env });
    if (install !== 0) {
      return install;
    }

    // One retry, like CI (which retries twice): a spec that fails and then passes is reported as
    // "flaky" in the summary (with a trace under apps/web-angular/test-results) instead of
    // failing the whole local run. Pass --retries=0 to disable.
    const playwrightArgs = rest.some((arg) => arg.startsWith('--retries')) ? rest : ['--retries=1', ...rest];
    log.step(`Playwright: every spec under apps/web-angular/e2e (${playwrightArgs.join(' ')})`);
    return await run(playwrightInvocation(['test', ...playwrightArgs]), {
      cwd: WEB_DIR,
      env: {
        ...env,
        E2E_BASE_URL: URLS.web,
        E2E_API_URL: URLS.api,
        E2E_AUTH_EMULATOR_URL: URLS.authEmulator,
      },
    });
  } catch (error) {
    log.error(error.message);
    return 1;
  } finally {
    if (started.length > 0 && !interrupted) {
      log.step('Stopping the API and the web dev server started for the E2E run');
      await stopAll();
    }
  }
}

function mlPython() {
  const venvPython = IS_WINDOWS
    ? path.join(ML_DIR, '.venv', 'Scripts', 'python.exe')
    : path.join(ML_DIR, '.venv', 'bin', 'python');
  if (fs.existsSync(venvPython)) {
    return { python: venvPython, source: 'apps/ml/.venv' };
  }
  for (const candidate of IS_WINDOWS ? ['python', 'py'] : ['python3', 'python']) {
    if (capture(candidate, ['--version']).status === 0) {
      return { python: candidate, source: `${candidate} on PATH (no apps/ml/.venv)` };
    }
  }
  return null;
}

async function testMl() {
  log.warn('Phase 11 (ML card recognition) is on hold; this only runs the existing apps/ml skeleton tests.');
  const found = mlPython();
  if (!found) {
    log.error('Python 3.12+ not found. See apps/ml/README.md to create apps/ml/.venv.');
    return 1;
  }
  if (capture(found.python, ['-c', 'import pytest, fastapi'], { cwd: ML_DIR }).status !== 0) {
    log.error(
      `pytest/fastapi are not installed for ${found.source}. Create the venv: cd apps/ml && python -m venv .venv && ` +
        '.venv/Scripts/pip install -r requirements.txt -r requirements-dev.txt (bin/pip on macOS/Linux).',
    );
    return 1;
  }
  log.step(`ML: pytest (${found.source})`);
  // No cache or bytecode files are written into apps/ml.
  return run({ command: found.python, args: ['-m', 'pytest', '-q', '-p', 'no:cacheprovider'], shell: false }, {
    cwd: ML_DIR,
    env: childEnv({ PYTHONDONTWRITEBYTECODE: '1' }),
  });
}

async function testAll(args) {
  const suites = [
    ['api', testApi],
    ['web', testWeb],
    ['mobile', testMobile],
    ['e2e', () => testE2e(args)],
    ['mobile:e2e', () => testMobileE2e([])],
  ];
  const results = [];
  const allStarted = Date.now();
  for (const [name, runSuite] of suites) {
    console.log(paint('1;34', `\n==================== test:${name} ====================`));
    const started = Date.now();
    const code = await runSuite();
    results.push([name, code === 0 ? 'passed' : `FAILED (exit ${code})`, formatDuration(Date.now() - started)]);
  }
  console.log(paint('1', '\ntest:all summary\n'));
  console.log(table([['Suite', 'Result', 'Duration'], ...results, ['total', '', formatDuration(Date.now() - allStarted)]]));
  const failed = results.filter(([, result]) => result !== 'passed');
  if (failed.length > 0) {
    log.error(`${failed.length} suite(s) failed: ${failed.map(([name]) => name).join(', ')}`);
    return 1;
  }
  log.ok('All suites passed.');
  return 0;
}

const suites = {
  api: testApi,
  web: testWeb,
  mobile: testMobile,
  'mobile-e2e': () => testMobileE2e(argv),
  e2e: () => testE2e(argv),
  all: () => testAll(argv),
  ml: testMl,
};

if (!suites[suite]) {
  console.log(`Usage: node scripts/test.mjs <${Object.keys(suites).join('|')}> [args]`);
  process.exit(1);
}
const suiteStarted = Date.now();
const exitCode = await suites[suite]();
if (suite !== 'all') {
  const message = `test:${suite} ${exitCode === 0 ? 'passed' : `failed (exit ${exitCode})`} in ${formatDuration(Date.now() - suiteStarted)}`;
  if (exitCode === 0) {
    log.ok(message);
  } else {
    log.error(message);
  }
}
process.exit(exitCode);
