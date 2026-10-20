import type {
  AddInventoryItemsBatchLine,
  AddInventoryItemsBatchRequest,
  CardScanCard,
  CardScanMatch,
  CardScanNotFoundReason,
  CardScanOtherMatch,
  CardScanPrinting,
  ScanRead,
  ScanVisibility,
} from './types';

/**
 * The state of one scan (owner spec 2026-10-15, sections 3.2, 4 (27 to 30) and 10): the tiles of
 * the tray, newest first, and the photo files the scan made. Pure: every change returns a new
 * session and leaves the old one as it was. It lives in memory only: closing the app loses a scan
 * that was not added (the owner's default 1).
 */

/**
 * - READING: "Reading…" (the photo is read, then matched);
 * - FOUND: "✓ Found", one printing: ready to add;
 * - PICK_RARITY: "Pick rarity": the code comes in several rarities;
 * - PICK_PRINTING: "Pick printing": the card is known, not its printing ("Code unreadable");
 * - NOT_FOUND: "Couldn't read" ("Tap to search");
 * - WAITING: "Waiting for connection": read, not matched yet (offline, or the API could not answer);
 *   it resolves when the connection is back, and stays WAITING while it is tried again.
 */
export type TileStatus =
  'READING' | 'FOUND' | 'PICK_RARITY' | 'PICK_PRINTING' | 'NOT_FOUND' | 'WAITING';

/** At most 99 copies per tile (the owner's default 5). */
export const MAX_COPIES = 99;
export const MIN_COPIES = 1;

/** A photo of the scan. */
export interface ScanPhoto {
  uri: string;
  width: number;
  height: number;
  /**
   * Whether the scan made or copied the file (a camera photo, the picker's copy of a library
   * photo): such files are deleted when the scan ends. A file the scan does not own is never
   * deleted.
   */
  owned: boolean;
}

export interface ScanTile {
  id: string;
  status: TileStatus;
  /** The tile's photos, the first one shown; a repeat grouped into the tile adds its own. */
  photos: ScanPhoto[];
  copies: number;
  /** What the phone read (null while reading). */
  read: ScanRead | null;
  card: CardScanCard | null;
  /** FOUND only: the printing to add. */
  printing: CardScanPrinting | null;
  /** The printings of the code read, one per rarity (the rarity list and screen 28's chips). */
  rarities: CardScanPrinting[];
  /** Every English printing of the card, newest set first (the printing list). */
  printings: CardScanPrinting[];
  otherMatches: CardScanOtherMatch[];
  /** NOT_FOUND: why, when the API said (null after a failure of the reader or the API). */
  notFoundReason: CardScanNotFoundReason | null;
}

export interface ScanSession {
  /** Newest first. */
  tiles: ScanTile[];
  /** Photos of tiles that were removed: deleted with the others when the scan ends. */
  discarded: ScanPhoto[];
  /** Photos taken so far (it numbers the tiles). */
  taken: number;
}

export function emptyScanSession(): ScanSession {
  return { tiles: [], discarded: [], taken: 0 };
}

export function findTile(session: ScanSession, tileId: string): ScanTile | null {
  return session.tiles.find((tile) => tile.id === tileId) ?? null;
}

function clampCopies(copies: number): number {
  if (!Number.isFinite(copies)) {
    return MIN_COPIES;
  }
  return Math.min(MAX_COPIES, Math.max(MIN_COPIES, Math.round(copies)));
}

function updateTile(
  session: ScanSession,
  tileId: string,
  change: (tile: ScanTile) => ScanTile | null
): ScanSession {
  let changed = false;
  const tiles = session.tiles.map((tile) => {
    if (tile.id !== tileId) {
      return tile;
    }
    const next = change(tile);
    if (next && next !== tile) {
      changed = true;
      return next;
    }
    return tile;
  });
  return changed ? { ...session, tiles } : session;
}

/** A new photo: a "Reading…" tile at the front of the tray. The shutter never waits. */
export function addPhoto(
  session: ScanSession,
  photo: ScanPhoto
): { session: ScanSession; tileId: string } {
  const taken = session.taken + 1;
  const tile: ScanTile = {
    id: `scan-${taken}`,
    status: 'READING',
    photos: [photo],
    copies: 1,
    read: null,
    card: null,
    printing: null,
    rarities: [],
    printings: [],
    otherMatches: [],
    notFoundReason: null,
  };
  return { session: { ...session, tiles: [tile, ...session.tiles], taken }, tileId: tile.id };
}

