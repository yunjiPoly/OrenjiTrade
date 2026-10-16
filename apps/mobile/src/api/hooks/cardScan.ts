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
    const answer = await Promise.race([
      api.POST('/api/v1/cards/scan-match', {
        body: scanMatchBody(read),
        signal: controller.signal,
      }),
      timeout,
    ]);
    return required(answer.data);
  } finally {
    clearTimeout(timer);
  }
}

/** Whether a failed match means "no connection" (the tile waits) rather than a refusal. */
export function isOfflineError(error: unknown): boolean {
  return error instanceof ApiError && error.isNetworkError;
}

/** `POST /api/v1/inventory/items/batch`: the review's ready cards, in one transaction. */
export async function addInventoryItemsBatch(
  body: AddInventoryItemsBatchRequest
): Promise<AddInventoryItemsBatchResponse> {
  return required((await api.POST('/api/v1/inventory/items/batch', { body })).data);
}

/**
 * "Add {n} cards to inventory": adds the ready cards (`batchAddRequest` of the scan session), then
 * reads the inventory and the binders again. Refusals: 429 `LIMIT_REACHED` (nothing written),
 * 404 `NOT_FOUND` (the binder is gone), 404 `FEATURE_DISABLED`, 400 `VALIDATION_FAILED`.
 */
export function useAddScannedCards() {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<AddInventoryItemsBatchResponse, ApiError, AddInventoryItemsBatchRequest>({
    mutationFn: addInventoryItemsBatch,
    onSuccess: async () => refreshInventory(queryClient, uid),
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
