import type { ApiError } from '@/src/api/ApiError';
import { friendlyError, type FriendlyError } from '@/src/api/errorMessages';
import type { ImportRowFilter } from '@/src/api/hooks/inventoryImport';
import type {
  ImportLimits,
  ImportResult,
  ImportRow,
  ImportSections,
  ImportSource,
  ImportSummary,
  ImportUnmatchedReason,
  InventoryImport,
  PrintingSummary,
} from '@/src/api/types';
import type { IconName } from '@/src/components/ui/EmptyState';
import { whichCopyLabel } from '@/src/features/wishlist/wishlistLabels';
import { conditionLabel } from '@/src/lib/inventory';

/**
 * Wording of the inventory import (stage S5): the two sources, what a file may be, why a file was
 * refused, the counts of a preview, one row, the commit and its result. Pure functions, so the
 * screens, the screen reader names and the tests say the same thing.
 */

// --- Sources -----------------------------------------------------------------------------------

export interface ImportSourceInfo {
  /** What the collector picks. */
  title: string;
  /** What it is and how to get it out of the other app, in one sentence. */
  description: string;
  icon: IconName;
  /** "a deck file" / "a CSV export", for sentences. */
  noun: string;
  /** Label of the paste field. */
  pasteLabel: string;
  /** Extension of the file a pasted text is sent as. */
  extension: string;
}

export const IMPORT_SOURCES: Record<ImportSource, ImportSourceInfo> = {
  YDK: {
    title: 'Yu-Gi-Oh! deck file (.ydk)',
    description:
      'The list of a deck as deck builders save it: in your deck builder, open the deck and choose “Export” or “Download YDK”. Each line of the file is the passcode of a card: the number printed in the lower left corner of the card.',
    icon: 'cards-playing-outline',
    noun: 'a deck file',
    pasteLabel: 'Text of the deck file',
    extension: '.ydk',
  },
  COLLECTR_CSV: {
    title: 'Collectr CSV export',
    description:
      'Your collection as a spreadsheet file: in Collectr, export your portfolio as CSV, then bring that file here. OrenjiTrade never connects to Collectr and never reads its prices.',
    icon: 'file-delimited-outline',
    noun: 'a CSV export',
    pasteLabel: 'Text of the CSV export',
    extension: '.csv',
  },
};

export const IMPORT_SOURCE_ORDER: readonly ImportSource[] = ['YDK', 'COLLECTR_CSV'];

// --- Numbers -----------------------------------------------------------------------------------

/** "1,234" (no Intl: Hermes formats differently across devices). */
export function formatCount(value: number): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** "1 card" / "3 cards". */
export function plural(count: number, one: string, many: string = `${one}s`): string {
  return `${formatCount(count)} ${count === 1 ? one : many}`;
}

/**
 * What one line of a preview is called. A deck file names each card once per copy, and its lines
 * become one line per different card; a CSV export is shown line by line. "Card" alone always
 * means an inventory card (what the import adds), "copy" a copy of it.
 */
export function lineNoun(source: ImportSource): { one: string; many: string } {
  return source === 'YDK'
    ? { one: 'different card', many: 'different cards' }
    : { one: 'line', many: 'lines' };
}

/** "3 different cards" / "1 line". */
export function pluralLines(count: number, source: ImportSource): string {
  const noun = lineNoun(source);
  return plural(count, noun.one, noun.many);
}

/** The short word for the lines that need something: "card(s)" of a deck, "line(s)" of a CSV. */
function shortLines(count: number, source: ImportSource): string {
  return source === 'YDK' ? plural(count, 'card') : plural(count, 'line');
}

