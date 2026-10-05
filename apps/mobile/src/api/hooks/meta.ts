import { useQuery } from '@tanstack/react-query';

import type { ApiError } from '../ApiError';
import { api, required } from '../client';
import { publicKeys } from '../queryKeys';
import type { MetaResponse } from '../types';

export async function fetchMeta(): Promise<MetaResponse> {
  const { data } = await api.GET('/api/v1/meta');
  return required(data);
}

/** `GET /api/v1/meta`: public build/environment metadata (Settings → About). */
export function useMeta() {
  return useQuery<MetaResponse, ApiError>({
    queryKey: publicKeys.meta,
    queryFn: fetchMeta,
    staleTime: 5 * 60_000,
  });
}
