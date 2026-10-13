import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import type { ApiError } from '../ApiError';
import { api, required } from '../client';
import { meKeys } from '../queryKeys';
import type { PublicBinderCursorPage, RegionBinderCounts } from '../types';
import { useIsAuthenticated, useUid } from './useUid';

/** Binders per page of a state or province (the API allows 1 to 50; the web asks for 20 too). */
export const SUBDIVISION_BINDERS_PAGE = 20;

/**
 * `GET /api/v1/regions/{region}/binder-counts` (the web's `/map`): how many public binders each
 * state or province of a region holds; places without one are absent. A signed-in caller never
 * counts collectors blocked with them, so the answer is kept per viewer.
 */
export function useRegionBinderCounts(region: string, enabled = true) {
  const uid = useUid();
  const authenticated = useIsAuthenticated();
  return useQuery<RegionBinderCounts, ApiError>({
    queryKey: meKeys.regionBinderCounts(uid, region),
    queryFn: async () =>
      required(
        (await api.GET('/api/v1/regions/{region}/binder-counts', { params: { path: { region } } }))
          .data
      ),
    enabled: authenticated && enabled,
    staleTime: 60_000,
  });
}

/**
 * `GET /api/v1/regions/{region}/subdivisions/{code}/binders`: the public binders of the
 * discoverable collectors of one state or province, most recently updated first, by cursor. Each
 * binder names its owner and the owner's state or province and country, never a city.
 */
export function useSubdivisionBinders(region: string | null, code: string | null) {
  const uid = useUid();
  const authenticated = useIsAuthenticated();
  return useInfiniteQuery<PublicBinderCursorPage, ApiError>({
    queryKey: meKeys.subdivisionBinders(uid, region ?? '', code ?? ''),
    initialPageParam: null,
    queryFn: async ({ pageParam }) =>
      required(
        (
          await api.GET('/api/v1/regions/{region}/subdivisions/{code}/binders', {
            params: {
              path: { region: region ?? '', code: code ?? '' },
              query: {
                cursor: (pageParam as string | null) ?? undefined,
                limit: SUBDIVISION_BINDERS_PAGE,
              },
            },
          })
        ).data
      ),
    getNextPageParam: (last) => (last.hasMore && last.nextCursor ? last.nextCursor : undefined),
    enabled: authenticated && region !== null && code !== null,
    staleTime: 60_000,
  });
}
