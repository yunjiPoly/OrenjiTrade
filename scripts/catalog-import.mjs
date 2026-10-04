#!/usr/bin/env node
// Catalog import from the command line (ADR 0015, docs/development/local-setup.md):
//
//   npm run catalog:import -- --game yugioh --provider ygoprodeck --images referenced
//
// Options:
//   --game <slug>          game to import (default yugioh)
//   --provider <id>        provider id (default ygoprodeck; "mock" re-imports the fictional catalog)
//   --images <mode>        none | referenced (default) | all | limit:<n>   (or: limit --limit <n>)
//   --limit <n>            artworks of a LIMIT run
//   --mode <mode>          full (default) | incremental
//   --api <url>            API base URL (default ORENJI_API_URL or http://localhost:8080)
//
// Queues POST /internal/jobs/catalog-import with the local service token, polls
// GET /internal/jobs/catalog-import/{id} until the run finished and prints the report. The card
// metadata is always imported completely; the images go into the local cache, which never grows
// beyond CARD_IMAGE_LOCAL_CACHE_MAX_MB (at most 5 GB = 5120 MiB, enough for the whole Yu-Gi-Oh!
// catalog at 320 px). Needs a running API (npm run api:dev).

import { fail, formatDuration, log, table } from './lib/util.mjs';
import { apiBase, internal, mb, parseOptions } from './lib/internal-api.mjs';

const options = parseOptions(process.argv.slice(2), {
  values: ['game', 'provider', 'images', 'limit', 'mode', 'api'],
});

const game = (options.game || 'yugioh').toLowerCase();
const provider = (options.provider || 'ygoprodeck').toLowerCase();
const mode = (options.mode || 'full').toUpperCase();
if (!['FULL', 'INCREMENTAL'].includes(mode)) {
  fail(`--mode must be full or incremental (got "${options.mode}").`);
}

let imageMode = (options.images || 'referenced').toLowerCase();
let imageLimit = options.limit === undefined ? undefined : Number(options.limit);
const limitMatch = /^limit:(\d+)$/.exec(imageMode);
if (limitMatch) {
  imageMode = 'limit';
  imageLimit = Number(limitMatch[1]);
}
if (!['none', 'referenced', 'all', 'limit'].includes(imageMode)) {
  fail(`--images must be none, referenced, all or limit:<n> (got "${options.images}").`);
}
if (imageMode === 'limit' && !(Number.isInteger(imageLimit) && imageLimit > 0)) {
  fail('--images limit needs a positive number: --images limit:60 or --images limit --limit 60.');
}
if (imageMode !== 'limit') {
  imageLimit = undefined;
}

const base = apiBase(options);
const body = { gameSlug: game, provider, mode, imageMode: imageMode.toUpperCase() };
if (imageLimit !== undefined) {
  body.imageLimit = imageLimit;
}

log.step(
  `Catalog import: ${provider} -> ${game} (${mode.toLowerCase()}, images ${imageMode}` +
    `${imageLimit ? ` ${imageLimit}` : ''}) on ${base}`,
);
const started = Date.now();
const queued = await internal(base, 'POST', '/internal/jobs/catalog-import', body);
log.info(`Run ${queued.id} queued.`);

let run = queued;
let lastPhase = '';
while (run.status === 'QUEUED' || run.status === 'RUNNING') {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  run = await internal(base, 'GET', `/internal/jobs/catalog-import/${queued.id}`);
  const phase = run.phase || run.status;
  if (phase !== lastPhase) {
    lastPhase = phase;
    const report = run.report;
    const detail =
      phase === 'METADATA' && report
        ? ` (${report.totalCardsProcessed} cards from provider version ${report.providerDbVersion ?? '-'})`
        : '';
    log.info(`${formatDuration(Date.now() - started)}  ${phase}${detail}`);
  }
}

const report = run.report || {};
const rows = [
  ['Field', 'Value'],
  ['status', run.status],
  ['provider', report.provider ?? provider],
  ['providerDbVersion', report.providerDbVersion ?? '-'],
  ['imageMode', report.imageMode ?? imageMode.toUpperCase()],
  ['imageLimit', report.imageLimit ?? '-'],
  ['totalCardsProcessed', report.totalCardsProcessed],
  ['cardsCreated', report.cardsCreated],
  ['cardsUpdated', report.cardsUpdated],
  ['cardsUnchanged', report.cardsUnchanged],
  ['cardsFailed', report.cardsFailed],
  ['setsUpserted', report.setsUpserted],
  ['printingsUpserted', report.printingsUpserted],
  ['printingsSkipped', report.printingsSkipped],
  ['imagesReferenced', report.imagesReferenced],
  ['imagesSelected', report.imagesSelected],
  ['imagesAlreadyCached', report.imagesAlreadyCached],
  ['imagesDownloaded', report.imagesDownloaded],
  ['imagesDeduplicated', report.imagesDeduplicated],
  ['imagesSkippedCacheFull', report.imagesSkippedCacheFull],
  ['imagesFailed', report.imagesFailed],
  ['imagesMissingAtSource', report.imagesMissingAtSource],
  ['bytesDownloaded', `${report.bytesDownloaded ?? 0} (${mb(report.bytesDownloaded)} MB)`],
  ['cacheUsedMb', report.cacheUsedMb],
  ['cacheReservedMb', report.cacheReservedMb],
  ['cacheLimitMb', report.cacheLimitMb],
  ['cacheLimitReached', report.cacheLimitReached],
  ['durationSeconds', report.durationSeconds],
];
console.log(`\n${table(rows.map((row) => row.map((cell) => (cell === undefined ? '-' : String(cell)))))}\n`);
for (const warning of report.warnings ?? []) {
  log.warn(`warning: ${warning}`);
}
for (const error of report.errors ?? []) {
  log.warn(`error: ${error}`);
}
if (run.status !== 'SUCCEEDED') {
  fail(`Import ${run.status}: ${run.error ?? 'see the API log'}`);
}
if (report.cacheLimitReached) {
  log.warn(
    `The card image cache reached its limit (${report.cacheLimitMb} MB): the remaining artworks show ` +
      'placeholders. Metadata was imported completely.',
  );
}
log.ok(`Import finished in ${formatDuration(Date.now() - started)}.`);
