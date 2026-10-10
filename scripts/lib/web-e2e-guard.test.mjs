// Unit tests of the web E2E isolation rules (node --test; npm run test:scripts, also run by
// npm run test:e2e before anything starts and by the E2E CI job).

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import {
  DEV_API_PORT,
  E2E_DB,
  E2E_REALTIME_CHANNEL_PREFIX,
  INFO_KEY,
  assertIsolated,
  assertRecreatable,
  comparablePath,
  databaseOf,
  developerDirs,
  e2eApiEnv,
  identityArgs,
  ignoresPathCase,
  isInside,
  isLocalUrl,
  isProcessImage,
  isRunAccount,
  isTestDataEmail,
  isolationProblems,
  newRunId,
  overlaps,
  portProblem,
  redisDatabaseOf,
  reuseRefusal,
  runEmailPrefix,
  samePath,
  storageDirsOf,
  webReuseRefusal,
  webRuntimeConfig,
  withDatabase,
  withRedisDatabase,
} from './web-e2e-guard.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orenji-web-e2e-guard-'));
const checkout = path.join(tmp, 'OrenjiTrade');
const apiDir = path.join(checkout, 'apps', 'api');
const workDir = path.join(checkout, '.local-dev', 'e2e');
fs.mkdirSync(apiDir, { recursive: true });
fs.mkdirSync(workDir, { recursive: true });
const devDirs = developerDirs([apiDir]);
const DEV_CACHE = path.join(apiDir, '.local-storage', 'card-images');
const DEV_MEDIA = path.join(apiDir, '.local-storage');
/** This machine's default file system ignores case (stated here, not asked of the code under test). */
const HOST_IGNORES_CASE = process.platform === 'win32' || process.platform === 'darwin';

after(() => fs.rmSync(tmp, { recursive: true, force: true }));

function safeEnv(overrides = {}) {
  return { ...e2eApiEnv({}, { apiPort: 8180, webPort: 4300, workDir }), ...overrides };
}

