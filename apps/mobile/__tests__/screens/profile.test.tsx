import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { Dimensions, Share } from 'react-native';

import ProfileScreen from '@/app/(tabs)/profile';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import {
  WISH_ID,
  collectorFixture,
  privacyFixture,
  publicBinderSummaryFixture,
  publicItemFixture,
  publicItemsPage,
  referencesPageFixture,
  wishFixture,
} from '../support/fixtures';
import { mockApi, ok, problem, type MockRoutes } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());

const CARD = publicItemFixture({ askingPriceText: '$11.50' });
const CORE = publicBinderSummaryFixture({
  id: 'core-1',
  name: 'Snake-Eye core',
  sellsAsCore: true,
  askingPriceText: '$180',
  itemCount: 0,
});

// The default text size of a phone (jest's window says 2, a larger size where rows stack).
const WINDOW = Dimensions.get('window');
beforeEach(() => {
  Dimensions.set({ window: { ...WINDOW, fontScale: 1 }, screen: { ...WINDOW, fontScale: 1 } });
  resetRouterMock();
  resetAppState();
});

afterAll(() => {
  Dimensions.set({ window: WINDOW, screen: WINDOW });
});

function routes(extra: MockRoutes = {}): MockRoutes {
  return signedInRoutes({
    'GET /api/v1/collectors/{handle}': ok(collectorFixture()),
    'GET /api/v1/collectors/{handle}/inventory': ok(publicItemsPage([CARD])),
    'GET /api/v1/collectors/{handle}/binders': ok([CORE]),
    'GET /api/v1/collectors/{handle}/references': ok(referencesPageFixture()),
    'GET /api/v1/wishlist': ok([wishFixture()]),
    ...extra,
  });
}

const render = () => renderWithProviders(<ProfileScreen />, { port: new FakeAuthPort(testUser()) });

