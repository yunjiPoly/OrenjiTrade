import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

import AccountSettingsScreen from '@/app/settings/account';
import AppearanceSettingsScreen from '@/app/settings/appearance';
import DeleteAccountScreen from '@/app/settings/delete-account';
import SettingsScreen from '@/app/settings/index';
import LocationSettingsScreen from '@/app/settings/location';
import NotificationSettingsScreen from '@/app/settings/notifications';
import PrivacySettingsScreen from '@/app/settings/privacy';
import ProfileSettingsScreen from '@/app/settings/profile';
import { useRecentSearchesStore } from '@/src/features/catalog/recentSearchesStore';
import { TAG_REFUSED } from '@/src/features/profile/useProfileEditor';
import { savedDetailKey } from '@/src/features/shipping/savedDetails';
import { useAppStore } from '@/src/store/useAppStore';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import {
  GAMES,
  TAGS,
  blockedUserFixture,
  deletionFixture,
  locationFixture,
  meFixture,
  myReportFixture,
  notificationsFixture,
  privacyFixture,
  profileFixture,
  ONTARIO,
} from '../support/fixtures';
import { mockApi, noContent, ok, problem, type MockRequest } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());
// Edit profile's leave guard: the test plays the back gesture held by `usePreventRemove`.
const mockLeave = { held: false, tryToLeave: () => undefined as void };
jest.mock('expo-router/react-navigation', () => ({
  usePreventRemove: (held: boolean, callback: (options: { data: { action: unknown } }) => void) => {
    mockLeave.held = held;
    mockLeave.tryToLeave = () => callback({ data: { action: { type: 'GO_BACK' } } });
  },
}));
jest.mock('@/src/features/account/exportData', () => ({
  exportMyData: jest.fn(async () => 'orenjitrade-export-maika-2026-10-04.json'),
}));

const exportMock = () =>
  (jest.requireMock('@/src/features/account/exportData') as { exportMyData: jest.Mock })
    .exportMyData;

const port = () => new FakeAuthPort(testUser());

beforeEach(() => {
  resetRouterMock();
  resetAppState();
  exportMock().mockClear();
  mockLeave.held = false;
});

describe('Settings (47)', () => {
  it('shows the profile card, the groups with their values, and opens each page', async () => {
    const session = port();
    mockApi(
      signedInRoutes({
        'GET /api/v1/me/location': ok(locationFixture({ discoverable: true })),
        'GET /api/v1/me/blocks': ok([
          blockedUserFixture(),
          blockedUserFixture({ id: 'b2', handle: 'collector9', displayName: 'Zoé' }),
        ]),
        'GET /api/v1/me/reports': ok([
          myReportFixture(),
          myReportFixture({ id: 'r2', status: 'ACTIONED', resolvedAt: '2026-10-05T12:00:00Z' }),
        ]),
      })
    );
    renderWithProviders(<SettingsScreen />, { port: session });
    expect(screen.getByRole('header', { name: 'Settings' })).toBeOnTheScreen();
    const card = await screen.findByRole('link', { name: 'Maïka Test, @maika. Edit profile' });
    expect(within(card).getByText('@maika · Edit profile')).toBeOnTheScreen();
    for (const group of ['WHERE YOU SHIP FROM', 'APP', 'SAFETY', 'ACCOUNT']) {
      expect(screen.getByText(group)).toBeOnTheScreen();
    }
    expect(await screen.findByText('Quebec, Canada · On the map')).toBeOnTheScreen();
    expect(screen.getByText('Address and e-Transfer, on this phone only')).toBeOnTheScreen();
    // A new install is dark (redesign default); Appearance says so.
    expect(screen.getByRole('link', { name: 'Appearance' })).toHaveProp('accessibilityValue', {
      text: 'Dark',
    });
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Blocked collectors' })).toHaveProp(
        'accessibilityValue',
        { text: '2' }
      )
    );
    await waitFor(() => expect(screen.getByText('1 waiting')).toBeOnTheScreen());
    expect(screen.getByRole('link', { name: 'Account' })).toHaveProp('accessibilityValue', {
      text: 'maika@example.test',
    });
    expect(screen.getByTestId('settings-version')).toHaveTextContent(/^OrenjiTrade/);
    // Offers, payouts and the paid features left the phone (ADR 0018, ADR 0019).
    expect(screen.queryByText(/Offers|Payouts|Premium|Credits|Donat/)).toBeNull();

    for (const [label, href] of [
      ['Maïka Test, @maika. Edit profile', '/settings/profile'],
      ['Location and discoverability', '/settings/location'],
      ['Shipping details', '/settings/shipping'],
      ['Notifications', '/settings/notifications'],
      ['Privacy', '/settings/privacy'],
      ['Appearance', '/settings/appearance'],
      ['Blocked collectors', '/settings/blocked'],
      ['My reports', '/settings/reports'],
      ['Account', '/settings/account'],
      ['Legal', '/legal'],
    ] as const) {
      fireEvent.press(screen.getByRole('link', { name: label }));
      expect(mockRouter.push).toHaveBeenLastCalledWith(href);
    }
    fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(session.signOut).toHaveBeenCalled());
  });

  it('says a place is not set yet, waits for the values and leaves out those that failed', async () => {
    mockApi(
      signedInRoutes({
        'GET /api/v1/me/location': ok({ discoverable: false }),
        'GET /api/v1/me/blocks': problem(503, 'SERVICE_UNAVAILABLE', 'down'),
        'GET /api/v1/me/reports': ok([myReportFixture({ status: 'DISMISSED' })]),
      })
    );
    useAppStore.getState().setThemeOverride('system');
    renderWithProviders(<SettingsScreen />, { port: port() });
    expect(await screen.findByText('Not set yet · Not on the map')).toBeOnTheScreen();
    expect(screen.getByRole('link', { name: 'Appearance' })).toHaveProp('accessibilityValue', {
      text: 'Same as the phone',
    });
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Blocked collectors' })).toHaveProp(
        'accessibilityValue',
        undefined
      )
    );
    // Nothing waits for a decision: no value.
    expect(screen.queryByText(/waiting/)).toBeNull();
  });
});

