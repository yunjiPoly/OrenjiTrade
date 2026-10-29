import type {
  InventoryImportLimits,
  InventoryImportResponse,
  InventoryImportRow,
} from '@orenji/api-client';
import { ApiError } from '../../../core/http/api-error';
import { friendlyError } from '../../../core/http/api-error-messages';
import { ImportSourceChoice } from './import-handoff.service';

/**
 * The words of Import (web redesign spec 9.11, board W16 and W17): the phone's
 * (`apps/mobile/src/features/inventory/import/importLabels.ts`) where the web shares them. The
 * limits always come from `GET /inventory/imports/limits` (decision 22), never from this file.
 */

export const IMPORT_SOURCES: Record<
  ImportSourceChoice,
  { toggle: string; description: string; noun: string; extension: string; label: string }
> = {
  YDK: {
    toggle: 'Yu-Gi-Oh! deck (.ydk)',
    description: 'A .ydk file from YGOPRODeck or EDOPro.',
    noun: 'a deck file',
    extension: '.ydk',
    label: 'Yu-Gi-Oh! deck (.ydk)',
  },
  COLLECTR_CSV: {
    toggle: 'Collectr (.csv)',
    description: "A .csv export from Collectr. You check every match before it's added.",
    noun: 'a CSV export',
    extension: '.csv',
    label: 'Collectr export (.csv)',
  },
};

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString('en-CA')} ${count === 1 ? one : many}`;
}

/** "100 kB", "2 MB" (powers of 1024, as the API counts). */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    const mb = bytes / (1024 * 1024);
    return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    const kb = bytes / 1024;
    return `${Number.isInteger(kb) ? kb : kb.toFixed(1)} kB`;
  }
  return `${bytes} bytes`;
}

/** "Up to 100 kB and 500 lines" / "Up to 2 MB and 5,000 rows", from the server's limits. */
export function limitsLine(
  source: ImportSourceChoice,
  limits: InventoryImportLimits | null,
): string | null {
  if (!limits) {
    return null;
  }
  return source === 'YDK'
    ? `Up to ${formatBytes(limits.ydkMaxBytes)} and ${plural(limits.ydkMaxLines, 'line')}`
    : `Up to ${formatBytes(limits.csvMaxBytes)} and ${plural(limits.csvMaxRows, 'row')}`;
}

/** "The preview is kept for 60 minutes." */
export function keptLine(limits: InventoryImportLimits | null): string {
  const minutes = limits?.previewTtlMinutes;
  return minutes
    ? `The preview is kept for ${plural(minutes, 'minute')}.`
    : 'The preview is kept for a while.';
}

/** The largest file of a source, or null while the limits are unknown. */
export function maxBytes(
  source: ImportSourceChoice,
  limits: InventoryImportLimits | null,
): number | null {
  if (!limits) {
    return null;
  }
  return source === 'YDK' ? limits.ydkMaxBytes : limits.csvMaxBytes;
}

export interface ImportProblem {
  title: string;
  message: string;
}

function tooLarge(source: ImportSourceChoice, limit: number | null): ImportProblem {
  return {
    title: 'This file is too large',
    message:
      limit !== null
        ? `${IMPORT_SOURCES[source].noun.replace(/^a /, 'A ')} can be up to ${formatBytes(limit)}.${
            source === 'COLLECTR_CSV' ? ' Export your collection in smaller parts.' : ''
          }`
        : 'This file is larger than an import may be.',
  };
}

/** Refused before the upload: a file the browser can already tell is too large. */
export function refusalBeforeUpload(
  source: ImportSourceChoice,
  bytes: number,
  limits: InventoryImportLimits | null,
): ImportProblem | null {
  const limit = maxBytes(source, limits);
  return limit !== null && bytes > limit ? tooLarge(source, limit) : null;
}

function numberOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function retryIn(seconds: number | null): string {
  if (seconds === null || seconds <= 0) {
    return 'in a moment';
  }
  return seconds < 90
    ? `in ${plural(Math.max(1, Math.round(seconds)), 'second')}`
    : `in ${plural(Math.ceil(seconds / 60), 'minute')}`;
}

/** Why an upload or a commit was refused, in plain words. */
export function importRefusal(error: ApiError, source: ImportSourceChoice): ImportProblem {
  const problem = (error.problem ?? {}) as Record<string, unknown>;
  const reason = typeof problem['reason'] === 'string' ? problem['reason'] : null;
  const limit = numberOf(problem['fileLimit']);
  if (error.errorCode === 'RATE_LIMITED') {
    return {
      title: 'Too many imports in a short time',
      message: `You can import again ${retryIn(numberOf(problem['retryAfterSeconds']))}. Every collector has the same limits.`,
    };
  }
  if (error.errorCode === 'LIMIT_REACHED') {
    const used = numberOf(problem['used']);
    const max = numberOf(problem['limit']);
    return {
      title: 'Your inventory would be over its limit',
      message: `${max !== null ? `An inventory holds at most ${plural(max, 'card')}${used !== null ? `; yours has ${used.toLocaleString('en-CA')}` : ''}. ` : ''}Leave some lines out, or delete cards you no longer have. Every collector has the same limits.`,
    };
  }
  if (error.errorCode === 'IMPORT_EXPIRED') {
    return {
      title: 'This preview has expired',
      message: 'Previews are kept for a limited time. Choose the file again.',
    };
  }
  if (reason === 'TOO_LARGE' || error.errorCode === 'PAYLOAD_TOO_LARGE') {
    return tooLarge(source, limit);
  }
  if (reason === 'NOT_TEXT' || error.errorCode === 'UNSUPPORTED_MEDIA_TYPE') {
    return {
      title: 'This file could not be read as text',
      message:
        source === 'YDK'
          ? 'A deck file is plain text: choose the .ydk file itself, not a picture or a compressed folder.'
          : 'A CSV export is plain text in UTF-8. Choose the .csv file itself, not a spreadsheet saved as .xlsx or .numbers.',
    };
  }
  switch (reason) {
    case 'TOO_MANY_LINES':
      return {
        title: 'This file has too many lines',
        message:
          limit !== null
            ? `A deck file can have up to ${plural(limit, 'line')}.`
            : 'This deck file has more lines than a deck file may have.',
      };
    case 'TOO_MANY_ROWS':
      return {
        title: 'This file has too many rows',
        message: `${limit !== null ? `A CSV export can have up to ${plural(limit, 'row')}.` : 'This export has more rows than an export may have.'} Export your collection in smaller parts.`,
      };
    case 'MISSING_COLUMNS': {
      const missing = Array.isArray(problem['missingColumns'])
        ? (problem['missingColumns'] as unknown[]).filter((name): name is string => typeof name === 'string')
        : [];
      const columns = missing.length ? missing.map((name) => `“${name}”`).join(', ') : null;
      return {
        title: 'A column could not be found',
        message: `${columns ? `This file has no ${columns} column.` : 'This file lacks a column the import needs.'} The first line of the file must name its columns: the card name is found under “Product Name”, “Card Name” or “Name”.`,
      };
    }
    case 'MALFORMED':
      return {
        title: 'This file could not be read',
        message: 'A quoted value of this CSV is never closed. Export the file again and retry.',
      };
    case 'EMPTY_FILE':
      return { title: 'This file is empty', message: `Choose ${IMPORT_SOURCES[source].noun} that lists cards.` };
    case 'NO_CARDS':
      return {
        title: 'No card in this file',
        message:
          source === 'YDK'
            ? 'A deck file lists one passcode per line under “#main”, “#extra” and “!side”. This file has none.'
            : 'This export has column titles but no row with a card name.',
      };
    default:
      return { title: 'This file could not be imported', message: friendlyError(error).message };
  }
}

/** Why a line was not recognised (the phone's words). */
export const UNMATCHED_WHY: Record<string, string> = {
  UNKNOWN_PASSCODE: 'This id is not in the Yu-Gi-Oh! catalog. Add it by name from Add cards.',
  UNKNOWN_CARD: 'No card of the catalog has this name. Check its spelling, or add it by name.',
  AMBIGUOUS_CARD: 'Several cards have this name and the file does not say which one.',
  UNKNOWN_GAME: 'OrenjiTrade does not have this game.',
  NO_PRINTING: 'The catalog has this card but no printing of it yet.',
  INVALID_QUANTITY: 'The number of copies is not a whole number from 1 to 9,999.',
  CARD_REMOVED: 'This card left the catalog after the file was read.',
};

export function unmatchedWhy(row: Pick<InventoryImportRow, 'unmatchedReason'>): string {
  return (row.unmatchedReason && UNMATCHED_WHY[row.unmatchedReason]) || 'It stays out.';
}

/** The row's line of the file, as a collector recognises it: the passcode, or set and number. */
export function fileLine(row: Pick<InventoryImportRow, 'source' | 'position'>): string {
  const source = row.source;
  const parts = [
    source.passcode ?? null,
    source.set && source.number ? `${source.set} ${source.number}` : (source.set ?? source.number ?? null),
  ].filter(Boolean);
  return parts.join(' · ') || `row ${row.position + 1}`;
}

/** The row's name: the catalog card's, else the file's, else its passcode. */
export function rowName(row: Pick<InventoryImportRow, 'card' | 'source'>): string {
  return row.card?.name ?? row.source.name ?? (row.source.passcode ? `Card id ${row.source.passcode}` : 'Unknown card');
}

export type RowState = 'ready' | 'choose' | 'unmatched' | 'out';

export function rowState(row: Pick<InventoryImportRow, 'status' | 'included' | 'inScope'>): RowState {
  if (row.status === 'UNMATCHED') {
    return 'unmatched';
  }
  if (!row.included || !row.inScope) {
    return 'out';
  }
  return row.status === 'CHOOSE_PRINTING' ? 'choose' : 'ready';
}

export const ROW_STATE_LABEL: Record<RowState, string> = {
  ready: 'Ready',
  choose: 'Which copy?',
  unmatched: 'Not recognised',
  out: 'Left out',
};

/** The footer (spec 9.11): "34 cards · 69 copies will be added. They start private and unfiled." */
export function footerLine(preview: Pick<InventoryImportResponse, 'summary'>): {
  strong: string;
  rest: string;
} {
  const { items, copies } = preview.summary;
  return {
    strong: `${plural(items, 'card')} · ${plural(copies, 'copy', 'copies')}`,
    rest: ' will be added. They start private and unfiled.',
  };
}

/** "Add 34 cards". */
export function addLabel(preview: Pick<InventoryImportResponse, 'summary'>): string {
  return `Add ${plural(preview.summary.items, 'card')}`;
}

/** "40 main, 15 extra, 15 side" of a deck file. */
export function sectionsLine(preview: Pick<InventoryImportResponse, 'sections'>): string | null {
  const sections = preview.sections;
  if (!sections) {
    return null;
  }
  return `${sections.mainCopies} main, ${sections.extraCopies} extra, ${sections.sideCopies} side`;
}

/** Done (W17): "34 cards added" and "69 copies in all. They start private. …". */
export function doneLines(preview: Pick<InventoryImportResponse, 'result'>): {
  title: string;
  body: string;
  cards: number;
  copies: number;
} {
  const result = preview.result;
  const cards = (result?.itemsCreated ?? 0) + (result?.itemsMerged ?? 0);
  const copies = result?.copiesAdded ?? 0;
  return {
    title: `${plural(cards, 'card')} added`,
    body: `${plural(copies, 'copy', 'copies')} in all. They start private. Make the ones you trade public from Inventory.`,
    cards,
    copies,
  };
}
