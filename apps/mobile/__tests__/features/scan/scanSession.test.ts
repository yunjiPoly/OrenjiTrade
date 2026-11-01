import {
  addAnswered,
  addPhoto,
  addRefused,
  addSent,
  applyMatch,
  batchAddRequest,
  hasCardsToSend,
  isGivenUp,
  isSent,
  chooseOtherMatch,
  emptyScanSession,
  filterPrintingRows,
  findTile,
  markUnread,
  markWaiting,
  MAX_COPIES,
  photoFilesToDelete,
  pickPrinting,
  pickRarity,
  printingRows,
  removeTile,
  reopenMatch,
  replaceMatch,
  reviewGroups,
  scanCounts,
  sentCopies,
  sentPhotoFiles,
  setCopies,
  tileFromMatch,
  tilesToSend,
  tilesWaiting,
  type PendingAdd,
  type ScanPhoto,
  type ScanSession,
} from '@/src/features/scan/scanSession';
import type {
  CardScanCard,
  CardScanMatch,
  CardScanPrinting,
  ScanRead,
} from '@/src/features/scan/types';

// --- Fixtures (fictional twins of the mockup's sample data, ids made up) ---------------------------

const YEW: CardScanCard = {
  id: 'card-yew',
  name: 'Yew Flowers & Velvet Breeze',
  imageUrl: '/api/v1/public/card-images/img-yew',
};
const LYRA: CardScanCard = { id: 'card-lyra', name: 'Fable Tide - Lyra' };
const INTERFERENCE: CardScanCard = { id: 'card-ii', name: 'Inkshade Interference' };

function printing(
  id: string,
  printingCode: string,
  setName: string,
  rarity?: string
): CardScanPrinting {
  return {
    id,
    printingCode,
    setCode: printingCode.split('-')[0] ?? printingCode,
    setName,
    ...(rarity ? { rarity } : {}),
  };
}

const ZACR_036 = printing('p-zacr-036', 'ZACR-EN036', 'Lantern Crisis', 'Secret Rare');
const ZAGO_011 = printing('p-zago-011', 'ZAGO-EN011', 'Lantern Gold', 'Premium Gold Rare');
const ZA01_008_SUPER = printing(
  'p-za01-008-s',
  'ZA01-EN008',
  '25th Lanternfall Rarity Collection',
  'Super Rare'
);
const ZA01_008_ULTRA = printing(
  'p-za01-008-u',
  'ZA01-EN008',
  '25th Lanternfall Rarity Collection',
  'Ultra Rare'
);
const YEW_PRINTINGS = [ZA01_008_SUPER, ZA01_008_ULTRA, ZAGO_011, ZACR_036];
const ZA01_075 = ['Super Rare', 'Ultra Rare', 'Secret Rare'].map((rarity, index) =>
  printing(`p-za01-075-${index}`, 'ZA01-EN075', '25th Lanternfall Rarity Collection', rarity)
);

const READ: ScanRead = { codes: ['ZACR-EN036'], names: ['Yew Flowers & Velvet Breeze'] };

function match(overrides: Partial<CardScanMatch>): CardScanMatch {
  return {
    status: 'NOT_FOUND',
    rarities: [],
    printings: [],
    otherMatches: [],
    read: READ,
    ...overrides,
  };
}

const FOUND_YEW = match({
  status: 'FOUND',
  card: YEW,
  printing: ZACR_036,
  printings: YEW_PRINTINGS,
});
const PICK_RARITY_II = match({
  status: 'PICK_RARITY',
  card: INTERFERENCE,
  rarities: ZA01_075,
  printings: ZA01_075,
});
const PICK_PRINTING_YEW = match({ status: 'PICK_PRINTING', card: YEW, printings: YEW_PRINTINGS });
const NOT_FOUND = match({
  status: 'NOT_FOUND',
  reason: 'NO_MATCH',
  otherMatches: [{ cardId: LYRA.id, name: LYRA.name, kind: 'NAME' }],
});

function photo(n: number, owned = true): ScanPhoto {
  return { uri: `file:///cache/scan/photo-${n}.jpg`, width: 3000, height: 4000, owned };
}

