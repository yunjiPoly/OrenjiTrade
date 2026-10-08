import { create } from 'zustand';

/**
 * The app link a signed-out visitor opened (a collector profile, a card, a conversation, ...):
 * the gate sends them to sign-in first and reopens it once their account is ready. Not persisted:
 * it only lives for this run of the app.
 */
export interface PendingLinkStore {
  href: string | null;
  set: (href: string) => void;
  clear: () => void;
}

export const usePendingLink = create<PendingLinkStore>()((set) => ({
  href: null,
  set: (href) => set({ href }),
  clear: () => set({ href: null }),
}));

/** Route roots that never come back after sign-in (auth, account states, legal, the map home). */
const NOT_RESUMED = new Set([
  '(auth)',
  '(account)',
  'onboarding',
  'legal',
  '+not-found',
  '_sitemap',
]);

/**
 * The href to reopen after sign-in for the route the visitor is on (`pathname` from
 * `usePathname()`, `params` from `useGlobalSearchParams()`), or null when there is nothing worth
 * reopening (the tabs' home, auth and account screens). Dynamic segments already in the path are
 * not repeated as query parameters.
 */
export function resumableHref(
  segments: readonly string[],
  pathname: string,
  params: Readonly<Record<string, string | string[] | undefined>>
): string | null {
  const root = segments[0] ?? '(tabs)';
  if (NOT_RESUMED.has(root) || !pathname.startsWith('/') || pathname === '/') {
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