describe('E2E API storage directories', () => {
  it('the safe environment passes', () => {
    assert.deepEqual(isolationProblems(safeEnv(), { workDir, devDirs }), []);
    assert.doesNotThrow(() => assertIsolated(safeEnv(), { workDir, devDirs }));
  });

  it('FAILS when the E2E card image cache directory equals the developer one', () => {
    const env = safeEnv({ CARD_IMAGE_CACHE_DIR: DEV_CACHE });
    const problems = isolationProblems(env, { workDir, devDirs });
    assert.ok(
      problems.some((p) => p.startsWith('CARD_IMAGE_CACHE_DIR') && p.includes('developer')),
      problems.join('\n'),
    );
    assert.throws(() => assertIsolated(env, { workDir, devDirs }), /would not be isolated/);
  });

  it('FAILS when the E2E media directory equals the developer one (or contains its cache)', () => {
    const problems = isolationProblems(safeEnv({ STORAGE_LOCAL_ROOT: DEV_MEDIA }), { workDir, devDirs });
    assert.ok(problems.some((p) => p.startsWith('STORAGE_LOCAL_ROOT') && p.includes('developer')));
  });

  it('compares paths case-insensitively on Windows and macOS, and through relative segments', () => {
    const sneaky = path.join(workDir, '..', '..', 'apps', 'api', '.local-storage', 'card-images');
    const env = safeEnv({ CARD_IMAGE_CACHE_DIR: sneaky });
    assert.ok(isolationProblems(env, { workDir, devDirs }).some((p) => p.includes('developer')));
    // NTFS and APFS ignore case by default; Linux file systems do not.
    assert.equal(ignoresPathCase('win32'), true);
    assert.equal(ignoresPathCase('darwin'), true);
    assert.equal(ignoresPathCase('linux'), false);
    assert.equal(
      comparablePath('/Users/Me/OrenjiTrade/apps/api/.local-storage/Card-Images/', 'darwin'),
      '/users/me/orenjitrade/apps/api/.local-storage/card-images',
    );
    assert.equal(comparablePath('C:\\Dev\\OrenjiTrade\\', 'win32'), 'c:\\dev\\orenjitrade');
    assert.equal(comparablePath('/home/Me/Cache/', 'linux'), '/home/Me/Cache');
    assert.equal(samePath(DEV_CACHE.toUpperCase(), DEV_CACHE), HOST_IGNORES_CASE);
  });

  it('a differently cased developer override is still the same directory on Windows and macOS', () => {
    // The developer's .env names the E2E card image cache with another case. Neither directory
    // exists yet, so resolving links cannot normalise the names: only the comparison can tell.
    const recased = path.join(workDir, 'CARD-IMAGES');
    const dirs = developerDirs([apiDir], { CARD_IMAGE_CACHE_DIR: recased });
    const problems = isolationProblems(safeEnv(), { workDir, devDirs: dirs });
    if (HOST_IGNORES_CASE) {
      assert.ok(
        problems.some((p) => p.startsWith('CARD_IMAGE_CACHE_DIR') && p.includes('developer')),
        problems.join('\n'),
      );
      assert.ok(overlaps(path.join(workDir.toUpperCase(), 'media'), workDir));
      assert.ok(isInside(path.join(workDir, 'MEDIA', 'avatars'), path.join(workDir, 'media')));
    } else {
      // A case-sensitive file system: these really are two directories.
      assert.deepEqual(problems, []);
    }
  });

  it('follows directory links (a junction to the developer cache is the developer cache)', (t) => {
    fs.mkdirSync(DEV_CACHE, { recursive: true });
    const link = path.join(workDir, 'linked-card-images');
    try {
      fs.symlinkSync(DEV_CACHE, link, 'junction');
    } catch {
      t.skip('creating a directory link is not permitted here');
      return;
    }
    try {
      const problems = isolationProblems(safeEnv({ CARD_IMAGE_CACHE_DIR: link }), { workDir, devDirs });
      assert.ok(problems.some((p) => p.includes('developer')), problems.join('\n'));
    } finally {
      fs.rmSync(link, { recursive: false, force: true });
    }
  });

  it('refuses relative paths, paths outside the work directory and a shared media/cache dir', () => {
    assert.ok(isolationProblems(safeEnv({ CARD_IMAGE_CACHE_DIR: 'card-images' }), { workDir, devDirs }).length > 0);
    assert.ok(
      isolationProblems(safeEnv({ STORAGE_LOCAL_ROOT: path.join(tmp, 'elsewhere') }), { workDir, devDirs }).some((p) =>
        p.includes('is not inside'),
      ),
    );
    const shared = path.join(workDir, 'shared');
    assert.ok(
      isolationProblems(safeEnv({ STORAGE_LOCAL_ROOT: shared, CARD_IMAGE_CACHE_DIR: shared }), { workDir, devDirs }).some(
        (p) => p.includes('different directories'),
      ),
    );
  });

  it('covers the developer directories of every checkout and of the developer .env', () => {
    const other = path.join(tmp, 'OrenjiTrade-other', 'apps', 'api');
    const dirs = developerDirs([apiDir, other], { CARD_IMAGE_CACHE_DIR: path.join(tmp, 'custom-cache') });
    assert.ok(dirs.some((dir) => samePath(dir, path.join(other, '.local-storage', 'card-images'))));
    assert.ok(dirs.some((dir) => samePath(dir, path.join(tmp, 'custom-cache'))));
    assert.deepEqual(storageDirsOf(apiDir, {}), { mediaRoot: DEV_MEDIA, cardImages: DEV_CACHE });
    assert.ok(isInside(DEV_CACHE, DEV_MEDIA));
    assert.ok(overlaps(DEV_MEDIA, DEV_CACHE));
  });
});