/** Takes a photo and lands the matcher's answer on its tile. */
function scan(session: ScanSession, answer: CardScanMatch, n = session.taken + 1): ScanSession {
  const added = addPhoto(session, photo(n));
  return applyMatch(added.session, added.tileId, READ, answer);
}

// --- Tests -----------------------------------------------------------------------------------------

describe('tiles', () => {
  it('shows a new photo as "Reading…" at the front of the tray', () => {
    const first = addPhoto(emptyScanSession(), photo(1));
    const second = addPhoto(first.session, photo(2));
    expect(second.session.tiles.map((tile) => [tile.id, tile.status])).toEqual([
      ['scan-2', 'READING'],
      ['scan-1', 'READING'],
    ]);
    expect(findTile(second.session, first.tileId)?.photos).toEqual([photo(1)]);
  });

  it('never changes the session it was given', () => {
    const empty = emptyScanSession();
    const { session } = addPhoto(empty, photo(1));
    expect(empty.tiles).toEqual([]);
    expect(session).not.toBe(empty);
  });
});

describe('the matcher answer as a status', () => {
  const reading = addPhoto(emptyScanSession(), photo(1));
  const tile = findTile(reading.session, reading.tileId)!;

  it('FOUND: "✓ Found" with its printing, ready', () => {
    const found = tileFromMatch(tile, READ, FOUND_YEW);
    expect(found).toMatchObject({ status: 'FOUND', card: YEW, printing: ZACR_036, read: READ });
    expect(found.printings).toEqual(YEW_PRINTINGS);
  });

  it('PICK_RARITY: "Pick rarity" with the rarities of the code', () => {
    expect(tileFromMatch(tile, READ, PICK_RARITY_II)).toMatchObject({
      status: 'PICK_RARITY',
      card: INTERFERENCE,
      printing: null,
      rarities: ZA01_075,
    });
  });

  it('PICK_PRINTING: "Pick printing" with every printing of the card', () => {
    expect(tileFromMatch(tile, READ, PICK_PRINTING_YEW)).toMatchObject({
      status: 'PICK_PRINTING',
      card: YEW,
      printings: YEW_PRINTINGS,
    });
  });

  it('NOT_FOUND: "Couldn\'t read", the other matches kept for the search', () => {
    expect(tileFromMatch(tile, READ, NOT_FOUND)).toMatchObject({
      status: 'NOT_FOUND',
      card: null,
      notFoundReason: 'NO_MATCH',
      otherMatches: NOT_FOUND.otherMatches,
      read: READ,
    });
    expect(
      tileFromMatch(tile, READ, match({ status: 'NOT_FOUND', reason: 'OTHER_LANGUAGE' }))
    ).toMatchObject({ status: 'NOT_FOUND', notFoundReason: 'OTHER_LANGUAGE' });
  });

  it('never trusts an answer that misses what its status needs', () => {
    expect(tileFromMatch(tile, READ, match({ status: 'FOUND', card: YEW })).status).toBe(
      'PICK_PRINTING'
    );
    expect(tileFromMatch(tile, READ, match({ status: 'FOUND', printing: ZACR_036 })).status).toBe(
      'NOT_FOUND'
    );
    expect(
      tileFromMatch(tile, READ, match({ status: 'PICK_RARITY', card: YEW, rarities: [ZACR_036] }))
    ).toMatchObject({ status: 'FOUND', printing: ZACR_036 });
    expect(tileFromMatch(tile, READ, match({ status: 'PICK_RARITY', card: YEW })).status).toBe(
      'PICK_PRINTING'
    );
    expect(tileFromMatch(tile, READ, match({ status: 'PICK_PRINTING' })).status).toBe('NOT_FOUND');
  });
});

