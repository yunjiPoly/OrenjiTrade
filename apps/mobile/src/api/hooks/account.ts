import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { ApiError } from '../ApiError';
import { api, required } from '../client';
import { meKeys } from '../queryKeys';
import type { AccountExport, CreateDeletionRequest, DeletionRequestResponse } from '../types';
import { useIsAuthenticated, useUid } from './useUid';

/** `GET /api/v1/me/export`: everything OrenjiTrade stores about the caller (allowed while leaving). */
export async function fetchAccountExport(): Promise<AccountExport> {
  return required((await api.GET('/api/v1/me/export')).data);
}

/** `GET /api/v1/me/deletion-requests`. */
export function useDeletionRequests(enabled = true) {
  const uid = useUid();
  return useQuery<DeletionRequestResponse[], ApiError>({
    queryKey: meKeys.deletionRequests(uid),
    queryFn: async () => required((await api.GET('/api/v1/me/deletion-requests')).data),
    enabled: useIsAuthenticated() && enabled,
  });
}

/** The pending request of a list, if any. */
export function pendingDeletion(
  requests: readonly DeletionRequestResponse[] | undefined
): DeletionRequestResponse | null {
  return requests?.find((request) => request.status === 'PENDING') ?? null;
}

/**
 * `POST /api/v1/me/deletion-requests`: needs a sign-in younger than 5 minutes (re-authenticate
 * first). 409 `DELETION_BLOCKED` lists the open obligations in `blockers`.
 */
export function useRequestDeletion() {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<DeletionRequestResponse, ApiError, CreateDeletionRequest>({
    mutationFn: async (body) =>
      required((await api.POST('/api/v1/me/deletion-requests', { body })).data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: meKeys.deletionRequests(uid) });
      await queryClient.invalidateQueries({ queryKey: meKeys.account(uid) });
    },
  });
}

/** `DELETE /api/v1/me/deletion-requests/{id}`: cancels a pending deletion during the grace period. */
export function useCancelDeletion() {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: async (id) => {
      await api.DELETE('/api/v1/me/deletion-requests/{id}', { params: { path: { id } } });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: meKeys.deletionRequests(uid) });
      await queryClient.invalidateQueries({ queryKey: meKeys.account(uid) });
    },
  });
}

/** Human labels of `DELETION_BLOCKED` blockers (unknown codes are shown humanised). */
export const BLOCKER_LABELS: Readonly<Record<string, string>> = {
  OPEN_DISPUTE: 'You have an open dispute.',
  OPEN_TRADE: 'You have a trade in progress.',
  PENDING_PAYOUT: 'A payout is still pending.',
  OPEN_OFFER: 'You have open offers.',
};

export function blockerLabel(code: string): string {
  return BLOCKER_LABELS[code] ?? code.replace(/_/g, ' ').toLowerCase();
}
