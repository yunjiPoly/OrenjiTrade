import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';

import AccountSettingsScreen from '@/app/settings/account';
import AppearanceSettingsScreen from '@/app/settings/appearance';
import DeleteAccountScreen from '@/app/settings/delete-account';
import SettingsScreen from '@/app/settings/index';
import LocationSettingsScreen from '@/app/settings/location';
import NotificationSettingsScreen from '@/app/settings/notifications';
import PrivacySettingsScreen from '@/app/settings/privacy';
import ProfileSettingsScreen from '@/app/settings/profile';
import { useAppStore } from '@/src/store/useAppStore';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import {
  TAGS,
  deletionFixture,
  locationFixture,
  meFixture,
  notificationsFixture,
  privacyFixture,
  profileFixture,
} from '../support/fixtures';
import { mockApi, noContent, ok, problem, type MockRequest } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());
jest.mock('@/src/features/account/exportData', () => ({
  exportMyData: jest.fn(async () => 'orenjitrade-export-maika-2026-10-04.json'),
}));
jest.mock('@/src/features/location/deviceLocation', () => ({ readApproximatePosition: jest.fn() }));

const exportMock = () =>
  (jest.requireMock('@/src/features/account/exportData') as { exportMyData: jest.Mock })
    .exportMyData;

beforeEach(() => {
  resetRouterMock();
  resetAppState();
  exportMock().mockClear();
});