describe('repeats', () => {
  it('groups a card found again with the same printing and rarity as copies (×2)', () => {
    let session = scan(emptyScanSession(), FOUND_YEW);
    session = scan(session, PICK_RARITY_II);
    session = scan(session, FOUND_YEW);
    expect(session.tiles.map((tile) => [tile.status, tile.copies])).toEqual([
      ['FOUND', 2],
      ['PICK_RARITY', 1],
    ]);
    // The grouped tile takes the new photo's place and keeps both photos.
    expect(session.tiles[0]?.id).toBe('scan-1');
    expect(session.tiles[0]?.photos.map((entry) => entry.uri)).toEqual([
      photo(1).uri,
      photo(3).uri,
    ]);
  });

  it('keeps another rarity of the same code apart', () => {
    let session = scan(emptyScanSession(), match({ ...FOUND_YEW, printing: ZA01_008_SUPER }));
    session = scan(session, match({ ...FOUND_YEW, printing: ZA01_008_ULTRA }));
    expect(session.tiles).toHaveLength(2);
  });

  it('never groups unfinished tiles', () => {
    let session = scan(emptyScanSession(), PICK_RARITY_II);
    session = scan(session, PICK_RARITY_II);
    session = scan(session, PICK_PRINTING_YEW);
    session = scan(session, PICK_PRINTING_YEW);
    session = scan(session, NOT_FOUND);
    session = scan(session, NOT_FOUND);
    expect(session.tiles).toHaveLength(6);
    // A tile still being read is never a twin either.
    const reading = addPhoto(session, photo(7)).session;
    const found = scan(reading, FOUND_YEW);
    expect(found.tiles.filter((tile) => tile.status === 'READING')).toHaveLength(1);
    expect(found.tiles.filter((tile) => tile.status === 'FOUND')).toHaveLength(1);
  });

  it('groups into a tile a collector fixed, never merging that tile away', () => {
    let session = scan(emptyScanSession(), PICK_PRINTING_YEW);
    const fixed = session.tiles[0]!.id;
    session = pickPrinting(session, fixed, { printings: [ZACR_036] });
    session = scan(session, FOUND_YEW);
    expect(session.tiles).toHaveLength(1);
    expect(session.tiles[0]).toMatchObject({ id: fixed, copies: 2 });
  });

  it('starts a new tile once a tile holds 99 copies', () => {
    let session = scan(emptyScanSession(), FOUND_YEW);
    session = setCopies(session, 'scan-1', MAX_COPIES);
    session = scan(session, FOUND_YEW);
    expect(session.tiles.map((tile) => tile.copies)).toEqual([1, 99]);
  });

  it('groups a repeat into a tile of 98 copies: one tile of 99', () => {
    let session = scan(emptyScanSession(), FOUND_YEW);
    session = setCopies(session, 'scan-1', MAX_COPIES - 1);
    session = scan(session, FOUND_YEW);
    expect(session.tiles.map((tile) => [tile.id, tile.copies])).toEqual([['scan-1', 99]]);
  });

  it('keeps a code to pick the rarity of apart from a found tile of one of its rarities', () => {
    let session = scan(emptyScanSession(), match({ ...FOUND_YEW, printing: ZA01_075[0] }));
    session = scan(session, PICK_RARITY_II);
    expect(session.tiles.map((tile) => [tile.status, tile.copies])).toEqual([
      ['PICK_RARITY', 1],
      ['FOUND', 1],
    ]);
  });
});

