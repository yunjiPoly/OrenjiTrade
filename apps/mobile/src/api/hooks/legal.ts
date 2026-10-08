import { useQuery } from '@tanstack/react-query';

import type { ApiError } from '../ApiError';
import { api, required } from '../client';
import { publicKeys } from '../queryKeys';
import type { LegalDocument } from '../types';

/** `GET /api/v1/public/legal/documents`: current versions of every legal document. */
export async function fetchLegalDocuments(): Promise<LegalDocument[]> {
  const { data } = await api.GET('/api/v1/public/legal/documents');
  return required(data);
}

export function useLegalDocuments() {
  return useQuery<LegalDocument[], ApiError>({
    queryKey: publicKeys.legalDocuments,
    queryFn: fetchLegalDocuments,
    staleTime: 60 * 60_000,
  });
}
