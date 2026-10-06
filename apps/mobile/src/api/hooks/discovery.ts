import { keepPreviousData, useQuery } from '@tanstack/react-query';

import {
  MAP_RADIUS_LIMIT_KEY,
  radiusCapKm,
  roundCentre,
  type NearbyParams,
} from '@/src/features/map/discovery';
import type { LatLng } from '@/src/lib/location';

import type { ApiError } from '../ApiError';
import { api, required } from '../client';
import { meKeys } from '../queryKeys';
import type { CollectorPreview, MyPlan, NearbyCollectorsResponse } from '../types';
import { usePlans } from './billing';
import { useIsAuthenticated, useUid } from './useUid';

/**
 * `GET /api/v1/collectors/nearby` (the web map's discovery call): collectors at their public
 * points (3 decimals) with distance buckets, filtered by game, intent and card. The centre is sent
 * with 2 decimals at most; `lat`/`lng` left out = the caller's own trading area (the server knows
 * it, the app never reads its private centre). Previous answers stay on the map while a pan loads.
 */
export function useNearbyCollectors(params: NearbyParams | null) {
  const uid = useUid();
  const authenticated = useIsAuthenticated();
  return useQuery<NearbyCollectorsResponse, ApiError>({
    queryKey: meKeys.nearby(uid, params ?? {}),
    queryFn: async () =>
      required(
        (await api.GET('/api/v1/collectors/nearby', { params: { query: params ?? {} } })).data
      ),
    enabled: params !== null && authenticated,
    placeholderData: keepPreviousData,
    // The server caches answers for 60 s as well.
    staleTime: 60_000,
  });
}

/**
 * `GET /api/v1/collectors/{handle}/preview`: what the map's preview sheet shows, with
 * `canMessage` / `isBlocked`. `centre` (a city the map shows, never the viewer's own area) is
 * rounded to 2 decimals before it is sent; 404 when the collector is not on the map.
 */
export function useCollectorPreview(handle: string | null, centre: LatLng | null) {
  const uid = useUid();
  const authenticated = useIsAuthenticated();
  const rounded = centre ? roundCentre(centre) : null;
  return useQuery<CollectorPreview, ApiError>({
    queryKey: meKeys.preview(uid, handle ?? '', rounded),
    queryFn: async () =>
      required(
        (
          await api.GET('/api/v1/collectors/{handle}/preview', {
            params: {
              path: { handle: handle ?? '' },
              query: rounded ? { lat: rounded.lat, lng: rounded.lng } : undefined,
            },
          })
        ).data
      ),
    enabled: !!handle && authenticated,
  });
}

/**
 * `GET /api/v1/me/plan`: the caller's plan, its limits with usage and overrides, entitlements and
 * the live subscription. `fresh` re-reads it when a screen opens (Premium, credits).
 */
export function useMyPlan({
  fresh = false,
  enabled = true,
}: { fresh?: boolean; enabled?: boolean } = {}) {
  const uid = useUid();
  const authenticated = useIsAuthenticated();
  return useQuery<MyPlan, ApiError>({
    queryKey: meKeys.plan(uid),
    queryFn: async () => required((await api.GET('/api/v1/me/plan')).data),
    enabled: authenticated && enabled,
    staleTime: fresh ? 0 : 10 * 60_000,
  });
}

/**
 * The caller's radius cap (`map.radius.max_km` of `GET /me/plan`, with overrides); the FREE value
 * of `GET /plans` when the plan cannot be read. `null` while unknown.
 */
export function useMapRadiusCap(): number | null {
  const plan = useMyPlan();
  const plans = usePlans(!!plan.error);
  const status = plan.data?.limits?.find((entry) => entry.key === MAP_RADIUS_LIMIT_KEY);
  if (status) {
    return radiusCapKm(status.limit);
  }
  if (plan.data) {
    // No such limit on the plan: unlimited.
    return radiusCapKm(null);
  }
  const free = plans.data?.find((entry) => entry.code === 'FREE') ?? plans.data?.[0];
  const limit = free?.limits?.find((entry) => entry.key === MAP_RADIUS_LIMIT_KEY);
  return limit ? radiusCapKm(limit.limit) : null;
}
