#!/usr/bin/env node
// Local infrastructure (docker-compose.yml, project "orenjitrade"):
//   npm run infra:up      docker compose up -d --build --wait   (PostGIS, Redis, Firebase Auth emulator)
//   npm run infra:down    stops and removes the project's containers; data volumes are kept
//   npm run infra:reset   DELETES this project's data: docker compose down -v (named volumes
//                         orenjitrade_*), apps/api/.local-storage, then infra:up again.
//                         Asks for confirmation; `npm run infra:reset -- --yes` skips the prompt.
// The seed data (fictional accounts, catalog, binders, ...) is re-created automatically the next
// time the API starts with the `local` profile (npm run dev / npm run api:dev).

import fs from 'node:fs';
import path from 'node:path';
import {
  API_MEDIA_DIR,
  PORTS,
  ROOT,
  capture,
  confirm,
  describePortOwner,
  ensureDocker,
  fail,
  formatDuration,
  infraUp,
  log,
  parseFlags,
  portInUse,
  runDocker,
} from './lib/util.mjs';

const [command, ...argv] = process.argv.slice(2);
const { flags, rest } = parseFlags(argv, { yes: ['--yes', '-y'] });

const COMPOSE_PROJECT = 'orenjitrade';

async function up() {
  ensureDocker();
  const code = await infraUp(rest);
  if (code === 0) {
    await runDocker(['compose', 'ps'], { cwd: ROOT });
  }
  return code;
}

async function down() {
  ensureDocker();
  log.step('Stopping the local stack (docker compose down; data volumes are kept)');
  // --profile "*" also stops the optional services (Docker "app" profile, Pub/Sub emulator).
  return runDocker(['compose', '--profile', '*', 'down', '--remove-orphans', ...rest], { cwd: ROOT });
}

function projectVolumes() {
  const { stdout } = capture('docker', [
    'volume',
    'ls',
    '--filter',
    `label=com.docker.compose.project=${COMPOSE_PROJECT}`,
    '--format',
    '{{.Name}}',
  ]);
  return stdout.split(/\r?\n/).filter(Boolean);
}

async function reset() {
  ensureDocker();
  const volumes = projectVolumes();
  const media = path.relative(ROOT, API_MEDIA_DIR);
  console.log(`
This DELETES all local OrenjiTrade data of this checkout:
  - Docker volumes: ${volumes.length ? volumes.join(', ') : '(none yet)'}
    (PostgreSQL databases orenjitrade + orenjitrade_test, Redis, Firebase Auth emulator accounts)
  - uploaded media: ${media}
Nothing outside the "${COMPOSE_PROJECT}" compose project is touched. Seed data is re-created the next
time the API starts with the local profile.`);
  if (!flags.yes) {
    const ok = await confirm('Delete the local data and restart the infrastructure?');
    if (!ok) {
      log.warn(
        process.stdin.isTTY
          ? 'Aborted; nothing was deleted.'
          : 'Not an interactive terminal; re-run with `npm run infra:reset -- --yes` to confirm. Nothing was deleted.',
      );
      return 1;
    }
  }
  const started = Date.now();
  const apiRunning = await portInUse(PORTS.api);

  log.step('Removing containers and volumes (docker compose down -v)');
  const downCode = await runDocker(
    ['compose', '--profile', '*', 'down', '--volumes', '--remove-orphans'],
    { cwd: ROOT },
  );
  if (downCode !== 0) {
    fail('docker compose down -v failed; nothing else was changed.');
  }

  log.step(`Deleting uploaded media (${media})`);
  fs.rmSync(API_MEDIA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });

  const upCode = await infraUp();
  if (upCode !== 0) {
    return upCode;
  }
  log.ok(`Reset finished in ${formatDuration(Date.now() - started)}: empty databases, empty emulator, no media.`);
  if (apiRunning) {
    log.warn(
      `Something is still listening on port ${PORTS.api} (${describePortOwner(PORTS.api)}). ` +
        'An API that was running during the reset keeps stale state: restart it so Flyway recreates the schema and the seed runs again.',
    );
  } else {
    log.info('Start the API (npm run dev or npm run api:dev): Flyway recreates the schema and the seed data is loaded.');
  }
  return 0;
}

const commands = { up, down, reset };
if (!commands[command]) {
  console.log('Usage: node scripts/infra.mjs <up|down|reset> [--yes]');
  process.exit(1);
}
process.exit(await commands[command]());