describe('Edit profile (48)', () => {
  it('saves the details and the tags with one "Save changes", in one request', async () => {
    const api = mockApi(
      signedInRoutes({
        'PUT /api/v1/me/profile': ({ body }: MockRequest) => {
          const sent = body as { tags?: { tagIds: string[] } };
          return ok({
            ...profileFixture(),
            ...(body as object),
            tags: TAGS.filter((tag) => sent.tags?.tagIds.includes(tag.id)),
          });
        },
      })
    );
    renderWithProviders(<ProfileSettingsScreen />, { port: port() });
    const save = await screen.findByTestId('profile-save');
    expect(save).toHaveTextContent('No changes yet');
    expect(save).toBeDisabled();
    expect(screen.getByRole('header', { name: 'Edit profile' })).toBeOnTheScreen();

    fireEvent.changeText(screen.getByLabelText('Display name'), 'Maïka T.');
    fireEvent.press(screen.getByRole('checkbox', { name: 'Yu-Gi-Oh!' }));
    expect(screen.getByTestId('profile-save')).toHaveTextContent('Save changes');
    // The saved tag is a filled chip; unpicked, it stays on the page to be picked again.
    const saved = screen.getByTestId('profile-tag-tracked-shipping');
    expect(saved).toBeChecked();
    fireEvent.press(saved);
    expect(screen.getByTestId('profile-tag-tracked-shipping')).not.toBeChecked();
    // "Add a tag" opens the search and the suggestions.
    fireEvent.press(screen.getByRole('button', { name: 'Add a tag' }));
    fireEvent.press(await screen.findByTestId('tag-suggestion-binder-collector'));
    fireEvent.press(screen.getByTestId('profile-tag-sheet-done'));
    expect(screen.getByTestId('profile-tag-binder-collector')).toBeChecked();

    fireEvent.press(screen.getByTestId('profile-save'));
    expect(await screen.findByTestId('snackbar')).toHaveTextContent(/Profile saved\.$/);
    expect(api.callsTo('PUT /api/v1/me/profile')).toHaveLength(1);
    expect(api.callsTo('PUT /api/v1/me/profile/tags')).toHaveLength(0);
    expect(api.callsTo('PUT /api/v1/me/profile')[0]?.body).toEqual({
      handle: 'maika',
      displayName: 'Maïka T.',
      bio: 'Binder collector in Montréal.',
      games: ['pokemon', 'yugioh'],
      languages: ['fr', 'en'],
      tags: { tagIds: ['tag-2'], customLabels: [] },
    });
    await waitFor(() =>
      expect(screen.getByTestId('profile-save')).toHaveTextContent('No changes yet')
    );
  });

  it('is clean again when a value comes back; details alone send no tags', async () => {
    const api = mockApi(
      signedInRoutes({
        'PUT /api/v1/me/profile': ({ body }: MockRequest) =>
          ok({ ...profileFixture(), ...(body as object) }),
      })
    );
    renderWithProviders(<ProfileSettingsScreen />, { port: port() });
    const bio = await screen.findByLabelText('Bio');
    fireEvent.changeText(bio, 'Changed');
    expect(screen.getByTestId('profile-save')).not.toBeDisabled();
    fireEvent.changeText(screen.getByLabelText('Bio'), 'Binder collector in Montréal.');
    expect(screen.getByTestId('profile-save')).toBeDisabled();
    expect(screen.getByText('29 / 500')).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('checkbox', { name: 'Spanish' }));
    fireEvent.press(screen.getByTestId('profile-save'));
    await waitFor(() => expect(api.callsTo('PUT /api/v1/me/profile')).toHaveLength(1));
    const body = api.callsTo('PUT /api/v1/me/profile')[0]?.body as Record<string, unknown>;
    expect(body.languages).toEqual(['fr', 'en', 'es']);
    expect(body).not.toHaveProperty('tags');
  });

  it('checks the fields, maps a taken handle, a refused tag and other failures', async () => {
    const api = mockApi(
      signedInRoutes({
        'PUT /api/v1/me/profile': [
          problem(409, 'HANDLE_TAKEN', 'taken'),
          problem(400, 'VALIDATION_FAILED', 'Validation failed', {
            errors: [{ field: 'customLabels[0]', message: 'contains a term that is not allowed' }],
          }),
          problem(429, 'RATE_LIMITED', 'slow'),
        ],
      })
    );
    renderWithProviders(<ProfileSettingsScreen />, { port: port() });
    fireEvent.changeText(await screen.findByLabelText('Display name'), '');
    fireEvent.press(screen.getByTestId('profile-save'));
    expect(screen.getByText('Enter a display name.')).toBeOnTheScreen();
    expect(api.callsTo('PUT /api/v1/me/profile')).toHaveLength(0);

    fireEvent.changeText(screen.getByLabelText('Display name'), 'Maïka');
    fireEvent.changeText(screen.getByLabelText('Handle'), 'collector2');
    fireEvent.press(screen.getByTestId('profile-save'));
    expect(
      await screen.findByText('That handle is already taken. Try another one.')
    ).toBeOnTheScreen();

    fireEvent.changeText(screen.getByLabelText('Handle'), 'maika_2');
    fireEvent.press(screen.getByTestId('profile-save'));
    expect(await screen.findByTestId('profile-error')).toHaveTextContent(
      new RegExp(`${TAG_REFUSED.replace(/\./g, '\\.')}$`)
    );

    fireEvent.press(screen.getByTestId('profile-save'));
    await waitFor(() =>
      expect(screen.getByTestId('profile-error')).toHaveTextContent(
        /Too many requests in a short time/
      )
    );
  });

  it('previews the public profile and asks before leaving with unsaved changes', async () => {
    mockApi(signedInRoutes());
    renderWithProviders(<ProfileSettingsScreen />, { port: port() });
    fireEvent.press(await screen.findByRole('link', { name: 'Preview your public profile' }));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/collectors/[id]',
      params: { id: 'maika' },
    });
    // Nothing changed: leaving is free.
    expect(mockLeave.held).toBe(false);
    fireEvent.changeText(screen.getByLabelText('Bio'), 'Something new');
    expect(mockLeave.held).toBe(true);
    act(() => mockLeave.tryToLeave());
    const sheet = await screen.findByTestId('profile-leave-sheet');
    expect(within(sheet).getByText('Leave without saving?')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('profile-leave-sheet-cancel'));
    await waitFor(() => expect(screen.queryByText('Leave without saving?')).toBeNull());
    expect(screen.getByLabelText('Bio').props.value).toBe('Something new');
  });

  it('shows the loading and error states with Try again', async () => {
    mockApi(
      signedInRoutes({
        'GET /api/v1/me/profile': [problem(500, 'INTERNAL_ERROR', 'boom'), ok(profileFixture())],
      })
    );
    renderWithProviders(<ProfileSettingsScreen />, { port: port() });
    expect(screen.getByTestId('settings-profile-loading')).toBeOnTheScreen();
    expect(await screen.findByText('We could not load your profile')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('profile-save')).toBeOnTheScreen();
  });
});

