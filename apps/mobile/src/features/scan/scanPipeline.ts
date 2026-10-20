import { scanCallFailure } from '@/src/api/hooks/cardScan';

import type { ReadCardInput } from './readCardText';
import { applyMatch, markUnread, markWaiting, type ScanSession } from './scanSession';
import { hasText, type CardScanMatch, type CardScanNotFoundReason, type ScanRead } from './types';

/**
 * One photo from the reader to its tile: read on the phone, then matched by the API. The reader
 * and the matcher are passed in (the device's and `matchScannedCard` in the app, fakes in tests).
 *
 * - Nothing read: "Couldn't read" at once (`NOTHING_READ`); nothing is sent.
 * - The API unreachable (offline, or no answer in time: `NETWORK`), or unable to answer this time
 *   (a server error, a restart, too many requests: `SERVER`): "Waiting for connection", the read
 *   kept to match again later (`scanRunner.ts` tries again, and gives a tile up whose match keeps
 *   failing while the API answers the scan's other photos).
 * - The reader failing, or the API refusing (the flag off, a bad request): "Couldn't read" (the
 *   search is one tap away).
 */

export type PhotoOutcome =
  | { kind: 'MATCHED'; read: ScanRead; match: CardScanMatch }
  | { kind: 'OFFLINE'; read: ScanRead; cause: 'NETWORK' | 'SERVER' }
  | { kind: 'UNREAD'; read: ScanRead | null; reason: CardScanNotFoundReason | null };

export type CardReader = (input: ReadCardInput) => Promise<ScanRead>;
export type CardMatcher = (read: ScanRead) => Promise<CardScanMatch>;

/** Matches what was read (a new read, or a tile that waited for the connection). */
export async function matchRead(matcher: CardMatcher, read: ScanRead): Promise<PhotoOutcome> {
  if (!hasText(read)) {
    return { kind: 'UNREAD', read, reason: 'NOTHING_READ' };
  }
  try {
    return { kind: 'MATCHED', read, match: await matcher(read) };
  } catch (error) {
    const failure = scanCallFailure(error);
    return failure === 'REFUSED'
      ? { kind: 'UNREAD', read, reason: null }
      : { kind: 'OFFLINE', read, cause: failure };
  }
}

/** Reads one photo, then matches it. */
export async function readAndMatch(
  reader: CardReader,
  matcher: CardMatcher,
  input: ReadCardInput
): Promise<PhotoOutcome> {
  let read: ScanRead;
  try {
    read = await reader(input);
  } catch {
    return { kind: 'UNREAD', read: null, reason: null };
  }
  return matchRead(matcher, read);
}

/** Lands an outcome on its tile. */
export function applyOutcome(
  session: ScanSession,
  tileId: string,
  outcome: PhotoOutcome
): ScanSession {
  switch (outcome.kind) {
    case 'MATCHED':
      return applyMatch(session, tileId, outcome.read, outcome.match);
    case 'OFFLINE':
      return markWaiting(session, tileId, outcome.read);
    case 'UNREAD':
      return markUnread(session, tileId, outcome.read, outcome.reason);
  }
}
