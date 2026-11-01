import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  MAX_CODE_CANDIDATES,
  MAX_CODE_LENGTH,
  MAX_NAME_CANDIDATES,
  MAX_NAME_LENGTH,
  SCAN_GAME,
  type AddInventoryItemsBatchRequest,
  type AddInventoryItemsBatchResponse,
  type CardScanMatch,
  type CardScanMatchRequest,
  type ScanRead,
} from '@/src/features/scan/types';

import { ApiError } from '../ApiError';
import { api, required } from '../client';
import { catalogKeys } from '../queryKeys';
import type { PrintingSummary } from '../types';
import { refreshInventory } from './inventory';
import { useUid } from './useUid';

/**
 * The card scan's two calls (`docs/api/contracts/card-scan.md`), both signed in and behind the
 * flag `cardTextScan` (404 `FEATURE_DISABLED` while it is off). Only the text read goes to the
 * API, in the body of a POST (never in an address); the photo never leaves the phone.
 */

/** How long a match may take before the tile waits for the connection instead. */
export const SCAN_MATCH_TIMEOUT_MS = 20_000;

/**
 * How long "Add {n} cards to inventory" waits for its answer. Without one, the review says that it
 * could not tell whether the cards were added (the request may have reached the API), and adding
 * again is safe: the same body is sent again under the same `Idempotency-Key`, which gets the first
 * answer back instead of a second add.
 */
export const SCAN_ADD_TIMEOUT_MS = 30_000;

/** Runs a request, given up as a network `ApiError` (`isTimeout`) after `timeoutMs`. */
async function withTimeout<T>(
  timeoutMs: number,
  request: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      // Rejected here, not by the aborted request (how a platform reports an abort varies).
      reject(ApiError.timeout(timeoutMs));
      controller.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([request(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function bounded(values: readonly string[], max: number, length: number): string[] {
  return values
    .filter((value) => typeof value === 'string' && value.trim().length > 0)
    .slice(0, max)
    .map((value) => [...value].slice(0, length).join(''));
}

/** The body of a match: the read, within the API's limits (3 codes of 40, 3 names of 150). */
export function scanMatchBody(read: ScanRead): CardScanMatchRequest {
  return {
    game: SCAN_GAME,
    codes: bounded(read.codes, MAX_CODE_CANDIDATES, MAX_CODE_LENGTH),
    names: bounded(read.names, MAX_NAME_CANDIDATES, MAX_NAME_LENGTH),
  };
}

/**
 * `POST /api/v1/cards/scan-match`: the printing the read points to. One call per photo. It is a
 * write by its method but a read by its use: without an answer within `timeoutMs` it is given up
 * as a network `ApiError` (`isTimeout`), so its tile waits for the connection.
 */
export async function matchScannedCard(
  read: ScanRead,
  { timeoutMs = SCAN_MATCH_TIMEOUT_MS }: { timeoutMs?: number } = {}
): Promise<CardScanMatch> {
  const answer = await withTimeout(timeoutMs, (signal) =>
    api.POST('/api/v1/cards/scan-match', { body: scanMatchBody(read), signal })
  );
  return required(answer.data);
}

/** Whether a failed match means "no connection" (the tile waits) rather than a refusal. */
export function isOfflineError(error: unknown): boolean {
  return error instanceof ApiError && error.isNetworkError;
}

/**
 * Why a call of the scan failed:
 * - NETWORK: no answer (offline, or none in time);
 * - SERVER: the service could not answer this time (5xx, 408, 429): trying again later can work;
 * - REFUSED: the API said no (the flag off, a bad request, the account): trying again cannot.
 */
export type ScanCallFailure = 'NETWORK' | 'SERVER' | 'REFUSED';

export function scanCallFailure(error: unknown): ScanCallFailure {
  if (!(error instanceof ApiError)) {
    return 'REFUSED';
  }
  if (error.isNetworkError) {
    return 'NETWORK';
  }
  if (error.isServerError || error.status === 408 || error.status === 429) {
    return 'SERVER';
  }
  return 'REFUSED';
}

/** What "Add {n} cards to inventory" sends: the cards, and the key of that add. */
export interface ScanAddRequest {
  body: AddInventoryItemsBatchRequest;
  /**
   * Each add has its own key, kept with the body it sent (`PendingAdd` of the scan session): sent
   * again as it was after an answer that was lost, it gets the first answer back, so no card is
   * added twice.
   */
  idempotencyKey: string;
}

/**
 * `POST /api/v1/inventory/items/batch`: the review's ready cards, in one transaction, given up
 * after `timeoutMs` without an answer.
 */
export async function addInventoryItemsBatch(
  { body, idempotencyKey }: ScanAddRequest,
  { timeoutMs = SCAN_ADD_TIMEOUT_MS }: { timeoutMs?: number } = {}
): Promise<AddInventoryItemsBatchResponse> {
  const answer = await withTimeout(timeoutMs, (signal) =>
    api.POST('/api/v1/inventory/items/batch', {
      body,
      params: { header: { 'Idempotency-Key': idempotencyKey } },
      signal,
    })
  );
  return required(answer.data);
}

/**
 * "Add {n} cards to inventory": adds the ready cards (`batchAddRequest` of the scan session), then
 * reads the inventory and the binders again. Refusals: 429 `LIMIT_REACHED` (nothing written),
 * 404 `NOT_FOUND` (the binder is gone), 404 `FEATURE_DISABLED`, 400 `VALIDATION_FAILED`. Without
 * an answer (offline, none in time, a server error) the cards may have been added: the inventory
 * and the binders are read again too.
 */
export function useAddScannedCards() {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<AddInventoryItemsBatchResponse, ApiError, ScanAddRequest>({
    mutationFn: (request) => addInventoryItemsBatch(request),
    onSuccess: async () => refreshInventory(queryClient, uid),
    onError: (error) => {
      // Not waited for: on a network that stalls the reads would hold the review's message back.
      if (scanCallFailure(error) !== 'REFUSED') {
        void refreshInventory(queryClient, uid);
      }
    },
  });
}

/**
 * `GET /api/v1/cards/{id}/printings`: the printings of a card picked by hand in the scan (the
 * printing list), public. Unlike `GET /cards/{id}`, it records no "card viewed" event: fixing a
 * scanned card is not viewing it.
 */
export function useScanCardPrintings(cardId: string | null | undefined) {
  return useQuery<PrintingSummary[], ApiError>({
    queryKey: [...catalogKeys.card(cardId ?? ''), 'printings'],
    queryFn: async () =>
      required(
        (
          await api.GET('/api/v1/cards/{id}/printings', {
            params: { path: { id: cardId ?? '' } },
          })
        ).data
      ),
    enabled: !!cardId,
    staleTime: 10 * 60_000,
  });
}
