import { screen, waitFor } from '@testing-library/react-native';

import NotFoundScreen from '@/app/+not-found';
import { DEALS_IN_CHAT_NOTE } from '@/src/features/notifications/notificationKinds';
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

describe('links to the screens that left the phone (ADR 0018)', () => {
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

  it('leaves every other path alone, the Premium and donation checkouts included', () => {
    for (const path of [
      '/',
      '/messages',
      '/settings',
      '/settings/privacy',
      '/checkout/fake-billing/x',
      '/checkout/fake-donation/x',
      '/offerings',
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
  });
});
