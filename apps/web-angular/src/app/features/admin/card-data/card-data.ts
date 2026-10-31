import type { CardImageCacheStatus, CatalogImportReport, CatalogSyncRun } from '@orenji/api-client';

/** A source's name (provider ids stay server-side words: never a source's address). */
const SOURCE_NAMES: Readonly<Record<string, string>> = {
  ygoprodeck: 'YGOPRODeck',
  tcgdex: 'TCGdex',
  scryfall: 'Scryfall',
  mock: 'Mock (local fixtures)',
};

export function sourceName(provider: string | null | undefined): string {
  return provider ? (SOURCE_NAMES[provider] ?? provider) : 'No source';
}

/** The line under a source (board A12). Magic's stays "Unique Artwork" until decision 5. */
const SOURCE_NOTES: Readonly<Record<string, string>> = {
  ygoprodeck: 'Database version check first · 5 requests a second',
  tcgdex: 'Card database download · English',
  scryfall: 'Daily "Unique Artwork" bulk file · one image per artwork',
  mock: 'Fictional cards for local work and tests: no network call',
};

export function sourceNote(provider: string | null | undefined): string {
  return provider ? (SOURCE_NOTES[provider] ?? '') : '';
}

/** What the Source select says about a source. */
const SOURCE_HINTS: Readonly<Record<string, string>> = {
  ygoprodeck: 'The Yu-Gi-Oh! catalog: cards, sets, printings and artworks.',
  tcgdex: 'Pokémon cards: one image per printing.',
  scryfall: 'Magic cards: one image per artwork.',
  mock: 'Fictional cards bundled with the API; it never calls a provider.',
};

export function sourceHint(provider: string): string {
  return SOURCE_HINTS[provider] ?? '';
}

/**
 * The provider etiquette line (CLAUDE.md, ADR 0015 and 0021, spec 15.6): called only when staff
 * run a sync, the version first, the stored snapshot, the API's pace for the source
 * (application.yml: YGOPRODeck and TCGdex 5 requests a second, Scryfall 8, under its 10).
 */
export function etiquette(provider: string): string {
  const name = sourceName(provider);
  switch (provider) {
    case 'ygoprodeck':
      return `${name} is called only when someone runs a sync, never on a schedule. The sync checks the source’s database version first, reuses the stored snapshot and sends at most 5 requests a second.`;
    case 'tcgdex':
      return `${name} is called only when someone runs a sync, never on a schedule. The sync checks the source’s version first, reuses the stored snapshot (one download of the card database, not a call per card) and sends at most 5 requests a second.`;
    case 'scryfall':
      return `${name} is called only when someone runs a sync, never on a schedule. The sync downloads the bulk file at most once a day (it checks the file's date first), reuses the stored snapshot and sends at most 8 requests a second.`;
    case 'mock':
      return 'The local fixtures never call a provider: the run reads the cards bundled with the API.';
    default:
      return `${name} is called only when someone runs a sync, never on a schedule, with the source's version checked first.`;
  }
}

export type ImageMode = 'REFERENCED' | 'ALL' | 'NONE' | 'LIMIT';

/** The Images choices (the API's `imageMode` and `imageLimit`). */
export const IMAGE_MODES: readonly { id: ImageMode; label: string; hint: string }[] = [
  {
    id: 'REFERENCED',
    label: 'Only images in use',
    hint: 'Artworks of cards members use: inventories, binders, wishlists, messages and community posts. The default.',
  },
  {
    id: 'ALL',
    label: 'All',
    hint: 'Every artwork of the game, the ones in use first, until the cache reaches its cap.',
  },
  { id: 'NONE', label: 'None', hint: 'Card data only: no downloads.' },
  {
    id: 'LIMIT',
    label: 'Up to …',
    hint: 'The first artworks up to this number, the ones in use first, then by card name.',
  },
];

export const MODE_HINTS: Readonly<Record<'INCREMENTAL' | 'FULL', string>> = {
  INCREMENTAL: 'Brings in what changed since the stored version. The usual choice.',
  FULL: 'Reads the whole source again. Unchanged rows still aren’t rewritten.',
};

/** The "Up to …" number: a whole number from 1 to 1,000,000, else the error. */
export function imageLimitError(raw: string): string | null {
  const text = raw.trim();
  if (!/^\d+$/.test(text) || Number(text) < 1 || Number(text) > 1_000_000) {
    return 'Use a whole number from 1 to 1,000,000.';
  }
  return null;
}

/** "Only images in use", "Up to 2,000". */
export function imagesLabel(run: { imageMode?: string; imageLimit?: number }): string {
  if (run.imageMode === 'LIMIT') {
    return `Up to ${(run.imageLimit ?? 0).toLocaleString('en-US')}`;
  }
  return IMAGE_MODES.find((mode) => mode.id === run.imageMode)?.label ?? '—';
}

export const PHASES: readonly { id: string; label: string }[] = [
  { id: 'FETCHING', label: 'Fetching' },
  { id: 'METADATA', label: 'Metadata' },
  { id: 'IMAGES', label: 'Images' },
  { id: 'DONE', label: 'Done' },
];

