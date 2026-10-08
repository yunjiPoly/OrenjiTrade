// Unit tests of the mobile E2E isolation guards: `node --test scripts/lib/mobile-e2e-guard.test.mjs`
// (part of `npm run test:mobile`, `npm run test:scripts` and the mobile E2E CI job).

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import {
  DEV_API_PORT,
  INFO_KEY,
  MOBILE_E2E_DB,
  MOBILE_E2E_REALTIME_CHANNEL_PREFIX,
  MOBILE_E2E_REDIS_DB,
  assertFlushableRedis,
  assertIsolated,
  assertRecreatable,
  databaseOf,
  deleteRunAccounts,
  developerDirs,
  identityArgs,
  isInside,
  isRunAccount,
  isolationProblems,
  mobileE2eApiEnv,
  newRunId,
  reuseRefusal,
  runEmailPrefix,
  storageDirsOf,
} from './mobile-e2e-guard.mjs';

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'orenji-mobile-e2e-guard-'));
after(() => fs.rmSync(sandbox, { recursive: true, force: true }));

const repo = path.join(sandbox, 'repo');
const apiDir = path.join(repo, 'apps', 'api');
const workDir = path.join(repo, '.local-dev', 'mobile-e2e');
const ownerApiDir = path.join(sandbox, 'owner-checkout', 'apps', 'api');
fs.mkdirSync(path.join(apiDir, '.local-storage', 'card-images'), { recursive: true });
fs.mkdirSync(path.join(ownerApiDir, '.local-storage', 'card-images'), { recursive: true });
fs.mkdirSync(workDir, { recursive: true });

const devDirs = developerDirs([apiDir, ownerApiDir], {});

/** The environment the harness builds (on top of a developer `.env`), with overrides. */
function isolatedEnv(overrides = {}) {
  const developer = {
    DATABASE_URL: 'jdbc:postgresql://localhost:5432/orenjitrade',
    REDIS_URL: 'redis://localhost:6379',
    STORAGE_LOCAL_ROOT: './.local-storage',
    STORAGE_PUBLIC_BASE_URL: 'http://localhost:8080',
    YGOPRODECK_ENABLED: 'true',
  };
  return { ...mobileE2eApiEnv(developer, { workDir }), ...overrides };
}

describe('storage directories of an API', () => {
  it('follow application.yml defaults relative to the API working directory', () => {
    const dirs = storageDirsOf(apiDir, {});
    assert.equal(dirs.mediaRoot, path.join(apiDir, '.local-storage'));
    assert.equal(dirs.cardImages, path.join(apiDir, '.local-storage', 'card-images'));
  });

  it('honour STORAGE_LOCAL_ROOT and CARD_IMAGE_CACHE_DIR like the API does', () => {
    const dirs = storageDirsOf(apiDir, { STORAGE_LOCAL_ROOT: '../media', CARD_IMAGE_CACHE_DIR: '' });
    assert.equal(dirs.mediaRoot, path.join(repo, 'apps', 'media'));
    assert.equal(dirs.cardImages, path.join(repo, 'apps', 'media', 'card-images'));
    const custom = storageDirsOf(apiDir, { CARD_IMAGE_CACHE_DIR: 'D:/cache/images' });
    assert.equal(custom.cardImages, path.resolve(apiDir, 'D:/cache/images'));
  });

  it('cover every checkout and the developer environment', () => {
    const dirs = developerDirs([apiDir, ownerApiDir], { CARD_IMAGE_CACHE_DIR: '../shared-cache' });
    assert.ok(dirs.includes(path.join(ownerApiDir, '.local-storage', 'card-images')));
    assert.ok(dirs.includes(path.join(repo, 'apps', 'shared-cache')));
  });
});

