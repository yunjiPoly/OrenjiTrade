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
  /** The caller's plan (`GET /me/plan`: limits such as `map.radius.max_km`). */
  plan: (uid: Uid) => [...ME_ROOT, uidKey(uid), 'plan'] as const,
  /**
   * Map discovery as this viewer sees it (distance buckets, blocks and visibility depend on who
   * asks): `GET /collectors/nearby` answers and previews.
   */
  discovery: (uid: Uid) => [...ME_ROOT, uidKey(uid), 'discovery'] as const,
  nearby: (uid: Uid, params: object) =>
    [...ME_ROOT, uidKey(uid), 'discovery', 'nearby', params] as const,
  preview: (uid: Uid, handle: string, centre: object | null) =>
    [...ME_ROOT, uidKey(uid), 'discovery', 'preview', handle, centre] as const,
  /** Another collector as this viewer sees them: profile, binders, cards, ratings, references. */
  collector: (uid: Uid, handle: string) =>
    [...ME_ROOT, uidKey(uid), 'collectors', handle.toLowerCase()] as const,
  collectorPart: (uid: Uid, handle: string, part: 'binders' | 'items' | 'ratings' | 'references') =>
    [...ME_ROOT, uidKey(uid), 'collectors', handle.toLowerCase(), part] as const,
  /** Conversations (Phase 5): every read below (prefix), the inbox, one conversation, messages. */
  conversations: (uid: Uid) => [...ME_ROOT, uidKey(uid), 'conversations'] as const,
  conversationList: (uid: Uid) => [...ME_ROOT, uidKey(uid), 'conversations', 'list'] as const,
  conversation: (uid: Uid, id: string) =>
    [...ME_ROOT, uidKey(uid), 'conversations', 'one', id] as const,
  /** Every thread's messages (prefix). */
  allMessages: (uid: Uid) => [...ME_ROOT, uidKey(uid), 'conversations', 'messages'] as const,
  messages: (uid: Uid, id: string) =>
    [...ME_ROOT, uidKey(uid), 'conversations', 'messages', id] as const,
  /** Collectors the caller blocked (`GET /me/blocks`). */
  blocks: (uid: Uid) => [...ME_ROOT, uidKey(uid), 'blocks'] as const,
  /**
   * Community (Phase 5) as this viewer sees it (blocks hide authors both ways, `canEdit`):
   * channels with 24 h counts, a channel's posts, a post's replies.
   */
  community: (uid: Uid) => [...ME_ROOT, uidKey(uid), 'community'] as const,
  communityChannels: (uid: Uid) => [...ME_ROOT, uidKey(uid), 'community', 'channels'] as const,
  communityPosts: (uid: Uid, slug: string) =>
    [...ME_ROOT, uidKey(uid), 'community', 'posts', slug] as const,
  communityReplies: (uid: Uid, postId: string) =>
    [...ME_ROOT, uidKey(uid), 'community', 'replies', postId] as const,
  /** Wishlist (Phase 6): every read (prefix), the list, one wish's matches. */
  wishlist: (uid: Uid) => [...ME_ROOT, uidKey(uid), 'wishlist'] as const,
  wishlistItems: (uid: Uid) => [...ME_ROOT, uidKey(uid), 'wishlist', 'items'] as const,
  wishMatches: (uid: Uid, id: string) =>
    [...ME_ROOT, uidKey(uid), 'wishlist', 'matches', id] as const,
  /** Notification centre (Phase 6): every read (prefix), the unread count, the feeds. */
  notificationCentre: (uid: Uid) => [...ME_ROOT, uidKey(uid), 'notification-centre'] as const,
  notificationUnread: (uid: Uid) =>
    [...ME_ROOT, uidKey(uid), 'notification-centre', 'unread-count'] as const,
  notificationFeeds: (uid: Uid) =>
    [...ME_ROOT, uidKey(uid), 'notification-centre', 'feed'] as const,
  notificationFeed: (uid: Uid, unreadOnly: boolean) =>
    [...ME_ROOT, uidKey(uid), 'notification-centre', 'feed', { unreadOnly }] as const,
  /** Every collector read of this viewer (profiles, their ratings and references; prefix). */
  collectors: (uid: Uid) => [...ME_ROOT, uidKey(uid), 'collectors'] as const,
  /** Ratings (Phase 7): what the caller may still rate about one collector. */
  ratingEligibility: (uid: Uid, userId: string) =>
    [...ME_ROOT, uidKey(uid), 'rating-eligibility', userId] as const,
  /** The caller's collector reports (`GET /me/reports`). */
  reports: (uid: Uid) => [...ME_ROOT, uidKey(uid), 'reports'] as const,
  /** Offers (Phase 8): every read (prefix), an inbox page set per query, one proposal. */
  offers: (uid: Uid) => [...ME_ROOT, uidKey(uid), 'offers'] as const,
  offerList: (uid: Uid, query: object) =>
    [...ME_ROOT, uidKey(uid), 'offers', 'list', query] as const,
  offer: (uid: Uid, id: string) => [...ME_ROOT, uidKey(uid), 'offers', 'one', id] as const,
  offerSettings: (uid: Uid) => [...ME_ROOT, uidKey(uid), 'offer-settings'] as const,
  /** Trades (Phase 8): every read (prefix), a list per filter, one trade. */
  trades: (uid: Uid) => [...ME_ROOT, uidKey(uid), 'trades'] as const,
  tradeList: (uid: Uid, filter: string) =>
    [...ME_ROOT, uidKey(uid), 'trades', 'list', filter] as const,
  trade: (uid: Uid, id: string) => [...ME_ROOT, uidKey(uid), 'trades', 'one', id] as const,
  /** Payment protection (Phase 9): the caller's payout account (`GET /me/seller-account`). */
  sellerAccount: (uid: Uid) => [...ME_ROOT, uidKey(uid), 'seller-account'] as const,
  /** Disputes of the caller's protected trades: every read (prefix), one dispute. */
  disputes: (uid: Uid) => [...ME_ROOT, uidKey(uid), 'disputes'] as const,
  dispute: (uid: Uid, id: string) => [...ME_ROOT, uidKey(uid), 'disputes', 'one', id] as const,
  /** An evidence file of a dispute (fetched with the ID token, shown from memory). */
  evidenceFile: (uid: Uid, disputeId: string, evidenceId: string) =>
    [...ME_ROOT, uidKey(uid), 'disputes', 'file', disputeId, evidenceId] as const,
  /**
   * A local fake provider checkout (`payment`: a protected trade, `billing`: a subscription,
   * `donation`: a donation), the caller's own only.
   */
  checkout: (uid: Uid, kind: 'payment' | 'billing' | 'donation', ref: string) =>
    [...ME_ROOT, uidKey(uid), 'checkout', kind, ref] as const,
  /** Credits (Phase 10): every read (prefix), the ledger pages, the referral code. */
  credits: (uid: Uid) => [...ME_ROOT, uidKey(uid), 'credits'] as const,
  creditLedger: (uid: Uid) => [...ME_ROOT, uidKey(uid), 'credits', 'ledger'] as const,
  referral: (uid: Uid) => [...ME_ROOT, uidKey(uid), 'credits', 'referral'] as const,
  /** The caller's donations (`GET /me/donations`). */
  donations: (uid: Uid) => [...ME_ROOT, uidKey(uid), 'donations'] as const,
  /**
   * Sponsored placements served to this viewer (targeting and the plan depend on who asks):
   * every placement (prefix), one placement for a game and a plan.
   */
  ads: (uid: Uid) => [...ME_ROOT, uidKey(uid), 'ads'] as const,
  adSlot: (uid: Uid, placement: string, game: string | null, plan: string | null) =>
    [...ME_ROOT, uidKey(uid), 'ads', placement, game ?? '', plan ?? ''] as const,
};

export const publicKeys = {
  meta: ['meta'] as const,
  legalDocuments: ['public', 'legal-documents'] as const,
  games: ['public', 'games'] as const,
  tags: (query: string) => ['tags', query] as const,
  /** The plans and their limits (`GET /plans`). */
  plans: ['public', 'plans'] as const,
  /**
   * Public feature flags (`GET /public/feature-flags`: `publicChat`, `protectedPayments`, ...),
   * evaluated for the signed-in collector (partial rollouts), so keyed by who asks.
   */
  featureFlags: (uid: Uid) => ['public', 'feature-flags', uidKey(uid)] as const,
  /** The public supporters wall (`GET /public/donations/supporters`). */
  supporters: ['public', 'donations', 'supporters'] as const,
  /** The reasons of the "Report collector" dialog (`GET /public/report-reasons`). */
  reportReasons: ['public', 'report-reasons'] as const,
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
