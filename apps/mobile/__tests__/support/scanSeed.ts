import {
  addPhoto,
  applyMatch,
  markUnread,
  markWaiting,
  type ScanSession,
} from '@/src/features/scan/scanSession';
import { useScanStore } from '@/src/features/scan/scanStore';
import type { CardScanMatch, ScanRead } from '@/src/features/scan/types';

import {
  FOUND_YEW,
  LYRA,
  PICK_PRINTING_FOX,
  PICK_RARITY_LANTERN,
  printing,
  READ_FOX,
} from './scanFixtures';
import { libraryPhoto } from './scanScreen';

/**
 * A scan put straight into the store for the review's and the search's tests: each entry is one
 * photo (a fictional file name) and what became of it. The photos are added in order, so the last
 * one is the newest (the top of the tray).
 */
export type SeedEntry =
  | { photo: string; match: CardScanMatch }
  | { photo: string; unread: ScanRead | null }
  | { photo: string; waiting: ScanRead }
  /** Given up after server errors ("Couldn't match"), with what it read. */
  | { photo: string; givenUp: ScanRead }
  | { photo: string; reading: true };

export function seedScan(entries: readonly SeedEntry[]): string[] {
  const ids: string[] = [];
  useScanStore.getState().apply((start) => {
    let session: ScanSession = start;
    for (const entry of entries) {
      const picture = libraryPhoto(entry.photo);
      const added = addPhoto(session, { ...picture, owned: true });
      session = added.session;
      ids.push(added.tileId);
      if ('match' in entry) {
        session = applyMatch(session, added.tileId, entry.match.read, entry.match);
      } else if ('unread' in entry) {
        session = markUnread(session, added.tileId, entry.unread, entry.unread ? 'NO_MATCH' : null);
      } else if ('waiting' in entry) {
        session = markWaiting(session, added.tileId, entry.waiting);
      } else if ('givenUp' in entry) {
        session = markUnread(session, added.tileId, entry.givenUp, 'MATCH_FAILED');
      }
    }
    return session;
  });
  return ids;
}

/** A second card found by the matcher (fictional). */
export const ZACR_038 = printing('p-zacr-038', 'ZACR-EN038', 'Lantern Crisis', 'Super Rare');
export const READ_LYRA: ScanRead = { codes: ['ZACR-EN038'], names: [LYRA.name] };
export const FOUND_LYRA: CardScanMatch = {
  status: 'FOUND',
  card: LYRA,
  printing: ZACR_038,
  rarities: [],
  printings: [ZACR_038],
  otherMatches: [],
  read: READ_LYRA,
};

/** What a photo nobody could match read. */
export const READ_BLUR: ScanRead = { codes: ['ZQQ-EN999'], names: ['Smudged Wyvern'] };

/**
 * The review of the mockup, in fictional cards: Yew ×2 (found), Lyra (found), Lantern (pick the
 * rarity), Fox (pick the printing) and one photo that could not be read. Returns the tile ids in
 * this order: yew, lyra, lantern, fox, blur (the second Yew is grouped into the first).
 */
export function seedMockupScan(): {
  yew: string;
  lyra: string;
  lantern: string;
  fox: string;
  blur: string;
} {
  const [yew, , lyra, lantern, fox, blur] = seedScan([
    { photo: 'yew-1', match: FOUND_YEW },
    { photo: 'yew-2', match: FOUND_YEW },
    { photo: 'lyra', match: FOUND_LYRA },
    { photo: 'lantern', match: PICK_RARITY_LANTERN },
    { photo: 'fox', match: { ...PICK_PRINTING_FOX, read: READ_FOX } },
    { photo: 'blur', unread: READ_BLUR },
  ]);
  return {
    yew: yew ?? '',
    lyra: lyra ?? '',
    lantern: lantern ?? '',
    fox: fox ?? '',
    blur: blur ?? '',
  };
}
