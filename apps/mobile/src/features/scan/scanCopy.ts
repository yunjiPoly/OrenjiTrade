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

/** "Tap to try again": a tile waiting for the connection is matched again when tapped. */
export const TAP_TO_TRY_AGAIN = 'Tap to try again';

/** "Trying again…": a waiting tile whose match is being tried again (it still waits). */
export const TRYING_AGAIN = 'Trying again…';

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

export function tileText(tile: ScanTile, trying = false): TileText {
  const badge = tile.copies > 1 ? `×${tile.copies}` : null;
  // A photo not matched yet shows its state in place of a name, like the mockup's "Reading…" tile.
  if (tile.status === 'READING') {
    return {
      title: TILE_STATUS_TEXT.READING,
      code: '',
      status: '',
      badge,
      accessibilityLabel: 'Reading a card',
    };
  }
  if (tile.status === 'WAITING') {
    return {
      title: TILE_STATUS_TEXT.WAITING,
      code: '',
      status: trying ? TRYING_AGAIN : TAP_TO_TRY_AGAIN,
      badge,
      accessibilityLabel: trying
        ? 'A card waiting for connection, trying again'
        : 'A card waiting for connection, tap to try again',
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

function printings(count: number): string {
  return `${count} ${count === 1 ? 'printing' : 'printings'}`;
}

/**
 * The printing list's count, in printings (a code in several rarities counts each one, like the
 * search's "{n} printings"): "{n} printings, newest first", or "{n} of {total} printings".
 */
export function printingListCount(shown: number, total: number, filtering: boolean): string {
  return filtering ? `${shown} of ${printings(total)}` : `${printings(total)}, newest first`;
}

/**
 * What tapping a tile does: a found card opens 28, a pick opens its list, a card that could not be
 * read opens 29, and a tile waiting for the connection is matched again. A photo being read does
 * nothing.
 */
export function tileAction(
  tile: ScanTile
): 'DETAILS' | 'RARITY_LIST' | 'PRINTING_LIST' | 'UNREAD' | 'RETRY' | null {
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
    case 'WAITING':
      return 'RETRY';
    default:
      return null;
  }
}

/** The printing list's text: "{name}. We couldn’t read its set code: type it from your card, or pick it below." */
export function printingListText(tile: ScanTile): string {
  return `${tile.card?.name ?? ''}. We couldn’t read its set code: type it from your card, or pick it below.`;
}

/**
 * What a screen reader hears when a photo lands in the tray ("Ash Blossom & Joyous Spring,
 * found"): the card and its result, the copies of a grouped repeat.
 */
export function tileAnnouncement(tile: ScanTile): string {
  if (tile.status === 'READING') {
    return 'Reading a card';
  }
  if (tile.status === 'WAITING') {
    return 'A card is waiting for connection';
  }
  if (tile.status === 'NOT_FOUND' || !tile.card) {
    return "Couldn't read this card";
  }
  const copies = tile.copies > 1 ? `, ${tile.copies} copies` : '';
  return `${tile.card.name}, ${STATUS_SPOKEN[tile.status]}${copies}`;
}

/** "{n} rarities" (a code of the printing list, a tile of "Other matches"). */
export function raritiesCount(count: number): string {
  return `${count} rarities`;
}

/** Screen 28: "This code comes in {n} rarities. Pick yours." */
export function manyRaritiesText(count: number): string {
  return `This code comes in ${count} rarities. Pick yours.`;
}

/** The wording of the camera screen (27) and its sheets (28, 29, the lists), from the mockup. */
export const SCAN_COPY = {
  // 27: the camera.
  title: 'Scan cards',
  close: 'Close the scanner',
  light: 'Light',
  hint: 'Fit the card in the frame, then tap the button.',
  frame: 'Card frame: fit the whole card inside',
  nameArea: 'Name',
  setCodeArea: 'Set code',
  trayPrivacy: 'Photos stay on your phone',
  trayList: 'Scanned cards',
  trayEmpty: 'The cards you snap show up here.',
  photos: 'Photos',
  photosLabel: 'Add photos you already took',
  shutter: 'Take the photo',
  review: 'Review',
  tip: 'Tip: tilt the card a little if the set code shines.',
  photosFailed: "Your photos couldn't be opened. Try again.",
  shotFailed: "The photo couldn't be taken. Try again.",
  // The camera itself: its permission, a phone without a camera, a camera that did not start.
  cameraStarting: 'Starting the camera…',
  permissionRefused: 'Allow the camera in Settings to scan cards.',
  openSettings: 'Open Settings',
  noCamera: 'There is no camera here. Choose photos you already took.',
  cameraFailed: "The camera didn't start.",
  tryAgain: 'Try again',
  chooseFromPhotos: 'Choose from photos',
  // The scan cannot run here.
  unavailableTitle: "Scanning isn't available here",
  readerMissing:
    'This version of the app cannot read cards. Add them by name or code from Add cards.',
  flagOff: 'Scanning is turned off for now. Add cards by name or code from Add cards.',
  flagsFailed: "We couldn't check whether scanning is on.",
  backToAddCards: 'Back to Add cards',
  // Leaving with cards in the tray.
  leaveTitle: 'Leave without adding?',
  leaveDialog: 'Leave the scanner',
  keepScanning: 'Keep scanning',
  leave: 'Leave',
  // The rarity list.
  rarityTitle: 'Pick the rarity',
  rarityGroup: 'Rarity',
  cancel: 'Cancel',
  // The printing list.
  printingTitle: 'Pick the printing',
  codeField: 'Set code on your card',
  codePlaceholder: 'Code on your card, like MACR',
  printingsList: 'Printings',
  noPrintingStart: 'No printing of this card has that code. Check it, or ',
  noPrintingLink: 'search by name or code',
  // The rarity and printing lists: the search is always one tap away.
  searchLink: 'Search by name or code',
  printingsLoadFailed: "We couldn't load this card's printings.",
  // 28: Check the match.
  checkTitle: 'Check the match',
  remove: 'Remove',
  closeSheet: 'Close',
  yourPhoto: 'Your photo',
  ourMatch: 'Our match',
  readFromPhoto: 'Read from your photo',
  copies: 'Copies',
  oneLess: 'One less',
  oneMore: 'One more',
  otherMatches: 'Other matches',
  matchesGroup: 'Matches',
  notHere: 'Not here?',
  notHereSearch: 'Search',
  notHereLabel: 'Not here? Search',
  done: 'Done',
  pickARarity: 'Pick a rarity',
  // 29: Couldn't read this card.
  unreadTitle: "Couldn't read this card",
  noMatchYet: 'No match yet',
  unreadText:
    "We couldn't read the name or the set code. Search for the card, or take the photo again.",
  tipFillFrame: 'Fill the frame',
  tipNoGlare: 'No glare',
  tipHoldStill: 'Hold still',
  searchByNameOrCode: 'Search by name or code',
  takeItAgain: 'Take it again',
} as const;

/** "Reading 3 of 12…": the photo being read and how many the scan holds (screen 30). */
export function readingProgressText(current: number, total: number): string {
  return `Reading ${current} of ${total}…`;
}

/** The wording of the review (mockup screen 30) and of the search inside the scan. */
export const REVIEW_COPY = {
  backToScanning: 'Back to scanning',
  checkMatchFor: (name: string) => `Check the match for ${name}`,
  pickRarity: 'Pick rarity',
  pickPrinting: 'Pick printing',
  codeUnreadable: 'Set code not readable',
  searchByNameOrCode: 'Search by name or code',
  couldntRead: "Couldn't read",
  remove: (name: string) => `Remove ${name}`,
  // A row with no card yet (couldn't read, waiting for the connection).
  removeThisCard: 'Remove this card',
  tryAgain: 'Try again',
  tryingAgain: TRYING_AGAIN,
  // The two pills.
  private: 'Private',
  public: 'Public',
  privateLabel: 'Private: only you see them. Change',
  publicLabel: 'Public: collectors in your region can find them. Change',
  noBinder: 'No binder',
  binderLabel: (name: string | null) => (name ? `Binder: ${name}` : 'Binder: no binder'),
  binderTitle: 'Binder',
  noBinderYet: 'You have no binders yet. The cards go in no binder.',
  bindersFailed: "We couldn't load your binders.",
  privateBinder: 'Private',
  // The add.
  adding: 'Adding…',
  waitForReading: 'Wait until every photo is read',
  footer: 'Add prices and photos later by tapping a card in Inventory.',
  copiesNotAdded: (count: number) =>
    count === 1
      ? "1 copy didn't fit: a card holds at most 9999 copies."
      : `${count} copies didn't fit: a card holds at most 9999 copies.`,
  // What went wrong with the add: the scan is kept.
  limitTitle: 'Your inventory is full',
  limitMessage: (limit: number | null, used: number | null, needed: number | null) => {
    const room = limit !== null && used !== null ? Math.max(0, limit - used) : null;
    const holds =
      limit !== null
        ? `Your inventory holds at most ${limit} cards${used !== null ? ` and has ${used}` : ''}.`
        : 'Your inventory is full.';
    const fit =
      room !== null && needed !== null && room < needed
        ? ` These cards need ${needed} new ${needed === 1 ? 'place' : 'places'} and ${room} ${room === 1 ? 'is' : 'are'} left.`
        : '';
    return `${holds}${fit} Nothing was added: remove some cards here, or delete cards you no longer have in Inventory, then add again.`;
  },
  // No answer to the add (offline, none in time, a server error): it may have gone through.
  unsure:
    "We couldn't hear back from OrenjiTrade, so we can't tell whether your cards were added. Your cards are still here: add again when you're online, and the ones already added won't be added twice.",
  binderGone:
    'That binder is gone. Nothing was added: pick another binder, or No binder, and add again.',
  scanOff:
    'Adding scanned cards is turned off for now. Nothing was added: add them by name or code from Add cards.',
  failed: (message: string) => `${message} Nothing was added: try again.`,
  // The search inside the scan.
  searchTitle: 'Search by name or code',
  searchHint: 'Tap a card to pick its printing, or an exact printing to use it for this photo.',
  tileGone: 'This card is no longer in the scan.',
  englishOnly: 'The scan adds English cards only. Pick an English printing, or tap the card.',
} as const;
