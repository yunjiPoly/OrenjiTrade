import { useSession } from '@/src/auth/session';

/** Firebase uid of the signed-in collector (keys every `['me', uid, ...]` query). */
export function useUid(): string | null {
  return useSession().user?.uid ?? null;
}

/** True once Firebase restored a signed-in user (gates every `/me/**` query). */
export function useIsAuthenticated(): boolean {
  return useSession().status === 'authenticated';
}

/**
 * True for a signed-out visitor once Firebase has answered (stage R15, "Browse without an
 * account"): they browse Home and Search, and every member-only tab and action asks them to sign
 * in (`SignInSheet`).
 */
export function useIsGuest(): boolean {
  return useSession().status === 'anonymous';
}

/**
 * True once Firebase has answered, signed in or not: the open discovery reads (Home's feed, the
 * map's counts, card holders, deck cores, binder lists) run for guests too (stage R15). A guest
 * never sees who a collector is: the API leaves the name out.
 */
export function useCanBrowse(): boolean {
  return useSession().status !== 'loading';
}