describe('Location (49)', () => {
  it('saves a declared place with pickers side by side (no map, no GPS)', async () => {
    const api = mockApi(
      signedInRoutes({
        'PUT /api/v1/me/location': ok(
          locationFixture({
            location: { ...ONTARIO, regionName: 'Americas (North)', city: null, showCity: true },
          })
        ),
      })
    );
    renderWithProviders(<LocationSettingsScreen />, { port: port() });
    expect((await screen.findByLabelText('City (optional)')).props.value).toBe('Montréal');
    expect(
      screen.getByText(
        'Only on your profile, and only while the switch below is on. Never used to locate you.'
      )
    ).toBeOnTheScreen();
    expect(screen.getByTestId('location-protect')).toHaveTextContent(
      /How OrenjiTrade protects where you live.*never uses GPS.*no pin, no point, no distance.*only on your profile/
    );
    const save = screen.getByTestId('location-save');
    expect(save).toHaveTextContent('Save location');
    expect(save).toBeDisabled();
    expect(screen.queryByTestId('collector-map-view')).toBeNull();

    fireEvent.press(screen.getByTestId('location-subdivision'));
    fireEvent.press(await screen.findByTestId('location-subdivision-option-CA-ON'));
    fireEvent.changeText(screen.getByLabelText('City (optional)'), '');
    fireEvent.press(screen.getByTestId('location-save'));
    expect(await screen.findByTestId('snackbar')).toHaveTextContent(
      /Location saved · Ontario, Canada\.$/
    );
    expect(api.callsTo('PUT /api/v1/me/location')[0]?.body).toEqual({
      countryCode: 'CA',
      subdivisionCode: 'CA-ON',
      city: null,
      showCity: true,
    });
  });

  it('puts "Show me on the map" first, saved at once, with what collectors see', async () => {
    const api = mockApi(
      signedInRoutes({
        'PUT /api/v1/me/settings/privacy': ({ body }: MockRequest) => ok(body),
      })
    );
    renderWithProviders(<LocationSettingsScreen />, { port: port() });
    const optIn = await screen.findByRole('switch', { name: 'Show me on the map' });
    expect(optIn).not.toBeChecked();
    expect(screen.getByTestId('location-visibility')).toHaveTextContent(
      'You are hidden from the map and from searches.'
    );
    fireEvent.press(optIn);
    expect(await screen.findByTestId('snackbar')).toHaveTextContent(/You now appear on the map\.$/);
    expect(api.callsTo('PUT /api/v1/me/settings/privacy')[0]?.body).toEqual({
      ...privacyFixture(),
      discoverable: true,
    });
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Show me on the map' })).toBeChecked()
    );
    expect(screen.getByTestId('location-visibility')).toHaveTextContent(
      'Collectors see you in Quebec, Canada.'
    );
  });

  it('without a saved place, the map switch waits and nothing can be removed', async () => {
    mockApi(signedInRoutes({ 'GET /api/v1/me/location': ok({ discoverable: false }) }));
    renderWithProviders(<LocationSettingsScreen />, { port: port() });
    const optIn = await screen.findByRole('switch', { name: 'Show me on the map' });
    expect(optIn).toBeDisabled();
    expect(screen.getByTestId('location-visibility')).toHaveTextContent(
      'You have not chosen a location yet, so you never appear on the map.'
    );
    expect(screen.queryByRole('button', { name: 'Remove my location' })).toBeNull();
    // Saving without a state says what is missing.
    fireEvent.press(screen.getByTestId('location-country'));
    fireEvent.press(await screen.findByTestId('location-country-option-CA'));
    fireEvent.press(screen.getByTestId('location-save'));
    expect(await screen.findByTestId('location-missing')).toHaveTextContent(
      /Choose your state or province\.$/
    );
  });

  it('removes the location after the sheet asks', async () => {
    const api = mockApi(signedInRoutes({ 'DELETE /api/v1/me/location': noContent }));
    renderWithProviders(<LocationSettingsScreen />, { port: port() });
    fireEvent.press(await screen.findByRole('button', { name: 'Remove my location' }));
    const sheet = await screen.findByTestId('location-remove-sheet');
    expect(within(sheet).getByText('Remove your location?')).toBeOnTheScreen();
    expect(
      within(sheet).getByText(
        'You will disappear from the map and from searches in your region until you choose a location again.'
      )
    ).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('location-remove-sheet-confirm'));
    expect(await screen.findByTestId('snackbar')).toHaveTextContent(/Your location was removed\.$/);
    expect(api.callsTo('DELETE /api/v1/me/location')).toHaveLength(1);
    await waitFor(() =>
      expect(screen.getByTestId('location-visibility')).toHaveTextContent(
        /You have not chosen a location yet/
      )
    );
  });

  it('shows a save failure inline, and the loading and error states', async () => {
    mockApi(
      signedInRoutes({
        'PUT /api/v1/me/location': problem(400, 'VALIDATION_FAILED', 'Unknown subdivision.'),
      })
    );
    const first = renderWithProviders(<LocationSettingsScreen />, { port: port() });
    fireEvent.press(await screen.findByTestId('location-subdivision'));
    fireEvent.press(await screen.findByTestId('location-subdivision-option-CA-ON'));
    fireEvent.press(screen.getByTestId('location-save'));
    expect(await screen.findByTestId('location-error')).toHaveTextContent(/Unknown subdivision\./);
    first.unmount();

    mockApi(
      signedInRoutes({
        'GET /api/v1/me/location': [
          problem(503, 'SERVICE_UNAVAILABLE', 'down'),
          ok(locationFixture()),
        ],
      })
    );
    renderWithProviders(<LocationSettingsScreen />, { port: port() });
    expect(screen.getByTestId('settings-location-loading')).toBeOnTheScreen();
    expect(await screen.findByText('We could not load your location')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('location-save')).toBeOnTheScreen();
  });
});

