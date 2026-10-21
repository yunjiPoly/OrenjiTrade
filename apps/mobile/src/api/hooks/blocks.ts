import { useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';

import type { ApiError } from '../ApiError';
import { api, required } from '../client';
import { meKeys } from '../queryKeys';
import type { BlockedUser, FeedPage } from '../types';
import { useIsAuthenticated, useUid } from './useUid';

/** `GET /api/v1/me/blocks`: the collectors the caller blocked (Settings → Blocked users). */
export function useMyBlocks() {
  const uid = useUid();
  return useQuery<BlockedUser[], ApiError>({
    queryKey: meKeys.blocks(uid),
    queryFn: async () => required((await api.GET('/api/v1/me/blocks')).data),
    enabled: useIsAuthenticated(),
  });
}

/**
 * Block / unblock a collector (`POST` / `DELETE /api/v1/users/{id}/block`, idempotent on the
 * server; web: `BlockActionsService`). A block hides both collectors from each other on the map,
 * in search, in the community and in messages, so every viewer-dependent cache is refreshed: the
 * region map's counts and the binders of its states and provinces among them (a blocked
 * collector's binder is neither counted nor listed), what the Search tab and the card holders
 * already read (a blocked collector is no longer found, nor their binders or copies), and Home's
 * feed (stage R7): a blocked collector's posts leave the pages already read at once, and the feed
 * is read again (R7 review P1/F3: they stayed on Home until a pull or the 5-minute refresh).
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
    onSuccess: (_, { id }) => {
      if (kind === 'block') {
        queryClient.setQueriesData<InfiniteData<FeedPage>>(
          { queryKey: meKeys.homeFeeds(uid) },
          (data) =>
            data && {
              ...data,
              pages: data.pages.map((page) => ({
                ...page,
                items: (page.items ?? []).filter((post) => post.collector.id !== id),
              })),
            }
        );
      }
      void queryClient.invalidateQueries({ queryKey: meKeys.homeFeeds(uid) });
      void queryClient.invalidateQueries({ queryKey: meKeys.blocks(uid) });
      void queryClient.invalidateQueries({ queryKey: meKeys.community(uid) });
      void queryClient.invalidateQueries({ queryKey: meKeys.regionMap(uid) });
      void queryClient.invalidateQueries({ queryKey: meKeys.searches(uid) });
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