describe('fixing a tile', () => {
  it('a rarity pick makes the tile ready', () => {
    let session = scan(emptyScanSession(), PICK_RARITY_II);
    session = pickRarity(session, 'scan-1', ZA01_075[1]!.id);
    expect(findTile(session, 'scan-1')).toMatchObject({ status: 'FOUND', printing: ZA01_075[1] });
    // A rarity that is not one of the code's changes nothing.
    expect(pickRarity(session, 'scan-1', ZACR_036.id)).toBe(session);
  });

  it('the printing list groups printings by code and filters by what is typed', () => {
    const rows = printingRows(YEW_PRINTINGS);
    expect(rows.map((row) => [row.code, row.printings.length])).toEqual([
      ['ZA01-EN008', 2],
      ['ZAGO-EN011', 1],
      ['ZACR-EN036', 1],
    ]);
    expect(filterPrintingRows(rows, 'zacr').map((row) => row.code)).toEqual(['ZACR-EN036']);
    expect(filterPrintingRows(rows, 'za01 en').map((row) => row.code)).toEqual(['ZA01-EN008']);
    expect(filterPrintingRows(rows, '')).toHaveLength(3);
    expect(filterPrintingRows(rows, 'ZOB')).toEqual([]);
  });

  it('a printing pick finds the tile, or opens the rarity list for a code in several', () => {
    let session = scan(emptyScanSession(), PICK_PRINTING_YEW);
    const rows = printingRows(YEW_PRINTINGS);
    const several = pickPrinting(session, 'scan-1', rows[0]!);
    expect(findTile(several, 'scan-1')).toMatchObject({
      status: 'PICK_RARITY',
      rarities: [ZA01_008_SUPER, ZA01_008_ULTRA],
    });
    session = pickPrinting(session, 'scan-1', rows[2]!);
    expect(findTile(session, 'scan-1')).toMatchObject({ status: 'FOUND', printing: ZACR_036 });
  });

  it('an other match replaces the match: found when its code has one rarity', () => {
    let session = scan(emptyScanSession(), FOUND_YEW);
    session = chooseOtherMatch(session, 'scan-1', {
      cardId: LYRA.id,
      name: LYRA.name,
      kind: 'CODE',
      printingCode: 'ZACR-EN038',
      setName: 'Lantern Crisis',
      printingId: 'p-zacr-038',
      rarity: 'Super Rare',
    });
    expect(findTile(session, 'scan-1')).toMatchObject({
      status: 'FOUND',
      card: { id: LYRA.id, name: LYRA.name },
      printing: {
        id: 'p-zacr-038',
        printingCode: 'ZACR-EN038',
        setCode: 'ZACR',
        setName: 'Lantern Crisis',
        rarity: 'Super Rare',
      },
      printings: [],
    });
    session = chooseOtherMatch(session, 'scan-1', { cardId: YEW.id, name: YEW.name, kind: 'NAME' });
    expect(findTile(session, 'scan-1')).toMatchObject({
      status: 'PICK_PRINTING',
      card: { id: YEW.id },
    });
  });

  it('the search fixes a tile that could not be read', () => {
    let session = scan(emptyScanSession(), NOT_FOUND);
    session = replaceMatch(session, 'scan-1', { card: YEW, printings: YEW_PRINTINGS });
    expect(findTile(session, 'scan-1')).toMatchObject({ status: 'PICK_PRINTING', card: YEW });
    session = replaceMatch(session, 'scan-1', { card: YEW, rarities: ZA01_075.slice(0, 2) });
    expect(findTile(session, 'scan-1')).toMatchObject({
      status: 'PICK_RARITY',
      printings: YEW_PRINTINGS,
    });
    session = replaceMatch(session, 'scan-1', { card: YEW, printing: ZACR_036 });
    expect(findTile(session, 'scan-1')).toMatchObject({ status: 'FOUND', printing: ZACR_036 });
  });

  it('copies stay between 1 and 99', () => {
    let session = scan(emptyScanSession(), FOUND_YEW);
    expect(findTile(setCopies(session, 'scan-1', 0), 'scan-1')?.copies).toBe(1);
    expect(findTile(setCopies(session, 'scan-1', 120), 'scan-1')?.copies).toBe(99);
    session = setCopies(session, 'scan-1', 3);
    expect(findTile(session, 'scan-1')?.copies).toBe(3);
  });

  it('a removed tile leaves the tray', () => {
    let session = scan(emptyScanSession(), FOUND_YEW);
    session = scan(session, NOT_FOUND);
    session = removeTile(session, 'scan-2');
    expect(session.tiles.map((tile) => tile.id)).toEqual(['scan-1']);
    expect(removeTile(session, 'scan-9')).toBe(session);
  });
});

