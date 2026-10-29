// The web E2E job of CI (.github/workflows/e2e.yml, step "Start the API (local profile,
// background)") gives its API the environment `npm run test:e2e` gives its isolated API
// (web-e2e-guard.mjs, e2eApiEnv): every variable, with the same value. Stage WB's deck import
// passed locally and failed in CI because the harness had SEED_IMPORT_FIXTURES=true and CI did not.
// node --test; npm run test:scripts, also run by both E2E CI jobs before anything starts.
//
// E2E_WORKFLOW_FILE=<path> checks another copy of the workflow (to prove the test fails on one).

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { envParityProblems, exportsOf, scalarOf, workflowStep } from './ci-workflow.mjs';
import { E2E_API_PORT, E2E_WEB_PORT, e2eApiEnv, identityArgs, isolationProblems } from './web-e2e-guard.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WORKFLOW = process.env.E2E_WORKFLOW_FILE
  ? path.resolve(process.env.E2E_WORKFLOW_FILE)
  : path.join(ROOT, '.github', 'workflows', 'e2e.yml');
const JOB = 'e2e';
const API_STEP = 'Start the API (local profile, background)';
/** Where the CI step puts the API's files (`export ...="$RUNNER_TEMP/e2e/..."`). */
const CI_WORK_DIR = '$RUNNER_TEMP/e2e';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orenji-web-e2e-ci-parity-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));
/** The harness's work directory stands in for .local-dev/e2e: only the paths under it differ. */
const workDir = path.join(tmp, 'checkout', '.local-dev', 'e2e');

/**
 * What the harness sets for its API on its own, without the developer's `.env` and shell (an empty
 * base): the variables CI must give its API too. Default ports, so SERVER_PORT and
 * CORS_ALLOWED_ORIGINS match CI's 8180 and 4300; E2E_API_PORT / E2E_WEB_PORT only move a local run.
 */
const harnessEnv = e2eApiEnv({}, { apiPort: E2E_API_PORT, webPort: E2E_WEB_PORT, workDir });

/** `harnessValue`, a path under the harness's work directory, at the same place under CI's. */
function underCiWorkDir(harnessValue) {
  const relative = path.relative(workDir, harnessValue);
  assert.ok(
    relative && !relative.startsWith('..') && !path.isAbsolute(relative),
    `${harnessValue} is not under ${workDir}`,
  );
  return `${CI_WORK_DIR}/${relative.split(path.sep).join('/')}`;
}

/**
 * The allow-list: the variables whose value legitimately differs between the harness and CI, each
 * with the CI value it must have (strict: a variable listed here must still be set in CI, and the
 * list may only name variables the harness sets). Everything else must be equal. The ports, the
 * database URL, the Redis URL and logical database, the realtime channel prefix and the emulator
 * host are NOT listed: with an empty base the harness's values are exactly CI's (the developer's
 * own DATABASE_URL, REDIS_URL host and port and E2E_*_PORT only move a local run).
 */
const VALUES_DIFFER = Object.freeze({
  // The media root, the card image cache and the provider snapshots live in the work directory:
  // .local-dev/e2e locally, $RUNNER_TEMP/e2e on the runner (exported by the step's script).
  STORAGE_LOCAL_ROOT: underCiWorkDir,
  CARD_IMAGE_CACHE_DIR: underCiWorkDir,
  PROVIDER_DATA_DIR: underCiWorkDir,
});

function ciApiStep() {
  return workflowStep(fs.readFileSync(WORKFLOW, 'utf8'), JOB, API_STEP);
}

/** The environment the CI step gives the API: its `env:` entries, then what its script exports. */
function ciApiEnv() {
  const step = ciApiStep();
  return { ...step.env, ...exportsOf(step.run) };
}

const SHOWN = path.relative(ROOT, WORKFLOW).startsWith('..') ? WORKFLOW : path.relative(ROOT, WORKFLOW);

