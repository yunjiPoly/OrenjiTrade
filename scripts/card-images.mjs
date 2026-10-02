#!/usr/bin/env node
// Local card image cache (ADR 0015, docs/development/local-setup.md):
//
//   npm run card-images:status                       usage, limit, artworks per cache status
//   npm run card-images:clear -- --yes [--game yugioh]
//                                                    deletes the cached image files (of one game)
//                                                    and releases their capacity; card metadata and
//                                                    image source references stay
//   npm run card-images:reconcile                    re-syncs files, rows and accounting
//
// Option --api <url> targets another API (default ORENJI_API_URL or http://localhost:8080).
// Needs a running API (npm run api:dev); authenticates with the local service token.

import { confirm, fail, log, table } from './lib/util.mjs';
import { apiBase, internal, mb, parseOptions } from './lib/internal-api.mjs';

const [command, ...argv] = process.argv.slice(2);

function statusTable(status) {
  const rows = [
    ['', 'MB', 'bytes'],
    ['used', mb(status.usedBytes), status.usedBytes],
    ['reserved (in-flight downloads)', mb(status.reservedBytes), status.reservedBytes],
    ['remaining', mb(status.remainingBytes), status.remainingBytes],
    ['limit (CARD_IMAGE_LOCAL_CACHE_MAX_MB)', String(status.limitMb), status.limitBytes],
  ];
  return table(rows.map((row) => row.map(String)));
}

async function status(options) {
  const base = apiBase(options);
  const { directory, status: cache } = await internal(base, 'GET', '/internal/jobs/card-images/status');
  log.step(`Card image cache on ${base}`);
  console.log(`directory: ${directory}`);
  console.log(`files: ${cache.files}   active reservations: ${cache.activeReservations}`);
  console.log(`last reconciliation: ${cache.reconciledAt ?? 'never'}\n`);
  console.log(statusTable(cache));
  const statuses = ['NOT_CACHED', 'CACHED', 'FAILED', 'MISSING_AT_SOURCE'];
  const rows = [['game', 'provider', ...statuses, 'cached MB']];
  for (const game of cache.games ?? []) {
    rows.push([
      game.game,
      game.provider,
      ...statuses.map((s) => String(game.images?.[s] ?? 0)),
      mb(game.cachedBytes),
    ]);
  }
  rows.push(['all', '', ...statuses.map((s) => String(cache.images?.[s] ?? 0)), '']);
  console.log(`\n${table(rows)}\n`);
}

async function clear(options) {
  const base = apiBase(options);
  const scope = options.game ? `the "${options.game}" images` : 'ALL cached card images';
  if (!options.yes) {
    const ok = await confirm(`Delete ${scope} from the local card image cache on ${base}?`);
    if (!ok) {
      fail(
        process.stdin.isTTY
          ? 'Aborted; nothing was deleted.'
          : 'Not an interactive terminal; re-run with -- --yes to confirm. Nothing was deleted.',
      );
    }
  }
  const query = options.game ? `?game=${encodeURIComponent(options.game.toLowerCase())}` : '';
  const result = await internal(base, 'POST', `/internal/jobs/card-images/clear${query}`);
  log.ok(
    `Cleared ${scope}: ${result.images} image(s) back to NOT_CACHED, ${result.filesDeleted} file(s) ` +
      `deleted, ${mb(result.bytesReleased)} MB released. Metadata and source references were kept.`,
  );
}

async function reconcile(options) {
  const base = apiBase(options);
  const result = await internal(base, 'POST', '/internal/jobs/card-images/reconcile');
  log.ok(
    `Reconciled: ${result.orphanTempFiles} orphan temporary file(s), ${result.orphanFiles} orphan ` +
      `file(s), ${result.missingFiles} missing file(s), ${result.expiredReservations} expired ` +
      `reservation(s), ${result.evicted} evicted; ${mb(result.usedBytes)} MB in ${result.files} file(s).`,
  );
}

switch (command) {
  case 'status':
    await status(parseOptions(argv, { values: ['api'] }));
    break;
  case 'clear':
    await clear(parseOptions(argv, { values: ['api', 'game'], flags: ['yes'] }));
    break;
  case 'reconcile':
    await reconcile(parseOptions(argv, { values: ['api'] }));
    break;
  default:
    fail('Usage: node scripts/card-images.mjs status | clear [--yes] [--game <slug>] | reconcile');
}
