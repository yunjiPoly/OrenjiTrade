#!/usr/bin/env node
// Test entry points (run from the repository root):
//   npm run test:api      apps/api: gradlew check, tests always re-executed (Spotless + unit + Testcontainers
//                         integration tests; Docker required)
//   npm run test:web      apps/web-angular: lint + unit tests (Vitest)
//   npm run test:mobile   apps/mobile: typecheck + lint + jest, plus the mobile E2E harness guard
//                         tests (node --test scripts/lib/mobile-e2e-guard.test.mjs)
//   npm run test:mobile:e2e  apps/mobile web build + Playwright against an isolated real stack: the
//                         running infrastructure (infra:up only when it is down, never restarted),
//                         database orenjitrade_mobile_e2e (recreated), the API jar on :8090 with its
//                         own media/card-image directories, Redis db 1 and realtime channels, expo
//                         export + serve on :19006; run-scoped @mobile-e2e.test accounts deleted
//                         afterwards; stops only what it started
//                         (--reuse-running, --keep-running, --stack-only, --stop, --skip-build)
//   npm run test:mobile:maestro  native flows (apps/mobile/.maestro) in Expo Go on a running Android
//                         emulator, Metro on :8082 and the same isolated API (--keep-running, --stop)
//   npm run test:e2e      Playwright suite on its own isolated local stack (scripts/lib/web-e2e.mjs):
//                         database orenjitrade_e2e (recreated per run), the API jar on :8180 and
//                         ng serve on :4300, so it runs next to `npm run dev` without touching the
//                         developer's database, Redis keys, files or ports; deletes the run's Auth
//                         emulator accounts and stops what it started. Extra args go to Playwright,
//                         e.g. npm run test:e2e -- e2e/map.spec.ts. Harness options: --keep-running,
//                         --reuse-running (only a stack the harness started), --stack-only, --stop,
//                         --keep-db
//   npm run test:scripts  node --test unit tests of scripts/lib (E2E isolation guards, purge rules)
//   npm run test:all      scripts + api + web + mobile + e2e + mobile:e2e, then a summary with timings
//   npm run test:ml       optional: apps/ml pytest with apps/ml/.venv when present (Phase 11 is on hold)

import fs from 'node:fs';
import path from 'node:path';
import {
  API_DIR,
  IS_WINDOWS,
  ML_DIR,
  ROOT,
  capture,
  childEnv,
  ensureDocker,
  formatDuration,
  log,
  paint,
  run,
  runGradle,
  runNpm,
  table,
} from './lib/util.mjs';
import { testMobileE2e } from './lib/mobile-e2e.mjs';
import { testMobileMaestro } from './lib/mobile-maestro.mjs';
import { runWebE2e } from './lib/web-e2e.mjs';

const [suite, ...argv] = process.argv.slice(2);

// ------------------------------------------------------------------------------- suites

async function testApi() {
  ensureDocker();
  log.step('API: gradlew check (Spotless, unit and integration tests with Testcontainers)');
  // `--rerun`: always execute both test tasks (Gradle would otherwise report them UP-TO-DATE when
  // the inputs did not change since the last run); compilation stays incremental. catalogTest runs
  // the catalog fixture suites in their own JVM, against fresh containers (ADR 0017).
  return runGradle(['test', '--rerun', 'catalogTest', '--rerun', 'check'], { cwd: API_DIR });
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
    [
      'Mobile: E2E harness guard tests (node --test)',
      () =>
        run(
          { command: process.execPath, args: ['--test', 'scripts/lib/mobile-e2e-guard.test.mjs'], shell: false },
          { cwd: ROOT },
        ),
    ],
  ]);
}

/** The web Playwright suite on its own isolated stack (scripts/lib/web-e2e.mjs). */
function testE2e(args) {
  return runWebE2e(args);
}

/** node --test unit tests of the local scripts (isolation guards of the E2E harness and the purge). */
function testScripts() {
  log.step('Scripts: node --test scripts/lib');
  return run(
    { command: process.execPath, args: ['--test', 'scripts/lib/*.test.mjs'], shell: false },
    { cwd: ROOT },
  );
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
    ['scripts', testScripts],
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
  scripts: testScripts,
  'mobile-e2e': () => testMobileE2e(argv),
  'mobile-maestro': () => testMobileMaestro(argv),
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