describe(`the web E2E API in CI (${SHOWN}, job ${JOB})`, () => {
  it('gets every variable the local harness gives its API, with the same value', () => {
    const problems = envParityProblems(harnessEnv, ciApiEnv(), VALUES_DIFFER);
    assert.deepEqual(
      problems,
      [],
      `The CI step "${API_STEP}" does not start the API the way npm run test:e2e does ` +
        `(scripts/lib/web-e2e-guard.mjs, e2eApiEnv):\n${problems.map((problem) => `  - ${problem}`).join('\n')}`,
    );
  });

  it('keeps the allow-list strict: each entry is set by the harness and by CI', () => {
    const ci = ciApiEnv();
    for (const name of Object.keys(VALUES_DIFFER)) {
      assert.ok(Object.hasOwn(harnessEnv, name), `${name} is allow-listed but the harness does not set it`);
      assert.ok(Object.hasOwn(ci, name), `${name} is allow-listed but CI does not set it`);
    }
  });

  it('passes the isolation rules the harness checks before it starts its API', () => {
    const runnerTemp = path.join(tmp, 'runner-temp');
    const ci = Object.fromEntries(
      Object.entries(ciApiEnv()).map(([name, value]) => [
        name,
        typeof value === 'string' ? value.replaceAll('$RUNNER_TEMP', runnerTemp) : value,
      ]),
    );
    assert.deepEqual(isolationProblems(ci, { workDir: path.join(runnerTemp, 'e2e'), devDirs: [] }), []);
  });

  it('starts the jar exactly as the harness does: the identity block and nothing else', () => {
    const problems = startScriptProblems(ciApiStep().run);
    assert.deepEqual(
      problems,
      [],
      `The CI step "${API_STEP}" starts the API with more than its environment:\n` +
        problems.map((problem) => `  - ${problem}`).join('\n'),
    );
  });
});

/** The instance the CI step names in its identity block (one per workflow run). */
const CI_INSTANCE = 'ci-$GITHUB_RUN_ID';

/**
 * What is wrong with the CI step's script beyond its environment. The harness starts the jar with
 * `-jar <jar> ...identityArgs(instance)` and nothing else, so the script may hold only its
 * `export` lines (compared above), one `nohup java -jar` whose arguments are exactly the identity
 * block, and the line that keeps the PID. Anything else could give the API what the harness does
 * not: a `NAME=value` or `env` in front of the command, a JVM `-D` option, a `--property=` override
 * after the jar, `set -a`, `unset`.
 */
