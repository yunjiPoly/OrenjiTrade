import { useGlobalSearchParams, usePathname, useRouter, useSegments, type Href } from 'expo-router';
import { useCallback } from 'react';

import { guestReturnHref, usePendingLink } from '@/src/account/pendingLink';
import { afterModals } from '@/src/components/ui/modalTurns';

/**
 * Sign in and Create account from a guest's screen (stage R15): the screen is remembered first
 * (memory only, `PendingLinkStore` without an owner), so once the account is ready the phone goes
 * back to it (`useAuthGate`), and the guest's action finishes there (`PendingActionRunner`).
 *
 * Create account opens on top of Sign in, so its back leads to Sign in and Sign in's close button
 * back to the guest's screen. Both wait for a sheet on screen to be gone first (iOS dismisses a
 * modal's view controller for a moment after it has slid away).
 */
export function useGuestEntry() {
  const router = useRouter();
  const segments = useSegments();
  const pathname = usePathname();
  const params = useGlobalSearchParams();

  const remember = useCallback(() => {
    const href = guestReturnHref(segments, pathname, params);
    if (href) {
      usePendingLink.getState().set(href, null);
    }
  }, [params, pathname, segments]);

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
