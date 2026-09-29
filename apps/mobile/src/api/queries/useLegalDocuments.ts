import type { LegalDocument } from '@orenji/shared-types';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';

import { ApiError } from '../ApiError';
import { api, type ApiClient } from '../client';
import { LEGAL_DOCUMENTS_QUERY_KEY } from './keys';

export { LEGAL_DOCUMENTS_QUERY_KEY };

/** `GET /api/v1/public/legal/documents` — current versions of every legal document. */
export async function fetchLegalDocuments(client: ApiClient = api): Promise<LegalDocument[]> {
  const { data } = await client.GET('/api/v1/public/legal/documents');
  if (data === undefined) {
    throw new ApiError({ status: 0, errorCode: 'EMPTY_RESPONSE', message: 'Empty response' });
  }
  return data;
}

export type UseLegalDocumentsOptions = Omit<
  UseQueryOptions<LegalDocument[], ApiError, LegalDocument[], typeof LEGAL_DOCUMENTS_QUERY_KEY>,
  'queryKey' | 'queryFn'
> & { client?: ApiClient };

export function useLegalDocuments(options: UseLegalDocumentsOptions = {}) {
  const { client = api, ...queryOptions } = options;
  return useQuery<LegalDocument[], ApiError, LegalDocument[], typeof LEGAL_DOCUMENTS_QUERY_KEY>({
    queryKey: LEGAL_DOCUMENTS_QUERY_KEY,
    queryFn: () => fetchLegalDocuments(client),
    staleTime: 60 * 60_000,
    ...queryOptions,
  });
}

/** Documents that must be accepted when creating an account. */
export function requiredAtRegistration(documents: readonly LegalDocument[]): LegalDocument[] {
  return documents.filter((document) => document.requiredAtRegistration);
}