function startScriptProblems(run) {
  const lines = run
    .replace(/\\\n\s*/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
  const problems = [];
  const starts = [];
  for (const line of lines) {
    if (/^export [A-Z_][A-Z0-9_]*=/.test(line) || line === 'echo $! > "$RUNNER_TEMP/api.pid"') continue;
    if (/\bjava\b/.test(line)) starts.push(line);
    else problems.push(`unexpected line: ${line}`);
  }
  if (starts.length !== 1) {
    problems.push(`the jar must be started exactly once (found ${starts.length})`);
    return problems;
  }
  const command = starts[0].match(/^nohup java -jar (\S+) (.*?) > "\$RUNNER_TEMP\/api\.log" 2>&1 &$/);
  if (!command) {
    problems.push(`the start command is not "nohup java -jar <jar> <identity block> > ... &": ${starts[0]}`);
    return problems;
  }
  const args = command[2].trim().split(/\s+/).filter(Boolean).map((arg) => arg.replaceAll('"', ''));
  const expected = identityArgs(CI_INSTANCE);
  if (args.join(' ') !== expected.join(' ')) {
    problems.push(`the jar gets "${args.join(' ')}"; exactly "${expected.join(' ')}" expected`);
  }
  return problems;
}

describe('startScriptProblems', () => {
  const start = [
    'export DIR="$RUNNER_TEMP/e2e/media"',
    'nohup java -jar build/libs/app.jar \\',
    ...identityArgs(`"${CI_INSTANCE}"`).map((arg) => `  ${arg} \\`),
    '  > "$RUNNER_TEMP/api.log" 2>&1 &',
    'echo $! > "$RUNNER_TEMP/api.pid"',
  ].join('\n');

  it('accepts the exports, the identity block and the PID line', () => {
    assert.deepEqual(startScriptProblems(start), []);
  });

  it('refuses a variable in front of the command, a JVM option and an override after the jar', () => {
    const inline = start.replace('nohup java', 'SEED_IMPORT_FIXTURES=false nohup java');
    assert.match(startScriptProblems(inline)[0], /^the start command is not/);
    const jvm = start.replace('java -jar', 'java -Dorenji.seed.import-fixtures=false -jar');
    assert.match(startScriptProblems(jvm)[0], /^the start command is not/);
    const override = start.replace(
      '  > "$RUNNER_TEMP/api.log"',
      '  --orenji.seed.import-fixtures=false \\\n  > "$RUNNER_TEMP/api.log"',
    );
    assert.match(startScriptProblems(override)[0], /^the jar gets ".*--orenji\.seed\.import-fixtures=false"/);
  });

  it('refuses any other line and a second start', () => {
    assert.match(startScriptProblems(`set -a\n${start}`)[0], /^unexpected line: set -a/);
    assert.match(startScriptProblems(`unset SEED_IMPORT_FIXTURES\n${start}`)[0], /^unexpected line: unset/);
    assert.match(startScriptProblems(`${start}\n${start}`).at(-1), /^the jar must be started exactly once \(found 2\)/);
  });
});

describe('envParityProblems', () => {
  const differ = { DIR: (value) => `$RUNNER_TEMP/${value}` };

  it('is empty when every variable matches (allow-listed ones as the list says)', () => {
    assert.deepEqual(envParityProblems({ A: '1', DIR: 'x' }, { A: '1', DIR: '$RUNNER_TEMP/x' }, differ), []);
  });

  it('names a variable CI lacks, one with another value, and one CI sets alone', () => {
    const problems = envParityProblems(
      { A: '1', B: 'true', DIR: 'x' },
      { A: '2', DIR: '$RUNNER_TEMP/x', C: '3' },
      differ,
    );
    assert.equal(problems.length, 3);
    assert.match(problems[0], /^A is "2" in CI, "1" expected/);
    assert.match(problems[1], /^B is missing from CI \(the local harness sets "true"\)/);
    assert.match(problems[2], /^C is set in CI only/);
  });

  it('keeps allow-listed variables required and exact, and refuses a stale entry', () => {
    assert.match(envParityProblems({ DIR: 'x' }, {}, differ)[0], /^DIR is missing from CI/);
    assert.match(
      envParityProblems({ DIR: 'x' }, { DIR: '/elsewhere/x' }, differ)[0],
      /^DIR is "\/elsewhere\/x" in CI/,
    );
    assert.match(envParityProblems({}, {}, differ)[0], /^The allow-list names DIR, which the local harness does not set/);
  });

  it('tells an empty string from a YAML null', () => {
    assert.deepEqual(envParityProblems({ URL: '' }, { URL: '' }), []);
    assert.match(envParityProblems({ URL: '' }, { URL: null })[0], /^URL is null in CI, "" expected/);
  });
});

describe('workflowStep', () => {
  const workflow = [
    'name: Sample',
    'jobs:',
    '  other:',
    '    steps:',
    '      - name: Start',
    '        env:',
    '          ONLY_OTHER: "1"',
    '  e2e:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - uses: actions/checkout@v4',
    '      - name: Start',
    '        working-directory: apps/api',
    '        env:',
    '          # a comment',
    '          PLAIN: local',
    '          PORT: "8180"',
    "          SINGLE: 'it''s'",
    '          EMPTY: ""',
    '          NULL_VALUE:',
    '          WITH_COMMENT: true # trailing',
    '          URL: jdbc:postgresql://localhost:5432/db',
    '        # outside the mapping',
    '        run: |',
    '          export DIR="$RUNNER_TEMP/e2e/media"',
    '          java -jar app.jar \\',
    '            --flag=1',
    '      - name: Next',
    '        run: echo next',
  ].join('\n');

  it("reads one job's step by name: env scalars as GitHub Actions passes them, and the script", () => {
    const step = workflowStep(workflow, 'e2e', 'Start');
    assert.deepEqual(step.env, {
      PLAIN: 'local',
      PORT: '8180',
      SINGLE: "it's",
      EMPTY: '',
      NULL_VALUE: null,
      WITH_COMMENT: 'true',
      URL: 'jdbc:postgresql://localhost:5432/db',
    });
    assert.equal(step.run, 'export DIR="$RUNNER_TEMP/e2e/media"\njava -jar app.jar \\\n  --flag=1');
    assert.deepEqual(exportsOf(step.run), { DIR: '$RUNNER_TEMP/e2e/media' });
    assert.deepEqual(workflowStep(workflow, 'e2e', 'Next'), { env: {}, run: 'echo next' });
  });

  it('throws on a missing job or step and on values it does not read', () => {
    assert.throws(() => workflowStep(workflow, 'nope', 'Start'), /no job "nope"/);
    assert.throws(() => workflowStep(workflow, 'e2e', 'Nope'), /no step named "Nope"/);
    assert.throws(() => scalarOf('[a, b]', 'x'), /unsupported value/);
    assert.throws(() => scalarOf('&anchor x', 'x'), /unsupported value/);
    const folded = workflow.replace('        run: |', '        run: >-');
    assert.throws(() => workflowStep(folded, 'e2e', 'Start'), /literal block/);
    const twice = workflow.replace('          PLAIN: local', '          PLAIN: local\n          PLAIN: other');
    assert.throws(() => workflowStep(twice, 'e2e', 'Start'), /sets PLAIN twice/);
  });
});