/** What a tile becomes for a matcher answer (`POST /cards/scan-match`). */
export function tileFromMatch(tile: ScanTile, read: ScanRead, match: CardScanMatch): ScanTile {
  const base: ScanTile = {
    ...tile,
    read,
    card: match.card ?? null,
    printing: null,
    rarities: match.rarities ?? [],
    printings: match.printings ?? [],
    otherMatches: match.otherMatches ?? [],
    notFoundReason: null,
  };
  const unknownPrinting = (): ScanTile =>
    base.card ? { ...base, status: 'PICK_PRINTING' } : notFound(base, null);
  switch (match.status) {
    case 'FOUND':
      return match.printing && base.card
        ? { ...base, status: 'FOUND', printing: match.printing }
        : unknownPrinting();
    case 'PICK_RARITY':
      if (base.card && base.rarities.length === 1) {
        return { ...base, status: 'FOUND', printing: base.rarities[0] ?? null };
      }
      return base.card && base.rarities.length > 1
        ? { ...base, status: 'PICK_RARITY' }
        : unknownPrinting();
    case 'PICK_PRINTING':
      return unknownPrinting();
    case 'NOT_FOUND':
    default:
      return notFound(base, match.reason ?? null);
  }
}

function notFound(tile: ScanTile, reason: CardScanNotFoundReason | null): ScanTile {
  return {
    ...tile,
    status: 'NOT_FOUND',
    card: null,
    printing: null,
    rarities: [],
    printings: [],
    notFoundReason: reason,
  };
}

/** Whether a tile is ready to add: found, with its printing. */
export function isReady(tile: ScanTile): boolean {
  return tile.status === 'FOUND' && tile.printing !== null;
}

/** Whether the matcher's answer may still land on a tile (it was not removed nor fixed). */
function awaitsAnswer(tile: ScanTile | null): tile is ScanTile {
  return tile !== null && (tile.status === 'READING' || tile.status === 'WAITING');
}

/**
 * The matcher's answer for a tile. A card found again with the same printing (and so the same
 * rarity) adds a copy to its tile (×2) instead, while that tile holds fewer than 99: the grouped
 * tile takes the new tile's place in the tray (it is the newest scan) and keeps both photos.
 * Unfinished tiles are never grouped, and a tile a collector fixed by hand is never merged away.
 */
export function applyMatch(
  session: ScanSession,
  tileId: string,
  read: ScanRead,
  match: CardScanMatch
): ScanSession {
  const tile = findTile(session, tileId);
  if (!awaitsAnswer(tile)) {
    return session;
  }
  const resolved = tileFromMatch(tile, read, match);
  const printingId = resolved.status === 'FOUND' ? resolved.printing?.id : undefined;
  const twin = printingId
    ? session.tiles.find(
        (other) =>
          other.id !== tileId &&
          isReady(other) &&
          other.printing?.id === printingId &&
          other.copies + resolved.copies <= MAX_COPIES
      )
    : undefined;
  if (!twin) {
    return updateTile(session, tileId, () => resolved);
  }
  const grouped: ScanTile = {
    ...twin,
    copies: twin.copies + resolved.copies,
    photos: [...twin.photos, ...resolved.photos],
  };
  return {
    ...session,
    tiles: session.tiles
      .filter((other) => other.id !== twin.id)
      .map((other) => (other.id === tileId ? grouped : other)),
  };
}

/** The matcher could not be reached (offline): "Waiting for connection", the read kept. */
export function markWaiting(session: ScanSession, tileId: string, read: ScanRead): ScanSession {
  return updateTile(session, tileId, (tile) =>
    awaitsAnswer(tile) ? { ...tile, status: 'WAITING', read } : null
  );
}

/** The tiles waiting for the connection, oldest first, with what they read (to match again). */
export function tilesWaiting(session: ScanSession): { tileId: string; read: ScanRead }[] {
  return session.tiles
    .filter((tile) => tile.status === 'WAITING' && tile.read !== null)
    .reverse()
    .map((tile) => ({ tileId: tile.id, read: tile.read as ScanRead }));
}

/**
 * "Couldn't read": the reader found nothing (`NOTHING_READ`: nothing is sent to the API), or the
 * reader or the API failed (no reason).
 */
