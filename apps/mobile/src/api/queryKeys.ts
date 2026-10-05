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
  /** Every inventory read (items, one item, summary): invalidated by any inventory write. */
  inventory: (uid: Uid) => [...ME_ROOT, uidKey(uid), 'inventory'] as const,
  inventoryItems: (uid: Uid, filters: object) =>
    [...ME_ROOT, uidKey(uid), 'inventory', 'items', filters] as const,
  inventoryItem: (uid: Uid, id: string) =>
    [...ME_ROOT, uidKey(uid), 'inventory', 'item', id] as const,
  inventorySummary: (uid: Uid) => [...ME_ROOT, uidKey(uid), 'inventory', 'summary'] as const,
  /** Every binder read (list, one binder, its items): invalidated by binder and item writes. */
  binders: (uid: Uid) => [...ME_ROOT, uidKey(uid), 'binders'] as const,
  binderList: (uid: Uid) => [...ME_ROOT, uidKey(uid), 'binders', 'list'] as const,
  binder: (uid: Uid, id: string) => [...ME_ROOT, uidKey(uid), 'binders', 'one', id] as const,
  binderItems: (uid: Uid, id: string, filters: object) =>
    [...ME_ROOT, uidKey(uid), 'binders', 'items', id, filters] as const,
  listingStatus: (uid: Uid) => [...ME_ROOT, uidKey(uid), 'listing-status'] as const,
};

export const publicKeys = {
  meta: ['meta'] as const,
  legalDocuments: ['public', 'legal-documents'] as const,
  games: ['public', 'games'] as const,
  tags: (query: string) => ['tags', query] as const,
  collector: (handle: string) => ['collectors', handle] as const,
  /** A public binder as one viewer sees it (the owner block's distance bucket depends on them). */
  publicBinder: (id: string, uid: Uid) => ['public', 'binders', id, uidKey(uid)] as const,
  publicBinderItems: (id: string, uid: Uid, filters: object) =>
    ['public', 'binders', id, uidKey(uid), 'items', filters] as const,
};

/** The card catalog (public, the same for every caller). */
export const catalogKeys = {
  all: ['catalog'] as const,
  cards: (params: object) => ['catalog', 'cards', params] as const,
  suggest: (query: string) => ['catalog', 'suggest', query] as const,
  card: (id: string) => ['catalog', 'card', id] as const,
  sets: (game: string) => ['catalog', 'sets', game] as const,
};
