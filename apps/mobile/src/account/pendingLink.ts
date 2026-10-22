import { create } from 'zustand';

/**
 * The app link a signed-out visitor opened (a collector profile, a card, a conversation, ...):
 * the gate sends them to sign-in first and reopens it once their account is ready. Not persisted:
 * it only lives for this run of the app.
 *
 * A link kept for a signed-in collector (sent to Review our terms or to the welcome, or whose
 * session ended) belongs to them: `owner` is their uid, and it never opens for another account
 * signing in on the same phone (it may hold their search text, a place, a conversation). A link
 * opened while signed out has no owner and opens for whoever signs in.
 */
export interface PendingLinkStore {
  href: string | null;
  /** The uid of the collector whose screen it was; null for a link opened while signed out. */
  owner: string | null;
  set: (href: string, owner?: string | null) => void;
  /** The link for the collector `uid` (null when none, or another account's), cleared either way. */
  take: (uid: string | null) => string | null;
  clear: () => void;
}

export const usePendingLink = create<PendingLinkStore>()((set, get) => ({
  href: null,
  owner: null,
  set: (href, owner = null) => set({ href, owner }),
  take: (uid) => {
    const { href, owner } = get();
    set({ href: null, owner: null });
    return href !== null && (owner === null || owner === uid) ? href : null;
  },
  clear: () => set({ href: null, owner: null }),
}));

/** Route roots that never come back after sign-in (auth, account states, legal). */
const NOT_RESUMED = new Set([
  '(auth)',
  '(account)',
  'onboarding',
  'legal',
  '+not-found',
  '_sitemap',
]);

/**
 * The tabs' home: `/` (the old Map tab, which redirects) and `/search` (the first tab since stage
 * R5). Reopened only with link parameters (`/?region=&subdivision=`, `/search?segment=…`): without
 * them they are where the app starts anyway, and remembered they took a collector out of the
 * onboarding the moment their profile was saved.
 */
const HOME_LINK_PARAMS: Readonly<Record<string, readonly string[]>> = {
  '/': ['region', 'subdivision'],
  '/search': ['region', 'subdivision', 'segment', 'tab', 'q', 'game', 'typing', 'place'],
};

/**
 * The href to reopen after sign-in for the route the visitor is on (`pathname` from
 * `usePathname()`, `params` from `useGlobalSearchParams()`), or null when there is nothing worth
 * reopening (the tabs' home without a map link, auth and account screens). Dynamic segments
 * already in the path are not repeated as query parameters.
 */
export function resumableHref(
  segments: readonly string[],
  pathname: string,
  params: Readonly<Record<string, string | string[] | undefined>>
): string | null {
  const root = segments[0] ?? '(tabs)';
  if (NOT_RESUMED.has(root) || !pathname.startsWith('/')) {
    return null;
  }
  const homeParams = HOME_LINK_PARAMS[pathname];
  if (homeParams && !homeParams.some((key) => params[key])) {
    return null;
  }
  const pathParts = new Set(pathname.split('/').filter(Boolean).map(decodeURIComponent));
  const query = new URLSearchParams();
  for (const [key, raw] of Object.entries(params)) {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value && !pathParts.has(value)) {
      query.set(key, value);
    }
  }
  const search = query.toString();
  return search ? `${pathname}?${search}` : pathname;
}
