import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { ApiError } from '../ApiError';
import { api } from '../client';
import { meKeys } from '../queryKeys';
import { useUid } from './useUid';

/**
 * Block / unblock a collector (`POST` / `DELETE /api/v1/users/{id}/block`, idempotent on the
 * server; web: `BlockActionsService`). A block hides both collectors from each other on the map,
 * in search, in the community and in messages, so every viewer-dependent cache is refreshed.
 */
function useBlockMutation(kind: 'block' | 'unblock') {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, { id: string }>({
    mutationFn: async ({ id }) => {
      if (kind === 'block') {
        await api.POST('/api/v1/users/{id}/block', { params: { path: { id } }, body: {} });
      } else {
        await api.DELETE('/api/v1/users/{id}/block', { params: { path: { id } } });
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: meKeys.blocks(uid) });
      void queryClient.invalidateQueries({ queryKey: meKeys.discovery(uid) });
      void queryClient.invalidateQueries({ queryKey: meKeys.community(uid) });
      void queryClient.invalidateQueries({
        queryKey: [...meKeys.user(uid), 'collectors'],
      });
    },
  });
}

export function useBlockUser() {
  return useBlockMutation('block');
}

export function useUnblockUser() {
  return useBlockMutation('unblock');
}