/** "100 kB", "2 MB" (a kB is 1,024 bytes, as the admin settings count it). */
export function formatBytes(bytes: number): string {
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${formatCount(Math.max(1, Math.round(kb)))} kB`;
  }
  const mb = kb / 1024;
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
}

/** Bytes of a text once it is sent as UTF-8. */
export function utf8Length(text: string): number {
  let bytes = 0;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      // A surrogate pair is one character of four bytes.
      bytes += 4;
      index++;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

// --- What a file may be ------------------------------------------------------------------------

/** "Up to 100 kB and 500 lines." (the admin limits; nothing while they are unknown). */
export function limitsHint(source: ImportSource, limits: ImportLimits | undefined): string | null {
  if (!limits) {
    return null;
  }
  return source === 'YDK'
    ? `Up to ${formatBytes(limits.ydkMaxBytes)} and ${plural(limits.ydkMaxLines, 'line')}.`
    : `Up to ${formatBytes(limits.csvMaxBytes)} and ${plural(limits.csvMaxRows, 'row')}.`;
}

/** The size limit of a source in bytes; `null` while the limits are unknown. */
export function maxBytes(source: ImportSource, limits: ImportLimits | undefined): number | null {
  if (!limits) {
    return null;
  }
  return source === 'YDK' ? limits.ydkMaxBytes : limits.csvMaxBytes;
}

function tooLarge(source: ImportSource, limit: number | null): FriendlyError {
  const noun = IMPORT_SOURCES[source].noun;
  return {
    title: 'This file is too large',
    message:
      limit !== null
        ? `${capitalise(noun)} can be up to ${formatBytes(limit)}.${
            source === 'COLLECTR_CSV' ? ' Export your collection in smaller parts.' : ''
          }`
        : `This file is larger than ${noun} may be.`,
  };
}

/**
 * A file the app can already tell is too large (the API would answer 413): said before anything
 * is uploaded. `null` when the size is unknown or fits. The API checks again whatever the app did.
 */
export function refusalBeforeUpload(
  source: ImportSource,
  bytes: number | null | undefined,
  limits: ImportLimits | undefined
): FriendlyError | null {
  const limit = maxBytes(source, limits);
  if (bytes === null || bytes === undefined || limit === null || bytes <= limit) {
    return null;
  }
  return tooLarge(source, limit);
}

function capitalise(text: string): string {
  return text ? (text[0] ?? '').toUpperCase() + text.slice(1) : text;
}

function numberOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** "in 2 minutes" / "in a moment" for a rate limit's `retryAfterSeconds`. */
function retryIn(seconds: number | null): string {
  if (seconds === null || seconds <= 0) {
    return 'in a moment';
  }
  if (seconds < 90) {
    return `in ${plural(Math.max(1, Math.round(seconds)), 'second')}`;
  }
  return `in ${plural(Math.ceil(seconds / 60), 'minute')}`;
}

/**
 * Why an upload was refused, in words a collector understands: too large, too many lines or rows,
 * not a text file, the columns that could not be found (named), an empty file, a rate limit.
 * Anything else gets the app's usual wording.
 */
export function importRefusal(error: ApiError, source: ImportSource): FriendlyError {
  const problem = (error.problem ?? {}) as Record<string, unknown>;
  const reason = typeof problem.reason === 'string' ? problem.reason : null;
  const limit = numberOf(problem.fileLimit);
  const info = IMPORT_SOURCES[source];
  if (error.errorCode === 'RATE_LIMITED') {
    return {
      title: 'Too many imports in a short time',
      message: `You can import again ${retryIn(numberOf(problem.retryAfterSeconds))}.`,
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
          : 'A CSV export is plain text in UTF-8. Choose the .csv file itself, not a spreadsheet saved as .xlsx or .numbers. If it is a .csv that another app saved again, export it from Collectr once more, or save it as “CSV UTF-8”.',
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
        message: `${
          limit !== null
            ? `A CSV export can have up to ${plural(limit, 'row')}.`
            : 'This export has more rows than an export may have.'
        } Export your collection in smaller parts.`,
      };
    case 'MISSING_COLUMNS': {
      const missing = Array.isArray(problem.missingColumns)
        ? problem.missingColumns.filter((name): name is string => typeof name === 'string')
        : [];
      const columns = missing.length ? missing.map((name) => `“${name}”`).join(', ') : null;
      return {
        title: 'A column could not be found',
        message: `${
          columns
            ? `This file has no ${columns} column.`
            : 'This file lacks a column the import needs.'
        } The first line of the file must name its columns: the card name is found under “Product Name”, “Card Name” or “Name”.`,
      };
    }
    case 'MALFORMED':
      return {
        title: 'This file could not be read',
        message: 'A quoted value of this CSV is never closed. Export the file again and retry.',
      };
    case 'EMPTY_FILE':
      return { title: 'This file is empty', message: `Choose ${info.noun} that lists cards.` };
    case 'NO_CARDS':
      return {
        title: 'No card in this file',
        message:
          source === 'YDK'
            ? 'A deck file lists one passcode per line (the number printed in the lower left corner of a card) under “#main”, “#extra” and “!side”. This file has none.'
            : 'This export has column titles but no row with a card name.',
      };
    default:
      return friendlyError(error);
  }
}

// --- The preview -------------------------------------------------------------------------------

/** "3:45 PM" (the device's own clock format), "15:45" where it cannot be formatted. */
export function clockTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  try {
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  } catch {
    return date.toISOString().slice(11, 16);
  }
}

/** Whether a preview can no longer be used (`now` in milliseconds). */
export function isExpired(preview: Pick<InventoryImport, 'status' | 'expiresAt'>, now: number) {
  return preview.status === 'PENDING' && Date.parse(preview.expiresAt) <= now;
}

/** New cards a commit adds: the items it writes that are not added to a card already owned. */
export function newItems(summary: Pick<ImportSummary, 'items' | 'mergedItems'>): number {
  return Math.max(0, summary.items - summary.mergedItems);
}

export interface SummaryStat {
  key: 'new' | 'merged' | 'choose' | 'unmatched';
  value: number;
  label: string;
  tone: 'default' | 'attention';
}

/**
 * The four counts on top of a preview: new cards, cards added to ones already owned, lines that
 * still need a printing, lines that were not recognised.
 */
export function summaryStats(summary: ImportSummary): SummaryStat[] {
  const fresh = newItems(summary);
  return [
    { key: 'new', value: fresh, label: fresh === 1 ? 'new card' : 'new cards', tone: 'default' },
    {
      key: 'merged',
      value: summary.mergedItems,
      label: summary.mergedItems === 1 ? 'added to a card you own' : 'added to cards you own',
      tone: 'default',
    },
    {
      key: 'choose',
      value: summary.toChoose,
      label: summary.toChoose === 1 ? 'needs a printing' : 'need a printing',
      tone: summary.toChoose > 0 ? 'attention' : 'default',
    },
    {
      key: 'unmatched',
      value: summary.unmatched,
      label: 'not recognised',
      tone: summary.unmatched > 0 ? 'attention' : 'default',
    },
  ];
}

/**
 * The sentence under the counts, one word per thing: "Your file lists 4 different cards. 3 are
 * ready to add: 5 copies. 1 left out. 2 lines of the file were not cards and were skipped."
 */
export function summarySentence(
  preview: Pick<InventoryImport, 'summary' | 'ignoredLines' | 'source'>
): string {
  const { summary, ignoredLines, source } = preview;
  const parts = [
    source === 'YDK'
      ? `Your file lists ${pluralLines(summary.rows, source)}.`
      : `Your file has ${pluralLines(summary.rows, source)}.`,
    summary.ready === 0
      ? 'None is ready to add yet.'
      : `${formatCount(summary.ready)} ${summary.ready === 1 ? 'is' : 'are'} ready to add: ${plural(summary.copies, 'copy', 'copies')}.`,
  ];
  if (summary.leftOut > 0) {
    parts.push(`${formatCount(summary.leftOut)} left out.`);
  }
  if (ignoredLines > 0) {
    parts.push(
      ignoredLines === 1
        ? '1 line of the file was not a card and was skipped.'
        : `${formatCount(ignoredLines)} lines of the file were not cards and were skipped.`
    );
  }
  return parts.join(' ');
}

export interface SectionSwitch {
  key: 'includeMain' | 'includeExtra' | 'includeSide';
  label: string;
  /** "40 copies in your file". */
  help: string;
  value: boolean;
}

/** The three sections of a deck as switches, each with the copies the file holds in it. */
export function sectionSwitches(sections: ImportSections): SectionSwitch[] {
  const help = (copies: number) =>
    copies === 0 ? 'None in your file' : `${plural(copies, 'copy', 'copies')} in your file`;
  return [
    {
      key: 'includeMain',
      label: 'Main deck',
      help: help(sections.mainCopies),
      value: sections.includeMain,
    },
    {
      key: 'includeExtra',
      label: 'Extra deck',
      help: help(sections.extraCopies),
      value: sections.includeExtra,
    },
    {
      key: 'includeSide',
      label: 'Side deck',
      help: help(sections.sideCopies),
      value: sections.includeSide,
    },
  ];
}

/** Lines whose copy was taken as the plain one and not confirmed or changed since. */
export function assumedCopies(summary: Pick<ImportSummary, 'assumedPrintings'>): number {
  // An answer cached before the API counted them has no such number.
  return summary.assumedPrintings ?? 0;
}

/** A chip of the filter: what it shows, and what a screen reader says when that is shortened. */
export interface ImportFilterOption {
  value: ImportRowFilter;
  label: string;
  accessibilityLabel?: string;
}

/**
 * The filter chips with their counts: "All (4)", "Needs a printing (2)", "Not recognised (1)",
 * and the lines whose copy was assumed for the collector, while there are some (or while those
 * lines are what the list shows, so the chip pressed never vanishes under a finger).
 * What asks something of the collector comes first: the lines nothing fits can only be read.
 *
 * The chip of the assumed copies is the third of a row that stays on screen, and on a phone it
 * is cut at the screen's edge (which also says that the row scrolls). Its count therefore leads
 * and its words are few, "356 assumed": after "All (435)" and "Needs a printing (0)" some 80
 * points of it are in view, and a count at the end of any wording, "Assumed (356)" included,
 * would be the part that is cut. A screen reader hears the whole of it, "Plain copy assumed
 * (356)".
 */
export function filterOptions(
  summary: ImportSummary,
  current: ImportRowFilter = 'ALL'
): ImportFilterOption[] {
  const assumed = assumedCopies(summary);
  const options: (ImportFilterOption | null)[] = [
    { value: 'ALL', label: `All (${formatCount(summary.rows)})` },
    { value: 'CHOOSE_PRINTING', label: `Needs a printing (${formatCount(summary.toChoose)})` },
    assumed > 0 || current === 'MOST_RECENT_ASSUMED'
      ? {
          value: 'MOST_RECENT_ASSUMED',
          label: `${formatCount(assumed)} assumed`,
          accessibilityLabel: `Plain copy assumed (${formatCount(assumed)})`,
        }
      : null,
    { value: 'UNMATCHED', label: `Not recognised (${formatCount(summary.unmatched)})` },
  ];
  return options.filter((option) => option !== null);
}

/** What an empty filtered list says. */
export function emptyFilterText(filter: ImportRowFilter): { title: string; description: string } {
  switch (filter) {
    case 'CHOOSE_PRINTING':
      return {
        title: 'Nothing needs a printing',
        description: 'Everything in your file that was recognised has its printing.',
      };
    case 'UNMATCHED':
      return {
        title: 'Everything was recognised',
        description: 'Each card your file names is a card of the catalog.',
      };
    case 'MOST_RECENT_ASSUMED':
      return {
        title: 'No plain copy left to check',
        description: 'Every copy that was taken for you has been confirmed or changed.',
      };
    default:
      return { title: 'Nothing to show', description: 'This import has nothing to show.' };
  }
}

/** The title of the card over the bulk action: "2 cards need a printing" / "115 lines need …". */
export function needPrintingTitle(toChoose: number, source: ImportSource): string {
  return `${shortLines(toChoose, source)} ${toChoose === 1 ? 'needs' : 'need'} a printing`;
}

// --- One row -----------------------------------------------------------------------------------

/** The card's name, or what the file wrote when nothing fits. */
export function rowTitle(row: ImportRow): string {
  if (row.card?.name) {
    return row.card.name;
  }
  if (row.source.name) {
    return row.source.name;
  }
  return row.source.passcode ? `Passcode ${row.source.passcode}` : 'Unknown card';
}

/** What stands for the copies of a line whose file wrote no number of copies an item can hold. */
export const COPIES_NOT_A_NUMBER = 'copies: not a number from 1 to 9,999';

/**
 * What the file said about a row, as written: "Some Set · EN404 · Common · 3 copies".
 *
 * A line whose number of copies could not be read says so where its copies would stand, unless
 * that is the very reason it was not recognised (the sentence under it says it then). A line of
 * a game OrenjiTrade does not have is reported for its game, whatever its file wrote for the
 * copies: it showed nothing there, as if the file had said nothing.
 */
export function rowSourceText(row: ImportRow): string {
  const copies =
    row.fileQuantity > 0
      ? plural(row.fileQuantity, 'copy', 'copies')
      : row.unmatchedReason === 'INVALID_QUANTITY'
        ? null
        : COPIES_NOT_A_NUMBER;
  const parts = [row.source.set, row.source.number, row.source.rarity, copies].filter(
    (part): part is string => !!part
  );
  return parts.join(' · ');
}

/** Where a card is added one at a time: the button of the Inventory tab. */
const BY_HAND = 'find the card by its name with “Add card” in your inventory';

const UNMATCHED_REASONS: Record<ImportUnmatchedReason, { why: string; next: string }> = {
  UNKNOWN_PASSCODE: {
    why: 'No card of the catalog has this passcode (the number printed in the lower left corner of a card).',
    next: `If you know which card it is, ${BY_HAND}.`,
  },
  UNKNOWN_CARD: {
    why: 'No card of the catalog has this name.',
    next: `Check its spelling in your file, or ${BY_HAND}.`,
  },
  AMBIGUOUS_CARD: {
    why: 'Several cards have this name and the file does not say which one.',
    next: `Add the set or the card number to this line of your file, or ${BY_HAND}.`,
  },
  UNKNOWN_GAME: {
    why: 'OrenjiTrade does not have this game.',
    next: 'Cards of this game cannot be added yet.',
  },
  NO_PRINTING: {
    why: 'The catalog has this card but no printing of it yet.',
    next: 'It cannot be added until the catalog has one.',
  },
  INVALID_QUANTITY: {
    why: 'The number of copies in the file is not a whole number from 1 to 9,999.',
    next: `Correct it in your file, or ${BY_HAND}.`,
  },
  CARD_REMOVED: {
    why: 'This card left the catalog after the file was read.',
    next: 'It can no longer be added.',
  },
};

const NOTHING_FITS = { why: 'Nothing in the catalog fits.', next: `You can ${BY_HAND}.` };

/** Why a row was not recognised. */
export function unmatchedReasonText(reason: ImportRow['unmatchedReason']): string {
  return ((reason && UNMATCHED_REASONS[reason]) || NOTHING_FITS).why;
}

/** What the collector can do about a row that was not recognised. */
export function unmatchedNextStep(reason: ImportRow['unmatchedReason']): string {
  return ((reason && UNMATCHED_REASONS[reason]) || NOTHING_FITS).next;
}

/**
 * What the file said about a recognised row, so the match can be checked against the file: the
 * passcode of a deck line (two lines of one card are the card and its alternate artwork), or
 * the set, number and rarity of a CSV line as written (and its name when it is spelled otherwise).
 * `null` when the file said nothing more than the card shown.
 */
export function matchedSourceText(row: Pick<ImportRow, 'source' | 'card'>): string | null {
  if (row.source.passcode) {
    return `Passcode ${row.source.passcode}`;
  }
  const name =
    row.source.name && row.source.name.trim().toLowerCase() !== row.card?.name?.toLowerCase()
      ? row.source.name
      : null;
  const parts = [name, row.source.set, row.source.number, row.source.rarity].filter(
    (part): part is string => !!part
  );
  return parts.length ? `In your file: ${parts.join(' · ')}` : null;
}

/** The copy chosen ("AZR-EN001 · Ultra Rare · Azure Dawn · 1st Edition") or "Choose printing". */
export function rowCopyLabel(row: Pick<ImportRow, 'printing'>): string {
  return row.printing ? whichCopyLabel(row.printing) : CHOOSE_PRINTING;
}

export const CHOOSE_PRINTING = 'Choose printing';

/** "Damaged" and, when the file names no condition, that it is not from the file. */
export function rowConditionText(row: Pick<ImportRow, 'condition' | 'conditionSource'>): string {
  const label = conditionLabel(row.condition);
  return row.conditionSource === 'DEFAULT' ? `${label} (not in your file)` : label;
}

/** "Main 2 · Side 1" for a deck row; `null` for a CSV row. */
export function deckText(deck: ImportRow['deck']): string | null {
  if (!deck) {
    return null;
  }
  const parts = [
    deck.main > 0 ? `Main ${deck.main}` : null,
    deck.extra > 0 ? `Extra ${deck.extra}` : null,
    deck.side > 0 ? `Side ${deck.side}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

/**
 * What a row does to a card already owned. "You have 2: this adds 3." when it goes into a card
 * the collector keeps private. An import never changes a card the collector shows: "You show 1
 * publicly: that card stays as it is, and these 2 copies are added as a private card."
 */
export function ownedText(
  row: Pick<ImportRow, 'ownedQuantity' | 'shownQuantity' | 'quantity'>
): string | null {
  const shown = row.shownQuantity ?? 0;
  if (row.ownedQuantity > 0) {
    const adds = `You have ${formatCount(row.ownedQuantity)}: this adds ${formatCount(row.quantity)}.`;
    return shown > 0
      ? `${adds} The ${formatCount(shown)} you show publicly ${shown === 1 ? 'stays' : 'stay'} as ${shown === 1 ? 'it is' : 'they are'}.`
      : adds;
  }
  if (shown > 0) {
    return `You show ${formatCount(shown)} publicly: that card stays as it is, and ${
      row.quantity === 1 ? 'this copy is' : `these ${formatCount(row.quantity)} copies are`
    } added as a private card.`;
  }
  return null;
}

/** Why a matched row does not go in, when it does not: left out, or its deck sections are off. */
export function rowStateText(
  row: Pick<ImportRow, 'status' | 'included' | 'inScope'>
): string | null {
  if (row.status === 'UNMATCHED') {
    return null;
  }
  if (!row.included) {
    return 'Left out';
  }
  if (!row.inScope) {
    return 'Its deck section is switched off';
  }
  return null;
}

/** One sentence a screen reader says for a row. */
export function rowSummary(row: ImportRow): string {
  if (row.status === 'UNMATCHED') {
    return [
      `Not recognised: ${rowTitle(row)}`,
      rowSourceText(row),
      deckText(row.deck),
      unmatchedReasonText(row.unmatchedReason),
      unmatchedNextStep(row.unmatchedReason),
    ]
      .filter(Boolean)
      .join(', ');
  }
  return [
    rowTitle(row),
    rowCopyLabel(row),
    rowConditionText(row),
    plural(row.quantity, 'copy', 'copies'),
    ownedText(row),
    rowStateText(row),
  ]
    .filter(Boolean)
    .join(', ');
}

/**
 * The printings a row's chooser lists: the ones that fit what the file says first (a CSV row can
 * narrow them), then every other printing of the card, each in the catalog's order.
 */
export function orderedPrintings(
  printings: readonly PrintingSummary[],
  suggestedIds: readonly string[]
): { suggested: PrintingSummary[]; others: PrintingSummary[] } {
  const wanted = new Set(suggestedIds);
  return {
    suggested: printings.filter((printing) => !!printing.id && wanted.has(printing.id)),
    others: printings.filter((printing) => !printing.id || !wanted.has(printing.id)),
  };
}

// --- The commit --------------------------------------------------------------------------------

export interface CommitState {
  /** What a press does, in full: the button's name for a screen reader. */
  label: string;
  /**
   * What the button shows: `label` held to one line of a phone. The cards, their copies and "to
   * my inventory" together are wider than the button ("Add 434 cards (1,266 copies) to my
   * inventory" broke onto a second line), so where the copies are named the words the screen
   * already says give way to the numbers, and a press that leaves lines out names the cards
   * and how many lines stay out.
   */
  shortLabel: string;
  disabled: boolean;
  /** Why it is disabled, or what else a press does; `null` when there is nothing to add. */
  reason: string | null;
}

/**
 * "2 cards" and, when the copies are another number, "2 cards (5 copies)": a deck of 40 cards
 * that adds 12 different cards says so, instead of reading as 28 cards dropped.
 */
export function cardsAndCopies(summary: Pick<ImportSummary, 'items' | 'copies'>): string {
  const cards = plural(summary.items, 'card');
  return summary.copies === summary.items
    ? cards
    : `${cards} (${plural(summary.copies, 'copy', 'copies')})`;
}

/**
 * The commit button. While lines still need a printing it is disabled and says so, unless the
 * collector asked to leave those lines out: nothing is ever left out without having been said.
 */
export function commitState(
  summary: ImportSummary,
  leaveOutUnchosen: boolean,
  source: ImportSource = 'YDK'
): CommitState {
  const cards = cardsAndCopies(summary);
  const adding = summary.copies === summary.items ? `Add ${cards} to my inventory` : `Add ${cards}`;
  if (summary.toChoose > 0 && !leaveOutUnchosen) {
    const waiting = shortLines(summary.toChoose, source);
    return {
      label: summary.items > 0 ? `Add ${cards} to my inventory` : 'Add to my inventory',
      shortLabel: summary.items > 0 ? adding : 'Add to my inventory',
      disabled: true,
      reason:
        summary.toChoose === 1
          ? `${waiting} still needs a printing. Choose it, or leave it out.`
          : `${waiting} still need a printing. Choose them, or leave them out.`,
    };
  }
  if (summary.items === 0) {
    return {
      label: 'Add to my inventory',
      shortLabel: 'Add to my inventory',
      disabled: true,
      reason:
        summary.toChoose > 0
          ? 'No card is ready: everything that was recognised still needs a printing.'
          : 'No card of this file is ready to be added.',
    };
  }
  const reason = privacySentence(summary);
  if (summary.toChoose > 0) {
    const out = `leave ${formatCount(summary.toChoose)} out`;
    return {
      label: `Add ${cards}, ${out}`,
      shortLabel: `Add ${plural(summary.items, 'card')}, ${out}`,
      disabled: false,
      reason,
    };
  }
  return { label: `Add ${cards} to my inventory`, shortLabel: adding, disabled: false, reason };
}

/** What the button says while edits of the preview are still on their way to the API. */
export const SAVING_CHANGES = 'Saving your changes…';

/** What happens to the cards of a commit: new ones start private, the others go into owned cards. */
function privacySentence(summary: Pick<ImportSummary, 'items' | 'mergedItems'>): string {
  const merged = summary.mergedItems;
  if (merged === 0) {
    return summary.items === 1
      ? 'It starts private: nobody sees it until you publish it.'
      : 'They start private: nobody sees them until you publish them.';
  }
  if (merged >= summary.items) {
    return summary.items === 1
      ? 'Its copies are added to a card you already have.'
      : 'Their copies are added to cards you already have.';
  }
  return `New cards start private. ${
    merged === 1
      ? '1 of them is added to a card you already have.'
      : `${formatCount(merged)} of them are added to cards you already have.`
  }`;
}

/** The label of the "leave them out" choice shown while lines need a printing. */
export function leaveOutLabel(toChoose: number, source: ImportSource = 'YDK'): string {
  const waiting = shortLines(toChoose, source);
  return toChoose === 1
    ? `Leave out the ${waiting} that still needs a printing`
    : `Leave out the ${waiting} that still need a printing`;
}

/**
 * What "use the most recent printing" did, for the snackbar. Where the most recent set holds a
 * card in several editions or finishes (a 1st Edition and an Unlimited copy), the release date
 * decides nothing between them: the plain copy was taken, and that is said, so the collector
 * checks those lines. Where even that does not decide (two rarities, two languages), the lines
 * are left to choose, and that is said too.
 */
export function mostRecentMessage(
  updated: number,
  assumed: number = 0,
  undecided: number = 0,
  source: ImportSource = 'YDK'
): string {
  const parts: string[] = [];
  if (updated > 0) {
    parts.push(
      `${shortLines(updated, source)} got ${updated === 1 ? 'its' : 'their'} most recent printing.`
    );
  }
  if (assumed > 0) {
    parts.push(
      assumed === updated
        ? `${assumed === 1 ? 'Its' : 'Their'} most recent set has several versions: the plain copy (Unlimited, no foil) was taken. Check ${assumed === 1 ? 'it' : 'them'}.`
        : `For ${formatCount(assumed)} of them that set has several versions: the plain copy (Unlimited, no foil) was taken. Check ${assumed === 1 ? 'it' : 'them'}.`
    );
  }
  if (undecided > 0) {
    parts.push(
      `${shortLines(undecided, source)} ${undecided === 1 ? 'has' : 'have'} several printings in ${
        undecided === 1 ? 'its' : 'their'
      } most recent set: choose ${undecided === 1 ? 'it' : 'them'}.`
    );
  }
  return parts.length ? parts.join(' ') : 'Nothing was waiting for a printing.';
}

/**
 * What stands under the copy of a line the bulk action decided by taking the plain copy: the
 * collector is told the copy was assumed, as "(not in your file)" says it of a condition.
 */
export function assumedCopyText(row: Pick<ImportRow, 'printingChoice'>): string | null {
  return row.printingChoice === 'MOST_RECENT_ASSUMED'
    ? 'Taken as the plain copy (Unlimited, no foil): its most recent set has other versions. Change it if yours is another.'
    : null;
}

/**
 * The card "Plain copy assumed for …": it stays above the lines for as long as copies that were
 * taken for the collector are unchecked, counts them, and its button lists them. What the snackbar
 * of the bulk action said once ("Check them.") can still be done after it is gone, and in a long
 * file without scrolling through every line.
 */
export function assumedCopiesText(
  assumed: number,
  source: ImportSource
): { title: string; description: string; action: string } {
  const one = assumed === 1;
  const lines = shortLines(assumed, source);
  const noun = source === 'YDK' ? 'card' : 'line';
  return {
    title: `Plain copy assumed for ${lines}`,
    description: `${one ? 'Its' : 'Their'} most recent set has the card in several versions, so the plain copy (Unlimited, no foil) was taken. Check ${
      one ? 'it' : 'each one'
    }: open its copy and pick yours, or pick the plain copy again to confirm it.`,
    action: one ? `Show this ${noun}` : `Show these ${lines}`,
  };
}

export function conditionSetMessage(updated: number, condition: string): string {
  return updated === 0
    ? `Those cards are already ${conditionLabel(condition)}.`
    : `${plural(updated, 'card')} set to ${conditionLabel(condition)}.`;
}

/**
 * The card "Check the conditions": what the lines whose file names no condition are set to. They
 * start at the lowest grade of the game; once the collector set another for all of them, the card
 * says that one instead of repeating where they started.
 */
export function defaultConditionsText(
  summary: Pick<ImportSummary, 'defaultConditions' | 'defaultCondition'>,
  lowestGrades: readonly string[]
): { description: string; action: string } {
  const count = summary.defaultConditions;
  const cards = plural(count, 'card');
  const shared = summary.defaultCondition ?? null;
  const says = `Your file does not say the condition of ${cards}.`;
  if (shared && !lowestGrades.includes(shared)) {
    return {
      description: `${says} You set ${count === 1 ? 'it' : 'them'} to ${conditionLabel(shared)}. Check the condition on each line, or change it for all of them.`,
      action:
        count === 1
          ? 'Change the condition of this card'
          : `Change the condition of these ${cards}`,
    };
  }
  return {
    description: `${says} A card without one starts at the lowest grade${
      shared ? ` (${conditionLabel(shared)})` : ''
    }, so nothing promises more than the card is. Check the condition on each line, or set one for all of them.`,
    action:
      count === 1
        ? 'Set the condition of this card'
        : `Set one condition for these ${formatCount(count)} cards`,
  };
}

/**
 * What the plan still has room for, said before the commit: `null` while the import fits (or the
 * plan has no limit). "Your plan has room for 1 more card and this import adds 2 new cards: leave
 * 1 out." Lines that still need a printing may become new cards too, so they count as "up to":
 * the collector learns it before choosing printings for a long file, not at the commit.
 */
export function planRoomText(
  summary: Pick<ImportSummary, 'items' | 'mergedItems' | 'toChoose'>,
  remaining: number | null | undefined
): string | null {
  const adding = newItems(summary);
  const atMost = adding + summary.toChoose;
  if (remaining === null || remaining === undefined || atMost <= remaining) {
    return null;
  }
  const room =
    remaining === 0
      ? 'Your plan has no room for a new card'
      : `Your plan has room for ${plural(remaining, 'more card')}`;
  const fits = 'Copies added to cards you already have always fit.';
  if (summary.toChoose > 0) {
    return `${room} and this import can add up to ${plural(atMost, 'new card')}: leave out what does not fit before you add it. ${fits}`;
  }
  return `${room} and this import adds ${plural(adding, 'new card')}: leave ${formatCount(adding - remaining)} out. ${fits}`;
}

/**
 * What a refused commit says about the plan limit, with the numbers to act on: how many new cards
 * the import adds (`requested`), how many still fit, how many to leave out.
 */
export function limitRefusalText(problem: {
  limit: number | null;
  used: number | null;
  requested: number | null;
}): string | null {
  const { limit, used, requested } = problem;
  if (limit === null || used === null || requested === null) {
    return null;
  }
  const room = Math.max(0, limit - used);
  const over = Math.max(1, requested - room);
  return `This import adds ${plural(requested, 'new card')} and your plan has room for ${formatCount(room)} (${formatCount(used)} of ${formatCount(limit)} used). Leave ${formatCount(over)} out and try again.`;
}

// --- The result --------------------------------------------------------------------------------

export interface ResultLine {
  key: 'added' | 'merged' | 'leftOut';
  value: number;
  label: string;
  detail?: string;
}

/** Lines of the file a commit did not import. */
export function linesLeftOut(preview: Pick<InventoryImport, 'summary' | 'result'>): number {
  return Math.max(0, preview.summary.rows - (preview.result?.rowsImported ?? 0));
}

/**
 * The result of a commit: cards added, cards already owned that got copies, lines left out (and
 * why: not recognised, without a printing, left out by the collector or by a deck section).
 */
export function resultLines(
  preview: Pick<InventoryImport, 'summary' | 'result' | 'source'>
): ResultLine[] {
  const result: ImportResult = preview.result ?? {
    itemsCreated: 0,
    itemsMerged: 0,
    copiesAdded: 0,
    rowsImported: 0,
    copiesNotAdded: 0,
    chunksDone: 0,
    totalChunks: 0,
  };
  const { summary } = preview;
  const out = linesLeftOut(preview);
  const noun = lineNoun(preview.source);
  const why = [
    summary.unmatched > 0 ? `${formatCount(summary.unmatched)} not recognised` : null,
    summary.toChoose > 0 ? `${formatCount(summary.toChoose)} without a printing` : null,
    summary.leftOut > 0 ? `${formatCount(summary.leftOut)} left out by you` : null,
  ].filter(Boolean);
  return [
    {
      key: 'added',
      value: result.itemsCreated,
      label: result.itemsCreated === 1 ? 'new card added' : 'new cards added',
    },
    {
      key: 'merged',
      value: result.itemsMerged,
      label:
        result.itemsMerged === 1
          ? 'card you already had got more copies'
          : 'cards you already had got more copies',
    },
    {
      key: 'leftOut',
      value: out,
      label: `${out === 1 ? noun.one : noun.many} of your file left out`,
      detail: why.length ? why.join(', ') : undefined,
    },
  ];
}

/**
 * "12 copies in all. Everything this import added is private: publish it from your inventory when
 * you are ready." Copies above what one card holds are said, never dropped silently.
 */
export function resultSentence(result: ImportResult | null | undefined): string {
  const copies = plural(result?.copiesAdded ?? 0, 'copy', 'copies');
  const dropped = result?.copiesNotAdded ?? 0;
  const cap =
    dropped > 0
      ? ` ${plural(dropped, 'copy', 'copies')} ${dropped === 1 ? 'was' : 'were'} not added: a card holds at most 9,999 copies.`
      : '';
  return `${copies} in all.${cap} Everything this import added is private: publish it from your inventory when you are ready.`;
}

/** A change that reached the API after the import was already added: what to tell the collector. */
export function lateEditText(cards: readonly string[]): string {
  const names = Array.from(new Set(cards));
  if (names.length === 0) {
    return 'This import was already added before your last change was saved: that change is not in it. Check your inventory.';
  }
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `This import was already added before your last change to ${list} was saved: that change is not in it. Check ${names.length === 1 ? 'that card' : 'those cards'} in your inventory.`;
}

/** A commit that was cut between two parts: what is in, and that it can be finished. */
export function interruptedText(result: ImportResult | null | undefined): string {
  const done = result?.chunksDone ?? 0;
  const total = result?.totalChunks ?? 0;
  return total > 0
    ? `Part ${formatCount(done)} of ${formatCount(total)} is in your inventory. Finish the import to add the rest: nothing is added twice.`
    : 'Part of this import is in your inventory. Finish it to add the rest: nothing is added twice.';
}

/** What the open import of the start screen says: "Deck file · 4 different cards · kept until 3:45 PM". */
export function openImportText(preview: InventoryImport): string {
  const what = preview.source === 'YDK' ? 'Deck file' : 'CSV export';
  const lines = pluralLines(preview.summary.rows, preview.source);
  return preview.status === 'COMMITTING'
    ? `${what} · ${lines}`
    : `${what} · ${lines} · kept until ${clockTime(preview.expiresAt)}`;
}
