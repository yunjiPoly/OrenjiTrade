/**
 * TanStack Query keys (one place, dependency-free so hooks, the session and the account provider
 * can share them without import cycles).
 *
 * Conventions:
 * - everything owned by the signed-in collector lives under `['me', uid, ...]`, so a sign-out
 *   or a user switch drops it with one `removeQueries({ queryKey: ['me'] })`;
 * - public data (legal documents, games, tags, other collectors) is keyed by what identifies it;
 * - mutations invalidate the narrowest key they change, plus `meKeys.account(uid)` when the
 *   onboarding flags, name or avatar may change.
 */
export const ME_ROOT = ['me'] as const;

type Uid = string | null | undefined;

const uidKey = (uid: Uid) => uid ?? 'anonymous';

export const meKeys = {
  all: ME_ROOT,
  user: (uid: Uid) => [...ME_ROOT, uidKey(uid)] as const,
  account: (uid: Uid) => [...ME_ROOT, uidKey(uid), 'account'] as const,
  profile: (uid: Uid) => [...ME_ROOT, uidKey(uid), 'profile'] as const,
  location: (uid: Uid) => [...ME_ROOT, uidKey(uid), 'location'] as const,
  privacy: (uid: Uid) => [...ME_ROOT, uidKey(uid), 'privacy'] as const,
  notifications: (uid: Uid) => [...ME_ROOT, uidKey(uid), 'notifications'] as const,
  deletionRequests: (uid: Uid) => [...ME_ROOT, uidKey(uid), 'deletion-requests'] as const,
};

export const publicKeys = {
  meta: ['meta'] as const,
  legalDocuments: ['public', 'legal-documents'] as const,
  games: ['public', 'games'] as const,
  tags: (query: string) => ['tags', query] as const,
  collector: (handle: string) => ['collectors', handle] as const,
};
