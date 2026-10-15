import {
  addButtonLabel,
  leaveWarning,
  printingListCount,
  printingListText,
  rarityListText,
  readyTitle,
  reviewButtonLabel,
  reviewSummary,
  reviewTitle,
  savedToast,
  summaryNeedsAttention,
  tileAction,
  tileText,
  toCheckTitle,
  toCheckWarning,
  trayTitle,
} from '@/src/features/scan/scanCopy';
import {
  addPhoto,
  applyMatch,
  emptyScanSession,
  markWaiting,
  setCopies,
  type ScanCounts,
  type ScanTile,
} from '@/src/features/scan/scanSession';
import type { CardScanMatch, CardScanPrinting, ScanRead } from '@/src/features/scan/types';

const READ: ScanRead = { codes: ['ZA01-EN075'], names: ['Inkshade Interference'] };
const YEW = { id: 'card-yew', name: 'Yew Flowers & Velvet Breeze' };
const ZACR_036: CardScanPrinting = {
  id: 'p-zacr-036',
  printingCode: 'ZACR-EN036',
  setCode: 'ZACR',
  setName: 'Lantern Crisis',
  rarity: 'Secret Rare',
};
const ZA01_075: CardScanPrinting[] = ['Super Rare', 'Ultra Rare'].map((rarity, index) => ({
  id: `p-za01-075-${index}`,
  printingCode: 'ZA01-EN075',
  setCode: 'ZA01',
  setName: '25th Lanternfall Rarity Collection',
  rarity,
}));

function tileFor(answer: Partial<CardScanMatch> | 'READING' | 'WAITING', copies = 1): ScanTile {
  const added = addPhoto(emptyScanSession(), {
    uri: 'file:///cache/scan/1.jpg',
    width: 3000,
    height: 4000,
    owned: true,
  });
  let session = added.session;
  if (answer === 'WAITING') {
    session = markWaiting(session, added.tileId, READ);
  } else if (answer !== 'READING') {
    session = applyMatch(session, added.tileId, READ, {
      status: 'NOT_FOUND',
      rarities: [],
      printings: [],
      otherMatches: [],
      read: READ,
      ...answer,
    });
  }
  session = setCopies(session, added.tileId, copies);
  return session.tiles[0]!;
}

const counts = (cards: number, ready: number, reading = 0): ScanCounts => ({
  cards,
  ready,
  toCheck: cards - ready,
  reading,
});

describe('a tile in the tray', () => {
  it('says "✓ Found" with the name and the code, and a screen reader hears the result', () => {
    const text = tileText(tileFor({ status: 'FOUND', card: YEW, printing: ZACR_036 }));
    expect(text).toEqual({
      title: 'Yew Flowers & Velvet Breeze',
      code: 'ZACR-EN036',
      status: '✓ Found',
      badge: null,
      accessibilityLabel: 'Yew Flowers & Velvet Breeze, ZACR-EN036, found',
    });
  });

  it('shows repeats as copies (×2)', () => {
    const text = tileText(tileFor({ status: 'FOUND', card: YEW, printing: ZACR_036 }, 2));
    expect(text.badge).toBe('×2');
    expect(text.accessibilityLabel).toBe(
      'Yew Flowers & Velvet Breeze, ZACR-EN036, found, 2 copies'
    );
  });

  it('says "Pick rarity" with the code read', () => {
    const tile = tileFor({
      status: 'PICK_RARITY',
      card: { id: 'card-ii', name: 'Inkshade Interference' },
      rarities: ZA01_075,
    });
    expect(tileText(tile)).toMatchObject({
      code: 'ZA01-EN075',
      status: 'Pick rarity',
      accessibilityLabel: 'Inkshade Interference, ZA01-EN075, pick rarity',
    });
    expect(rarityListText(tile)).toBe(
      'Inkshade Interference · ZA01-EN075. This code comes in 2 rarities: pick the one on your card.'
    );
  });

  it('says "Pick printing" with "Code unreadable" in place of the code', () => {
    const tile = tileFor({ status: 'PICK_PRINTING', card: YEW, printings: [ZACR_036] });
    expect(tileText(tile)).toMatchObject({
      code: 'Code unreadable',
      status: 'Pick printing',
      accessibilityLabel: 'Yew Flowers & Velvet Breeze, set code unreadable, pick printing',
    });
    expect(printingListText(tile)).toBe(
      'Yew Flowers & Velvet Breeze. We couldn’t read its set code: type it from your card, or pick it below.'
    );
  });

  it('says "Couldn\'t read" with "Tap to search"', () => {
    expect(tileText(tileFor({ status: 'NOT_FOUND', reason: 'NO_MATCH' }))).toEqual({
      title: "Couldn't read",
      code: '',
      status: 'Tap to search',
      badge: null,
      accessibilityLabel: "Couldn't read this card, tap to search",
    });
  });

  it('says "Reading…" while the photo is read, and "Waiting for connection" offline', () => {
    expect(tileText(tileFor('READING'))).toEqual({
      title: 'Reading…',
      code: '',
      status: '',
      badge: null,
      accessibilityLabel: 'Reading a card',
    });
    expect(tileText(tileFor('WAITING'))).toEqual({
      title: 'Waiting for connection',
      code: '',
      status: '',
      badge: null,
      accessibilityLabel: 'A card waiting for connection',
    });
  });

  it('opens what fixes it', () => {
    expect(tileAction(tileFor({ status: 'FOUND', card: YEW, printing: ZACR_036 }))).toBe('DETAILS');
    expect(tileAction(tileFor({ status: 'PICK_RARITY', card: YEW, rarities: ZA01_075 }))).toBe(
      'RARITY_LIST'
    );
    expect(tileAction(tileFor({ status: 'PICK_PRINTING', card: YEW }))).toBe('PRINTING_LIST');
    expect(tileAction(tileFor({ status: 'NOT_FOUND' }))).toBe('UNREAD');
    expect(tileAction(tileFor('READING'))).toBeNull();
    expect(tileAction(tileFor('WAITING'))).toBeNull();
  });
});