describe('Notifications (51)', () => {
  it('dims a channel that is off in the grid and keeps what was chosen', async () => {
    const api = mockApi(
      signedInRoutes({
        // The API still lists the offer and trade categories (kept for the paused web).
        'GET /api/v1/me/settings/notifications': ok(
          notificationsFixture({
            categories: {
              MESSAGE: { inApp: true, push: true, email: false },
              OFFER: { inApp: true, push: false, email: true },
              TRADE: { inApp: false, push: true, email: false },
              RATING: { inApp: true, push: true, email: true },
              BINDER_FRESHNESS: { inApp: true, push: false, email: false },
              REPORT_DECISION: { inApp: true, push: true, email: true },
              MARKETING: { inApp: false, push: false, email: false },
            },
          })
        ),
        'PUT /api/v1/me/settings/notifications': ({ body }: MockRequest) => ok(body),
      })
    );
    renderWithProviders(<NotificationSettingsScreen />, { port: port() });
    const save = await screen.findByTestId('notif-save');
    expect(save).toHaveTextContent('No changes yet');
    // The grid: five topics by App, Push and Email, in the mockup's order.
    const grid = screen.getByTestId('notif-grid');
    expect(within(grid).getByText('WHAT TO NOTIFY ME ABOUT')).toBeOnTheScreen();
    expect(
      within(grid)
        .getAllByRole('checkbox')
        .map((box) => box.props.accessibilityLabel as string)
        .filter((label) => label.endsWith('by email'))
    ).toEqual([
      'Messages by email',
      'Ratings by email',
      'Binder reminders by email',
      'Report decisions by email',
      'News and tips by email',
    ]);

    fireEvent.press(screen.getByRole('checkbox', { name: 'Messages by email' }));
    expect(screen.getByRole('checkbox', { name: 'Messages by email' })).toBeChecked();
    // Email off: its column is dimmed, empty and still.
    fireEvent.press(screen.getByRole('switch', { name: 'Email' }));
    const off = screen.getByRole('checkbox', { name: 'Messages by email, channel off' });
    expect(off).toBeDisabled();
    expect(off).not.toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: 'Ratings by email, channel off' })
    ).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Ratings by push' })).toBeChecked();
    // On again: what was chosen comes back.
    fireEvent.press(screen.getByRole('switch', { name: 'Email' }));
    expect(screen.getByRole('checkbox', { name: 'Messages by email' })).toBeChecked();
    fireEvent.press(screen.getByRole('switch', { name: 'Email' }));

    fireEvent.press(screen.getByTestId('notif-save'));
    expect(await screen.findByTestId('snackbar')).toHaveTextContent(
      /Notification preferences saved\.$/
    );
    const body = api.callsTo('PUT /api/v1/me/settings/notifications')[0]?.body as ReturnType<
      typeof notificationsFixture
    >;
    expect(body.emailEnabled).toBe(false);
    expect(body.wishlistAlerts).toBe(true);
    expect(body.categories.MESSAGE).toEqual({ inApp: true, push: true, email: true });
    expect(body.categories.RATING).toEqual({ inApp: true, push: true, email: true });
    // Offers and trades left the phone (ADR 0018): no row, and their stored values go back.
    expect(screen.queryAllByRole('checkbox', { name: /offer|trade/i })).toHaveLength(0);
    expect(body.categories.OFFER).toEqual({ inApp: true, push: false, email: true });
    expect(body.categories.TRADE).toEqual({ inApp: false, push: true, email: false });
    await waitFor(() =>
      expect(screen.getByTestId('notif-save')).toHaveTextContent('No changes yet')
    );
  });

  it('is clean again when a change is undone; keeps the push note', async () => {
    mockApi(signedInRoutes());
    renderWithProviders(<NotificationSettingsScreen />, { port: port() });
    fireEvent.press(await screen.findByRole('switch', { name: 'Push' }));
    expect(screen.getByTestId('notif-save')).toHaveTextContent('Save preferences');
    fireEvent.press(screen.getByRole('switch', { name: 'Push' }));
    expect(screen.getByTestId('notif-save')).toBeDisabled();
    expect(
      screen.getByText(
        'Turn a channel off to silence it everywhere. Push notifications on this device arrive with a later release; your choice is already saved.'
      )
    ).toBeOnTheScreen();
  });

  it('checks quiet hours in 24-hour time and names the time zone', async () => {
    const api = mockApi(signedInRoutes());
    renderWithProviders(<NotificationSettingsScreen />, { port: port() });
    fireEvent.press(await screen.findByRole('switch', { name: 'Pause push at night' }));
    expect(screen.getByTestId('notif-time-zone')).toHaveTextContent('Time zone: America/Toronto');
    fireEvent.changeText(screen.getByLabelText('From'), '25:00');
    expect(screen.getByTestId('notif-quiet-error')).toHaveTextContent(/Use 24-hour times/);
    expect(screen.getByTestId('notif-save')).toBeDisabled();
    expect(api.callsTo('PUT /api/v1/me/settings/notifications')).toHaveLength(0);
  });

  it('says next to the wishlist alerts switch that alerts need a country and state', async () => {
    mockApi(signedInRoutes({ 'GET /api/v1/me/location': ok({ discoverable: false }) }));
    renderWithProviders(<NotificationSettingsScreen />, { port: port() });
    expect(await screen.findByRole('switch', { name: 'Wishlist alerts' })).toBeChecked();
    expect(
      screen.getByText('One alert when a card you wish for is listed in your region.')
    ).toBeOnTheScreen();
    expect(await screen.findByTestId('wishlist-location-prompt')).toHaveTextContent(
      /Set your country and state to get wishlist alerts/
    );
    fireEvent.press(screen.getByTestId('wishlist-location-action'));
    expect(mockRouter.push).toHaveBeenCalledWith('/settings/location');
  });

  it('shows the loading and error states with Try again', async () => {
    mockApi(
      signedInRoutes({
        'GET /api/v1/me/settings/notifications': [
          problem(503, 'SERVICE_UNAVAILABLE', 'down'),
          ok(notificationsFixture()),
        ],
      })
    );
    renderWithProviders(<NotificationSettingsScreen />, { port: port() });
    expect(screen.getByTestId('settings-notifications-loading')).toBeOnTheScreen();
    fireEvent.press(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('notif-grid')).toBeOnTheScreen();
  });
});

