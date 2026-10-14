import { useQuery } from '@tanstack/react-query';

import type { ApiError } from '../ApiError';
import { api, required } from '../client';
import { meKeys } from '../queryKeys';
import type { MyLimits } from '../types';
import { useIsAuthenticated, useUid } from './useUid';

/**
 * `GET /api/v1/me/limits`: the usage limits, the same for every collector, with the caller's usage
 * of the current window. `fresh` re-reads them when a screen opens.
 */
export function useMyLimits({
  fresh = false,
  enabled = true,
}: { fresh?: boolean; enabled?: boolean } = {}) {
  const uid = useUid();
  const authenticated = useIsAuthenticated();
  return useQuery<MyLimits, ApiError>({
    queryKey: meKeys.limits(uid),
    queryFn: async () => required((await api.GET('/api/v1/me/limits')).data),
    enabled: authenticated && enabled,
    staleTime: fresh ? 0 : 10 * 60_000,
  });
}
