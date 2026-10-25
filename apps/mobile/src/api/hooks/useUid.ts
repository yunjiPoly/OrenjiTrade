import { useFlowLock } from '@/src/account/flowLock';
import { useSession } from '@/src/auth/session';

/** Firebase uid of the signed-in collector (keys every `['me', uid, ...]` query). */
export function useUid(): string | null {
  return useSession().user?.uid ?? null;
}

/**
 * True while sign-up is creating the account (it holds the flow lock from the Firebase user's
 * creation to the consents): no read may go out meanwhile. The first call with the new token
 * provisions the account from its claims, and the display name the collector chose is only in
 * the token once sign-up refreshed it; since stage R15 Home, Search or a card page of the guest
 * stay mounted under Sign up and would otherwise ask first.
 */
function useSignUpHolds(): boolean {
  return useFlowLock((store) => store.lockedBy === 'sign-up');
}

/** True once Firebase restored a signed-in user (gates every `/me/**` query). */
export function useIsAuthenticated(): boolean {
  const holds = useSignUpHolds();
  return useSession().status === 'authenticated' && !holds;
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
 * never sees who a collector is: the API leaves the name out. Not while sign-up holds (above).
 */
export function useCanBrowse(): boolean {
  const holds = useSignUpHolds();
  return useSession().status !== 'loading' && !holds;
}
