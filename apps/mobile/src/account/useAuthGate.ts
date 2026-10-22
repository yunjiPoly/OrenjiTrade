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
import { GATE_HOME, gateFor, redirectFor, type Gate } from './gate';
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
 * route whenever it is not allowed (signed out → sign-in, consent required → consent, suspended
 * or deletion pending → account status, unfinished profile → onboarding, otherwise the tabs).
 *
 * A link opened while signed out (or a screen whose session ended) is remembered and reopened on
 * top of the tabs once the account is ready; an explicit sign-out remembers nothing, not even the
 * link kept while Review our terms or the welcome was asked (stage R12's review fix 1). A link
 * kept for a signed-in collector reopens for that collector only (`PendingLinkStore.owner`). The
 * welcome takes the link itself when it ends: the gate never pushes it on top of the welcome
 * (its second step completes the account while the third is still to come).
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
    const target = redirectFor(gate, current, flowLocked);
    if (target === GATE_HOME.guest) {
      const sessionEnded = useSessionNotice.getState().ended;
      if (SIGNED_IN_GATES.has(previousGate.current) && !sessionEnded) {
        // Signed out (Sign out on any screen, Review our terms and the welcome included): the
        // next account on this phone must never open the previous collector's screen.
        usePendingLink.getState().clear();
      } else {
        const href = resumableHref(current, latest.current.pathname, latest.current.params);
        if (href) {
          usePendingLink.getState().set(href, sessionEnded ? lastUid.current : null);
        }
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
    if (gate !== 'boot') {
      previousGate.current = gate;
    }
    if (target) {
      // Back to the target when it is already in the stack (e.g. the tabs a deep link opened
      // under the sign-in screen), otherwise in place of the current screen: never a second copy.
      router.dismissTo(target);
    }
    // Not on top of the welcome: it takes the link when it ends (Finish or Skip for now).
    const onWelcome = current[0] === 'onboarding';
    if (gate === 'app' && usePendingLink.getState().href && !flowLocked && !onWelcome) {
      const pending = usePendingLink.getState().take(uid);
      if (pending) {
        router.push(pending as Href);
      }
    }
  }, [flowLocked, gate, navigationState?.key, path, router, uid]);

  return gate;
}
