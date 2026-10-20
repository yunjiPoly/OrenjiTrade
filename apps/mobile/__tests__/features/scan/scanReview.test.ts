import { ApiError } from '@/src/api/ApiError';
import { REVIEW_COPY } from '@/src/features/scan/scanCopy';
import { addFailure, readingProgress, reviewRowKind } from '@/src/features/scan/scanReview';
import { scanCardOf, scanPrintingOf, searchTextOf } from '@/src/features/scan/scanSearch';
import {
  addPhoto,
  applyMatch,
  emptyScanSession,
  markUnread,
  markWaiting,
  type ScanSession,
} from '@/src/features/scan/scanSession';

import {
  FOUND_YEW,
  PICK_PRINTING_FOX,
  PICK_RARITY_LANTERN,
  READ_FOX,
} from '../../support/scanFixtures';

/**
 * The review's rules without a screen (owner spec 2026-10-15, section 4): how each row looks, the
 * reading count, what a failed add says, and what the search inside the scan opens with and picks.
 * Fictional cards only.
 */

function photo(name: string) {
  return { uri: `file:///cache/${name}.jpg`, width: 3000, height: 4000, owned: true };
}

function withPhotos(count: number): { session: ScanSession; ids: string[] } {
  let session = emptyScanSession();
  const ids: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const added = addPhoto(session, photo(`p${index}`));
    session = added.session;
    ids.push(added.tileId);
  }
  return { session, ids };
}

function problemError(status: number, errorCode: string, extra: Record<string, unknown> = {}) {
  return new ApiError({
    status,
    errorCode,
    message: 'Refused',
    problem: { errorCode, status, ...extra },
  });
}

