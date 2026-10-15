import { isReady, type ScanCounts, type ScanTile, type TileStatus } from './scanSession';

/**
 * The approved wording of the scan's tray and review (mockup screens 27 and 30), from the scan's
 * counts. One place, so the screens and their tests say the same thing.
 */

function cards(count: number): string {
  return `${count} ${count === 1 ? 'card' : 'cards'}`;
}

/** The status line of a tile in the tray. */
export const TILE_STATUS_TEXT: Readonly<Record<TileStatus, string>> = {
  READING: 'Reading…',
  FOUND: '✓ Found',
  PICK_RARITY: 'Pick rarity',
  PICK_PRINTING: 'Pick printing',
  NOT_FOUND: 'Tap to search',
  WAITING: 'Waiting for connection',
};

/** What a screen reader hears for a status ("Ash Blossom & Joyous Spring, found"). */
const STATUS_SPOKEN: Readonly<Record<TileStatus, string>> = {
  READING: 'reading',
  FOUND: 'found',
  PICK_RARITY: 'pick rarity',
  PICK_PRINTING: 'pick printing',
  NOT_FOUND: 'tap to search',
  WAITING: 'waiting for connection',
};

/** How a tile shows in the tray: its title, its code line and its status. */
export interface TileText {
  title: string;
  /** The printing code; "Code unreadable" for a card whose printing is unknown. */
  code: string;
  status: string;
  /** "×2" from two copies on. */
  badge: string | null;
  accessibilityLabel: string;
}

function codeOf(tile: ScanTile): string {
  if (tile.status === 'PICK_PRINTING') {
    return 'Code unreadable';
  }
  const printing = tile.printing ?? tile.rarities[0] ?? null;
  return printing?.printingCode ?? '';
}

export function tileText(tile: ScanTile): TileText {
  const badge = tile.copies > 1 ? `×${tile.copies}` : null;
  // A photo not matched yet shows its state in place of a name, like the mockup's "Reading…" tile.
  if (tile.status === 'READING' || tile.status === 'WAITING') {
    return {
      title: TILE_STATUS_TEXT[tile.status],
      code: '',
      status: '',
      badge,
      accessibilityLabel:
        tile.status === 'READING' ? 'Reading a card' : 'A card waiting for connection',
    };
  }
  if (tile.status === 'NOT_FOUND' || !tile.card) {
    return {
      title: "Couldn't read",
      code: '',
      status: TILE_STATUS_TEXT.NOT_FOUND,
      badge,
      accessibilityLabel: "Couldn't read this card, tap to search",
    };
  }
  const code = codeOf(tile);
  const spoken = [
    tile.card.name,
    tile.status === 'PICK_PRINTING' ? 'set code unreadable' : code,
    STATUS_SPOKEN[tile.status],
    tile.copies > 1 ? `${tile.copies} copies` : '',
  ].filter((part) => part.length > 0);
  return {
    title: tile.card.name,
    code,
    status: TILE_STATUS_TEXT[tile.status],
    badge,
    accessibilityLabel: spoken.join(', '),
  };
}

/** The tray's title: "This scan · {n}". */
export function trayTitle(counts: ScanCounts): string {
  return `This scan · ${counts.cards}`;
}

/** The camera's button to the review: "Review {n}". */
export function reviewButtonLabel(counts: ScanCounts): string {
  return `Review ${counts.cards}`;
}

/** The review's title: "Review {n} cards". */
export function reviewTitle(counts: ScanCounts): string {
  return `Review ${cards(counts.cards)}`;
}

/** "{n} ready · {n} to check", "{n} ready", or "Nothing scanned yet". */
export function reviewSummary(counts: ScanCounts): string {
  if (counts.cards === 0) {
    return 'Nothing scanned yet';
  }
  return counts.toCheck > 0
    ? `${counts.ready} ready · ${counts.toCheck} to check`
    : `${counts.ready} ready`;
}

/** Whether the summary is amber: something is left to check. */
export function summaryNeedsAttention(counts: ScanCounts): boolean {
  return counts.toCheck > 0;
}

/** The section titles: "To check · {n}" above "Ready · {n}". */
export function toCheckTitle(counts: ScanCounts): string {
  return `To check · ${counts.toCheck}`;
}

export function readyTitle(counts: ScanCounts): string {
  return `Ready · ${counts.ready}`;
}

/** "The card to check won't be added." / "The {n} cards to check won't be added." / nothing. */
export function toCheckWarning(counts: ScanCounts): string | null {
  if (counts.toCheck === 0) {
    return null;
  }
  return counts.toCheck === 1
    ? "The card to check won't be added."
    : `The ${counts.toCheck} cards to check won't be added.`;
}

/** "Add {n} cards to inventory", or "Nothing ready to add" (the button is off). */
export function addButtonLabel(counts: ScanCounts): string {
  return counts.ready > 0 ? `Add ${cards(counts.ready)} to inventory` : 'Nothing ready to add';
}

/** The toast on Inventory after the add: "Saved · {n} cards". */
export function savedToast(copiesAdded: number): string {
  return `Saved · ${cards(copiesAdded)}`;
}

/** The leave question's text: "The {n} cards in this scan won't be added to your inventory." */
export function leaveWarning(counts: ScanCounts): string {
  return counts.cards === 1
    ? "The card in this scan won't be added to your inventory."
    : `The ${counts.cards} cards in this scan won't be added to your inventory.`;
}

/** The rarity list's text: "{name} · {code}. This code comes in {n} rarities: pick the one on your card." */
export function rarityListText(tile: ScanTile): string {
  const code = tile.rarities[0]?.printingCode ?? tile.printing?.printingCode ?? '';
  return `${tile.card?.name ?? ''} · ${code}. This code comes in ${tile.rarities.length} rarities: pick the one on your card.`;
}

/** The printing list's count: "{n} printings, newest first", or "{n} of {total} printings". */
export function printingListCount(shown: number, total: number, filtering: boolean): string {
  return filtering ? `${shown} of ${total} printings` : `${total} printings, newest first`;
}

/** Whether a tile opens screen 28 (found), a list (pick), or the search (couldn't read). */
export function tileAction(
  tile: ScanTile
): 'DETAILS' | 'RARITY_LIST' | 'PRINTING_LIST' | 'UNREAD' | null {
  if (isReady(tile)) {
    return 'DETAILS';
  }
  switch (tile.status) {
    case 'PICK_RARITY':
      return 'RARITY_LIST';
    case 'PICK_PRINTING':
      return 'PRINTING_LIST';
    case 'NOT_FOUND':
      return 'UNREAD';
    default:
      return null;
  }
}

/** The printing list's text: "{name}. We couldn’t read its set code: type it from your card, or pick it below." */
export function printingListText(tile: ScanTile): string {
  return `${tile.card?.name ?? ''}. We couldn’t read its set code: type it from your card, or pick it below.`;
}