describe('Settings home', () => {
  it('lists the Phase 1 sections and signs out', async () => {
    const port = new FakeAuthPort(testUser());
    mockApi(signedInRoutes());
    renderWithProviders(<SettingsScreen />, { port });
    expect(await screen.findByText('@maika')).toBeOnTheScreen();
    for (const label of [
      'Profile',
      'Location and discoverability',
      'Privacy',
      'Notifications',
      'Account',
      'Appearance',
      'Legal',
    ]) {
      expect(screen.getByRole('link', { name: label })).toBeOnTheScreen();
    }
    fireEvent.press(screen.getByRole('link', { name: 'Notifications' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/settings/notifications');
    fireEvent.press(screen.getByTestId('settings-sign-out'));
    await waitFor(() => expect(port.signOut).toHaveBeenCalled());
  });
});

describe('Settings → Profile', () => {
  it('validates, saves the details and the tags', async () => {
    const api = mockApi(
      signedInRoutes({
        'PUT /api/v1/me/profile': ({ body }: MockRequest) =>
          ok({ ...profileFixture(), ...(body as object) }),
        'PUT /api/v1/me/profile/tags': ok(TAGS),
      })
    );
    renderWithProviders(<ProfileSettingsScreen />, { port: new FakeAuthPort(testUser()) });
    const save = await screen.findByRole('button', { name: 'Save details' });
    expect(save).toBeDisabled();

    fireEvent.changeText(screen.getByLabelText('Display name'), '');
    fireEvent.press(save);
    expect(screen.getByText('Enter a display name.')).toBeOnTheScreen();
    expect(api.callsTo('PUT /api/v1/me/profile')).toHaveLength(0);

    fireEvent.changeText(screen.getByLabelText('Display name'), 'Maïka T.');
    fireEvent.press(screen.getByRole('checkbox', { name: 'Yu-Gi-Oh!' }));
    fireEvent.press(screen.getByRole('button', { name: 'Save details' }));
    expect(await screen.findByTestId('snackbar')).toHaveTextContent('Profile saved.');
    expect(api.callsTo('PUT /api/v1/me/profile')[0]?.body).toMatchObject({
      displayName: 'Maïka T.',
      games: ['pokemon', 'yugioh'],
      languages: ['fr', 'en'],
    });

    fireEvent.press(await screen.findByRole('button', { name: 'Add tag Binder collector' }));
    fireEvent.press(screen.getByRole('button', { name: 'Save tags' }));
    expect(await screen.findByText('Tags saved.')).toBeOnTheScreen();
    expect(api.callsTo('PUT /api/v1/me/profile/tags')[0]?.body).toEqual({
      tagIds: ['tag-1', 'tag-2'],
      customLabels: [],
    });
  });

  it('maps a taken handle and shows other failures', async () => {
    mockApi(
      signedInRoutes({
        'PUT /api/v1/me/profile': [
          problem(409, 'HANDLE_TAKEN', 'taken'),
          problem(429, 'RATE_LIMITED', 'slow'),
        ],
      })
    );
    renderWithProviders(<ProfileSettingsScreen />, { port: new FakeAuthPort(testUser()) });
    fireEvent.changeText(await screen.findByLabelText('Handle'), 'collector2');
    fireEvent.press(screen.getByRole('button', { name: 'Save details' }));
    expect(
      await screen.findByText('That handle is already taken. Try another one.')
    ).toBeOnTheScreen();
    fireEvent.changeText(screen.getByLabelText('Handle'), 'maika_2');
    fireEvent.press(screen.getByRole('button', { name: 'Save details' }));
    expect(await screen.findByText(/Too many requests in a short time/)).toBeOnTheScreen();
  });

  it('shows the loading and error states', async () => {
    mockApi(signedInRoutes({ 'GET /api/v1/me/profile': problem(500, 'INTERNAL_ERROR', 'boom') }));
    renderWithProviders(<ProfileSettingsScreen />, { port: new FakeAuthPort(testUser()) });
    expect(screen.getByTestId('settings-profile-loading')).toBeOnTheScreen();
    expect(await screen.findByText('We could not load your profile')).toBeOnTheScreen();
  });
});

describe('Settings → Location and discoverability', () => {
  it('saves a manual trading area and shows the server label', async () => {
    const api = mockApi(
      signedInRoutes({
        'PUT /api/v1/me/location/trading-area': ok(
          locationFixture({
            tradingArea: {
              lat: 46.813,
              lng: -71.208,
              radiusKm: 10,
              source: 'MANUAL',
              label: 'Vieux-Québec, Québec',
            },
          })
        ),
      })
    );
    renderWithProviders(<LocationSettingsScreen />, { port: new FakeAuthPort(testUser()) });
    expect(await screen.findByTestId('area-public-label')).toHaveTextContent(
      'Ville-Marie, Montréal · 10 km radius'
    );
    const save = screen.getByRole('button', { name: 'Save trading area' });
    expect(save).toBeDisabled();

    fireEvent.press(screen.getByRole('button', { name: 'Québec' }));
    fireEvent.press(screen.getByRole('button', { name: 'Save trading area' }));
    expect(await screen.findByTestId('snackbar')).toHaveTextContent(
      'Trading area saved · Vieux-Québec, Québec.'
    );
    expect(api.callsTo('PUT /api/v1/me/location/trading-area')[0]?.body).toEqual({
      lat: 46.813,
      lng: -71.208,
      radiusKm: 15,
      source: 'MANUAL',
    });
    expect(screen.getByTestId('area-public-label')).toHaveTextContent(
      'Vieux-Québec, Québec · 10 km radius'
    );
  });

  it('opts in to the map (off by default) and explains what others see', async () => {
    const api = mockApi(
      signedInRoutes({
        'PUT /api/v1/me/settings/privacy': ({ body }: MockRequest) => ok(body),
      })
    );
    renderWithProviders(<LocationSettingsScreen />, { port: new FakeAuthPort(testUser()) });
    const optIn = await screen.findByRole('switch', { name: 'Show me on the map' });
    expect(optIn).not.toBeChecked();
    expect(screen.getByTestId('location-visibility')).toHaveTextContent(
      /You are hidden from the map\./
    );

    fireEvent.press(optIn);
    expect(await screen.findByTestId('snackbar')).toHaveTextContent('You now appear on the map.');
    expect(api.callsTo('PUT /api/v1/me/settings/privacy')[0]?.body).toEqual({
      ...privacyFixture(),
      discoverable: true,
    });
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Show me on the map' })).toBeChecked()
    );
    expect(screen.getByTestId('location-visibility')).toHaveTextContent(
      'Collectors see you near Ville-Marie, Montréal.'
    );
  });

  it('removes the location after confirmation', async () => {
    const api = mockApi(signedInRoutes({ 'DELETE /api/v1/me/location': noContent }));
    renderWithProviders(<LocationSettingsScreen />, { port: new FakeAuthPort(testUser()) });
    fireEvent.press(await screen.findByRole('button', { name: 'Remove location' }));
    expect(screen.getByText('Remove your location?')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('confirm-dialog-confirm'));
    expect(await screen.findByTestId('snackbar')).toHaveTextContent('Your location was removed.');
    expect(api.callsTo('DELETE /api/v1/me/location')).toHaveLength(1);
    expect(await screen.findByTestId('area-public-label')).toHaveTextContent(
      'No trading area saved yet.'
    );
  });

  it('shows a save failure inline', async () => {
    mockApi(
      signedInRoutes({
        'PUT /api/v1/me/location/trading-area': problem(
          400,
          'VALIDATION_FAILED',
          'Radius out of range.'
        ),
      })
    );
    renderWithProviders(<LocationSettingsScreen />, { port: new FakeAuthPort(testUser()) });
    fireEvent.press(await screen.findByRole('button', { name: 'Increase trading radius' }));
    fireEvent.press(screen.getByRole('button', { name: 'Save trading area' }));
    expect(await screen.findByTestId('location-error')).toHaveTextContent(/Radius out of range\./);
  });
});

describe('Settings → Privacy', () => {
  it('saves every change at once and restores the last saved state on failure', async () => {
    const api = mockApi(
      signedInRoutes({
        'PUT /api/v1/me/settings/privacy': [
          ({ body }: MockRequest) => ok(body),
          problem(500, 'INTERNAL_ERROR', 'boom'),
        ],
      })
    );
    renderWithProviders(<PrivacySettingsScreen />, { port: new FakeAuthPort(testUser()) });
    const wishlist = await screen.findByRole('switch', { name: 'Show my wishlist on my profile' });
    expect(wishlist).toBeChecked();
    fireEvent.press(wishlist);
    await waitFor(() =>
      expect(screen.getByTestId('privacy-status')).toHaveTextContent(/All changes saved/)
    );
    expect(api.callsTo('PUT /api/v1/me/settings/privacy')[0]?.body).toEqual({
      ...privacyFixture(),
      wishlistVisible: false,
    });

    fireEvent.press(screen.getByRole('radio', { name: 'Private' }));
    await waitFor(() =>
      expect(screen.getByTestId('privacy-status')).toHaveTextContent(/Last change not saved/)
    );
    expect(screen.getByRole('radio', { name: 'Members' })).toBeChecked();
    expect(screen.getByTestId('snackbar')).toHaveTextContent(/Please try again in a moment\./);
  });
});

describe('Settings → Notifications', () => {
  it('saves channel and topic preferences', async () => {
    const api = mockApi(
      signedInRoutes({
        'PUT /api/v1/me/settings/notifications': ({ body }: MockRequest) => ok(body),
      })
    );
    renderWithProviders(<NotificationSettingsScreen />, { port: new FakeAuthPort(testUser()) });
    fireEvent.press(await screen.findByRole('checkbox', { name: 'Messages by Email' }));
    fireEvent.press(screen.getByRole('switch', { name: 'Email' }));
    // A channel switched off disables its topics.
    expect(screen.getByRole('checkbox', { name: 'Messages by Email' })).toBeDisabled();
    fireEvent.press(screen.getByRole('button', { name: 'Save preferences' }));
    expect(await screen.findByTestId('snackbar')).toHaveTextContent(
      'Notification preferences saved.'
    );
    const body = api.callsTo('PUT /api/v1/me/settings/notifications')[0]?.body as ReturnType<
      typeof notificationsFixture
    >;
    expect(body.emailEnabled).toBe(false);
    expect(body.categories.MESSAGE).toEqual({ inApp: true, push: true, email: true });
  });

  it('validates quiet hours', async () => {
    const api = mockApi(signedInRoutes());
    renderWithProviders(<NotificationSettingsScreen />, { port: new FakeAuthPort(testUser()) });
    fireEvent.press(
      await screen.findByRole('switch', { name: 'Pause push notifications at night' })
    );
    fireEvent.changeText(screen.getByLabelText('From'), '25:00');
    expect(screen.getByTestId('notif-quiet-error')).toHaveTextContent(/Use 24-hour times/);
    fireEvent.press(screen.getByRole('button', { name: 'Save preferences' }));
    expect(api.callsTo('PUT /api/v1/me/settings/notifications')).toHaveLength(0);
  });

  it('shows the error state', async () => {
    mockApi(
      signedInRoutes({
        'GET /api/v1/me/settings/notifications': problem(503, 'SERVICE_UNAVAILABLE', 'down'),
      })
    );
    renderWithProviders(<NotificationSettingsScreen />, { port: new FakeAuthPort(testUser()) });
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeOnTheScreen();
  });
});

describe('Settings → Account', () => {
  it('shows the sign-in details and downloads the data', async () => {
    mockApi(signedInRoutes());
    renderWithProviders(<AccountSettingsScreen />, { port: new FakeAuthPort(testUser()) });
    expect(screen.getByTestId('account-email')).toHaveTextContent('maika@example.test');
    expect(screen.getByTestId('account-verified')).toHaveTextContent('Verified');
    fireEvent.press(screen.getByRole('button', { name: 'Download my data' }));
    expect(await screen.findByTestId('snackbar')).toHaveTextContent(
      'Your data export orenjitrade-export-maika-2026-10-04.json is ready.'
    );
    fireEvent.press(screen.getByRole('button', { name: 'Delete my account' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/settings/delete-account');
  });

  it('offers to resend the verification email and reports export failures', async () => {
    const port = new FakeAuthPort(testUser({ emailVerified: false }));
    exportMock().mockRejectedValueOnce(new Error('disk full'));
    mockApi(signedInRoutes());
    renderWithProviders(<AccountSettingsScreen />, { port });
    expect(screen.getByTestId('account-verified')).toHaveTextContent('Not verified');
    fireEvent.press(screen.getByRole('button', { name: 'Resend link' }));
    expect(await screen.findByTestId('snackbar')).toHaveTextContent(
      'Verification email sent. Check your inbox.'
    );
    fireEvent.press(screen.getByRole('button', { name: 'Download my data' }));
    await waitFor(() =>
      expect(screen.getByTestId('snackbar')).toHaveTextContent(
        'The export failed. Please try again.'
      )
    );
  });
});

describe('Settings → Delete account', () => {
  async function fill(password: string) {
    fireEvent.press(screen.getByRole('checkbox', { name: 'Download a copy of my data first' }));
    fireEvent.press(screen.getByRole('checkbox', { name: /I understand/ }));
    fireEvent.changeText(screen.getByLabelText('Password'), password);
    fireEvent.press(screen.getByRole('button', { name: 'Delete my account' }));
    const dialog = await screen.findByTestId('delete-confirm');
    expect(within(dialog).getByText('Delete your account?')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('delete-confirm-confirm'));
  }

  it('requires the password and the acknowledgement', async () => {
    const api = mockApi(signedInRoutes());
    renderWithProviders(<DeleteAccountScreen />, { port: new FakeAuthPort(testUser()) });
    fireEvent.press(screen.getByRole('button', { name: 'Delete my account' }));
    expect(screen.getByText('Enter your password to continue.')).toBeOnTheScreen();
    expect(screen.getByText('Please confirm to continue.')).toBeOnTheScreen();
    expect(screen.queryByTestId('delete-confirm')).toBeNull();
    expect(api.callsTo('POST /api/v1/me/deletion-requests')).toHaveLength(0);
  });

  it('rejects a wrong password', async () => {
    const port = new FakeAuthPort(testUser());
    const api = mockApi(signedInRoutes());
    renderWithProviders(<DeleteAccountScreen />, { port });
    await fill('not-it');
    expect(await screen.findByTestId('delete-error')).toHaveTextContent(
      /That password is not correct\./
    );
    expect(api.callsTo('POST /api/v1/me/deletion-requests')).toHaveLength(0);
  });

  it('re-authenticates, then files the request (the gate shows the pending screen)', async () => {
    const port = new FakeAuthPort(testUser());
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/me': [ok(meFixture()), ok(meFixture({ status: 'DELETION_REQUESTED' }))],
        'POST /api/v1/me/deletion-requests': ok(deletionFixture(), 201),
      })
    );
    renderWithProviders(<DeleteAccountScreen />, { port });
    fireEvent.changeText(screen.getByLabelText('Why are you leaving? (optional)'), 'Moving away.');
    await fill('correct-password');
    await waitFor(() => expect(api.callsTo('POST /api/v1/me/deletion-requests')).toHaveLength(1));
    expect(port.reauthenticate).toHaveBeenCalledWith('correct-password');
    expect(api.callsTo('POST /api/v1/me/deletion-requests')[0]?.body).toEqual({
      reason: 'Moving away.',
      exportFirst: false,
    });
    expect(exportMock()).not.toHaveBeenCalled();
  });

  it('lists what blocks the deletion', async () => {
    mockApi(
      signedInRoutes({
        'POST /api/v1/me/deletion-requests': problem(409, 'DELETION_BLOCKED', 'Open obligations', {
          blockers: ['OPEN_TRADE'],
        }),
      })
    );
    renderWithProviders(<DeleteAccountScreen />, { port: new FakeAuthPort(testUser()) });
    await fill('correct-password');
    expect(await screen.findByText(/You have a trade in progress\./)).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(mockRouter.back).toHaveBeenCalled();
  });
});

describe('Settings → Appearance', () => {
  it('switches the theme and shows the API version', async () => {
    useAppStore.getState().reset();
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
    renderWithProviders(<AppearanceSettingsScreen />, { port: new FakeAuthPort(testUser()) });
    fireEvent.press(screen.getByRole('button', { name: 'Dark' }));
    expect(useAppStore.getState().themeOverride).toBe('dark');
    expect(await screen.findByTestId('api-version')).toHaveTextContent('0.1.0');
  });
});