describe('offline and unread', () => {
  it('waits for the connection with the read kept, and resolves when it is back', () => {
    const { session: reading, tileId } = addPhoto(emptyScanSession(), photo(1));
    let session = markWaiting(reading, tileId, READ);
    expect(findTile(session, tileId)).toMatchObject({ status: 'WAITING', read: READ });
    expect(tilesWaiting(session)).toEqual([{ tileId, read: READ }]);
    // Tried again, it stays waiting until the answer lands.
    session = applyMatch(session, tileId, READ, FOUND_YEW);
    expect(findTile(session, tileId)?.status).toBe('FOUND');
    expect(tilesWaiting(session)).toEqual([]);
  });

  it('lists the waiting tiles oldest first', () => {
    let session = emptyScanSession();
    for (let n = 1; n <= 3; n++) {
      const added = addPhoto(session, photo(n));
      session = markWaiting(added.session, added.tileId, READ);
    }
    expect(tilesWaiting(session).map((entry) => entry.tileId)).toEqual([
      'scan-1',
      'scan-2',
      'scan-3',
    ]);
  });

  it('marks a photo that held nothing as "Couldn\'t read"', () => {
    const { session: reading, tileId } = addPhoto(emptyScanSession(), photo(1));
    const session = markUnread(reading, tileId, { codes: [], names: [] }, 'NOTHING_READ');
    expect(findTile(session, tileId)).toMatchObject({
      status: 'NOT_FOUND',
      notFoundReason: 'NOTHING_READ',
    });
  });

  it('drops an answer for a tile that was removed or already fixed', () => {
    const { session: reading, tileId } = addPhoto(emptyScanSession(), photo(1));
    const removed = removeTile(reading, tileId);
    expect(applyMatch(removed, tileId, READ, FOUND_YEW)).toBe(removed);
    const fixed = replaceMatch(markWaiting(reading, tileId, READ), tileId, {
      card: YEW,
      printing: ZAGO_011,
    });
    expect(findTile(applyMatch(fixed, tileId, READ, FOUND_YEW), tileId)?.printing).toEqual(
      ZAGO_011
    );
    expect(markUnread(fixed, tileId, null, null)).toBe(fixed);
  });
});

describe('counts', () => {
  it('counts copies: the cards, the ready ones and the ones to check, the photos being read aside', () => {
    let session = scan(emptyScanSession(), FOUND_YEW);
    session = scan(session, FOUND_YEW);
    session = scan(session, PICK_RARITY_II);
    session = scan(session, PICK_PRINTING_YEW);
    session = scan(session, NOT_FOUND);
    const waiting = addPhoto(session, photo(6));
    session = markWaiting(waiting.session, waiting.tileId, READ);
    session = addPhoto(session, photo(7)).session;
    expect(scanCounts(session)).toEqual({ cards: 6, ready: 2, toCheck: 4, reading: 1 });
    expect(scanCounts(emptyScanSession())).toEqual({ cards: 0, ready: 0, toCheck: 0, reading: 0 });
  });

  it('puts the cards to check above the ready ones in the review, the reading ones out', () => {
    let session = scan(emptyScanSession(), FOUND_YEW);
    session = scan(session, NOT_FOUND);
    session = scan(session, match({ ...FOUND_YEW, printing: ZAGO_011 }));
    session = scan(session, PICK_RARITY_II);
    session = addPhoto(session, photo(9)).session;
    const groups = reviewGroups(session);
    expect(groups.toCheck.map((tile) => tile.status)).toEqual(['PICK_RARITY', 'NOT_FOUND']);
    expect(groups.ready.map((tile) => tile.printing?.id)).toEqual([ZAGO_011.id, ZACR_036.id]);
  });
});

describe('adding', () => {
  it('adds only the ready cards, in the order they were scanned, repeats summed', () => {
    let session = scan(emptyScanSession(), FOUND_YEW);
    session = scan(session, PICK_RARITY_II);
    session = scan(session, match({ ...FOUND_YEW, printing: ZAGO_011 }));
    session = scan(session, NOT_FOUND);
    session = scan(session, PICK_PRINTING_YEW);
    session = setCopies(session, 'scan-3', 4);
    // A rarity picked by hand is ready too; its twin tile is summed into one line.
    session = pickPrinting(session, 'scan-5', { printings: [ZACR_036] });
    session = addPhoto(session, photo(6)).session;
    expect(batchAddRequest(session)).toEqual({
      visibility: 'PRIVATE',
      lines: [
        { printingId: ZACR_036.id, quantity: 2 },
        { printingId: ZAGO_011.id, quantity: 4 },
      ],
    });
  });

  it('takes the visibility and the binder of the review', () => {
    const session = scan(emptyScanSession(), FOUND_YEW);
    expect(batchAddRequest(session, { visibility: 'PUBLIC', binderId: 'binder-1' })).toEqual({
      visibility: 'PUBLIC',
      binderId: 'binder-1',
      lines: [{ printingId: ZACR_036.id, quantity: 1 }],
    });
    expect(batchAddRequest(session, { binderId: null })).not.toHaveProperty('binderId');
  });

  it('has nothing to add when nothing is ready', () => {
    let session = scan(emptyScanSession(), PICK_RARITY_II);
    session = scan(session, NOT_FOUND);
    expect(batchAddRequest(session)).toBeNull();
    expect(batchAddRequest(emptyScanSession())).toBeNull();
  });
});

