import { Slot } from 'expo-router';
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import TabLayout from '@/app/(tabs)/_layout';
import MapScreen from '@/app/(tabs)/index';
import InventoryScreen from '@/app/(tabs)/inventory';
import MessagesScreen from '@/app/(tabs)/messages';
import ProfileScreen from '@/app/(tabs)/profile';
import SearchScreen from '@/app/(tabs)/search';
import WishlistScreen from '@/app/(tabs)/wishlist';
import { TABS } from '@/src/navigation/tabs';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import { conversationFixture, conversationPage } from '../support/fixtures';
import { mockApi, ok } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { TestProviders, resetAppState } from '../test-utils';

function TestRootLayout() {
  return (
    <TestProviders port={new FakeAuthPort(testUser())}>
      <Slot />
    </TestProviders>
  );
}

const routes = {
  _layout: TestRootLayout,
  '(tabs)/_layout': TabLayout,
  '(tabs)/index': MapScreen,
  '(tabs)/inventory': InventoryScreen,
  '(tabs)/search': SearchScreen,
  '(tabs)/messages': MessagesScreen,
  '(tabs)/wishlist': WishlistScreen,
  '(tabs)/profile': ProfileScreen,
};

describe('(tabs) layout', () => {
  beforeEach(() => {
    resetAppState();
    mockApi(signedInRoutes());
  });

  it('declares the six product tabs in order', () => {
    expect(TABS.map((tab) => tab.title)).toEqual([
      'Map',
      'Inventory',
      'Search',
      'Messages',
      'Wishlist',
      'Profile',
    ]);
  });

  it('renders all six tab buttons and the map screen first', async () => {
    renderRouter(routes, { initialUrl: '/' });

    expect(await screen.findByTestId('screen-map')).toBeOnTheScreen();
    for (const tab of TABS) {
      expect(screen.getByLabelText(`${tab.title} tab`)).toBeOnTheScreen();
      // Stable ids for the native Maestro flows.
      expect(screen.getByTestId(`tab-${tab.name}`)).toBeOnTheScreen();
    }
    // The Map tab: a placeholder until the region map reaches the app (ADR 0017).
    expect(await screen.findByTestId('map-placeholder')).toBeOnTheScreen();
  });

  it('shows the notification bell and the unread messages on the Messages tab', async () => {
    mockApi(
      signedInRoutes({
        'GET /api/v1/conversations': ok(
          conversationPage([
            conversationFixture({ unreadCount: 3 }),
            conversationFixture({ id: 'muted', unreadCount: 7, muted: true }),
          ])
        ),
        'GET /api/v1/notifications/unread-count': ok({ count: 5 }),
      })
    );
    renderRouter(routes, { initialUrl: '/' });
    await screen.findByTestId('screen-map');
    expect(await screen.findByLabelText('Messages tab, 3 unread')).toBeOnTheScreen();
    expect(await screen.findByLabelText('Notifications, 5 unread')).toBeOnTheScreen();
    expect(screen.getByTestId('notification-bell-index-badge')).toHaveTextContent('5');
  });

  it('navigates to the Profile tab', async () => {
    renderRouter(routes, { initialUrl: '/' });
    await screen.findByTestId('screen-map');

    fireEvent.press(screen.getByLabelText('Profile tab'));

    expect(await screen.findByTestId('screen-profile')).toBeOnTheScreen();
    expect(await screen.findByTestId('profile-name')).toHaveTextContent('Maïka Test');
  });
});