describe('the largest text sizes (stage R13 walk)', () => {
  const window = Dimensions.get('window');
  const textSize = (fontScale: number) =>
    act(() => {
      Dimensions.set({ window: { ...window, fontScale }, screen: { ...window, fontScale } });
    });
  afterEach(() => textSize(window.fontScale));

  it('names each box of the grid under its topic, and gives the words the whole row', async () => {
    mockApi(signedInRoutes());
    textSize(3.1);
    renderWithProviders(<NotificationSettingsScreen />, { port: port() });
    const grid = await screen.findByTestId('notif-grid');
    // No column heads: each box says its channel (one topic in the fixture, one "Email").
    expect(within(grid).getAllByText('Email')).toHaveLength(1);
    expect(within(grid).getByRole('checkbox', { name: 'Messages by email' })).toBeOnTheScreen();
    expect(within(grid).getByText('Messages')).toHaveProp('maxFontSizeMultiplier', 2.5);
  });

  it('puts the picture above the name in Settings, without icons or chevrons beside the rows', async () => {
    mockApi(signedInRoutes({ 'GET /api/v1/me/blocks': ok([]), 'GET /api/v1/me/reports': ok([]) }));
    textSize(3.1);
    renderWithProviders(<SettingsScreen />, { port: port() });
    const card = await screen.findByTestId('settings-link-profile');
    expect(card).toHaveStyle({ flexDirection: 'column' });
    expect(screen.getByText('Location and discoverability')).toHaveProp(
      'maxFontSizeMultiplier',
      2.5
    );
  });
});

