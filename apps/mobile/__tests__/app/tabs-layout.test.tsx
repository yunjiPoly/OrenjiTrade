import { Slot } from 'expo-router';
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import TabLayout from '@/app/(tabs)/_layout';
import MapRedirect from '@/app/(tabs)/index';
import InventoryScreen from '@/app/(tabs)/inventory';
import MessagesScreen from '@/app/(tabs)/messages';
import ProfileScreen from '@/app/(tabs)/profile';
import SearchScreen from '@/app/(tabs)/search';
import WishlistRedirect from '@/app/(tabs)/wishlist';
import { HIDDEN_TAB_ROUTES, TABS } from '@/src/navigation/tabs';

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
  '(tabs)/index': MapRedirect,
  '(tabs)/inventory': InventoryScreen,
  '(tabs)/search': SearchScreen,
  '(tabs)/messages': MessagesScreen,
  '(tabs)/wishlist': WishlistRedirect,
  '(tabs)/profile': ProfileScreen,
};

describe('(tabs) layout', () => {
  beforeEach(() => {
    resetAppState();
    mockApi(signedInRoutes());
  });

  it('declares the four product tabs of stage R5 in order (Home comes with R7)', () => {
    expect(TABS.map((tab) => tab.title)).toEqual(['Search', 'Inventory', 'Messages', 'Profile']);
    // The old Map and Wishlist tabs are routes that redirect into Search, not tabs.
    expect(HIDDEN_TAB_ROUTES).toEqual(['index', 'wishlist']);
  });

  it('opens on Search, with the map, and shows exactly the four tab buttons', async () => {
    renderRouter(routes, { initialUrl: '/' });

    expect(await screen.findByTestId('screen-search')).toBeOnTheScreen();
    for (const tab of TABS) {
      expect(screen.getByLabelText(`${tab.title} tab`)).toBeOnTheScreen();
      // Stable ids for the native Maestro flows.
      expect(screen.getByTestId(`tab-${tab.name}`)).toBeOnTheScreen();
    }
    expect(screen.queryByLabelText('Map tab')).toBeNull();
    expect(screen.queryByLabelText('Wishlist tab')).toBeNull();
    // Search draws its own title with the bell, and the map is its default view (ADR 0017).
    expect(screen.getByTestId('search-title')).toHaveTextContent('Search');
    expect(await screen.findByTestId('notification-bell-search')).toBeOnTheScreen();
    expect(await screen.findByTestId('search-map')).toBeOnTheScreen();
  });

  it('sends the old Wishlist tab to the Wishlist segment of Search', async () => {
    renderRouter(routes, { initialUrl: '/wishlist' });
    expect(await screen.findByTestId('screen-search')).toBeOnTheScreen();
    expect(await screen.findByTestId('search-wishlist')).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: /^Wishlist/ })).toBeSelected();
  });

  it('shows the notification bell and the unread chats on the Messages tab', async () => {
    mockApi(
      signedInRoutes({
        'GET /api/v1/conversations': ok(
          conversationPage([
            conversationFixture({ unreadCount: 3 }),
            conversationFixture({ id: 'second', unreadCount: 1 }),
            conversationFixture({ id: 'read', unreadCount: 0 }),
            conversationFixture({ id: 'muted', unreadCount: 7, muted: true }),
          ])
        ),
        'GET /api/v1/notifications/unread-count': ok({ count: 5 }),
      })
    );
    renderRouter(routes, { initialUrl: '/' });
    await screen.findByTestId('screen-search');
    // Unread chats, not messages (spec section 4), muted ones left out.
    expect(await screen.findByLabelText('Messages tab, 2 unread chats')).toBeOnTheScreen();
    expect(await screen.findByLabelText('Notifications, 5 unread')).toBeOnTheScreen();
    expect(screen.getByTestId('notification-bell-search-badge')).toHaveTextContent('5');
  });

  it('navigates to the Profile tab', async () => {
    renderRouter(routes, { initialUrl: '/' });
    await screen.findByTestId('screen-search');

    fireEvent.press(screen.getByLabelText('Profile tab'));

    expect(await screen.findByTestId('screen-profile')).toBeOnTheScreen();
    expect(await screen.findByTestId('profile-name')).toHaveTextContent('Maïka Test');
  });
});
