import { useQuery } from '@tanstack/react-query';

import { PLATFORM_REGION_NAMES } from '@/src/lib/place';

import type { ApiError } from '../ApiError';
import { api, required } from '../client';
import { publicKeys } from '../queryKeys';
import type { RegionsResponse } from '../types';

/**
 * `GET /api/v1/regions` (public, cached server side): the three platform regions with their
 * countries and ISO 3166-2 subdivisions, for the location pickers and the map's list of states
 * and provinces (ADR 0017). Kept for the session.
 */
export function useRegions(enabled = true) {
  return useQuery<RegionsResponse, ApiError>({
    queryKey: publicKeys.regions,
    queryFn: async () => required((await api.GET('/api/v1/regions')).data),
    enabled,
    staleTime: 60 * 60_000,
  });
}

export interface RegionOption {
  code: string;
  name: string;
}

/**
 * The regions the switcher offers: the server's names when `GET /regions` was already read in
 * this session, the built-in names otherwise (the three regions are fixed). Asks nothing itself.
 */
export function useRegionOptions(): RegionOption[] {
  const loaded = useRegions(false).data?.regions;
  if (loaded && loaded.length > 0) {
    return loaded.map((region) => ({ code: region.code, name: region.name }));
  }
  return Object.entries(PLATFORM_REGION_NAMES).map(([code, name]) => ({ code, name }));
}
