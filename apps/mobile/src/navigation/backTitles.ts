import { TABS } from './tabs';

/**
 * What the iOS back button says on a screen opened over a route group.
 *
 * iOS writes the previous screen's title next to the back chevron. The tabs, the signed-out
 * screens and the account-state screens are route groups of the root stack: `(tabs)`, `(auth)` and
 * `(account)` have no title of their own, so iOS showed the folder name ("‹ (tabs)") on every
 * screen opened from a tab, and read it out with VoiceOver. The group takes the title of the
 * screen the collector comes from instead: "‹ Profile", "‹ Messages", "‹ Sign in".
 *
 * Android's back button is an arrow without a title and the web header shows none either, so only
 * iOS gets these titles (`groupTitleOptions`).
 */

/** Titles of the signed-out screens (`app/(auth)`), as their own headers show them. */
export const AUTH_SCREEN_TITLES = {
  'sign-in': 'Sign in',
  'sign-up': 'Create account',
  'reset-password': 'Reset password',
} as const;

/** Titles of the account-state screens (`app/(account)`). */
export const ACCOUNT_SCREEN_TITLES = {
  'verify-email': 'Verify your email',
  consent: 'Review our terms',
  suspended: 'Account status',
  unavailable: 'OrenjiTrade',
} as const;

export type RouteGroup = '(tabs)' | '(auth)' | '(account)';

const GROUPS: Record<RouteGroup, { initial: string; titles: Readonly<Record<string, string>> }> = {
  '(tabs)': {
    initial: TABS[0]?.name ?? 'index',
    titles: Object.fromEntries(TABS.map((tab) => [tab.name, tab.title])),
  },
  '(auth)': { initial: 'sign-in', titles: AUTH_SCREEN_TITLES },
  '(account)': { initial: 'verify-email', titles: ACCOUNT_SCREEN_TITLES },
};

/** The generic iOS wording, for a screen of a group that has no title here. */
export const GENERIC_BACK_TITLE = 'Back';

/**
 * Title of a route group: the title of its focused screen (`focused` is the route name react
 * navigation reports; undefined until the group has navigated once, when its first screen shows).
 */
export function groupBackTitle(group: RouteGroup, focused: string | undefined): string {
  const { initial, titles } = GROUPS[group];
  return titles[focused ?? initial] ?? GENERIC_BACK_TITLE;
}

/** Stack options of a route group: its title on iOS, nothing elsewhere. */
export function groupTitleOptions(
  platform: string,
  group: RouteGroup,
  focused: string | undefined
): { title?: string } {
  return platform === 'ios' ? { title: groupBackTitle(group, focused) } : {};
}
