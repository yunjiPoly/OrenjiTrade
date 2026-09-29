/**
 * TanStack Query keys shared by hooks, the API client (account signals) and the session
 * provider (invalidation on auth changes). Kept dependency-free to avoid import cycles.
 */

export const ME_QUERY_KEY = ['me'] as const;

/** `GET /api/v1/me` is cached per Firebase uid so a different sign-in never sees stale data. */
export function meQueryKey(uid: string | null) {
  return [...ME_QUERY_KEY, uid ?? 'anonymous'] as const;
}

export const LEGAL_DOCUMENTS_QUERY_KEY = ['public', 'legal-documents'] as const;