describe('review rows', () => {
  it('names how each tile shows on the review', () => {
    const { session, ids } = withPhotos(7);
    const [found, rarity, printing, unread, waiting, reading, givenUp] = ids as [
      string,
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    let next = applyMatch(session, found, FOUND_YEW.read, FOUND_YEW);
    next = applyMatch(next, rarity, PICK_RARITY_LANTERN.read, PICK_RARITY_LANTERN);
    next = applyMatch(next, printing, READ_FOX, PICK_PRINTING_FOX);
    next = markUnread(next, unread, null, null);
    next = markWaiting(next, waiting, READ_FOX);
    next = markUnread(next, givenUp, READ_FOX, 'MATCH_FAILED');
    const kinds = Object.fromEntries(next.tiles.map((tile) => [tile.id, reviewRowKind(tile)]));
    expect(kinds).toEqual({
      [found]: 'READY',
      [rarity]: 'PICK_RARITY',
      [printing]: 'PICK_PRINTING',
      [unread]: 'UNREAD',
      [waiting]: 'WAITING',
      [reading]: 'WAITING',
      [givenUp]: 'UNMATCHED',
    });
  });

  it('counts "Reading n of m…" over the photos of the scan', () => {
    expect(readingProgress(emptyScanSession())).toBeNull();
    const { session, ids } = withPhotos(3);
    expect(readingProgress(session)).toEqual({ current: 1, total: 3 });
    const one = applyMatch(session, ids[0] ?? '', FOUND_YEW.read, FOUND_YEW);
    expect(readingProgress(one)).toEqual({ current: 2, total: 3 });
    // A repeat grouped into its tile still counts its photo.
    const two = applyMatch(one, ids[1] ?? '', FOUND_YEW.read, FOUND_YEW);
    expect(two.tiles).toHaveLength(2);
    expect(readingProgress(two)).toEqual({ current: 3, total: 3 });
    expect(readingProgress(applyMatch(two, ids[2] ?? '', FOUND_YEW.read, FOUND_YEW))).toBeNull();
  });
});

describe('a failed add', () => {
  it('explains the limit with the room left', () => {
    const failure = addFailure(
      problemError(429, 'LIMIT_REACHED', {
        limitKey: 'inventory.items.max',
        limit: 10,
        used: 9,
        requested: 3,
      }),
      false
    );
    expect(failure).toEqual({
      kind: 'LIMIT',
      message:
        'Your inventory holds at most 10 cards and has 9. These cards need 3 new places and 1 is left. Nothing was added: remove some cards here, or delete cards you no longer have in Inventory, then add again.',
    });
    expect(REVIEW_COPY.limitMessage(null, null, null)).toBe(
      'Your inventory is full. Nothing was added: remove some cards here, or delete cards you no longer have in Inventory, then add again.'
    );
    expect(REVIEW_COPY.limitMessage(10, 10, 1)).toContain(
      'These cards need 1 new place and 0 are left.'
    );
  });

  it('tells no answer, a binder gone, scanning off and anything else apart', () => {
    // No answer (offline, none in time, a server error): the cards may have been added.
    const offline = new ApiError({ status: 0, errorCode: 'NETWORK_ERROR', message: 'offline' });
    for (const unsure of [
      offline,
      ApiError.timeout(30_000),
      problemError(500, 'INTERNAL_ERROR'),
      problemError(503, 'SERVICE_UNAVAILABLE'),
    ]) {
      expect(addFailure(unsure, false)).toEqual({
        kind: 'UNSURE',
        message:
          "We couldn't hear back from OrenjiTrade, so we can't tell whether your cards were added. They stay as they were sent: add again when you're online, and nothing will be added twice.",
      });
    }
    expect(addFailure(problemError(404, 'NOT_FOUND'), true).kind).toBe('BINDER_GONE');
    // Without a binder, a 404 is no binder gone.
    expect(addFailure(problemError(404, 'NOT_FOUND'), false).kind).toBe('OTHER');
    expect(addFailure(problemError(404, 'FEATURE_DISABLED'), true).kind).toBe('SCAN_OFF');
    const invalid = addFailure(
      new ApiError({ status: 400, errorCode: 'VALIDATION_FAILED', message: 'Unknown printing.' }),
      false
    );
    expect(invalid).toEqual({
      kind: 'OTHER',
      message: 'Unknown printing. Nothing was added: try again.',
    });
  });

  it('sent again after no answer, still cannot tell unless the refusal comes after the key', () => {
    // The limit and the binder are decided after the API looked the key up: the first try did not
    // go through, nothing was added.
    expect(
      addFailure(
        problemError(429, 'LIMIT_REACHED', { limit: 3, used: 3, requested: 1 }),
        false,
        true
      ).kind
    ).toBe('LIMIT');
    expect(addFailure(problemError(404, 'NOT_FOUND'), true, true).kind).toBe('BINDER_GONE');
    // Decided before it (the flag, the body, the account): the first try may have gone through.
    for (const refusal of [
      problemError(404, 'FEATURE_DISABLED'),
      problemError(404, 'NOT_FOUND'),
      problemError(400, 'VALIDATION_FAILED'),
      problemError(403, 'ACCOUNT_SUSPENDED'),
      problemError(429, 'RATE_LIMITED'),
    ]) {
      expect(addFailure(refusal, false, true).kind).toBe('UNSURE');
    }
    expect(addFailure(problemError(404, 'FEATURE_DISABLED'), true, true).kind).toBe('UNSURE');
    expect(addFailure(ApiError.timeout(30_000), false, true).kind).toBe('UNSURE');
  });
});

describe('the search inside the scan', () => {
  it('opens with the name read, else the code, cut to the field', () => {
    expect(searchTextOf({ codes: ['ZACR-EN036'], names: ['Yew Flowers'] })).toBe('Yew Flowers');
    expect(searchTextOf({ codes: ['ZACR-EN036'], names: [] })).toBe('ZACR-EN036');
    expect(searchTextOf(null)).toBe('');
    expect(searchTextOf({ codes: [], names: ['x'.repeat(150)] })).toHaveLength(100);
  });

  it('turns a suggestion into the card and printing a tile holds', () => {
    expect(scanCardOf({ kind: 'CARD', name: 'No id', game: 'yugioh' })).toBeNull();
    expect(scanCardOf({ kind: 'CARD', id: 'card-1', name: 'Paper Fox', game: 'yugioh' })).toEqual({
      id: 'card-1',
      name: 'Paper Fox',
    });
    expect(scanPrintingOf({ kind: 'CARD', id: 'card-1', game: 'yugioh' })).toBeNull();
    expect(
      scanPrintingOf({
        kind: 'PRINTING',
        id: 'card-1',
        printingId: 'p-1',
        game: 'yugioh',
        printingCode: 'ZPAP-EN001',
        setName: 'Paper Pack',
        language: 'EN',
      })
    ).toEqual({ id: 'p-1', printingCode: 'ZPAP-EN001', setCode: 'ZPAP', setName: 'Paper Pack' });
  });

  it('never takes a card of another game, nor a printing in another language (Yu-Gi-Oh! English only)', () => {
    const other = { kind: 'CARD' as const, id: 'card-mtg', name: 'Cinder Drake', game: 'mtg' };
    expect(scanCardOf(other)).toBeNull();
    expect(scanCardOf({ ...other, game: undefined })).toBeNull();
    const printing = {
      kind: 'PRINTING' as const,
      id: 'card-1',
      printingId: 'p-1',
      printingCode: 'ZPAP-FR001',
      setName: 'Paper Pack',
    };
    expect(scanPrintingOf({ ...printing, game: 'mtg', language: 'EN' })).toBeNull();
    expect(scanPrintingOf({ ...printing, game: 'yugioh', language: 'FR' })).toBeNull();
    expect(scanPrintingOf({ ...printing, game: 'yugioh', language: 'English' })).not.toBeNull();
  });
});