export function markUnread(
  session: ScanSession,
  tileId: string,
  read: ScanRead | null,
  reason: CardScanNotFoundReason | null
): ScanSession {
  return updateTile(session, tileId, (tile) =>
    awaitsAnswer(tile) ? notFound({ ...tile, read, otherMatches: [] }, reason) : null
  );
}

/** The rarity list's pick (or a chip of screen 28): the tile is found with that printing. */
export function pickRarity(session: ScanSession, tileId: string, printingId: string): ScanSession {
  return updateTile(session, tileId, (tile) => {
    const printing = tile.rarities.find((candidate) => candidate.id === printingId);
    if (!printing || !tile.card || (tile.status !== 'PICK_RARITY' && tile.status !== 'FOUND')) {
      return null;
    }
    return { ...tile, status: 'FOUND', printing };
  });
}

/** One row of the printing list: a code and its printings (one per rarity). */
export interface PrintingRow {
  /** The printing code, or the set code when the catalog has no code for it. */
  code: string;
  setName: string;
  printings: CardScanPrinting[];
}

/** The printing list: the card's printings grouped by code, newest set first (the API's order). */
export function printingRows(printings: readonly CardScanPrinting[]): PrintingRow[] {
  const rows: PrintingRow[] = [];
  const byCode = new Map<string, PrintingRow>();
  for (const printing of printings) {
    const code = printing.printingCode ?? printing.setCode;
    const row = byCode.get(code);
    if (row) {
      row.printings.push(printing);
    } else {
      const created = { code, setName: printing.setName, printings: [printing] };
      byCode.set(code, created);
      rows.push(created);
    }
  }
  return rows;
}

