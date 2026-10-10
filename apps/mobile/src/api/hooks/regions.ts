import { useQuery } from '@tanstack/react-query';

import { useAccount } from '@/src/account/AccountProvider';
import { DEFAULT_REGION } from '@/src/lib/place';

import type { ApiError } from '../ApiError';
import { api, required } from '../client';
import { publicKeys } from '../queryKeys';
import type { RegionsResponse } from '../types';

/**
 * `GET /api/v1/regions` (public, cached server side): the three platform regions with their
 * countries and ISO 3166-2 subdivisions, for the location pickers (ADR 0017). Kept for the session.
 */
export function useRegions() {
  return useQuery<RegionsResponse, ApiError>({
    queryKey: publicKeys.regions,
    queryFn: async () => required((await api.GET('/api/v1/regions')).data),
    staleTime: 60 * 60_000,
  });
}

/**
 * The platform region every region-scoped call sends (search, card holders, suggestions, ads): the
 * signed-in collector's home region (`homeRegion` of `GET /me`), else `americas-north`. The app has
 * no region switcher yet (follow-up), so the home region is the one browsed.
 */
export function useHomeRegion(): string {
  return useAccount().me?.homeRegion ?? DEFAULT_REGION;
}
