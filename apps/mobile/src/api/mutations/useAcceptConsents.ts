import type { ConsentRequest } from '@orenji/shared-types';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { ApiError } from '../ApiError';
import { clearAccountSignal } from '../accountState';
import { api, type ApiClient } from '../client';
import { ME_QUERY_KEY } from '../queries/keys';

/**
 * `POST /api/v1/me/consents` once per document, sequentially (the server records IP hash and
 * user agent per acceptance). Stops at the first failure so the caller can retry the rest.
 */
export async function acceptConsents(
  consents: readonly ConsentRequest[],
  client: ApiClient = api
): Promise<void> {
  for (const consent of consents) {
    await client.POST('/api/v1/me/consents', { body: consent });
  }
}

export function useAcceptConsents(client: ApiClient = api) {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, readonly ConsentRequest[]>({
    mutationFn: (consents) => acceptConsents(consents, client),
    onSuccess: async () => {
      clearAccountSignal();
      await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
    },
  });
}
