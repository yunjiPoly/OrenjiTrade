#!/usr/bin/env node
// npm run dev — one command for the whole local stack:
//   1. docker compose up -d --build --wait   (PostGIS, Redis, Firebase Auth emulator)
//   2. API: Gradle bootRun with the `local` profile (seed data is applied at start-up)
//   3. waits for http://localhost:8080/actuator/health/readiness
//   4. web: ng serve on http://localhost:4200
//   5. prints the URLs; Ctrl+C stops the API and the web dev server (infrastructure keeps running)
//
// Output of both children is prefixed ([api] / [web]) and also written to .local-dev/logs/.
// Options: --no-web (API only), --skip-infra (do not touch docker compose).

import {
  API_DIR,
  HAS_CONSOLE,
  IS_WINDOWS,
  LOG_DIR,
  ManagedProcess,
  PORTS,
  URLS,
  assertPortsFree,
  childEnv,
  ensureDocker,
  formatDuration,
  gradleInvocation,
  infraUp,
  isAlive,
  killTree,
  listeningPids,
  log,
  ngInvocation,
  paint,
  parseFlags,
  runNpm,
  settlesWithin,
  sleep,
  table,
  waitForHttp,
  WEB_DIR,
} from './lib/util.mjs';
import path from 'node:path';

const { flags, rest } = parseFlags(process.argv.slice(2), {
  noWeb: ['--no-web', '--api-only'],
  skipInfra: ['--skip-infra'],
  help: ['--help', '-h'],
});

if (flags.help || rest.length > 0) {
  console.log(`Usage: npm run dev [-- --no-web] [-- --skip-infra]

Starts docker compose infrastructure, the API (bootRun, profile local) and the web dev server.
Ctrl+C stops the API and the web dev server; the Docker infrastructure keeps running
(npm run infra:down stops it). Logs: .local-dev/logs/api.log and .local-dev/logs/web.log.`);
  process.exit(rest.length > 0 ? 1 : 0);
}

const children = [];
/** PIDs that listened on the API port once the API was ready (the bootRun JVM is a child of the Gradle daemon, not of us). */
let apiListenerPids = new Set();
let shuttingDown = false;
const startedAt = Date.now();

async function main() {
  console.log(paint('1', '\nOrenjiTrade local development stack'));

  if (!flags.skipInfra) {
    ensureDocker();
  }
  await assertPortsFree([
    ['API', PORTS.api],
    ...(flags.noWeb ? [] : [['Web dev server', PORTS.web]]),
  ]);

  if (!flags.skipInfra) {
    if ((await infraUp()) !== 0) {
      process.exit(1);
    }
  }

  const env = childEnv({ SPRING_PROFILES_ACTIVE: 'local' });

  log.step('Starting the API: gradlew bootRun (profile local; first run compiles, later runs are incremental)');
  const api = new ManagedProcess('api', gradleInvocation(['bootRun', '--console=plain']), {
    cwd: API_DIR,
    env,
    color: '36',
  }).start();
  children.push(api);

  let web;
  if (!flags.noWeb) {
    // Design tokens are a build step of the web app (`prestart`); run it once before ng serve so
    // the dev server can be spawned directly (no npm/cmd layer between us and Angular CLI).
    log.step('Building design tokens for the web app');
    if ((await runNpm(['run', 'build:tokens'], { env })) !== 0) {
      await shutdown(1, false);
    }
  }

  log.step(`Waiting for API readiness: ${URLS.apiReadiness}`);
  try {
    const waited = await waitForHttp(URLS.apiReadiness, {
      timeoutMs: 15 * 60_000,
      abortIf: () =>
        api.running ? null : `the API process exited (code ${api.exitInfo?.code}); see ${path.join(LOG_DIR, 'api.log')}`,
    });
    log.ok(`API ready after ${formatDuration(waited)}.`);
  } catch (error) {
    if (shuttingDown) {
      return; // Ctrl+C while waiting: shutdown() is already stopping everything.
    }
    log.error(`API did not become ready: ${error.message}`);
    await shutdown(1, false);
    return;
  }
  apiListenerPids = listeningPids(PORTS.api);

  if (!flags.noWeb) {
    log.step('Starting the web dev server: ng serve');
    web = new ManagedProcess('web', ngInvocation(['serve', '--port', String(PORTS.web)]), {
      cwd: WEB_DIR,
      env,
      color: '35',
    }).start();
    children.push(web);
    try {
      const waited = await waitForHttp(`${URLS.web}/`, {
        timeoutMs: 10 * 60_000,
        abortIf: () =>
          web.running ? null : `ng serve exited (code ${web.exitInfo?.code}); see ${path.join(LOG_DIR, 'web.log')}`,
      });
      log.ok(`Web dev server ready after ${formatDuration(waited)}.`);
    } catch (error) {
      if (shuttingDown) {
        return;
      }
      log.error(`Web dev server did not become ready: ${error.message}`);
      await shutdown(1, false);
      return;
    }
  }

  printUrls();

  // Stay up until Ctrl+C (handled below) or until a child dies on its own.
  const firstExit = await Promise.race(children.map((child) => child.exited.then(() => child)));
  if (!shuttingDown) {
    log.error(
      `${firstExit.name} exited unexpectedly (code ${firstExit.exitInfo.code}); stopping the rest. ` +
        `Log: ${path.join(LOG_DIR, `${firstExit.name}.log`)}`,
    );
    await shutdown(1, false);
  }
}

