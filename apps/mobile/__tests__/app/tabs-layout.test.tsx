import { Slot, Stack } from 'expo-router';
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import TabLayout from '@/app/(tabs)/_layout';
import HomeRoute from '@/app/(tabs)/index';
import InventoryScreen from '@/app/(tabs)/inventory';
import MessagesScreen from '@/app/(tabs)/messages';
import ProfileScreen from '@/app/(tabs)/profile';
import SearchScreen from '@/app/(tabs)/search';
import WishlistRedirect from '@/app/(tabs)/wishlist';
import PlaceBindersRedirect from '@/app/regions/[region]/[code]';
import { HIDDEN_TAB_ROUTES, TABS } from '@/src/navigation/tabs';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import {
  collectorFixture,
  conversationFixture,
  conversationPage,
  publicItemsPage,
  referencesPageFixture,
} from '../support/fixtures';
import { mockApi, ok, type MockRoutes } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { TestProviders, resetAppState } from '../test-utils';

/** The Profile tab reads your public page (stage R6). */
const PROFILE_ROUTES: MockRoutes = {
  'GET /api/v1/collectors/{handle}': ok(collectorFixture()),
  'GET /api/v1/collectors/{handle}/inventory': ok(publicItemsPage([])),
  'GET /api/v1/collectors/{handle}/binders': ok([]),
  'GET /api/v1/collectors/{handle}/references': ok(referencesPageFixture({ items: [] })),
  'GET /api/v1/wishlist': ok([]),
};

function TestRootLayout() {
  return (
    <TestProviders port={new FakeAuthPort(testUser())}>
      <Slot />
    </TestProviders>
  );
}

/** The root of the app: a stack over the tabs, as `RootNavigator` draws it. */
function TestRootStack() {
  return (
    <TestProviders port={new FakeAuthPort(testUser())}>
      <Stack />
    </TestProviders>
  );
}

const routes = {
  _layout: TestRootLayout,
  '(tabs)/_layout': TabLayout,
  '(tabs)/index': HomeRoute,
  '(tabs)/inventory': InventoryScreen,
  '(tabs)/search': SearchScreen,
  '(tabs)/messages': MessagesScreen,
  '(tabs)/wishlist': WishlistRedirect,
  '(tabs)/profile': ProfileScreen,
};

describe('(tabs) layout', () => {
  beforeEach(() => {
    resetAppState();
    mockApi(signedInRoutes(PROFILE_ROUTES));
  });

  it('declares the five product tabs of stage R7 in order', () => {
    expect(TABS.map((tab) => tab.title)).toEqual([
      'Home',
      'Search',
      'Inventory',
      'Messages',
      'Profile',
    ]);
    expect(TABS[0]).toMatchObject({ name: 'index', id: 'home' });
    // The old Wishlist tab is a route that redirects into Search, not a tab.
    expect(HIDDEN_TAB_ROUTES).toEqual(['wishlist']);
  });

  it('opens on Home and shows exactly the five tab buttons', async () => {
    renderRouter(routes, { initialUrl: '/' });

    expect(await screen.findByTestId('screen-home')).toBeOnTheScreen();
    for (const tab of TABS) {
      expect(screen.getByLabelText(`${tab.title} tab`)).toBeOnTheScreen();
      // Stable ids for the native Maestro flows.
      expect(screen.getByTestId(`tab-${tab.id}`)).toBeOnTheScreen();
    }
    expect(screen.queryByLabelText('Map tab')).toBeNull();
    expect(screen.queryByLabelText('Wishlist tab')).toBeNull();
    // Home draws its own top row: the region and game pills, the bell.
    expect(await screen.findByTestId('notification-bell-home')).toBeOnTheScreen();
    expect(screen.getByTestId('home-region')).toBeOnTheScreen();
    expect(screen.getByTestId('home-game')).toBeOnTheScreen();
    expect(screen.getByTestId('home-search-field')).toBeOnTheScreen();
  });

  it("sends the old Map tab links to Search's map on their state", async () => {
    renderRouter(routes, { initialUrl: '/?region=americas-north&subdivision=CA-QC' });
    expect(await screen.findByTestId('screen-search')).toBeOnTheScreen();
    expect(await screen.findByTestId('search-map')).toBeOnTheScreen();
    expect(screen.queryByTestId('screen-home')).toBeNull();
  });

  it('follows an old Map tab link once: the Home tab opens Home afterwards (R7 review U1/F1)', async () => {
    const app = renderRouter(routes, { initialUrl: '/?region=europe&subdivision=DE-BY' });
    expect(await screen.findByTestId('search-map')).toBeOnTheScreen();

    // The link's parameters stayed on the Home route and sent every later visit back to Search.
    fireEvent.press(screen.getByLabelText('Home tab'));
    expect(await screen.findByTestId('screen-home')).toBeOnTheScreen();
    fireEvent.press(screen.getByLabelText('Profile tab'));
    expect(await screen.findByTestId('screen-profile')).toBeOnTheScreen();
    fireEvent.press(screen.getByLabelText('Home tab'));
    expect(await screen.findByTestId('screen-home')).toBeOnTheScreen();
    expect(app.getPathnameWithParams()).toBe('/');
  });

  it('sends the old Wishlist tab to the Wishlist segment of Search', async () => {
    renderRouter(routes, { initialUrl: '/wishlist' });
    expect(await screen.findByTestId('screen-search')).toBeOnTheScreen();
    expect(await screen.findByTestId('search-wishlist')).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: /^Wishlist/ })).toBeSelected();
  });

  it('sends the old binders of a state, a screen of the root stack, to Search › Binders on that state', async () => {
    // A link of the root stack into a tab went through every navigator with its parameters: one
    // named like a navigator's own (`state`) crashed the tabs (stage R5 review, P1).
    renderRouter(
      {
        ...routes,
        _layout: TestRootStack,
        'regions/[region]/[code]': PlaceBindersRedirect,
      },
      { initialUrl: '/regions/americas-north/CA-QC' }
    );
    expect(await screen.findByTestId('screen-search')).toBeOnTheScreen();
    expect(await screen.findByTestId('binders-state-chip')).toHaveTextContent(/Quebec/);
    expect(screen.getByTestId('search-segment-binders')).toBeSelected();
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
    await screen.findByTestId('screen-home');
    // Unread chats, not messages (spec section 4), muted ones left out.
    expect(await screen.findByLabelText('Messages tab, 2 unread chats')).toBeOnTheScreen();
    expect(await screen.findByLabelText('Notifications, 5 unread')).toBeOnTheScreen();
    expect(screen.getByTestId('notification-bell-home-badge')).toHaveTextContent('5');
  });

  it('navigates to the Profile tab', async () => {
    renderRouter(routes, { initialUrl: '/' });
    await screen.findByTestId('screen-home');

    fireEvent.press(screen.getByLabelText('Profile tab'));

    expect(await screen.findByTestId('screen-profile')).toBeOnTheScreen();
    expect(await screen.findByTestId('profile-name')).toHaveTextContent('Maïka Test');
  });
});