describe('Your Profile tab (mockup screen 21)', () => {
  it('has the title, the bell and the gear, then your page as others see it', async () => {
    const api = mockApi(routes());
    render();
    expect(screen.getByText('Profile')).toBeOnTheScreen();
    expect(screen.getByTestId('profile-settings').props.accessibilityLabel).toBe('Settings');
    expect(screen.getByTestId('profile-loading')).toBeOnTheScreen();

    expect(await screen.findByTestId('profile-name')).toHaveTextContent('Maïka Test');
    expect(await screen.findByTestId('notification-bell-profile')).toBeOnTheScreen();
    expect(screen.getByTestId('profile-handle-label')).toHaveTextContent('@maika');
    expect(screen.getByTestId('profile-rating')).toHaveTextContent(/4\.5$/);
    // Your line: the city you show, the province, member since; no "Active" (you are here).
    expect(screen.getByTestId('profile-line')).toHaveTextContent(
      'Montréal, Quebec · Member since 2026'
    );
    expect(screen.getByTestId('profile-chips')).toHaveTextContent('PokémonTracked shipping');
    // The same page others see, read from the public profile.
    expect(api.callsTo('GET /api/v1/collectors/{handle}')[0]?.path).toBe(
      '/api/v1/collectors/maika'
    );
    expect(await screen.findByTestId(`profile-card-${CARD.id}`)).toHaveTextContent(/\$11\.50/);
    expect(screen.getByTestId('profile-binder-core-1')).toHaveTextContent(/Snake-Eye core\$180/);
    expect(screen.getByTestId('profile-bio-text')).toHaveTextContent(
      'Binder collector in Montréal.'
    );
    expect(await screen.findByText('Fair and friendly trader.')).toBeOnTheScreen();
    // Edit profile and Share profile instead of Message; no "⋯".
    expect(screen.getByTestId('profile-edit')).toBeOnTheScreen();
    expect(screen.getByTestId('profile-share')).toBeOnTheScreen();
    expect(screen.queryByTestId('collector-message')).toBeNull();
    expect(screen.queryByTestId('collector-menu')).toBeNull();
    // Never coordinates.
    expect(screen.queryByText(/45\.5|73\.5|km/)).toBeNull();
  });

  it('opens Settings from the gear, the editor from Edit profile, and shares your link', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    mockApi(routes());
    render();
    fireEvent.press(screen.getByTestId('profile-settings'));
    expect(mockRouter.push).toHaveBeenCalledWith('/settings');
    fireEvent.press(await screen.findByTestId('profile-edit'));
    expect(mockRouter.push).toHaveBeenCalledWith('/settings/profile');
    fireEvent.press(screen.getByTestId('profile-share'));
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(JSON.stringify(share.mock.calls[0]?.[0])).toContain(
      'https://www.orenjitrade.com/collectors/maika'
    );
    share.mockRestore();
  });

  it('leads "See all" to your Inventory, Inventory › Binders and Search › Wishlist', async () => {
    mockApi(routes());
    render();
    fireEvent.press(await screen.findByTestId('profile-cards-see-all'));
    expect(mockRouter.navigate).toHaveBeenLastCalledWith({
      pathname: '/inventory',
      params: { view: 'cards' },
    });
    fireEvent.press(screen.getByTestId('profile-binders-see-all'));
    expect(mockRouter.navigate).toHaveBeenLastCalledWith({
      pathname: '/inventory',
      params: { view: 'binders' },
    });
    fireEvent.press(screen.getByTestId('profile-wishes-see-all'));
    expect(mockRouter.navigate).toHaveBeenLastCalledWith({
      pathname: '/search',
      params: { segment: 'wishlist' },
    });
    // Your card opens Edit card, your binder Edit binder.
    fireEvent.press(screen.getByTestId(`profile-card-${CARD.id}`));
    expect(mockRouter.push).toHaveBeenLastCalledWith({
      pathname: '/items/[id]',
      params: { id: CARD.id },
    });
    fireEvent.press(screen.getByTestId('profile-binder-core-1'));
    expect(mockRouter.push).toHaveBeenLastCalledWith({
      pathname: '/binders/edit',
      params: { id: 'core-1' },
    });
  });

  it('lists your wishes without "I have it"; a row edits the wish', async () => {
    mockApi(routes());
    render();
    const wish = await screen.findByTestId(`profile-wish-${WISH_ID}`);
    expect(wish).toHaveTextContent(/Azure-Eyes Sky Dragon/);
    expect(wish).toHaveTextContent(/Any printing · NM only · 85% TCG/);
    expect(screen.queryByText('I have it')).toBeNull();
    fireEvent.press(wish);
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/wishlist/edit',
      params: { id: WISH_ID },
    });
    expect(screen.queryByTestId('profile-wishes-hidden')).toBeNull();
  });

  it('says when others cannot see your wishes', async () => {
    mockApi(
      routes({
        'GET /api/v1/me/settings/privacy': ok(privacyFixture({ wishlistVisible: false })),
      })
    );
    render();
    expect(await screen.findByTestId('profile-wishes-hidden')).toHaveTextContent(
      'Only you see your wishes. Turn on “Let others see what you want” in Settings › Privacy to show them here.'
    );
  });

  it('says "Not on the map" without a public place; it opens Location', async () => {
    mockApi(
      routes({ 'GET /api/v1/collectors/{handle}': ok(collectorFixture({ location: undefined })) })
    );
    render();
    const line = await screen.findByTestId('profile-line');
    expect(line).toHaveTextContent('Not on the map · Member since 2026');
    expect(line.props.accessibilityRole).toBe('link');
    fireEvent.press(line);
    expect(mockRouter.push).toHaveBeenCalledWith('/settings/location');
  });

  it('says how to fill each empty section', async () => {
    mockApi(
      routes({
        'GET /api/v1/collectors/{handle}': ok(
          collectorFixture({ bio: '', rating: { average: null, count: 0 } })
        ),
        'GET /api/v1/collectors/{handle}/inventory': ok(publicItemsPage([])),
        'GET /api/v1/collectors/{handle}/binders': ok([]),
        'GET /api/v1/collectors/{handle}/references': ok(referencesPageFixture({ items: [] })),
        'GET /api/v1/wishlist': ok([]),
      })
    );
    render();
    expect(await screen.findByTestId('profile-cards-empty')).toHaveTextContent(
      'No public cards yet. Make cards public in Inventory so collectors in your region can find them.'
    );
    expect(await screen.findByTestId('profile-binders-empty')).toHaveTextContent(
      'No public binders yet. Make a binder public, or sell a deck core, in Inventory › Binders.'
    );
    expect(await screen.findByTestId('profile-wishes-empty')).toHaveTextContent(
      'No wishes yet. Add the cards you want in Search › Wishlist.'
    );
    expect(screen.getByTestId('profile-bio-text')).toHaveTextContent(
      'No bio yet. Add a few words with Edit profile.'
    );
    expect(screen.getByTestId('profile-ratings-empty')).toHaveTextContent('No ratings yet.');
    // Your "See all" still leads where you add them.
    expect(screen.getByTestId('profile-cards-see-all')).toBeOnTheScreen();
  });

  it('shows an error with retry', async () => {
    const api = mockApi(
      routes({
        'GET /api/v1/collectors/{handle}': [
          problem(500, 'INTERNAL_ERROR', 'boom'),
          ok(collectorFixture()),
        ],
      })
    );
    render();
    const error = await screen.findByTestId('profile-error');
    expect(error).toHaveTextContent(/We could not load your profile/);
    fireEvent.press(within(error).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('profile-name')).toHaveTextContent('Maïka Test');
    expect(api.callsTo('GET /api/v1/collectors/{handle}')).toHaveLength(2);
  });

  it('has no Offers, Trades, Premium, Credits or Support (ADR 0018, ADR 0019)', async () => {
    mockApi(routes());
    render();
    await screen.findByTestId('profile-name');
    for (const id of ['profile-offers', 'profile-trades', 'profile-premium', 'profile-credits']) {
      expect(screen.queryByTestId(id)).toBeNull();
    }
    expect(screen.queryByText(/^(Offers|Trades|Premium|Credits|Support OrenjiTrade)$/)).toBeNull();
  });
});