function printUrls() {
  const rows = [
    ['What', 'Where'],
    ['Web app', `${URLS.web}`],
    ['API', `${URLS.api}/api/v1/...`],
    ['Swagger UI', URLS.swagger],
    ['API readiness', URLS.apiReadiness],
    ['Auth emulator UI', URLS.emulatorUi],
    ['Auth emulator', URLS.authEmulator],
    ['PostgreSQL', `localhost:${PORTS.postgres}  db orenjitrade  user orenjitrade / orenjitrade_local`],
    ['Redis', `localhost:${PORTS.redis}`],
    ['Seed accounts', 'collector1@orenjitrade.test ... admin@orenjitrade.test  password LocalDev!2026'],
    ['Logs', `${path.join('.local-dev', 'logs', 'api.log')}, ${path.join('.local-dev', 'logs', 'web.log')}`],
  ];
  if (flags.noWeb) {
    rows.splice(1, 1);
  }
  console.log(`\n${paint('1;32', 'OrenjiTrade is running')} (started in ${formatDuration(Date.now() - startedAt)})\n`);
  console.log(table(rows));
  console.log(
    `\nSeed accounts: docs/development/test-accounts.md. Fake payments/billing/donations and log push/email/analytics ` +
      `output appear in the [api] lines.\n${paint('1', 'Press Ctrl+C to stop')} the API and the web dev server ` +
      `(the Docker infrastructure keeps running; npm run infra:down stops it).\n`,
  );
}

/** Kills the API JVM if it is still listening (it belongs to the Gradle daemon's process tree). */
async function stopApiListener() {
  for (const pid of apiListenerPids) {
    if (!pid || !isAlive(pid) || !listeningPids(PORTS.api).has(pid)) {
      continue;
    }
    if (!IS_WINDOWS) {
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        // gone
      }
      for (let i = 0; i < 20 && isAlive(pid); i++) {
        await sleep(500);
      }
    }
    if (isAlive(pid)) {
      killTree(pid);
    }
  }
}

/**
 * Stops the children. `graceful` = the user pressed Ctrl+C: on Windows every process of the
 * console already received it, on Unix the process groups get SIGINT now. Whatever is still
 * running after the grace period is killed (whole tree).
 */
async function shutdown(code, graceful) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  log.step(graceful ? 'Stopping the API and the web dev server (Ctrl+C again to force)' : 'Stopping');
  const running = children.filter((child) => child.running);
  await Promise.all(
    running.map((child) => child.stop({ graceful, graceMs: child.name === 'api' ? 30_000 : 15_000 })),
  );
  await stopApiListener();
  await settlesWithin(Promise.all(children.map((child) => child.exited)), 5_000);
  log.ok(
    'Stopped. The Docker infrastructure is still running (npm run infra:down to stop it, npm run infra:reset for a clean database).',
  );
  process.exit(code);
}

let interrupts = 0;
function onSignal(signal) {
  interrupts += 1;
  if (interrupts > 1) {
    log.warn('Forcing shutdown.');
    for (const child of children) {
      child.kill();
    }
    for (const pid of apiListenerPids) {
      killTree(pid);
    }
    process.exit(130);
  }
  void shutdown(signal === 'SIGINT' || signal === 'SIGBREAK' ? 130 : 143, true);
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', ...(IS_WINDOWS ? ['SIGBREAK'] : [])]) {
  process.on(signal, () => onSignal(signal));
}
// Last resort: never leave children behind if this process dies on an exception.
process.on('exit', () => {
  for (const child of children) {
    if (child.running) {
      child.kill();
    }
  }
});

if (!HAS_CONSOLE && IS_WINDOWS) {
  log.info('No interactive console detected: child processes run hidden and are stopped when this process receives a signal.');
}

main().catch(async (error) => {
  log.error(error?.stack ?? String(error));
  await shutdown(1, false);
});