describe('an add sent without an answer', () => {
  /** Yew ×2 and Gold found, Interference to pick, then the found ones sent under key-1. */
  function sentScan(): { session: ScanSession; add: PendingAdd } {
    let session = scan(emptyScanSession(), FOUND_YEW);
    session = scan(session, FOUND_YEW);
    session = scan(session, match({ ...FOUND_YEW, printing: ZAGO_011 }));
    session = scan(session, PICK_RARITY_II);
    const body = batchAddRequest(session, { visibility: 'PUBLIC' });
    const add: PendingAdd = {
      key: 'key-1',
      body: body!,
      tileIds: tilesToSend(session).map((tile) => tile.id),
      binderName: null,
    };
    return { session: addSent(session, add), add };
  }

  it('keeps what was sent: its tiles cannot change, take copies or leave', () => {
    const { session, add } = sentScan();
    expect(add.tileIds).toEqual(['scan-1', 'scan-3']);
    expect(isSent(session, 'scan-1')).toBe(true);
    expect(isSent(session, 'scan-4')).toBe(false);
    expect(sentCopies(session)).toBe(3);
    expect(setCopies(session, 'scan-1', 5)).toBe(session);
    expect(removeTile(session, 'scan-3')).toBe(session);
    expect(pickPrinting(session, 'scan-1', { printings: [ZAGO_011] })).toBe(session);
    expect(replaceMatch(session, 'scan-1', { card: LYRA })).toBe(session);
    // A repeat found again is a tile of its own: the one sent takes no copy.
    const again = scan(session, FOUND_YEW);
    expect(findTile(again, 'scan-1')?.copies).toBe(2);
    expect(again.tiles[0]).toMatchObject({ id: 'scan-5', status: 'FOUND', copies: 1 });
    // One add at a time.
    expect(addSent(again, { ...add, key: 'key-2', tileIds: ['scan-5'] })).toBe(again);
  });

  it('adds afterwards only the cards that became ready since', () => {
    let { session } = sentScan();
    expect(batchAddRequest(session)).toBeNull();
    expect(hasCardsToSend(session)).toBe(false);
    session = pickRarity(session, 'scan-4', ZA01_075[1]!.id);
    expect(hasCardsToSend(session)).toBe(true);
    expect(batchAddRequest(session, { visibility: 'PRIVATE' })).toEqual({
      visibility: 'PRIVATE',
      lines: [{ printingId: ZA01_075[1]!.id, quantity: 1 }],
    });
  });

  it('answered: exactly its tiles leave the scan, their photos to delete at once', () => {
    let { session } = sentScan();
    session = pickRarity(session, 'scan-4', ZA01_075[1]!.id);
    expect(sentPhotoFiles(session).sort()).toEqual(
      [photo(1).uri, photo(2).uri, photo(3).uri].sort()
    );
    expect(addAnswered(session, 'another-key')).toBe(session);
    const answered = addAnswered(session, 'key-1');
    expect(answered.tiles.map((tile) => tile.id)).toEqual(['scan-4']);
    expect(answered.pendingAdd).toBeNull();
    expect(answered.discarded).toEqual([]);
    expect(photoFilesToDelete(answered)).toEqual([photo(4).uri]);
  });

  it('a tap adds the cards it counted, as they were: one ready or changed since waits for the next', () => {
    let { session } = sentScan();
    session = pickRarity(session, 'scan-4', ZA01_075[1]!.id);
    // The tap: Interference is ready, besides the add sent before.
    const chosen = tilesToSend(session);
    expect(chosen.map((tile) => tile.id)).toEqual(['scan-4']);
    // While the add sent before is answered, another card becomes ready.
    session = addAnswered(session, 'key-1');
    session = scan(session, match({ ...FOUND_YEW, card: LYRA, printing: ZAGO_011 }));
    expect(tilesToSend(session).map((tile) => tile.id)).toEqual(['scan-4', 'scan-5']);
    expect(tilesToSend(session, chosen).map((tile) => tile.id)).toEqual(['scan-4']);
    expect(batchAddRequest(session, {}, chosen)).toEqual({
      visibility: 'PRIVATE',
      lines: [{ printingId: ZA01_075[1]!.id, quantity: 1 }],
    });
    // A card of the tap changed meanwhile (one more copy): it waits too.
    const changed = setCopies(session, 'scan-4', 2);
    expect(tilesToSend(changed, chosen)).toEqual([]);
    expect(batchAddRequest(changed, {}, chosen)).toBeNull();
  });

  it('deletes only the photo files the scan owns once answered', () => {
    let session = addPhoto(emptyScanSession(), photo(1)).session;
    session = applyMatch(session, 'scan-1', READ, FOUND_YEW);
    // A repeat whose photo the scan does not own (never deleted) is grouped into it.
    const repeat = addPhoto(session, { ...photo(2), uri: 'ph://library-original', owned: false });
    session = applyMatch(repeat.session, repeat.tileId, READ, FOUND_YEW);
    expect(findTile(session, 'scan-1')?.copies).toBe(2);
    session = addSent(session, {
      key: 'key-1',
      body: batchAddRequest(session)!,
      tileIds: ['scan-1'],
      binderName: null,
    });
    expect(sentPhotoFiles(session)).toEqual([photo(1).uri]);
  });

  it('refused: nothing was added, its tiles can change again', () => {
    const { session } = sentScan();
    expect(addRefused(session, 'another-key')).toBe(session);
    const refused = addRefused(session, 'key-1');
    expect(refused.pendingAdd).toBeNull();
    expect(refused.tiles).toBe(session.tiles);
    expect(findTile(setCopies(refused, 'scan-1', 5), 'scan-1')?.copies).toBe(5);
  });
});

