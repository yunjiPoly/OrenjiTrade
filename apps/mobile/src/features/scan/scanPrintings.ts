import type { PrintingSummary } from '@/src/api/types';

import { raritiesCount } from './scanCopy';
import { printingRows, type PrintingRow, type ScanTile } from './scanSession';
import type { CardScanOtherMatch, CardScanPrinting, ScanRead } from './types';

/**
 * The printings the scan's lists show, and the rail of screen 28's "Other matches" (owner spec
 * 2026-10-15, section 4). Pure.
 */

const ENGLISH = new Set(['EN', 'ENGLISH']);

/** Whether a printing's language is English (a printing without one is taken as English). */
export function isEnglishLanguage(language: string | null | undefined): boolean {
  return !language || ENGLISH.has(language.toUpperCase());
}

function isEnglish(printing: PrintingSummary): boolean {
  return isEnglishLanguage(printing.language);
}

/**
 * A card's English printings from the catalog (`GET /cards/{id}/printings`), newest set first, as
 * the scan's printing list shows them: for a card picked by hand (an "Other match" found by its
 * name, or a card of the search), whose printings the matcher did not send.
 */
export function printingsOfCard(catalog: readonly PrintingSummary[]): CardScanPrinting[] {
  const printings = catalog.filter(
    (printing): printing is PrintingSummary & { id: string } =>
      typeof printing.id === 'string' && isEnglish(printing)
  );
  return printings
    .map((printing, index) => ({ printing, index }))
    .sort((a, b) => {
      const left = a.printing.setReleaseDate ?? '';
      const right = b.printing.setReleaseDate ?? '';
      if (left !== right) {
        // Newest first; a set without a date goes last.
        return left === '' ? 1 : right === '' ? -1 : right.localeCompare(left);
      }
      return a.index - b.index;
    })
    .map(({ printing }) => ({
      id: printing.id,
      setCode: printing.setCode ?? '',
      setName: printing.setName ?? '',
      ...(printing.printingCode ? { printingCode: printing.printingCode } : {}),
      ...(printing.rarity ? { rarity: printing.rarity } : {}),
    }));
}

/** A row's second line: its rarity, or "{n} rarities". */
export function rowRarity(row: Pick<PrintingRow, 'printings'>): string {
  return row.printings.length > 1
    ? raritiesCount(row.printings.length)
    : (row.printings[0]?.rarity ?? '');
}

/** One tile of screen 28's "Other matches" rail. */
export interface MatchRailItem {
  key: string;
  name: string;
  imageUrl: string | null;
  code: string;
  /** The rarity, or "{n} rarities". */
  sub: string;
  /** The match shown now. */
  checked: boolean;
  /** What picking it does. */
  choice:
    | { kind: 'CURRENT' }
    | { kind: 'ROW'; row: PrintingRow }
    | { kind: 'OTHER'; other: CardScanOtherMatch };
}

/**
 * Screen 28's rail after "Not here? Search": the match shown now, then the matcher's other matches
 * (a code one look-alike away that belongs to another card, other cards with close names), then
 * the card's other printings, one per code. Picking one replaces the match.
 */
export function matchRail(tile: ScanTile): MatchRailItem[] {
  if (!tile.card) {
    return [];
  }
  const card = tile.card;
  const rows = printingRows(tile.printings);
  const currentPrintings =
    tile.rarities.length > 0 ? tile.rarities : tile.printing ? [tile.printing] : [];
  const currentCode = currentPrintings[0]?.printingCode ?? currentPrintings[0]?.setCode ?? null;
  const items: MatchRailItem[] = [];
  if (currentCode) {
    items.push({
      key: `current-${currentCode}`,
      name: card.name,
      imageUrl: card.imageUrl ?? null,
      code: currentCode,
      sub: rowRarity({ printings: currentPrintings }),
      checked: true,
      choice: { kind: 'CURRENT' },
    });
  }
  for (const other of tile.otherMatches) {
    items.push({
      key: `other-${other.cardId}-${other.printingId ?? other.kind}`,
      name: other.name,
      imageUrl: other.imageUrl ?? null,
      code: other.printingCode ?? '',
      sub: other.rarity ?? other.setName ?? '',
      checked: false,
      choice: { kind: 'OTHER', other },
    });
  }
  for (const row of rows) {
    if (row.code === currentCode) {
      continue;
    }
    items.push({
      key: `row-${row.code}`,
      name: card.name,
      imageUrl: card.imageUrl ?? null,
      code: row.code,
      sub: rowRarity(row),
      checked: false,
      choice: { kind: 'ROW', row },
    });
  }
  return items;
}

/** What the phone read, for "Read from your photo": the codes and names, best first. */
export function readText(read: ScanRead | null): string {
  if (!read) {
    return '';
  }
  return [read.codes[0], read.names[0]]
    .filter((part): part is string => !!part && part.length > 0)
    .join(' · ');
}
