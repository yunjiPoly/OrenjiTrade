import { useQuery } from '@tanstack/react-query';

import type { ApiError } from '../ApiError';
import { api, required } from '../client';
import { meKeys } from '../queryKeys';
import type { MyPlan } from '../types';
import { useIsAuthenticated, useUid } from './useUid';

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
