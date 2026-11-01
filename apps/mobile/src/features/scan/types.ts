import type { components } from '@orenji/shared-types';

/**
 * Short names for the card scan's server DTOs (`docs/api/contracts/card-scan.md`), generated from
 * the OpenAPI document. Aliases only, never hand-written shapes (CLAUDE.md). They live here rather
 * than in `src/api/types.ts`, which the phone redesign is changing at the same time.
 */
type Schemas = components['schemas'];

export type CardScanMatchRequest = Schemas['CardScanMatchRequest'];
export type CardScanMatch = Schemas['CardScanMatch'];
export type CardScanStatus = CardScanMatch['status'];
export type CardScanNotFoundReason = NonNullable<CardScanMatch['reason']>;
export type CardScanCard = Schemas['CardScanCard'];
export type CardScanPrinting = Schemas['CardScanPrinting'];
export type CardScanOtherMatch = Schemas['CardScanOtherMatch'];
export type AddInventoryItemsBatchRequest = Schemas['AddInventoryItemsBatchRequest'];
export type AddInventoryItemsBatchLine = Schemas['AddInventoryItemsBatchLine'];
export type AddInventoryItemsBatchResponse = Schemas['AddInventoryItemsBatchResponse'];
export type ScanVisibility = NonNullable<AddInventoryItemsBatchRequest['visibility']>;

/** The game the scan reads (the API refuses any other with a 400). */
export const SCAN_GAME = 'yugioh';

/**
 * What the phone read on one card and sends to `POST /cards/scan-match`: at most 3 printing code
 * candidates and 3 name candidates, best first. The phone never decides alone (spec 3.4).
 */
export interface ScanRead {
  codes: string[];
  names: string[];
}

/** At most this many codes and names go to the API (its own limit). */
export const MAX_CODE_CANDIDATES = 3;
export const MAX_NAME_CANDIDATES = 3;
/** The API's longest code and name entries. */
export const MAX_CODE_LENGTH = 40;
export const MAX_NAME_LENGTH = 150;

/** A read that found nothing. */
export function nothingRead(): ScanRead {
  return { codes: [], names: [] };
}

/** Whether a read holds anything to send. */
export function hasText(read: ScanRead): boolean {
  return read.codes.length > 0 || read.names.length > 0;
}
