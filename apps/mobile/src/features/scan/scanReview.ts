import type { ApiError } from '@/src/api/ApiError';
import { friendlyMessage } from '@/src/api/errorMessages';
import { limitReachedInfo } from '@/src/lib/limits';

import { REVIEW_COPY } from './scanCopy';
import { isReady, type ScanSession, type ScanTile } from './scanSession';

/**
 * The review's rules that hold no screen (mockup screen 30, owner spec 2026-10-15, section 4).
 * Pure.
 */

/** How a row of the review looks, and what it offers. */
export type ReviewRowKind = 'READY' | 'PICK_RARITY' | 'PICK_PRINTING' | 'UNREAD' | 'WAITING';

export function reviewRowKind(tile: ScanTile): ReviewRowKind {
  if (isReady(tile)) {
    return 'READY';
  }
  switch (tile.status) {
    case 'PICK_RARITY':
      return 'PICK_RARITY';
    case 'PICK_PRINTING':
      return 'PICK_PRINTING';
    case 'WAITING':
    case 'READING':
      return 'WAITING';
    default:
      return 'UNREAD';
  }
}

/**
 * "Reading 3 of 12…" while photos are read: the photo being read now (the ones read so far, plus
 * one) of every photo the scan holds. Null when nothing is being read.
 */
export function readingProgress(session: ScanSession): { current: number; total: number } | null {
  let photos = 0;
  let reading = 0;
  for (const tile of session.tiles) {
    photos += tile.photos.length;
    if (tile.status === 'READING') {
      reading += tile.photos.length;
    }
  }
  return reading === 0 ? null : { current: photos - reading + 1, total: photos };
}

/** Why "Add {n} cards to inventory" failed, and what the collector can do. Nothing was added. */
export interface AddFailure {
  kind: 'LIMIT' | 'OFFLINE' | 'BINDER_GONE' | 'SCAN_OFF' | 'OTHER';
  message: string;
}

/**
 * The batch add is one transaction (`POST /inventory/items/batch`): a refusal writes nothing, so
 * the scan is kept as it was and every failure says how to go on.
 */
export function addFailure(error: ApiError, binderChosen: boolean): AddFailure {
  if (error.errorCode === 'LIMIT_REACHED') {
    const info = limitReachedInfo(error);
    return {
      kind: 'LIMIT',
      message: REVIEW_COPY.limitMessage(info.limit, info.used, info.requested),
    };
  }
  if (error.isNetworkError) {
    return { kind: 'OFFLINE', message: REVIEW_COPY.offline };
  }
  if (error.errorCode === 'FEATURE_DISABLED') {
    return { kind: 'SCAN_OFF', message: REVIEW_COPY.scanOff };
  }
  if (error.status === 404 && binderChosen) {
    return { kind: 'BINDER_GONE', message: REVIEW_COPY.binderGone };
  }
  return { kind: 'OTHER', message: REVIEW_COPY.failed(friendlyMessage(error)) };
}
