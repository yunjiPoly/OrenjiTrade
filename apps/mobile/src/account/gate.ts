import type { AccountStatus } from './accountStatus';

/**
 * Which part of the app the collector may see (expo-router auth gate):
 * - `boot`: Firebase or `/me` has not answered yet (splash / boot screen, no redirect);
 * - `guest`: signed out (stage R15, "Browse without an account"): Home, Search's Cards and
 *   Binders, card pages, sets, the binders of a state, a public binder or deck core, legal and
 *   Settings › Appearance, and the `(auth)` group (sign in, create account, reset password). The
 *   member-only tabs show a page that asks to sign in in place; any other screen opens Sign in;
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
  // The app opens on Home for a signed-out visitor (stage R15), not on Sign in.
  guest: '/',
  consent: '/consent',
  suspended: '/suspended',
  error: '/unavailable',
  onboarding: '/onboarding',
  app: '/',
} as const satisfies Record<Exclude<Gate, 'boot'>, string>;

export type GateHome = (typeof GATE_HOME)[keyof typeof GATE_HOME];

const ALWAYS_ALLOWED = new Set(['legal', '+not-found', '_sitemap']);

/** Where a guest goes from a member-only screen (a deep link, a chat, a notification). */
export const SIGN_IN_HREF = '/sign-in';

/** Where the gate may send someone: a gate's home, or Sign in for a guest on a member screen. */
export type GateTarget = GateHome | typeof SIGN_IN_HREF;

/**
 * The roots a guest may open (stage R15): the tabs (Home and Search browse; Inventory, Messages,
 * Profile and Search › Wishlist ask to sign in in place), the card pages and their holders, sets,
 * the binders of a state (old links into Search), the auth screens. Legal is open to every gate.
 */
const GUEST_ROOTS = new Set(['(auth)', '(tabs)', 'cards', 'holders', 'sets', 'regions']);

/** Screens of a member root a guest may open: a public binder or deck core, Appearance. */
const GUEST_SCREENS: Readonly<Record<string, readonly string[]>> = {
  binders: ['[id]'],
  settings: ['appearance'],
};

/** Whether a guest may open `root`/`screen` (`segments[0]` and `segments[1]`). */
export function guestMayOpen(root: string, screen: string | undefined): boolean {
  if (GUEST_ROOTS.has(root) || ALWAYS_ALLOWED.has(root)) {
    return true;
  }
  return screen !== undefined && (GUEST_SCREENS[root]?.includes(screen) ?? false);
}

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
  // Phase 7: collector reports, ratings and references. Offers, trades, protected payments and
  // disputes left the phone (ADR 0018); Premium, credits and donations left the app (ADR 0019).
  'report',
  'ratings',
  // Stage M7: the card-holders list and set pages.
  'holders',
  'sets',
  // Stage M9: the public binders of a state or province (opened from the Map tab).
  'regions',
  // The card scan (spec 2026-10-15): its screens live under app/scan.
  'scan',
]);

function allowed(gate: Exclude<Gate, 'boot'>, root: string, screen: string | undefined): boolean {
  switch (gate) {
    case 'guest':
      return guestMayOpen(root, screen);
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
 * creates the Firebase user before it records the consents). A guest on a member-only screen goes
 * to Sign in (and on to the screen after, `useAuthGate`).
 */
export function redirectFor(
  gate: Gate,
  segments: readonly string[],
  flowLocked = false
): GateTarget | null {
  if (gate === 'boot' || flowLocked) {
    return null;
  }
  const root = segments[0] ?? '(tabs)';
  if (ALWAYS_ALLOWED.has(root)) {
    return null;
  }
  if (allowed(gate, root, segments[1])) {
    return null;
  }
  return gate === 'guest' ? SIGN_IN_HREF : GATE_HOME[gate];
}

/** Where a collector in this state belongs (used after flows that end a gate step). */
export function homeFor(status: AccountStatus, needsOnboarding: boolean): GateHome {
  const gate = gateFor(status, needsOnboarding);
  return gate === 'boot' ? GATE_HOME.app : GATE_HOME[gate];
}
