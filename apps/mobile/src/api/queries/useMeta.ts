import type { MetaResponse } from '@orenji/shared-types';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';

import { ApiError } from '../ApiError';
import { api } from '../client';

export const metaQueryKey = ['meta'] as const;

export async function fetchMeta(): Promise<MetaResponse> {
  const { data } = await api.GET('/api/v1/meta');
  if (data === undefined) {
    // Unreachable in practice: the middleware throws for every non-2xx response.
    throw new ApiError({ status: 0, errorCode: 'EMPTY_RESPONSE', message: 'Empty response' });
  }
  return data;
}

type MetaQueryOptions = Omit<
  UseQueryOptions<MetaResponse, ApiError, MetaResponse, typeof metaQueryKey>,
  'queryKey' | 'queryFn'
>;

/** `GET /api/v1/meta` — public build/environment metadata; shown on the Profile tab. */
export function useMeta(options: MetaQueryOptions = {}) {
  return useQuery<MetaResponse, ApiError, MetaResponse, typeof metaQueryKey>({
    queryKey: metaQueryKey,
    queryFn: fetchMeta,
    staleTime: 5 * 60_000,
    ...options,
  });
}
