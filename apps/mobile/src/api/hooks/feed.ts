import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { useBrowsingGame } from '@/src/features/games/browsingGame';
import type { FeedFilter } from '@/src/features/home/feedRules';
import { useBrowsingRegion } from '@/src/features/regions/browsingRegion';

import type { ApiError } from '../ApiError';
import { api, required } from '../client';
import { meKeys } from '../queryKeys';
import type { FeedPage } from '../types';
import { useCanBrowse, useIsAuthenticated, useUid } from './useUid';

/** Posts per page of `GET /feed`. */
export const FEED_PAGE = 20;

/**
 * Home refreshes on its own when its data is older than this (coming back to Home, or to the app);
 * otherwise only a pull refreshes it, so new posts never slide in while someone reads (owner
 * prompt of 2026-10-19, section 4; default 5 of section 8).
 */
export const FEED_STALE_MS = 5 * 60_000;

/**
 * `GET /api/v1/feed` (stage R7): what became public in the browsed region for the browsed game,
 * newest first, by cursor, for one chip (`kind`). Nothing older than the server's window
 * (`windowDays`); the last page has no `nextCursor`. A change of region, game or chip shows the
 * skeleton, never the posts of another one.
 */
export function useHomeFeed(kind: FeedFilter) {
  const uid = useUid();
  // Guests read Home too (stage R15): the API answers without who posted.
  const browse = useCanBrowse();
  const { region, ready } = useBrowsingRegion();
  const browsing = useBrowsingGame();
  const game = browsing.game;
  return useInfiniteQuery<FeedPage, ApiError>({
    queryKey: meKeys.homeFeed(uid, { region, game, kind }),
    initialPageParam: null,
    queryFn: async ({ pageParam }) =>
      required(
        (
          await api.GET('/api/v1/feed', {
            params: {
              query: {
                region,
                game,
                kind,
                cursor: (pageParam as string | null) ?? undefined,
                limit: FEED_PAGE,
              },
            },
          })
        ).data
      ),
    getNextPageParam: (last) => (last.hasMore && last.nextCursor ? last.nextCursor : undefined),
    enabled: browse && ready && browsing.ready,
    staleTime: FEED_STALE_MS,
  });
}

/**
 * How many of the caller's cards are set to Public (`GET /inventory/items?markedPublic=true`, one
 * per page): step 2 of Get started. Under the inventory's keys, so every inventory change
 * refreshes it.
 */
export function usePublicCardCount(enabled = true) {
  const uid = useUid();
  return useQuery<number, ApiError>({
    queryKey: [...meKeys.inventory(uid), 'get-started-public'],
    queryFn: async () =>
      required(
        (
          await api.GET('/api/v1/inventory/items', {
            params: { query: { markedPublic: true, page: 0, size: 1 } },
          })
        ).data
      ).totalItems ?? 0,
    enabled: useIsAuthenticated() && enabled,
  });
}
