import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import NotFoundScreen from '@/app/+not-found';
import {
  DEALS_IN_CHAT_NOTE,
  FREE_FOR_ALL_NOTE,
} from '@/src/features/notifications/notificationKinds';
import { removedRouteTarget } from '@/src/navigation/removedRoutes';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import { mockApi } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { mockPathname, mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());

beforeEach(() => {
  resetRouterMock();
  resetAppState();
});

describe('links to the screens that left the phone (ADR 0018 and ADR 0019)', () => {
  it('sends offers, trades, disputes and the payment checkout to Messages', () => {
    for (const path of [
      '/offers',
      '/offers/00000000-0000-4000-9c00-000000000003',
      '/offers/new?item=x',
      '/offers/counter',
      '/trades',
      '/trades/00000000-0000-4000-9d00-000000000001',
      '/disputes/d1',
      '/checkout/fake/fake_pi_1',
    ]) {
      expect(removedRouteTarget(path)).toEqual({ href: '/messages', note: DEALS_IN_CHAT_NOTE });
    }
  });

  it('sends the offer and payout settings to Settings', () => {
    expect(removedRouteTarget('/settings/offers')).toEqual({
      href: '/settings',
      note: DEALS_IN_CHAT_NOTE,
    });
    expect(removedRouteTarget('/settings/payouts?returnTo=/trades/t1')?.href).toBe('/settings');
  });

  it('sends Premium, credits, support and their checkouts to the Profile tab (free for all)', () => {
    for (const path of [
      '/premium',
      '/premium?checkout=success',
      '/credits',
      '/support',
      '/checkout/fake-billing/fake_cs_1',
      '/checkout/fake-donation/fake_dn_1',
    ]) {
      expect(removedRouteTarget(path)).toEqual({ href: '/profile', note: FREE_FOR_ALL_NOTE });
    }
  });

  it('leaves every other path alone', () => {
    for (const path of [
      '/',
      '/messages',
      '/settings',
      '/settings/privacy',
      '/profile',
      '/checkout',
      '/checkout/other/x',
      '/offerings',
      '/premiums',
      '/collectors/collector2',
      '',
      null,
      undefined,
    ]) {
      expect(removedRouteTarget(path)).toBeNull();
    }
  });

  it('the not-found screen moves an old offer link on to Messages with a note', async () => {
    mockApi(signedInRoutes());
    mockPathname.current = '/offers/00000000-0000-4000-9c00-000000000003';
    renderWithProviders(<NotFoundScreen />, { port: new FakeAuthPort(testUser()) });
    expect(screen.getByTestId('screen-moved')).toBeOnTheScreen();
    expect(screen.queryByText('This page does not exist')).toBeNull();
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/messages'));
    expect(await screen.findByText(DEALS_IN_CHAT_NOTE)).toBeOnTheScreen();
  });

  it('an old Premium link opens the Profile tab with a note that the app is free', async () => {
    mockApi(signedInRoutes());
    mockPathname.current = '/premium';
    renderWithProviders(<NotFoundScreen />, { port: new FakeAuthPort(testUser()) });
    expect(screen.getByTestId('screen-moved')).toBeOnTheScreen();
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/profile'));
    expect(await screen.findByText(FREE_FOR_ALL_NOTE)).toBeOnTheScreen();
  });

  it('an old payout link opens Settings', async () => {
    mockApi(signedInRoutes());
    mockPathname.current = '/settings/payouts';
    renderWithProviders(<NotFoundScreen />, { port: new FakeAuthPort(testUser()) });
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/settings'));
  });

  it('a really unknown link still says the page does not exist', () => {
    mockApi(signedInRoutes());
    mockPathname.current = '/nothing-here';
    renderWithProviders(<NotFoundScreen />, { port: new FakeAuthPort(testUser()) });
    expect(screen.getByText('This page does not exist')).toBeOnTheScreen();
    expect(mockRouter.replace).not.toHaveBeenCalled();
    // "Back to the map" opens Search's map: `/` is Home since stage R7 (R7 review U2/F4).
    fireEvent.press(screen.getByText('Back to the map'));
    expect(mockRouter.replace).toHaveBeenCalledWith({
      pathname: '/search',
      params: { segment: 'cards' },
    });
  });
});