describe('the tray and the review', () => {
  it('count the cards of the scan', () => {
    expect(trayTitle(counts(5, 3))).toBe('This scan · 5');
    expect(reviewButtonLabel(counts(5, 3))).toBe('Review 5');
    expect(reviewTitle(counts(6, 4))).toBe('Review 6 cards');
    expect(reviewTitle(counts(1, 1))).toBe('Review 1 card');
  });

  it('sum up as "{n} ready · {n} to check", amber while something is left to check', () => {
    expect(reviewSummary(counts(6, 4))).toBe('4 ready · 2 to check');
    expect(summaryNeedsAttention(counts(6, 4))).toBe(true);
    expect(reviewSummary(counts(3, 3))).toBe('3 ready');
    expect(summaryNeedsAttention(counts(3, 3))).toBe(false);
    expect(reviewSummary(counts(2, 0))).toBe('0 ready · 2 to check');
    expect(reviewSummary(counts(0, 0))).toBe('Nothing scanned yet');
    expect(toCheckTitle(counts(6, 4))).toBe('To check · 2');
    expect(readyTitle(counts(6, 4))).toBe('Ready · 4');
  });

  it('warn that the cards to check will not be added', () => {
    expect(toCheckWarning(counts(6, 5))).toBe("The card to check won't be added.");
    expect(toCheckWarning(counts(6, 3))).toBe("The 3 cards to check won't be added.");
    expect(toCheckWarning(counts(6, 6))).toBeNull();
  });

  it('add the ready cards, or say there is nothing to add', () => {
    expect(addButtonLabel(counts(6, 4))).toBe('Add 4 cards to inventory');
    expect(addButtonLabel(counts(1, 1))).toBe('Add 1 card to inventory');
    expect(addButtonLabel(counts(2, 0))).toBe('Nothing ready to add');
    expect(savedToast(4)).toBe('Saved · 4 cards');
    expect(savedToast(1)).toBe('Saved · 1 card');
  });

  it('ask before leaving with cards in the tray', () => {
    expect(leaveWarning(counts(3, 1))).toBe(
      "The 3 cards in this scan won't be added to your inventory."
    );
    expect(leaveWarning(counts(1, 1))).toBe(
      "The card in this scan won't be added to your inventory."
    );
  });

  it('count the printing list', () => {
    expect(printingListCount(21, 21, false)).toBe('21 printings, newest first');
    expect(printingListCount(2, 21, true)).toBe('2 of 21 printings');
  });
});
