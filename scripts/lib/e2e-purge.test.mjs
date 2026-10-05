// Unit tests of the test-data purge rules (node --test; npm run test:scripts). The deletion itself
// is covered by apps/api TestAccountPurgeIT / TestAccountPurgeCommandTest.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PURGE_ARGS, parseReport, purgeEnv, targetProblems } from './e2e-purge.mjs';

const safe = {
  database: 'orenjitrade',
  emulatorUrl: 'http://localhost:9099',
  dockerLocal: true,
  containerState: 'healthy',
  databaseExists: true,
};

describe('purge target', () => {
  it('accepts the local stack', () => {
    assert.deepEqual(targetProblems(safe), []);
    assert.deepEqual(targetProblems({ ...safe, database: 'orenjitrade_e2e' }), []);
  });

  it('refuses a remote Docker engine, a remote emulator, a missing database and odd names', () => {
    assert.ok(targetProblems({ ...safe, dockerLocal: false }).some((p) => p.includes('Docker')));
    assert.ok(targetProblems({ ...safe, emulatorUrl: 'http://10.0.0.5:9099' }).some((p) => p.includes('emulator')));
    assert.ok(targetProblems({ ...safe, databaseExists: false }).some((p) => p.includes('does not exist')));
    assert.ok(targetProblems({ ...safe, containerState: 'missing' }).some((p) => p.includes('missing')));
    assert.ok(targetProblems({ ...safe, database: "x'; DROP TABLE user_account; --" }).some((p) => p.includes('Invalid')));
  });
});

describe('maintenance jar', () => {
  it('starts nothing but the purge: no web server, Flyway, seed, jobs, republication or reconciliation', () => {
    for (const flag of [
      '--orenji.maintenance.purge-test-accounts=true',
      '--spring.main.web-application-type=none',
      '--spring.flyway.enabled=false',
      '--orenji.seed.enabled=false',
      '--orenji.scheduling.enabled=false',
      '--spring.modulith.events.republish-outstanding-events-on-restart=false',
      '--orenji.card-images.cache.reconcile-on-startup=false',
    ]) {
      assert.ok(PURGE_ARGS.includes(flag), flag);
    }
  });

  it('targets the requested local database and the local emulator, never a card provider', () => {
    const env = purgeEnv({ DATABASE_URL: 'jdbc:postgresql://localhost:5433/orenjitrade', CARD_IMAGE_ON_DEMAND_ENABLED: 'true' }, 'orenjitrade');
    assert.equal(env.DATABASE_URL, 'jdbc:postgresql://localhost:5433/orenjitrade');
    assert.equal(env.SPRING_PROFILES_ACTIVE, 'local');
    assert.equal(env.FIREBASE_AUTH_EMULATOR_HOST, 'localhost:9099');
    assert.equal(env.CARD_IMAGE_ON_DEMAND_ENABLED, 'false');
    assert.equal(env.YGOPRODECK_ENABLED, 'false');
    assert.equal(purgeEnv({}, 'orenjitrade_e2e').DATABASE_URL, 'jdbc:postgresql://localhost:5432/orenjitrade_e2e');
  });

  it('refuses a remote database or emulator from the environment', () => {
    assert.throws(() => purgeEnv({ DATABASE_URL: 'jdbc:postgresql://db.example.com:5432/orenjitrade' }, 'orenjitrade'), /not the local/);
    assert.throws(() => purgeEnv({ FIREBASE_AUTH_EMULATOR_HOST: 'auth.example.com:9099' }, 'orenjitrade'), /not local/);
  });

  it('reads the report line of the jar', () => {
    const output = 'log line\nORENJI_PURGE_REPORT {"report":{"found":2,"deleted":2}}\nshutdown\n';
    assert.deepEqual(parseReport(output), { report: { found: 2, deleted: 2 } });
    assert.equal(parseReport('nothing here'), null);
    assert.equal(parseReport('ORENJI_PURGE_REPORT {broken'), null);
  });
});
