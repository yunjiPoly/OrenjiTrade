import { useQuery } from '@tanstack/react-query';

import type { ApiError } from '../ApiError';
import { api, required } from '../client';
import { meKeys } from '../queryKeys';
import type { RegionBinderCounts } from '../types';
import { useIsAuthenticated, useUid } from './useUid';

/**
 * `GET /api/v1/regions/{region}/binder-counts` (the web's `/map`): how many public binders each
 * state or province of a region holds; places without one are absent. With `game` (stage G, the
 * browsed game) only that game's binders count. A signed-in caller never counts collectors blocked
 * with them, so the answer is kept per viewer.
 */
export function useRegionBinderCounts(region: string, enabled = true, game?: string) {
  const uid = useUid();
  const authenticated = useIsAuthenticated();
  return useQuery<RegionBinderCounts, ApiError>({
    queryKey: meKeys.regionBinderCounts(uid, region, game),
    queryFn: async () =>
      required(
        (
          await api.GET('/api/v1/regions/{region}/binder-counts', {
            params: { path: { region }, query: game ? { game } : {} },
          })
        ).data
      ),
    enabled: authenticated && enabled,
    staleTime: 60_000,
  });
}