describe('Privacy (52)', () => {
  it('saves every change at once and restores the last saved state on failure', async () => {
    const api = mockApi(
      signedInRoutes({
        'PUT /api/v1/me/settings/privacy': [
          ({ body }: MockRequest) => ok(body),
          problem(500, 'INTERNAL_ERROR', 'boom'),
        ],
      })
    );
    renderWithProviders(<PrivacySettingsScreen />, { port: port() });
    const wishlist = await screen.findByRole('switch', { name: 'Let others see what you want' });
    expect(screen.getByTestId('privacy-status')).toHaveTextContent('All changes saved');
    // The mockup's order of the Visibility switches.
    expect(
      screen
        .getAllByRole('switch')
        .map((row) => row.props.accessibilityLabel as string)
        .slice(0, 5)
    ).toEqual([
      'Show me on the map',
      'Appear in collector search',
      'Let others see what you want',
      'Show when I was last active',
      'Show when I am online',
    ]);
    expect(wishlist).toBeChecked();
    fireEvent.press(wishlist);
    await waitFor(() =>
      expect(screen.getByTestId('privacy-status')).toHaveTextContent('All changes saved')
    );
    expect(api.callsTo('PUT /api/v1/me/settings/privacy')[0]?.body).toEqual({
      ...privacyFixture(),
      wishlistVisible: false,
    });

    fireEvent.press(screen.getByRole('radio', { name: 'Private' }));
    await waitFor(() =>
      expect(screen.getByTestId('privacy-status')).toHaveTextContent('Last change not saved')
    );
    expect(screen.getByRole('radio', { name: 'Members (recommended)' })).toBeChecked();
    expect(screen.getByTestId('snackbar')).toHaveTextContent(/Please try again in a moment\./);
  });

  it('names who can see the profile and who can message', async () => {
    mockApi(signedInRoutes());
    renderWithProviders(<PrivacySettingsScreen />, { port: port() });
    // The radio group is named by its heading (the card is not one element: its rows are).
    const group = await screen.findByTestId('privacy-messaging');
    expect(within(group).getByRole('header', { name: 'Who can message you' })).toBeOnTheScreen();
    expect(
      within(group)
        .getAllByRole('radio')
        .map((radio) => radio.props.accessibilityLabel as string)
    ).toEqual(['Everyone', 'Members with a profile (recommended)', 'Nobody']);
    expect(screen.getByText('Only you. You also leave the map.')).toBeOnTheScreen();
  });

  it('shows the error state with Try again', async () => {
    mockApi(
      signedInRoutes({
        'GET /api/v1/me/settings/privacy': [
          problem(503, 'SERVICE_UNAVAILABLE', 'down'),
          ok(privacyFixture()),
        ],
      })
    );
    renderWithProviders(<PrivacySettingsScreen />, { port: port() });
    expect(screen.getByTestId('settings-privacy-loading')).toBeOnTheScreen();
    fireEvent.press(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('privacy-status')).toBeOnTheScreen();
  });
});

describe('Privacy › Remember my searches (stage R5)', () => {
  it('is on by default; off clears the recent searches of this phone and stops them', async () => {
    useRecentSearchesStore.setState({ byUser: { 'uid-maika': ['ash'] }, forgetting: {} });
    const api = mockApi(signedInRoutes());
    renderWithProviders(<PrivacySettingsScreen />, { port: port() });
    await screen.findByTestId('privacy-status');
    const remember = screen.getByRole('switch', { name: 'Remember my searches' });
    expect(remember).toBeChecked();
    fireEvent.press(remember);
    expect(screen.getByRole('switch', { name: 'Remember my searches' })).not.toBeChecked();
    expect(useRecentSearchesStore.getState().byUser['uid-maika']).toBeUndefined();
    expect(useRecentSearchesStore.getState().forgetting['uid-maika']).toBe(true);
    // A setting of this phone only: nothing is sent to the server.
    expect(api.callsTo('PUT /api/v1/me/settings/privacy')).toHaveLength(0);
    fireEvent.press(screen.getByRole('switch', { name: 'Remember my searches' }));
    expect(useRecentSearchesStore.getState().forgetting['uid-maika']).toBeUndefined();
  });
});

describe('Appearance (53)', () => {
  it('switches the theme and shows the version and the server', async () => {
    mockApi(
      signedInRoutes({
        'GET /api/v1/meta': ok({
          name: 'OrenjiTrade API',
          version: '0.1.0',
          environment: 'local',
          serverTime: '2026-10-04T12:00:00Z',
        }),
      })
    );
    renderWithProviders(<AppearanceSettingsScreen />, { port: port() });
    // A new install starts in dark (redesign default); the other two stay one tap away.
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
    expect(screen.getByText('New installs start in dark. Saved on this phone.')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('radio', { name: 'Light' }));
    expect(useAppStore.getState().themeOverride).toBe('light');
    fireEvent.press(screen.getByRole('radio', { name: 'Same as the phone' }));
    expect(useAppStore.getState().themeOverride).toBe('system');
    fireEvent.press(screen.getByRole('radio', { name: 'Dark' }));
    expect(useAppStore.getState().themeOverride).toBe('dark');
    expect(await screen.findByTestId('api-status-ready')).toHaveProp('accessibilityValue', {
      text: expect.stringMatching(/^OrenjiTrade API 0\.1\.0, Reached /),
    });
    expect(screen.getByTestId('app-version')).toHaveProp('accessibilityValue', {
      text: expect.stringMatching(/\(local\)$/),
    });
  });

  it('offers Try again when the server is not reached', async () => {
    mockApi(signedInRoutes({ 'GET /api/v1/meta': problem(503, 'SERVICE_UNAVAILABLE', 'down') }));
    renderWithProviders(<AppearanceSettingsScreen />, { port: port() });
    expect(screen.getByTestId('api-status-loading')).toBeOnTheScreen();
    expect(await screen.findByTestId('api-status-error')).toHaveTextContent(/Server not reached/);
  });

  it('credits the card data of the games that hold cards (stage R10)', async () => {
    const games = (withCards: boolean) => [
      { ...GAMES[1], sortOrder: 10, hasCards: true },
      { ...GAMES[0], sortOrder: 20, hasCards: withCards },
      {
        ...GAMES[0],
        id: 'g3',
        slug: 'mtg',
        name: 'Magic: The Gathering',
        shortName: 'Magic',
        sortOrder: 30,
        hasCards: withCards,
      },
    ];
    mockApi(signedInRoutes({ 'GET /api/v1/games': ok(games(false)) }));
    const first = renderWithProviders(<AppearanceSettingsScreen />, { port: port() });
    const before = await screen.findByTestId('card-data-credits');
    expect(before).toHaveProp(
      'accessibilityLabel',
      'Card data and images. Yu-Gi-Oh! card data from YGOPRODeck. Not affiliated with or endorsed by the game publishers.'
    );
    first.unmount();

    mockApi(signedInRoutes({ 'GET /api/v1/games': ok(games(true)) }));
    renderWithProviders(<AppearanceSettingsScreen />, { port: port() });
    expect(screen.getByTestId('card-data-credits-loading')).toBeOnTheScreen();
    const after = await screen.findByTestId('card-data-credits');
    expect(
      within(after).getByText(
        'Yu-Gi-Oh! card data from YGOPRODeck. Pokémon card data from TCGdex. Magic card data and images from Scryfall. Not affiliated with or endorsed by the game publishers.'
      )
    ).toBeOnTheScreen();
  });

  it('keeps every credit when the games cannot be loaded', async () => {
    mockApi(
      signedInRoutes({ 'GET /api/v1/games': problem(503, 'UNAVAILABLE', 'Try again later.') })
    );
    renderWithProviders(<AppearanceSettingsScreen />, { port: port() });
    expect(await screen.findByTestId('card-data-credits', {}, { timeout: 5000 })).toHaveTextContent(
      /YGOPRODeck\. Pokémon card data from TCGdex\. Magic card data and images from Scryfall\./
    );
  });
});

