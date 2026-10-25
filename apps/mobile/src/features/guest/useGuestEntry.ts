import { useGlobalSearchParams, usePathname, useRouter, useSegments, type Href } from 'expo-router';
import { useCallback } from 'react';

import { useGuestAction } from '@/src/account/guestAction';
import { guestReturnHref, usePendingLink } from '@/src/account/pendingLink';
import { afterModals } from '@/src/components/ui/modalTurns';

/**
 * Sign in and Create account from a guest's screen (stage R15): the screen is remembered first
 * (memory only, `PendingLinkStore` without an owner), so once the account is ready the phone goes
 * back to it (`useAuthGate`), and the guest's action finishes there (`PendingActionRunner`).
 *
 * The sheet of 71 keeps its action (`keepAction`); every other entry forgets any action left.
 *
 * Create account opens on top of Sign in, so its back leads to Sign in and Sign in's close button
 * back to the guest's screen. Both wait for a sheet on screen to be gone first (iOS dismisses a
 * modal's view controller for a moment after it has slid away).
 */
export function useGuestEntry({
  keepAction = false,
  returnParams,
}: {
  keepAction?: boolean;
  /** Link parameters added to the screen remembered (a segment kept in a screen's state). */
  returnParams?: Readonly<Record<string, string>>;
} = {}) {
  const router = useRouter();
  const segments = useSegments();
  const pathname = usePathname();
  const params = useGlobalSearchParams();

  const remember = useCallback(() => {
    // Only the sheet keeps the action it was opened for: the person button, Home's card and the
    // guest pages sign in for nothing in particular, so an action left from a Sign in closed
    // with a swipe never finishes later by surprise.
    if (!keepAction) {
      useGuestAction.getState().dismiss();
    }
    const href = guestReturnHref(segments, pathname, { ...params, ...returnParams });
    if (href) {
      usePendingLink.getState().set(href, null);
    }
  }, [keepAction, params, pathname, returnParams, segments]);

  const signIn = useCallback(async () => {
    remember();
    await afterModals();
    router.push('/sign-in' as Href);
  }, [remember, router]);

  const createAccount = useCallback(async () => {
    remember();
    await afterModals();
    router.push('/sign-in' as Href);
    router.push('/sign-up' as Href);
  }, [remember, router]);

  return { signIn, createAccount };
}