describe('E2E API database, Redis, ports and providers', () => {
  it('requires the E2E database on this machine', () => {
    const dev = isolationProblems(safeEnv({ DATABASE_URL: 'jdbc:postgresql://localhost:5432/orenjitrade' }), { workDir, devDirs });
    assert.ok(dev.some((p) => p.includes(E2E_DB)));
    const remote = isolationProblems(safeEnv({ DATABASE_URL: `jdbc:postgresql://db.example.com:5432/${E2E_DB}` }), {
      workDir,
      devDirs,
    });
    assert.ok(remote.some((p) => p.includes('local PostgreSQL')));
    assert.equal(databaseOf('jdbc:postgresql://localhost:5433/orenjitrade_e2e?ssl=false'), 'orenjitrade_e2e');
    assert.equal(withDatabase('jdbc:postgresql://localhost:5433/orenjitrade?x=1', E2E_DB), 'jdbc:postgresql://localhost:5433/orenjitrade_e2e?x=1');
    assert.equal(withDatabase(undefined, E2E_DB), 'jdbc:postgresql://localhost:5432/orenjitrade_e2e');
  });

  it('requires a Redis database and realtime channels apart from the developer ones', () => {
    assert.ok(isolationProblems(safeEnv({ REDIS_URL: 'redis://localhost:6379' }), { workDir, devDirs }).length > 0);
    assert.ok(isolationProblems(safeEnv({ REDIS_URL: 'redis://localhost:6379/0' }), { workDir, devDirs }).length > 0);
    assert.ok(isolationProblems(safeEnv({ REALTIME_CHANNEL_PREFIX: 'rt:user:' }), { workDir, devDirs }).length > 0);
    assert.equal(redisDatabaseOf('redis://localhost:6379/2'), 2);
    assert.equal(redisDatabaseOf('redis://localhost:6379'), 0);
    assert.equal(withRedisDatabase('redis://localhost:6380', 2), 'redis://localhost:6380/2');
    assert.equal(safeEnv().REALTIME_CHANNEL_PREFIX, E2E_REALTIME_CHANNEL_PREFIX);
  });

  it('never takes a port of the developer or mobile stacks', () => {
    for (const port of [8080, 4200, 8090, 19006, 8082, 8081]) {
      assert.ok(portProblem('API', port), `port ${port}`);
    }
    assert.equal(portProblem('API', 8180), null);
    assert.ok(isolationProblems(safeEnv({ SERVER_PORT: '8080' }), { workDir, devDirs }).some((p) => p.includes('8080')));
  });

  it('never calls a card provider', () => {
    assert.ok(isolationProblems(safeEnv({ CARD_IMAGE_ON_DEMAND_ENABLED: 'true' }), { workDir, devDirs }).length > 0);
    assert.ok(isolationProblems(safeEnv({ YGOPRODECK_ENABLED: 'true' }), { workDir, devDirs }).length > 0);
    assert.ok(
      isolationProblems(safeEnv({ YGOPRODECK_API_BASE_URL: 'https://db.ygoprodeck.com/api/v7/' }), { workDir, devDirs }).length > 0,
    );
  });

  it('only ever recreates the E2E database', () => {
    assert.doesNotThrow(() => assertRecreatable(E2E_DB));
    assert.throws(() => assertRecreatable('orenjitrade'), /Refusing to drop/);
    assert.throws(() => assertRecreatable('orenjitrade_mobile_e2e'), /Refusing to drop/);
  });

  it('the developer environment cannot override the isolation', () => {
    const env = e2eApiEnv(
      {
        DATABASE_URL: 'jdbc:postgresql://localhost:5432/orenjitrade',
        REDIS_URL: 'redis://localhost:6379',
        CARD_IMAGE_CACHE_DIR: DEV_CACHE,
        STORAGE_LOCAL_ROOT: DEV_MEDIA,
        CARD_IMAGE_ON_DEMAND_ENABLED: 'true',
        SERVER_PORT: '8080',
      },
      { apiPort: 8180, webPort: 4300, workDir },
    );
    assert.deepEqual(isolationProblems(env, { workDir, devDirs }), []);
    assert.equal(env.DATABASE_URL, 'jdbc:postgresql://localhost:5432/orenjitrade_e2e');
    assert.equal(env.REDIS_URL, 'redis://localhost:6379/2');
    assert.equal(env.CORS_ALLOWED_ORIGINS, 'http://localhost:4300');
  });
});

