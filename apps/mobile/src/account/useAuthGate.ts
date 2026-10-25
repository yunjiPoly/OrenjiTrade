import {
  useGlobalSearchParams,
  usePathname,
  useRootNavigationState,
  useRouter,
  useSegments,
  type Href,
} from 'expo-router';
import { useEffect, useRef } from 'react';

import { useSession } from '@/src/auth/session';
import { useSessionNotice } from '@/src/auth/sessionNotice';

import { useAccount } from './AccountProvider';
import { useFlowLock } from './flowLock';
import { GATE_HOME, SIGN_IN_HREF, gateFor, redirectFor, type Gate } from './gate';
import { useGuestAction } from './guestAction';
import { resumableHref, usePendingLink } from './pendingLink';

/** The gates of a signed-in collector: leaving one for `guest` is a sign-out. */
const SIGNED_IN_GATES: ReadonlySet<Gate> = new Set([
  'consent',
  'suspended',
  'error',
  'onboarding',
  'app',
]);

/**
 * The expo-router auth gate: computes the gate from the session + `/me` and replaces the current
 * route whenever it is not allowed (consent required → consent, suspended or deletion pending →
 * account status, unfinished profile → onboarding, otherwise the tabs).
 *
 * Signed out, the app is browsed as a guest (stage R15, "Browse without an account"): Home, Search
 * and the public pages stay; a member-only screen (a deep link to a chat, a profile, a
 * notification) opens Sign in and is remembered, to open once the account is ready. Sign in and
 * Create account opened from a guest screen remember that screen too (`useGuestEntry`):
 * once signed in, the phone goes back to it (`router.dismissTo`, which pops back to it when it is
 * still in the stack) and `PendingActionRunner` finishes what the guest tried to do.
 *
 * An explicit sign-out remembers nothing, not even the link kept while Review our terms or the
 * welcome was asked (stage R12's review fix 1), and lands on Home as a guest. A session that ended
 * on its own opens Sign in, and the screen it ended on is kept for that collector only
 * (`PendingLinkStore.owner`). The welcome takes the link itself when it ends: the gate never
 * pushes it on top of the welcome (its second step completes the account while the third is
 * still to come).
 */
export function useAuthGate(): Gate {
  const account = useAccount();
  const uid = useSession().user?.uid ?? null;
  const segments = useSegments();
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const router = useRouter();
  const navigationState = useRootNavigationState();
  const flowLocked = useFlowLock((store) => store.lockedBy !== null);
  const gate = gateFor(account.status, account.needsOnboarding);
  const previousGate = useRef<Gate>('boot');
  const latest = useRef({ pathname, params });
  // The last signed-in collector: the owner of the screen a session that ended leaves behind.
  const lastUid = useRef<string | null>(null);
  // Declared before the gate effect, so it runs first after each render.
  useEffect(() => {
    latest.current = { pathname, params };
    if (uid) {
      lastUid.current = uid;
    }
  });

  const path = segments.join('/');
  useEffect(() => {
    if (!navigationState?.key) {
      return;
    }
    const current = path ? path.split('/') : [];
    const signedOut = gate === 'guest' && SIGNED_IN_GATES.has(previousGate.current);
    if (gate !== 'boot') {
      previousGate.current = gate;
    }
    // Nothing moves while a multi-step auth flow holds the lock (sign-up creates the Firebase
    // user before it records the consents).
    if (flowLocked) {
      return;
    }
    if (signedOut) {
      if (!useSessionNotice.getState().ended) {
        // Signed out (Sign out on any screen, Review our terms and the welcome included): the
        // next account on this phone must never open the previous collector's screen or finish
        // their action; the phone shows Home as a guest (stage R15).
        usePendingLink.getState().clear();
        useGuestAction.getState().clear();
        router.dismissTo(GATE_HOME.guest);
        return;
      }
      // The session ended on its own: Sign in, and the screen it ended on for that collector.
      const href = resumableHref(current, latest.current.pathname, latest.current.params);
      if (href) {
        usePendingLink.getState().set(href, lastUid.current);
      }
      router.dismissTo(SIGN_IN_HREF);
      return;
    }
    const target = redirectFor(gate, current, flowLocked);
    if (target === SIGN_IN_HREF) {
      // A guest on a member-only screen (a deep link, a notification): Sign in first, then the
      // screen (stage R15). An action a guest left behind (a Sign in left with a swipe) is
      // forgotten: this sign-in is for the screen, never for that action (review fix 1, F6). A
      // member screen still in the stack after a session ended on its own (Sign in left with a
      // swipe) is that collector's: kept for them only, never for the next account (P4).
      useGuestAction.getState().dismiss();
      const href = resumableHref(current, latest.current.pathname, latest.current.params);
      if (href) {
        const owner = useSessionNotice.getState().ended ? lastUid.current : null;
        usePendingLink.getState().set(href, owner);
      }
    } else if (target === GATE_HOME.onboarding || target === GATE_HOME.consent) {
      // An existing collector sent to Review our terms or to the welcome from a screen (the 18+
      // confirmation asked on their next sign-in, a new document version, a deep link, a 403
      // AGE_CONFIRMATION_REQUIRED) comes back to it once the account is ready, like the web's
      // `returnUrl`.
      const href = resumableHref(current, latest.current.pathname, latest.current.params);
      if (href) {
        usePendingLink.getState().set(href, uid);
      }
    }
    // Not on top of the welcome: it takes the link when it ends (Finish or Skip for now).
    const onWelcome = current[0] === 'onboarding';
    const resume = gate === 'app' && !flowLocked && !onWelcome && !!usePendingLink.getState().href;
    if (target === GATE_HOME.app && resume) {
      // Signed in from Sign in (or done with Review our terms): straight back to the screen kept
      // for them, the guest's own screen when it is still in the stack (stage R15).
      const pending = usePendingLink.getState().take(uid);
      router.dismissTo((pending ?? GATE_HOME.app) as Href);
      return;
    }
    if (target) {
      // Back to the target when it is already in the stack (e.g. the tabs a deep link opened
      // under the sign-in screen), otherwise in place of the current screen: never a second copy.
      router.dismissTo(target);
    }
    if (!target && resume) {
      const pending = usePendingLink.getState().take(uid);
      if (pending) {
        router.push(pending as Href);
      }
    }
  }, [flowLocked, gate, navigationState?.key, path, router, uid]);

  return gate;
}
