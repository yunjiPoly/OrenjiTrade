import { useQuery } from '@tanstack/react-query';

import type { ApiError } from '../ApiError';
import { api, required } from '../client';
import { publicKeys } from '../queryKeys';
import type { CollectorProfileResponse } from '../types';

/**
 * `GET /api/v1/collectors/{handle}`: a public profile as the caller sees it (the owner's own
 * "public preview"). Location is a label + bucketed distance only; the public point is never
 * rendered as coordinates.
 */
export function useCollectorProfile(handle: string | null | undefined) {
  return useQuery<CollectorProfileResponse, ApiError>({
    queryKey: publicKeys.collector(handle ?? ''),
    queryFn: async () =>
      required(
        (
          await api.GET('/api/v1/collectors/{handle}', {
            params: { path: { handle: handle ?? '' } },
          })
        ).data
      ),
    enabled: !!handle,
  });
}