describe('isolation of the mobile E2E API environment', () => {
  it('accepts the harness environment, whatever the developer .env says', () => {
    assert.deepEqual(isolationProblems(isolatedEnv(), { workDir, devDirs }), []);
    assert.doesNotThrow(() => assertIsolated(isolatedEnv(), { workDir, devDirs }));
    const env = isolatedEnv();
    assert.equal(env.DATABASE_URL, `jdbc:postgresql://localhost:5432/${MOBILE_E2E_DB}`);
    assert.equal(env.REDIS_URL, `redis://localhost:6379/${MOBILE_E2E_REDIS_DB}`);
    assert.equal(env.REALTIME_CHANNEL_PREFIX, MOBILE_E2E_REALTIME_CHANNEL_PREFIX);
    assert.equal(env.STORAGE_LOCAL_ROOT, path.join(workDir, 'storage'));
    assert.equal(env.CARD_IMAGE_CACHE_DIR, path.join(workDir, 'card-images'));
    assert.equal(env.STORAGE_PUBLIC_BASE_URL, '');
    assert.equal(env.YGOPRODECK_ENABLED, 'false');
  });

  it("FAILS when the mobile card image cache directory equals the developer one", () => {
    const developerCache = storageDirsOf(apiDir, {}).cardImages;
    const env = isolatedEnv({ CARD_IMAGE_CACHE_DIR: developerCache });
    assert.throws(() => assertIsolated(env, { workDir, devDirs }), /resolves to the developer/);
  });

  it("refuses the developer's Redis database, the web E2E one and a remote Redis", () => {
    for (const [url, pattern] of [
      ['redis://localhost:6379', /REDIS_URL must select the mobile E2E Redis database 1/],
      ['redis://localhost:6379/0', /REDIS_URL must select/],
      ['redis://localhost:6379/2', /REDIS_URL must select/],
      ['not a url', /REDIS_URL must select/],
      ['redis://cache.example.com:6379/1', /local Redis/],
    ]) {
      const problems = isolationProblems(isolatedEnv({ REDIS_URL: url }), { workDir, devDirs });
      assert.ok(problems.some((problem) => pattern.test(problem)), `${url}: ${problems.join('\n')}`);
    }
  });

  it("refuses the developer's and the web E2E suite's realtime channels", () => {
    for (const prefix of [undefined, '', 'rt:user:', 'e2e-web:rt:user:']) {
      const problems = isolationProblems(isolatedEnv({ REALTIME_CHANNEL_PREFIX: prefix }), { workDir, devDirs });
      assert.ok(problems.some((problem) => problem.startsWith('REALTIME_CHANNEL_PREFIX')), String(prefix));
    }
  });

  it('refuses a database that is not on this machine', () => {
    const problems = isolationProblems(
      isolatedEnv({ DATABASE_URL: `jdbc:postgresql://db.example.com:5432/${MOBILE_E2E_DB}` }),
      { workDir, devDirs },
    );
    assert.ok(problems.some((problem) => problem.includes('local PostgreSQL')));
  });

  it('only ever recreates the mobile E2E database', () => {
    assert.doesNotThrow(() => assertRecreatable(MOBILE_E2E_DB));
    for (const database of ['orenjitrade', 'orenjitrade_e2e', 'orenjitrade_test', 'postgres']) {
      assert.throws(() => assertRecreatable(database), /Refusing to drop database/, database);
    }
  });

  it('only ever flushes the mobile E2E Redis database on the local Redis', () => {
    assert.equal(assertFlushableRedis('redis://localhost:6379/1'), 1);
    assert.equal(assertFlushableRedis('redis://127.0.0.1:6379/1'), 1);
    for (const url of ['redis://localhost:6379', 'redis://localhost:6379/0', 'redis://localhost:6379/2']) {
      assert.throws(() => assertFlushableRedis(url), /Refusing to flush Redis db/, url);
    }
    assert.throws(() => assertFlushableRedis('redis://cache.example.com:6379/1'), /not local/);
  });

  it("refuses the developer's card image cache", () => {
    const env = isolatedEnv({ CARD_IMAGE_CACHE_DIR: path.join(apiDir, '.local-storage', 'card-images') });
    const problems = isolationProblems(env, { workDir, devDirs });
    assert.ok(problems.some((problem) => problem.includes('CARD_IMAGE_CACHE_DIR') && problem.includes('developer')));
    assert.throws(() => assertIsolated(env, { workDir, devDirs }), /Refusing to start the mobile E2E API/);
  });

  it("refuses the owner checkout's media directory and anything around it", () => {
    for (const dir of [
      path.join(ownerApiDir, '.local-storage'),
      path.join(ownerApiDir, '.local-storage', 'card-images', 'yugioh'),
      path.join(ownerApiDir),
    ]) {
      const problems = isolationProblems(isolatedEnv({ STORAGE_LOCAL_ROOT: dir }), { workDir, devDirs });
      assert.ok(problems.some((problem) => problem.startsWith('STORAGE_LOCAL_ROOT')), dir);
    }
  });

  it('refuses a directory inside .local-dev/mobile-e2e that is a link to the developer cache', (t) => {
    const link = path.join(workDir, 'linked-cache');
    try {
      fs.symlinkSync(path.join(apiDir, '.local-storage', 'card-images'), link, 'junction');
    } catch (error) {
      t.skip(`cannot create a directory link here: ${error.code}`);
      return;
    }
    const problems = isolationProblems(isolatedEnv({ CARD_IMAGE_CACHE_DIR: link }), { workDir, devDirs });
    assert.ok(problems.some((problem) => problem.includes('resolves to the developer')), problems.join('\n'));
  });

  it('refuses relative paths, paths outside the work directory and a shared directory', () => {
    const relative = isolationProblems(isolatedEnv({ STORAGE_LOCAL_ROOT: './.local-storage' }), { workDir, devDirs });
    assert.ok(relative.some((problem) => problem.includes('absolute path')));
    const outside = isolationProblems(isolatedEnv({ CARD_IMAGE_CACHE_DIR: path.join(sandbox, 'elsewhere') }), {
      workDir,
      devDirs,
    });
    assert.ok(outside.some((problem) => problem.includes('not inside')));
    const same = isolationProblems(isolatedEnv({ CARD_IMAGE_CACHE_DIR: path.join(workDir, 'storage') }), {
      workDir,
      devDirs,
    });
    assert.ok(same.some((problem) => problem.includes('different directories')));
  });

  it('refuses the developer database and port', () => {
    const problems = isolationProblems(
      isolatedEnv({ DATABASE_URL: 'jdbc:postgresql://localhost:5432/orenjitrade', SERVER_PORT: String(DEV_API_PORT) }),
      { workDir, devDirs },
    );
    assert.ok(problems.some((problem) => problem.includes('not orenjitrade.')));
    assert.ok(problems.some((problem) => problem.startsWith('SERVER_PORT')));
  });

  it('refuses card provider calls', () => {
    const problems = isolationProblems(isolatedEnv({ YGOPRODECK_ENABLED: 'true', CARD_IMAGE_ON_DEMAND_ENABLED: undefined }), {
      workDir,
      devDirs,
    });
    assert.ok(problems.some((problem) => problem.startsWith('YGOPRODECK_ENABLED')));
    assert.ok(problems.some((problem) => problem.startsWith('CARD_IMAGE_ON_DEMAND_ENABLED')));
    const remote = isolationProblems(isolatedEnv({ YGOPRODECK_IMAGE_BASE_URL: 'https://images.ygoprodeck.com/images/cards/' }), {
      workDir,
      devDirs,
    });
    assert.ok(remote.some((problem) => problem.startsWith('YGOPRODECK_IMAGE_BASE_URL')));
  });

  it('keeps provider snapshots inside the work directory', () => {
    const problems = isolationProblems(isolatedEnv({ PROVIDER_DATA_DIR: path.join(apiDir, '.local-dev', 'provider-data') }), {
      workDir,
      devDirs,
    });
    assert.ok(problems.some((problem) => problem.startsWith('PROVIDER_DATA_DIR')));
  });

  it('parses the database of a JDBC URL', () => {
    assert.equal(databaseOf('jdbc:postgresql://localhost:5432/orenjitrade_mobile_e2e?ssl=false'), MOBILE_E2E_DB);
    assert.equal(databaseOf('jdbc:postgresql://db/orenjitrade'), 'orenjitrade');
    assert.equal(databaseOf('postgres://nope'), null);
  });

  it('compares paths after resolution', () => {
    assert.ok(isInside(path.join(workDir, 'a', '..', 'b'), workDir));
    assert.ok(!isInside(path.join(workDir, '..', 'other'), workDir));
  });
});

