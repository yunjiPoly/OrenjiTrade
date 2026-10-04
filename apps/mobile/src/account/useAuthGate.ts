import { useRootNavigationState, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';

import { useFlowLock } from './flowLock';
import { gateFor, redirectFor, type Gate } from './gate';
import { useAccount } from './AccountProvider';

/**
 * The expo-router auth gate: computes the gate from the session + `/me` and replaces the current
 * route whenever it is not allowed (signed out → sign-in, consent required → consent, suspended
 * or deletion pending → account status, unfinished profile → onboarding, otherwise the tabs).
 */
export function useAuthGate(): Gate {
  const account = useAccount();
  const segments = useSegments();
  const router = useRouter();
  const navigationState = useRootNavigationState();
  const flowLocked = useFlowLock((store) => store.lockedBy !== null);
  const gate = gateFor(account.status, account.needsOnboarding);

  const path = segments.join('/');
  useEffect(() => {
    if (!navigationState?.key) {
      return;
    }
    const target = redirectFor(gate, path ? path.split('/') : [], flowLocked);
    if (target) {
      // Back to the target when it is already in the stack (e.g. the tabs a deep link opened
      // under the sign-in screen), otherwise in place of the current screen: never a second copy.
      router.dismissTo(target);
    }
  }, [flowLocked, gate, navigationState?.key, path, router]);

  return gate;
}