describe('Account (56)', () => {
  it('shows the sign-in details, downloads the data and opens Delete account', async () => {
    mockApi(signedInRoutes());
    renderWithProviders(<AccountSettingsScreen />, { port: port() });
    expect(screen.getByTestId('account-email')).toHaveTextContent('maika@example.test');
    expect(screen.getByTestId('account-verified')).toHaveTextContent('Verified');
    expect(screen.queryByRole('button', { name: 'Resend link' })).toBeNull();
    expect(screen.getByTestId('account-sign-in-method')).toHaveTextContent('Email and password');
    expect(await screen.findByTestId('account-member-since')).toHaveTextContent(/2026/);
    // Staff roles are for staff only.
    expect(screen.queryByText('STAFF ROLES')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Download my data' }));
    expect(await screen.findByTestId('snackbar')).toHaveTextContent(
      /Your data export orenjitrade-export-maika-2026-10-04\.json is ready\.$/
    );
    expect(screen.getByTestId('account-delete-card')).toHaveTextContent(
      /Your profile, cards, tags and location are deleted after a 7-day grace period\./
    );
    fireEvent.press(screen.getByRole('button', { name: 'Delete my account' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/settings/delete-account');
  });

  it('names the sign-in methods of a Google account and the staff roles', async () => {
    mockApi(signedInRoutes({ 'GET /api/v1/me': ok(meFixture({ roles: ['USER', 'MODERATOR'] })) }));
    renderWithProviders(<AccountSettingsScreen />, {
      port: new FakeAuthPort(testUser({ providerIds: ['password', 'google.com'] })),
    });
    expect(screen.getByTestId('account-sign-in-method')).toHaveTextContent(
      'Email and password, Google'
    );
    expect(await screen.findByTestId('account-roles')).toHaveTextContent('Moderator');
    renderWithProviders(<AccountSettingsScreen />, {
      port: new FakeAuthPort(testUser({ providerIds: ['google.com'] })),
    });
    expect(screen.getAllByTestId('account-sign-in-method').at(-1)).toHaveTextContent(/^Google$/);
  });

  it('offers to resend the verification email and reports export failures', async () => {
    const session = new FakeAuthPort(testUser({ emailVerified: false }));
    exportMock().mockRejectedValueOnce(new Error('disk full'));
    mockApi(signedInRoutes());
    renderWithProviders(<AccountSettingsScreen />, { port: session });
    expect(screen.getByTestId('account-verified')).toHaveTextContent('Not verified');
    fireEvent.press(screen.getByRole('button', { name: 'Resend link' }));
    expect(await screen.findByTestId('snackbar')).toHaveTextContent(
      /Verification email sent\. Check your inbox\.$/
    );
    fireEvent.press(screen.getByRole('button', { name: 'Download my data' }));
    await waitFor(() =>
      expect(screen.getByTestId('snackbar')).toHaveTextContent(
        'The export failed. Please try again.'
      )
    );
    fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(session.signOut).toHaveBeenCalled());
  });
});

describe('Delete account (57)', () => {
  async function fill(password: string) {
    fireEvent.press(screen.getByRole('checkbox', { name: 'Download a copy of my data first' }));
    fireEvent.press(screen.getByRole('checkbox', { name: /I understand/ }));
    fireEvent.changeText(screen.getByLabelText('Password'), password);
    fireEvent.press(screen.getByTestId('delete-submit'));
    const sheet = await screen.findByTestId('delete-confirm');
    expect(within(sheet).getByText('Delete your account?')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('delete-confirm-confirm'));
  }

  it('keeps "Delete my account" grey until the confirmation is ticked, then asks for the password', async () => {
    const api = mockApi(signedInRoutes());
    renderWithProviders(<DeleteAccountScreen />, { port: port() });
    for (const fact of [
      'You have 7 days to change your mind. Signing in lets you cancel.',
      'You leave the map, search and Home right away.',
      'Consent and audit records are kept as the law requires.',
    ]) {
      expect(screen.getByText(fact)).toBeOnTheScreen();
    }
    expect(screen.getByText('0 / 500')).toBeOnTheScreen();
    expect(screen.getByTestId('delete-submit')).toBeDisabled();
    fireEvent.press(screen.getByRole('checkbox', { name: /I understand/ }));
    expect(screen.getByTestId('delete-submit')).not.toBeDisabled();
    fireEvent.press(screen.getByTestId('delete-submit'));
    expect(screen.getByText('Enter your password to continue.')).toBeOnTheScreen();
    expect(screen.queryByTestId('delete-confirm')).toBeNull();
    expect(api.callsTo('POST /api/v1/me/deletion-requests')).toHaveLength(0);
    fireEvent.press(screen.getByRole('button', { name: 'Keep my account' }));
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('rejects a wrong password', async () => {
    const api = mockApi(signedInRoutes());
    renderWithProviders(<DeleteAccountScreen />, { port: port() });
    await fill('not-it');
    expect(await screen.findByTestId('delete-error')).toHaveTextContent(
      /That password is not correct\./
    );
    expect(api.callsTo('POST /api/v1/me/deletion-requests')).toHaveLength(0);
  });

  it('re-authenticates, then files the request (the gate shows the pending screen)', async () => {
    // The saved shipping details of this account, and those of another account on this phone.
    const secureStore = (require('expo-secure-store') as { mockStore: Map<string, string> })
      .mockStore;
    secureStore.set(savedDetailKey('address', 'uid-maika'), '1 Rue Exemple');
    secureStore.set(savedDetailKey('etransfer', 'uid-maika'), 'maika@example.com');
    secureStore.set(savedDetailKey('address', 'uid-other'), '2 Rue Autre');
    const session = port();
    let release: () => void = () => undefined;
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/me': [ok(meFixture()), ok(meFixture({ status: 'DELETION_REQUESTED' }))],
        'POST /api/v1/me/deletion-requests': () =>
          new Promise((resolve) => {
            release = () => resolve(ok(deletionFixture(), 201));
          }),
      })
    );
    renderWithProviders(<DeleteAccountScreen />, { port: session });
    fireEvent.changeText(screen.getByLabelText('Why are you leaving? (optional)'), 'Moving away.');
    await fill('correct-password');
    // The working steps while it runs.
    expect(await screen.findByTestId('delete-working')).toHaveTextContent(
      /Deleting your account.*Confirming it is you….*Scheduling the deletion…/
    );
    await waitFor(() => expect(api.callsTo('POST /api/v1/me/deletion-requests')).toHaveLength(1));
    act(() => release());
    expect(session.reauthenticate).toHaveBeenCalledWith('correct-password');
    expect(api.callsTo('POST /api/v1/me/deletion-requests')[0]?.body).toEqual({
      reason: 'Moving away.',
      exportFirst: false,
    });
    expect(exportMock()).not.toHaveBeenCalled();
    // The account's saved address and e-Transfer email leave the phone with it (review fix 1,
    // P3); another account's stay.
    await waitFor(() =>
      expect(secureStore.has(savedDetailKey('address', 'uid-maika'))).toBe(false)
    );
    expect(secureStore.has(savedDetailKey('etransfer', 'uid-maika'))).toBe(false);
    expect(secureStore.get(savedDetailKey('address', 'uid-other'))).toBe('2 Rue Autre');
  });

  it('confirms with Google for an account without a password', async () => {
    const session = new FakeAuthPort(testUser({ providerIds: ['google.com'] }));
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/me': [ok(meFixture()), ok(meFixture({ status: 'DELETION_REQUESTED' }))],
        'POST /api/v1/me/deletion-requests': ok(deletionFixture(), 201),
      })
    );
    renderWithProviders(<DeleteAccountScreen />, { port: session });
    expect(screen.queryByLabelText('Password')).toBeNull();
    expect(screen.getByTestId('delete-google-note')).toHaveTextContent(
      'You will confirm with Google.'
    );
    fireEvent.press(screen.getByRole('checkbox', { name: 'Download a copy of my data first' }));
    fireEvent.press(screen.getByRole('checkbox', { name: /I understand/ }));
    fireEvent.press(screen.getByTestId('delete-submit'));
    fireEvent.press(await screen.findByTestId('delete-confirm-confirm'));
    // The simulated Google account is the signed-in one: its e-mail is fixed.
    const dialog = await screen.findByTestId('google-dialog');
    expect(within(dialog).getByTestId('google-locked-email')).toHaveTextContent(
      'maika@example.test'
    );
    fireEvent.changeText(within(dialog).getByTestId('google-name'), 'Maïka Test');
    fireEvent.press(screen.getByTestId('google-dialog-confirm'));
    await waitFor(() => expect(api.callsTo('POST /api/v1/me/deletion-requests')).toHaveLength(1));
    expect(session.reauthenticateWithGoogle).toHaveBeenCalledWith({
      kind: 'emulator',
      email: 'maika@example.test',
      displayName: 'Maïka Test',
    });
    expect(session.reauthenticate).not.toHaveBeenCalled();
  });

  it('lists what blocks the deletion', async () => {
    mockApi(
      signedInRoutes({
        'POST /api/v1/me/deletion-requests': problem(409, 'DELETION_BLOCKED', 'Open obligations', {
          blockers: ['OPEN_TRADE'],
        }),
      })
    );
    renderWithProviders(<DeleteAccountScreen />, { port: port() });
    await fill('correct-password');
    expect(await screen.findByText('Your account cannot be deleted yet')).toBeOnTheScreen();
    expect(screen.getByText(/You have a trade in progress\./)).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(mockRouter.back).toHaveBeenCalled();
  });
});