function codeKey(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** The rows whose code holds what was typed ("Code on your card, like MACR"), case and dashes aside. */
export function filterPrintingRows(rows: readonly PrintingRow[], typed: string): PrintingRow[] {
  const key = codeKey(typed);
  return key.length === 0 ? rows.slice() : rows.filter((row) => codeKey(row.code).includes(key));
}

/**
 * The printing list's pick: a code with one rarity finds the tile; a code with several opens the
 * rarity list next (PICK_RARITY with those printings).
 */
export function pickPrinting(
  session: ScanSession,
  tileId: string,
  row: Pick<PrintingRow, 'printings'>
): ScanSession {
  return updateTile(session, tileId, (tile) => {
    if (!tile.card || row.printings.length === 0 || tile.status === 'READING') {
      return null;
    }
    if (row.printings.length === 1) {
      return { ...tile, status: 'FOUND', printing: row.printings[0] ?? null, rarities: [] };
    }
    return { ...tile, status: 'PICK_RARITY', printing: null, rarities: row.printings.slice() };
  });
}

/** A card picked for a tile by hand (screen 28's other matches, the search inside the scan). */
export interface CardChoice {
  card: CardScanCard;
  /** Its printing, when known: the tile is found. */
  printing?: CardScanPrinting | null;
  /** The printings of a code in several rarities: the rarity list. */
  rarities?: CardScanPrinting[];
  /** Every printing of the card (the printing list); kept when not given. */
  printings?: CardScanPrinting[];
}

/** Replaces a tile's match by a card picked by hand. */
export function replaceMatch(
  session: ScanSession,
  tileId: string,
  choice: CardChoice
): ScanSession {
  return updateTile(session, tileId, (tile) => {
    if (tile.status === 'READING') {
      return null;
    }
    const sameCard = tile.card?.id === choice.card.id;
    const printings = choice.printings ?? (sameCard ? tile.printings : []);
    const rarities = choice.rarities ?? [];
    const base: ScanTile = {
      ...tile,
      card: choice.card,
      printing: null,
      rarities,
      printings,
      notFoundReason: null,
    };
    if (choice.printing) {
      return { ...base, status: 'FOUND', printing: choice.printing };
    }
    if (rarities.length === 1) {
      return { ...base, status: 'FOUND', printing: rarities[0] ?? null };
    }
    return { ...base, status: rarities.length > 1 ? 'PICK_RARITY' : 'PICK_PRINTING' };
  });
}

/**
 * Screen 28's "Other matches": picking one replaces the match. A code in one rarity finds the tile;
 * otherwise the card is known, not its printing (the printing list, read for that card).
 */
export function chooseOtherMatch(
  session: ScanSession,
  tileId: string,
  other: CardScanOtherMatch
): ScanSession {
  const card: CardScanCard = {
    id: other.cardId,
    name: other.name,
    ...(other.imageUrl ? { imageUrl: other.imageUrl } : {}),
  };
  const printing: CardScanPrinting | null =
    other.printingId && other.printingCode
      ? {
          id: other.printingId,
          printingCode: other.printingCode,
          setCode: other.printingCode.split('-')[0] ?? other.printingCode,
          setName: other.setName ?? '',
          ...(other.rarity ? { rarity: other.rarity } : {}),
        }
      : null;
  return replaceMatch(session, tileId, { card, printing });
}

/** "− {n} +": 1 to 99 copies. */
export function setCopies(session: ScanSession, tileId: string, copies: number): ScanSession {
  return updateTile(session, tileId, (tile) => ({ ...tile, copies: clampCopies(copies) }));
}

/**
 * "Remove" (or "Take it again"): the tile leaves the tray. Its photos wait in `discarded` until
 * they are deleted (`scanRunner.removeTile`, once nothing shows them; else when the scan ends).
 */
export function removeTile(session: ScanSession, tileId: string): ScanSession {
  const tile = findTile(session, tileId);
  if (!tile) {
    return session;
  }
  return {
    ...session,
    tiles: session.tiles.filter((other) => other.id !== tileId),
    discarded: [...session.discarded, ...tile.photos],
  };
}

/** Removed tiles' photos whose files were deleted: the scan no longer holds them. */
export function forgetPhotos(session: ScanSession, uris: readonly string[]): ScanSession {
  const gone = new Set(uris);
  const discarded = session.discarded.filter((photo) => !gone.has(photo.uri));
  return discarded.length === session.discarded.length ? session : { ...session, discarded };
}

export interface ScanCounts {
  /** Cards (copies) in the scan, the ones being read aside: "This scan · {n}", "Review {n}". */
  cards: number;
  /** Copies ready to add. */
  ready: number;
  /** Copies left to check (pick, couldn't read, waiting for connection): they won't be added. */
  toCheck: number;
  /** Photos being read. */
  reading: number;
}

export function scanCounts(session: ScanSession): ScanCounts {
  let cards = 0;
  let ready = 0;
  let reading = 0;
  for (const tile of session.tiles) {
    if (tile.status === 'READING') {
      reading += 1;
      continue;
    }
    cards += tile.copies;
    if (isReady(tile)) {
      ready += tile.copies;
    }
  }
  return { cards, ready, toCheck: cards - ready, reading };
}

/** The review's two groups, newest first: "To check" above "Ready". */
export function reviewGroups(session: ScanSession): { toCheck: ScanTile[]; ready: ScanTile[] } {
  const listed = session.tiles.filter((tile) => tile.status !== 'READING');
  return {
    toCheck: listed.filter((tile) => !isReady(tile)),
    ready: listed.filter(isReady),
  };
}

export interface BatchOptions {
  /** "Private" by default, or "Public". */
  visibility?: ScanVisibility;
  /** "No binder" by default. */
  binderId?: string | null;
}

/**
 * The body of `POST /inventory/items/batch` for "Add {n} cards to inventory": the ready tiles
 * only, in the order they were scanned, one line per printing (repeats summed). Null when nothing
 * is ready ("Nothing ready to add").
 */
export function batchAddRequest(
  session: ScanSession,
  { visibility = 'PRIVATE', binderId = null }: BatchOptions = {}
): AddInventoryItemsBatchRequest | null {
  const lines = new Map<string, AddInventoryItemsBatchLine>();
  for (const tile of session.tiles.slice().reverse()) {
    if (!isReady(tile) || !tile.printing) {
      continue;
    }
    const line = lines.get(tile.printing.id);
    if (line) {
      line.quantity += tile.copies;
    } else {
      lines.set(tile.printing.id, { printingId: tile.printing.id, quantity: tile.copies });
    }
  }
  if (lines.size === 0) {
    return null;
  }
  return { visibility, ...(binderId ? { binderId } : {}), lines: [...lines.values()] };
}

/**
 * Every photo file the scan made or copied, to delete when the scan ends (cards added, or the scan
 * left): the tiles' photos, grouped repeats and removed tiles included. Files the scan does not own
 * are left alone.
 */
export function photoFilesToDelete(session: ScanSession): string[] {
  const uris = new Set<string>();
  for (const photo of [...session.tiles.flatMap((tile) => tile.photos), ...session.discarded]) {
    if (photo.owned) {
      uris.add(photo.uri);
    }
  }
  return [...uris];
}
