import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import type { ApiError } from '../ApiError';
import { api, required } from '../client';
import { meKeys } from '../queryKeys';
import type {
  CollectorProfileResponse,
  CollectorRatingsPage,
  PublicBinderSummary,
  PublicInventoryPage,
  ReferencePage,
} from '../types';
import { useIsAuthenticated, useUid } from './useUid';

/** Ratings per page on a profile ("Show more ratings" loads the next cursor page). */
export const RATINGS_PAGE_SIZE = 5;
/** References per page ("Show more references"). */
export const REFERENCES_PAGE_SIZE = 10;
/** Public cards shown on a profile (the rest are in the binders). */
export const PUBLIC_ITEMS_PREVIEW = 8;

/**
 * `GET /api/v1/collectors/{handle}`: a public profile as the caller sees it (the owner's own
 * "public preview"). Members only (401 signed out); 404 for unknown, PRIVATE, suspended or
 * deleted collectors alike. Location is a label, a 3-decimal public point and a bucketed
 * distance; the point is only ever drawn as a 3 km zone, never as text.
 */
export function useCollectorProfile(handle: string | null | undefined) {
  const uid = useUid();
  const authenticated = useIsAuthenticated();
  return useQuery<CollectorProfileResponse, ApiError>({
    queryKey: meKeys.collector(uid, handle ?? ''),
    queryFn: async () =>
      required(
        (
          await api.GET('/api/v1/collectors/{handle}', {
            params: { path: { handle: handle ?? '' } },
          })
        ).data
      ),
    enabled: !!handle && authenticated,
  });
}

/** `GET /api/v1/collectors/{handle}/binders`: the collector's public binders (first = "View public binder"). */
export function useCollectorBinders(handle: string | null | undefined, enabled = true) {
  const uid = useUid();
  return useQuery<PublicBinderSummary[], ApiError>({
    queryKey: meKeys.collectorPart(uid, handle ?? '', 'binders'),
    queryFn: async () =>
      required(
        (
          await api.GET('/api/v1/collectors/{handle}/binders', {
            params: { path: { handle: handle ?? '' } },
          })
        ).data
      ),
    enabled: !!handle && enabled,
  });
}

/** `GET /api/v1/collectors/{handle}/inventory`: the first public cards across binders. */
export function useCollectorPublicItems(handle: string | null | undefined, enabled = true) {
  const uid = useUid();
  return useQuery<PublicInventoryPage, ApiError>({
    queryKey: meKeys.collectorPart(uid, handle ?? '', 'items'),
    queryFn: async () =>
      required(
        (
          await api.GET('/api/v1/collectors/{handle}/inventory', {
            params: { path: { handle: handle ?? '' }, query: { size: PUBLIC_ITEMS_PREVIEW } },
          })
        ).data
      ),
    enabled: !!handle && enabled,
  });
}

/** `GET /api/v1/collectors/{handle}/ratings`: the summary and the ratings, cursor pages. */
export function useCollectorRatings(handle: string | null | undefined, enabled = true) {
  const uid = useUid();
  return useInfiniteQuery<CollectorRatingsPage, ApiError>({
    queryKey: meKeys.collectorPart(uid, handle ?? '', 'ratings'),
    initialPageParam: null,
    queryFn: async ({ pageParam }) =>
      required(
        (
          await api.GET('/api/v1/collectors/{handle}/ratings', {
            params: {
              path: { handle: handle ?? '' },
              query: {
                cursor: (pageParam as string | null) ?? undefined,
                limit: RATINGS_PAGE_SIZE,
              },
            },
          })
        ).data
      ),
    getNextPageParam: (last) => (last.hasMore && last.nextCursor ? last.nextCursor : undefined),
    enabled: !!handle && enabled,
  });
}

/** `GET /api/v1/collectors/{handle}/references`: written references, cursor pages. */
export function useCollectorReferences(handle: string | null | undefined, enabled = true) {
  const uid = useUid();
  return useInfiniteQuery<ReferencePage, ApiError>({
    queryKey: meKeys.collectorPart(uid, handle ?? '', 'references'),
    initialPageParam: null,
    queryFn: async ({ pageParam }) =>
      required(
        (
          await api.GET('/api/v1/collectors/{handle}/references', {
            params: {
              path: { handle: handle ?? '' },
              query: {
                cursor: (pageParam as string | null) ?? undefined,
                limit: REFERENCES_PAGE_SIZE,
              },
            },
          })
        ).data
      ),
    getNextPageParam: (last) => (last.hasMore && last.nextCursor ? last.nextCursor : undefined),
    enabled: !!handle && enabled,
  });
}