/** A run's status in words and its chip tone. */
export function runStatus(run: { status?: string; phase?: string }): {
  label: string;
  tone: 'success' | 'danger' | 'info' | 'neutral';
} {
  switch (run.status) {
    case 'SUCCEEDED':
      return { label: 'Succeeded', tone: 'success' };
    case 'FAILED':
      return { label: 'Failed', tone: 'danger' };
    case 'RUNNING': {
      const phase = PHASES.find((p) => p.id === run.phase)?.label;
      return { label: phase ? `Running · ${phase}` : 'Running', tone: 'info' };
    }
    default:
      return { label: 'Queued', tone: 'neutral' };
  }
}

export function isFinished(run: CatalogSyncRun | null | undefined): boolean {
  return run?.status === 'SUCCEEDED' || run?.status === 'FAILED';
}

/** "3,413" for MB above 100, else one decimal. */
export function mbText(mb: number): string {
  return mb >= 100 ? Math.round(mb).toLocaleString('en-US') : String(Math.round(mb * 10) / 10);
}

/** One game's share of the cache meter. */
export interface MeterSegment {
  game: string;
  mb: number;
  percent: number;
}

/** The meter split by game (games without a cached byte are left out). */
export function meterSegments(status: CardImageCacheStatus): MeterSegment[] {
  const limit = Math.max(1, status.limitMb);
  const byGame = new Map<string, number>();
  for (const entry of status.games ?? []) {
    byGame.set(entry.game, (byGame.get(entry.game) ?? 0) + entry.cachedBytes / (1024 * 1024));
  }
  return [...byGame.entries()]
    .filter(([, mb]) => mb > 0)
    .map(([game, mb]) => ({ game, mb, percent: (mb / limit) * 100 }));
}

/** A game's image counts (summed over its providers). */
export interface GameImages {
  game: string;
  providers: string[];
  cached: number;
  notCached: number;
  failed: number;
  missing: number;
  mb: number;
}

export function gameImages(status: CardImageCacheStatus): GameImages[] {
  const games = new Map<string, GameImages>();
  for (const entry of status.games ?? []) {
    const row = games.get(entry.game) ?? {
      game: entry.game,
      providers: [],
      cached: 0,
      notCached: 0,
      failed: 0,
      missing: 0,
      mb: 0,
    };
    row.providers.push(entry.provider);
    row.cached += entry.images['CACHED'] ?? 0;
    row.notCached += entry.images['NOT_CACHED'] ?? 0;
    row.failed += entry.images['FAILED'] ?? 0;
    row.missing += entry.images['MISSING_AT_SOURCE'] ?? 0;
    row.mb += entry.cachedBytes / (1024 * 1024);
    games.set(entry.game, row);
  }
  return [...games.values()];
}

/** "14,812 cached · 1,204 not cached · 12 missing at the source" (zeros left out but cached). */
export function gameImagesLine(row: GameImages): string {
  const parts = [`${row.cached.toLocaleString('en-US')} cached`];
  if (row.notCached) {
    parts.push(`${row.notCached.toLocaleString('en-US')} not cached`);
  }
  if (row.failed) {
    parts.push(`${row.failed.toLocaleString('en-US')} failed`);
  }
  if (row.missing) {
    parts.push(`${row.missing.toLocaleString('en-US')} missing at the source`);
  }
  return parts.join(' · ');
}

/** The report drawer's rows, in sections (board A12's "Sync report"). */
export function reportSections(
  report: CatalogImportReport,
): { title: string; rows: [string, string][] }[] {
  const n = (value: number) => value.toLocaleString('en-US');
  return [
    {
      title: 'Card data',
      rows: [
        ['Cards read', n(report.totalCardsProcessed)],
        ['Created', n(report.cardsCreated)],
        ['Updated', n(report.cardsUpdated)],
        ['Unchanged', n(report.cardsUnchanged)],
        ['Failed', n(report.cardsFailed)],
        ['Sets written', n(report.setsUpserted)],
        ['Printings written', n(report.printingsUpserted)],
        ['Printings skipped', n(report.printingsSkipped)],
      ],
    },
    {
      title: 'Images',
      rows: [
        ['Artworks known', n(report.imagesReferenced)],
        ['Selected', n(report.imagesSelected)],
        ['Already cached', n(report.imagesAlreadyCached)],
        ['Downloaded', n(report.imagesDownloaded)],
        ['Shared with another artwork', n(report.imagesDeduplicated)],
        ['Skipped: the cache is full', n(report.imagesSkippedCacheFull)],
        ['Failed', n(report.imagesFailed)],
        ['Missing at the source', n(report.imagesMissingAtSource)],
      ],
    },
    {
      title: 'Cache',
      rows: [
        ['Downloaded', `${mbText(report.bytesDownloaded / (1024 * 1024))} MB`],
        ['Used after the run', `${mbText(report.cacheUsedMb)} of ${n(report.cacheLimitMb)} MB`],
        ['Reserved', `${mbText(report.cacheReservedMb)} MB`],
        ['Cap reached', report.cacheLimitReached ? 'Yes' : 'No'],
      ],
    },
  ];
}

/** "8 s", "6 min 51 s". */
export function durationText(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  return minutes ? `${minutes} min ${total % 60} s` : `${total} s`;
}
