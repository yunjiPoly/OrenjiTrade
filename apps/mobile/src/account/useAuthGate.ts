import {
  useGlobalSearchParams,
  usePathname,
  useRootNavigationState,
  useRouter,
  useSegments,
  type Href,
} from 'expo-router';
import { useEffect, useRef } from 'react';

import { useSessionNotice } from '@/src/auth/sessionNotice';

import { useAccount } from './AccountProvider';
import { useFlowLock } from './flowLock';
import { GATE_HOME, gateFor, redirectFor, type Gate } from './gate';
import { resumableHref, usePendingLink } from './pendingLink';

/**
 * The expo-router auth gate: computes the gate from the session + `/me` and replaces the current
 * route whenever it is not allowed (signed out → sign-in, consent required → consent, suspended
 * or deletion pending → account status, unfinished profile → onboarding, otherwise the tabs).
 *
 * A link opened while signed out (or a screen whose session ended) is remembered and reopened on
 * top of the tabs once the account is ready; an explicit sign-out remembers nothing.
 */
export function useAuthGate(): Gate {
  const account = useAccount();
  const segments = useSegments();
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const router = useRouter();
  const navigationState = useRootNavigationState();
  const flowLocked = useFlowLock((store) => store.lockedBy !== null);
  const gate = gateFor(account.status, account.needsOnboarding);
  const previousGate = useRef<Gate>('boot');
  const latest = useRef({ pathname, params });
  // Declared before the gate effect, so it runs first after each render.
  useEffect(() => {
    latest.current = { pathname, params };
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
      const href = resumableHref(current, latest.current.pathname, latest.current.params);
      if (href && (previousGate.current !== 'app' || sessionEnded)) {
        usePendingLink.getState().set(href);
      }
    } else if (target === GATE_HOME.onboarding) {
      // An existing collector sent to onboarding from a screen (the 18+ confirmation asked on
      // their next sign-in, a deep link, a 403 AGE_CONFIRMATION_REQUIRED) comes back to it once
      // the account is ready, like the web's `returnUrl`.
      const href = resumableHref(current, latest.current.pathname, latest.current.params);
      if (href) {
        usePendingLink.getState().set(href);
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
    const pending = usePendingLink.getState().href;
    if (gate === 'app' && pending && !flowLocked) {
      usePendingLink.getState().clear();
      router.push(pending as Href);
    }
  }, [flowLocked, gate, navigationState?.key, path, router]);

  return gate;
}
