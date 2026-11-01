import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { screen } from '@testing-library/react-native';

import ProfileScreen from '@/app/(tabs)/profile';
import AccountSettingsScreen from '@/app/settings/account';
import { FEATURE } from '@/src/api/hooks/featureFlags';
import {
  FREE_FOR_ALL_NOTE,
  mobileTarget,
  notificationLink,
} from '@/src/features/notifications/notificationKinds';
import { pushTarget, rowTarget } from '@/src/features/notifications/notificationRows';
import { removedRouteTarget } from '@/src/navigation/removedRoutes';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import { meFixture } from '../support/fixtures';
import { mockApi, ok } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());
jest.mock('@/src/features/account/exportData', () => ({
  exportMyData: jest.fn(async () => 'export.json'),
}));

/**
 * Stage F1, "free for all" (owner decision of 2026-10-14): Premium, credits, donations and ads left
 * the app. No screen, link or route leads to them any more, even when an older server still sends
 * their flags or an old notification still links to them.
 */

const APP_DIR = join(__dirname, '..', '..', 'app');

/** Every route file of the app, relative to `app/`. */
function routeFiles(dir = APP_DIR, prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? routeFiles(join(dir, entry.name), `${prefix}${entry.name}/`)
      : [`${prefix}${entry.name}`]
  );
}

/** What an older server could still answer: the four removed flags switched on. */
const OLD_FLAGS = {
  protectedPayments: true,
  publicChat: true,
  mlScanning: false,
  premiumPlans: true,
  credits: true,
  donations: true,
  advertising: true,
};

beforeEach(() => {
  resetRouterMock();
  resetAppState();
});

describe('no screen of the removed paid features', () => {
  it('has no route for Premium, credits, support or their checkouts', () => {
    const routes = routeFiles();
    expect(routes).toContain('settings/account.tsx');
    for (const removed of [
      'premium.tsx',
      'credits.tsx',
      'support.tsx',
      'checkout/fake-billing/[ref].tsx',
      'checkout/fake-donation/[ref].tsx',
    ]) {
      expect(routes).not.toContain(removed);
    }
    // With the protected-payment checkout gone too (ADR 0018), the phone has no checkout at all.
    expect(routes.filter((route) => route.startsWith('checkout/'))).toEqual([]);
    for (const folder of ['ads', 'billing', 'checkout', 'payments']) {
      expect(existsSync(join(__dirname, '..', '..', 'src', 'features', folder))).toBe(false);
    }
  });

  it('knows no flag of the removed features', () => {
    // cardTextScan: the camera card scan (V129), added after F1.
    expect(Object.values(FEATURE).sort()).toEqual([
      'cardTextScan',
      'mlScanning',
      'protectedPayments',
      'publicChat',
    ]);
  });

  it('shows no Premium, credits or support row on the Profile tab, whatever the flags say', async () => {
    mockApi(signedInRoutes({ 'GET /api/v1/public/feature-flags': ok(OLD_FLAGS) }));
    renderWithProviders(<ProfileScreen />, { port: new FakeAuthPort(testUser()) });
    expect(await screen.findByTestId('profile-settings')).toBeOnTheScreen();
    expect(screen.queryByTestId('profile-premium')).toBeNull();
    expect(screen.queryByTestId('profile-credits')).toBeNull();
    expect(screen.queryByTestId('profile-support')).toBeNull();
    expect(screen.queryByText(/Premium|Credits|Support OrenjiTrade|donation/)).toBeNull();
  });

  it('shows no plan in Settings → Account, and staff roles only to staff', async () => {
    mockApi(signedInRoutes());
    renderWithProviders(<AccountSettingsScreen />, { port: new FakeAuthPort(testUser()) });
    expect(screen.getByTestId('account-email')).toBeOnTheScreen();
    expect(screen.queryByText(/plan/i)).toBeNull();
    expect(screen.queryByTestId('account-roles')).toBeNull();

    mockApi(signedInRoutes({ 'GET /api/v1/me': ok(meFixture({ roles: ['USER', 'MODERATOR'] })) }));
    renderWithProviders(<AccountSettingsScreen />, { port: new FakeAuthPort(testUser()) });
    expect(await screen.findByTestId('account-roles')).toHaveTextContent('Moderator');
  });
});

describe('old links to the removed screens', () => {
  it('say the app is free instead of opening a screen that is gone', () => {
    for (const path of ['/premium', '/premium?checkout=success', '/credits', '/support']) {
      expect(mobileTarget(path)).toEqual({ kind: 'note', note: FREE_FOR_ALL_NOTE });
    }
    expect(FREE_FOR_ALL_NOTE).toBe(
      'OrenjiTrade is free for every collector now: there is no Premium, credits or donations.'
    );
  });

  it('never follow an old limit notice to Premium', () => {
    const notice = {
      type: 'SYSTEM' as const,
      data: {
        kind: 'LIMIT_REACHED',
        notificationType: 'WISHLIST_ALERT',
        planCode: 'FREE',
        upgradeUrl: '/premium',
      },
    };
    expect(notificationLink(notice)).toBe('/search?segment=wishlist');
    // Since stage R9 a system notice opens nothing on the phone, an old link to Premium included,
    // and its push opens Notifications.
    expect(rowTarget(notice, 'me')).toBeNull();
    const premium = {
      type: 'SYSTEM' as const,
      data: { kind: 'LIMIT_REACHED', deepLink: '/premium' },
    };
    expect(rowTarget(premium, 'me')).toBeNull();
    expect(pushTarget({ type: 'SYSTEM', deepLink: '/premium' }, 'me')).toBe('/notifications');
  });

  it('move an old Premium, credits, support or checkout link on to the Profile tab', () => {
    for (const path of [
      '/premium',
      '/credits',
      '/support',
      '/checkout/fake-billing/fake_cs_1',
      '/checkout/fake-donation/fake_dn_1',
    ]) {
      expect(removedRouteTarget(path)).toEqual({ href: '/profile', note: FREE_FOR_ALL_NOTE });
    }
  });
});