describe('reuse of a running API (--reuse-running)', () => {
  const identity = { [INFO_KEY]: { database: MOBILE_E2E_DB, instance: 'abc' } };

  it('reuses only the instance recorded by the harness', () => {
    assert.equal(reuseRefusal('http://localhost:8090', identity, 'abc'), null);
    assert.match(reuseRefusal('http://localhost:8090', identity, 'other'), /not the one recorded/);
  });

  it('refuses the developer API on 8080 with a clear message', () => {
    assert.match(reuseRefusal('http://localhost:8080', identity, 'abc'), /developer API \(port 8080, database orenjitrade\)/);
  });

  it('refuses an API that is not on this machine', () => {
    assert.match(reuseRefusal('http://192.0.2.10:8090', identity, 'abc'), /not on this machine/);
  });

  it('refuses an API without the identity block or on another database', () => {
    assert.match(reuseRefusal('http://localhost:8090', { build: {} }, 'abc'), /was not started by the mobile E2E harness/);
    assert.match(
      reuseRefusal('http://localhost:8090', { [INFO_KEY]: { database: 'orenjitrade', instance: 'abc' } }, 'abc'),
      /uses the database orenjitrade/,
    );
  });

  it('publishes the identity through Spring arguments', () => {
    assert.deepEqual(identityArgs('xyz'), [
      '--management.info.env.enabled=true',
      `--info.${INFO_KEY}.database=${MOBILE_E2E_DB}`,
      `--info.${INFO_KEY}.instance=xyz`,
    ]);
  });
});