describe('a card given up after server errors', () => {
  function givenUp(): ScanSession {
    const added = addPhoto(emptyScanSession(), photo(1));
    return markUnread(added.session, added.tileId, READ, 'MATCH_FAILED');
  }

  it('keeps its read, and can wait for its match again ("Try again")', () => {
    const session = givenUp();
    const tile = findTile(session, 'scan-1')!;
    expect(isGivenUp(tile)).toBe(true);
    expect(tile).toMatchObject({ status: 'NOT_FOUND', read: READ });
    const reopened = reopenMatch(session, 'scan-1');
    expect(findTile(reopened, 'scan-1')).toMatchObject({
      status: 'WAITING',
      read: READ,
      notFoundReason: null,
    });
    // Its answer lands as any waiting tile's.
    expect(findTile(applyMatch(reopened, 'scan-1', READ, FOUND_YEW), 'scan-1')?.status).toBe(
      'FOUND'
    );
  });

  it('reopens nothing else: a card that could not be read, or one fixed by hand', () => {
    const unread = markUnread(addPhoto(emptyScanSession(), photo(1)).session, 'scan-1', READ, null);
    expect(isGivenUp(findTile(unread, 'scan-1')!)).toBe(false);
    expect(reopenMatch(unread, 'scan-1')).toBe(unread);
    const fixed = replaceMatch(givenUp(), 'scan-1', { card: YEW, printing: ZACR_036 });
    expect(isGivenUp(findTile(fixed, 'scan-1')!)).toBe(false);
    expect(reopenMatch(fixed, 'scan-1')).toBe(fixed);
  });
});

describe('photo files', () => {
  it('deletes every photo the scan made or copied when it ends, grouped and removed ones too', () => {
    let session = scan(emptyScanSession(), FOUND_YEW);
    session = scan(session, FOUND_YEW);
    session = scan(session, NOT_FOUND);
    session = removeTile(session, 'scan-3');
    session = addPhoto(session, photo(4)).session;
    session = addPhoto(session, {
      ...photo(5),
      uri: 'ph://library-original',
      owned: false,
    }).session;
    expect(photoFilesToDelete(session).sort()).toEqual(
      [photo(1).uri, photo(2).uri, photo(3).uri, photo(4).uri].sort()
    );
    expect(photoFilesToDelete(emptyScanSession())).toEqual([]);
  });
});