describe('--reuse-running', () => {
  const identity = { [INFO_KEY]: { database: E2E_DB, instance: 'abc' } };

  it('refuses the developer API with a clear message', () => {
    const reason = reuseRefusal(`http://localhost:${DEV_API_PORT}`, identity);
    assert.match(reason, /developer API/);
    assert.match(reason, /--keep-running/);
  });

  it('refuses an API without the E2E identity block, on another database or another instance', () => {
    assert.match(reuseRefusal('http://localhost:8180', { build: {} }), /not started by the E2E harness/);
    assert.match(
      reuseRefusal('http://localhost:8180', { [INFO_KEY]: { database: 'orenjitrade', instance: 'abc' } }),
      /uses the database orenjitrade/,
    );
    assert.match(reuseRefusal('http://localhost:8180', identity, 'other'), /not the one recorded/);
    assert.match(reuseRefusal('http://api.example.com:8180', identity), /not on this machine/);
  });

  it('reuses the E2E API this harness started', () => {
    assert.equal(reuseRefusal('http://localhost:8180', identity, 'abc'), null);
    assert.deepEqual(identityArgs('abc'), [
      '--management.info.env.enabled=true',
      `--info.${INFO_KEY}.database=${E2E_DB}`,
      `--info.${INFO_KEY}.instance=abc`,
    ]);
  });

  it('reuses a web server only when it sends the browser to the E2E API', () => {
    const config = webRuntimeConfig({ apiUrl: 'http://localhost:8180' });
    assert.equal(config.wsBaseUrl, 'ws://localhost:8180/ws');
    assert.equal(webReuseRefusal('http://localhost:4300', config, 'http://localhost:8180'), null);
    assert.match(webReuseRefusal('http://localhost:4300', { apiBaseUrl: 'http://localhost:8080' }, 'http://localhost:8180'), /refusing/);
    assert.match(webReuseRefusal('http://localhost:4200', config, 'http://localhost:8180'), /developer web server/);
  });
});

describe('recorded processes (--stop)', () => {
  it('recognises java and node by the base name of the executable on every platform', () => {
    // macOS: `ps -o comm=` prints the whole executable path.
    assert.ok(isProcessImage('/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home/bin/java', 'java'));
    assert.ok(isProcessImage('/Users/collector/.nvm/versions/node/v24.21.0/bin/node', 'node'));
    assert.ok(isProcessImage('/Applications/Dev Tools/jdk-21/bin/java\n', 'java'));
    // Linux: the bare name. Windows: tasklist's image name.
    assert.ok(isProcessImage('java', 'java'));
    assert.ok(isProcessImage('node', 'node'));
    assert.ok(isProcessImage('java.exe', 'java'));
    assert.ok(isProcessImage('Node.EXE', 'node'));
    assert.ok(isProcessImage('C:\\Program Files\\Eclipse Adoptium\\jdk-21\\bin\\java.exe', 'java'));
  });

  it('never takes another program for java or node', () => {
    assert.ok(!isProcessImage('/usr/bin/javac', 'java'));
    assert.ok(!isProcessImage('/opt/java/bin/python3', 'java'));
    assert.ok(!isProcessImage('/usr/local/bin/node-gyp', 'node'));
    assert.ok(!isProcessImage('/Users/collector/node/bin/zsh', 'node'));
    assert.ok(!isProcessImage('unknown', 'java'));
    assert.ok(!isProcessImage('', 'java'));
    assert.ok(!isProcessImage(undefined, 'node'));
  });
});

describe('test accounts', () => {
  it('run ids and run emails', () => {
    const runId = newRunId(1_700_000_000_000, () => 0.5);
    assert.match(runId, /^r[a-z0-9]{7}$/);
    assert.equal(runEmailPrefix(runId), `e2e-${runId}-`);
    assert.throws(() => runEmailPrefix('../x'), /Invalid run id/);
    assert.ok(isRunAccount(`e2e-${runId}-mapseller-abc@example.test`, runId));
    assert.ok(!isRunAccount(`e2e-r0000000-mapseller-abc@example.test`, runId));
  });

  it('only the web suites\' test domain is test data, never seeds or other domains', () => {
    assert.ok(isTestDataEmail('e2e-signup-x@example.test'));
    assert.ok(isTestDataEmail('E2E-Upper@EXAMPLE.TEST'));
    assert.ok(!isTestDataEmail('collector1@orenjitrade.test'));
    assert.ok(!isTestDataEmail('m-r1-x@mobile-e2e.test'));
    assert.ok(!isTestDataEmail('someone@example.test.evil.com'));
    assert.ok(!isTestDataEmail('example.test'));
    assert.ok(!isTestDataEmail(null));
  });

  it('local URLs only', () => {
    assert.ok(isLocalUrl('http://localhost:8080'));
    assert.ok(isLocalUrl('http://127.0.0.1:9099'));
    assert.ok(isLocalUrl('http://[::1]:8080'));
    assert.ok(!isLocalUrl('https://api.orenjitrade.com'));
    assert.ok(!isLocalUrl('not a url'));
  });
});