describe('run-scoped test accounts', () => {
  it('builds run ids that fit an email local part', () => {
    assert.match(newRunId(), /^r[a-z0-9]{7}$/);
    assert.equal(runEmailPrefix('rabc1234'), 'm-rabc1234-');
    assert.throws(() => runEmailPrefix('../x'), /Invalid run id/);
  });

  it('matches only accounts of the same run under @mobile-e2e.test', () => {
    assert.ok(isRunAccount('m-rabc1234-signup-x1@mobile-e2e.test', 'rabc1234'));
    assert.ok(!isRunAccount('m-rabc1234-signup-x1@example.test', 'rabc1234'));
    assert.ok(!isRunAccount('m-rzzz9999-signup-x1@mobile-e2e.test', 'rabc1234'));
    assert.ok(!isRunAccount('collector1@orenjitrade.test', 'rabc1234'));
    assert.ok(!isRunAccount(undefined, 'rabc1234'));
  });

  it('deletes only the emulator accounts of the run', async () => {
    const calls = [];
    const users = [
      { localId: 'a', email: 'm-rabc1234-signup-1@mobile-e2e.test' },
      { localId: 'b', email: 'collector1@orenjitrade.test' },
      { localId: 'c', email: 'm-e2e-signup-1@example.test' },
      { localId: 'd', email: 'm-rother000-signup-1@mobile-e2e.test' },
      { localId: 'e' },
    ];
    const fetchImpl = async (url, init = {}) => {
      calls.push({ url, init });
      if (url.includes('accounts:batchGet')) {
        const second = url.includes('nextPageToken=p2');
        return Response.json(second ? { users: [{ localId: 'f', email: 'm-rabc1234-edit-2@mobile-e2e.test' }] } : { users, nextPageToken: 'p2' });
      }
      return Response.json({});
    };
    const deleted = await deleteRunAccounts({
      emulatorUrl: 'http://localhost:9099/',
      projectId: 'orenjitrade-local',
      runId: 'rabc1234',
      fetchImpl,
    });
    assert.equal(deleted, 2);
    const remove = calls.find((call) => call.url.endsWith('accounts:batchDelete'));
    assert.deepEqual(JSON.parse(remove.init.body), { localIds: ['a', 'f'], force: true });
    assert.equal(remove.init.headers.Authorization, 'Bearer owner');
  });

  it('never calls an emulator that is not on this machine', async () => {
    let called = false;
    await assert.rejects(
      deleteRunAccounts({
        emulatorUrl: 'https://identitytoolkit.example.com',
        projectId: 'orenjitrade-local',
        runId: 'rabc1234',
        fetchImpl: async () => {
          called = true;
          return Response.json({});
        },
      }),
      /only the local Auth emulator/,
    );
    assert.equal(called, false);
  });
});
