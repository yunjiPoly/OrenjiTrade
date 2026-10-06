import type { AccountStatus } from './accountStatus';

/**
 * Which part of the app the collector may see (expo-router auth gate):
 * - `boot`: Firebase or `/me` has not answered yet (splash / boot screen, no redirect);
 * - `guest`: signed out, the `(auth)` group (sign in, create account, reset password);
 * - `consent`, `suspended`, `error`: the matching `(account)` screen only;
 * - `onboarding`: signed in with an unfinished profile;
 * - `app`: the tabs and everything behind them.
 * Legal pages and the not-found screen stay reachable from every gate.
 */
export type Gate = 'boot' | 'guest' | 'consent' | 'suspended' | 'error' | 'onboarding' | 'app';

export function gateFor(status: AccountStatus, needsOnboarding: boolean): Gate {
  switch (status) {
    case 'loading':
      return 'boot';
    case 'anonymous':
      return 'guest';
    case 'consent-required':
      return 'consent';
    case 'suspended':
    case 'deletion-pending':
      return 'suspended';
    case 'error':
      return 'error';
    case 'ready':
      return needsOnboarding ? 'onboarding' : 'app';
    default:
      return 'boot';
  }
}

/** Route paths the gate redirects to (groups do not appear in URLs). */
export const GATE_HOME = {
  guest: '/sign-in',
  consent: '/consent',
  suspended: '/suspended',
  error: '/unavailable',
  onboarding: '/onboarding',
  app: '/',
} as const satisfies Record<Exclude<Gate, 'boot'>, string>;

export type GateHome = (typeof GATE_HOME)[keyof typeof GATE_HOME];

const ALWAYS_ALLOWED = new Set(['legal', '+not-found', '_sitemap']);
const APP_ROOTS = new Set([
  '(tabs)',
  'settings',
  'profile',
  'collectors',
  'cards',
  'binders',
  'items',
  'messages',
  'community',
  'wishlist',
  'notifications',
  // Phases 7 and 8: collector reports, ratings and references, offers and trades.
  'report',
  'ratings',
  'offers',
  'trades',
]);

function allowed(gate: Exclude<Gate, 'boot'>, root: string, screen: string | undefined): boolean {
  switch (gate) {
    case 'guest':
      return root === '(auth)';
    case 'consent':
      return root === '(account)' && screen === 'consent';
    case 'suspended':
      return root === '(account)' && screen === 'suspended';
    case 'error':
      return root === '(account)' && screen === 'unavailable';
    case 'onboarding':
      return root === 'onboarding' || (root === '(account)' && screen === 'verify-email');
    case 'app':
      // Onboarding stays reachable: its last step is saved after the profile is already complete.
      return (
        APP_ROOTS.has(root) ||
        root === 'onboarding' ||
        (root === '(account)' && screen === 'verify-email')
      );
    default:
      return false;
  }
}

/**
 * Where the gate sends a collector who is on `segments` (expo-router `useSegments()`), or null to
 * stay. Nothing moves while booting or while a multi-step auth flow holds the lock (sign-up
 * creates the Firebase user before it records the consents).
 */
export function redirectFor(
  gate: Gate,
  segments: readonly string[],
  flowLocked = false
): GateHome | null {
  if (gate === 'boot' || flowLocked) {
    return null;
  }
  const root = segments[0] ?? '(tabs)';
  if (ALWAYS_ALLOWED.has(root)) {
    return null;
  }
  return allowed(gate, root, segments[1]) ? null : GATE_HOME[gate];
}

/** Where a collector in this state belongs (used after flows that end a gate step). */
export function homeFor(status: AccountStatus, needsOnboarding: boolean): GateHome {
  const gate = gateFor(status, needsOnboarding);
  return gate === 'boot' ? GATE_HOME.app : GATE_HOME[gate];
}
