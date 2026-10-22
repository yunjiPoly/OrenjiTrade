import {
  ACCOUNT_SCREEN_TITLES,
  AUTH_SCREEN_TITLES,
  GENERIC_BACK_TITLE,
  groupBackTitle,
  groupTitleOptions,
} from '@/src/navigation/backTitles';
import { TABS } from '@/src/navigation/tabs';

describe('iOS back button over a route group', () => {
  it('names the tab the collector comes from, never the "(tabs)" folder', () => {
    expect(groupBackTitle('(tabs)', 'profile')).toBe('Profile');
    expect(groupBackTitle('(tabs)', 'messages')).toBe('Messages');
    // Home is the `index` route (stage R7); the old Wishlist tab redirects into Search (R5).
    expect(groupBackTitle('(tabs)', 'index')).toBe('Home');
    expect(groupBackTitle('(tabs)', 'wishlist')).toBe('Search');
    for (const tab of TABS) {
      expect(groupBackTitle('(tabs)', tab.name)).toBe(tab.title);
    }
  });

  it('uses the first screen of the group until the group has navigated', () => {
    expect(groupBackTitle('(tabs)', undefined)).toBe('Home');
    expect(groupBackTitle('(auth)', undefined)).toBe('Sign in');
    expect(groupBackTitle('(account)', undefined)).toBe('Verify your email');
  });

  it('names the signed-out and account-state screens as their own headers do', () => {
    expect(groupBackTitle('(auth)', 'sign-up')).toBe(AUTH_SCREEN_TITLES['sign-up']);
    expect(groupBackTitle('(auth)', 'reset-password')).toBe('Reset password');
    expect(groupBackTitle('(account)', 'consent')).toBe(ACCOUNT_SCREEN_TITLES.consent);
  });

  it('falls back to "Back" for a screen it does not know, never to a route name', () => {
    expect(groupBackTitle('(tabs)', 'a-future-tab')).toBe(GENERIC_BACK_TITLE);
    expect(GENERIC_BACK_TITLE).toBe('Back');
  });

  it('only iOS gets a title: Android and the web show no back title', () => {
    expect(groupTitleOptions('ios', '(tabs)', 'inventory')).toEqual({ title: 'Inventory' });
    expect(groupTitleOptions('android', '(tabs)', 'inventory')).toEqual({});
    expect(groupTitleOptions('web', '(auth)', 'sign-in')).toEqual({});
  });
});
