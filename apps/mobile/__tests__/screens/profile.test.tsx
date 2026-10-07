import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import ProfileScreen from '@/app/(tabs)/profile';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import { locationFixture, profileFixture } from '../support/fixtures';
import { mockApi, ok, problem } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());

beforeEach(() => {
  resetRouterMock();
  resetAppState();
});

describe('Profile tab', () => {
  it('shows a skeleton, then the collector, their interests, area and visibility', async () => {
    const api = mockApi(signedInRoutes());
    const release = api.hold();
    await renderWithProviders(<ProfileScreen />, { port: new FakeAuthPort(testUser()) });
    expect(screen.getByTestId('profile-loading')).toBeOnTheScreen();
    release();

    expect(await screen.findByTestId('profile-name')).toHaveTextContent('Maïka Test');
    expect(screen.getByTestId('profile-handle-label')).toHaveTextContent('@maika');
    expect(screen.getByTestId('profile-bio-text')).toHaveTextContent(
      'Binder collector in Montréal.'
    );
    expect(screen.getByText('Pokémon')).toBeOnTheScreen();
    expect(screen.getByText('Local pickup')).toBeOnTheScreen();
    expect(await screen.findByTestId('profile-area')).toHaveTextContent(
      'Ville-Marie, Montréal · 10 km radius'
    );
    expect(screen.getByTestId('profile-visibility')).toHaveTextContent('Hidden from the map.');
    // Never coordinates.
    expect(screen.queryByText(/45\.5|73\.5/)).toBeNull();
  });

  it('says when the collector is visible on the map, and when there is no area yet', async () => {
    mockApi(
      signedInRoutes({ 'GET /api/v1/me/location': ok(locationFixture({ discoverable: true })) })
    );
    const { unmount } = await renderWithProviders(<ProfileScreen />, {
      port: new FakeAuthPort(testUser()),
    });
    await waitFor(() =>
      expect(screen.getByTestId('profile-visibility')).toHaveTextContent(
        'Visible on the map at an approximate position.'
      )
    );
    await unmount();

    mockApi(signedInRoutes({ 'GET /api/v1/me/location': ok({ discoverable: true }) }));
    await renderWithProviders(<ProfileScreen />, { port: new FakeAuthPort(testUser()) });
    expect(await screen.findByTestId('profile-area')).toHaveTextContent('No trading area yet.');
    expect(screen.getByTestId('profile-visibility')).toHaveTextContent('Hidden from the map.');
  });

  it('shows empty interests', async () => {
    mockApi(
      signedInRoutes({
        'GET /api/v1/me/profile': ok(
          profileFixture({ games: [], languages: [], tags: [], bio: '' })
        ),
      })
    );
    await renderWithProviders(<ProfileScreen />, { port: new FakeAuthPort(testUser()) });
    expect(await screen.findByText('No games yet')).toBeOnTheScreen();
    expect(screen.getByText('No tags yet')).toBeOnTheScreen();
    expect(screen.queryByTestId('profile-bio-text')).toBeNull();
  });

  it('shows an error with retry', async () => {
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/me/profile': [problem(500, 'INTERNAL_ERROR', 'boom'), ok(profileFixture())],
      })
    );
    await renderWithProviders(<ProfileScreen />, { port: new FakeAuthPort(testUser()) });
    expect(await screen.findByText('We could not load your profile')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('profile-name')).toHaveTextContent('Maïka Test');
    expect(api.callsTo('GET /api/v1/me/profile')).toHaveLength(2);
  });

  it('opens the editor, the public preview and Settings, and signs out', async () => {
    const port = new FakeAuthPort(testUser());
    mockApi(signedInRoutes());
    await renderWithProviders(<ProfileScreen />, { port });
    await fireEvent.press(await screen.findByRole('button', { name: 'Edit profile' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/settings/profile');
    await fireEvent.press(screen.getByRole('button', { name: 'Public preview' }));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/collectors/[id]',
      params: { id: 'maika' },
    });
    await fireEvent.press(screen.getByRole('link', { name: 'Settings' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/settings');
    await fireEvent.press(screen.getByTestId('profile-offers'));
    expect(mockRouter.push).toHaveBeenCalledWith('/offers');
    await fireEvent.press(screen.getByTestId('profile-trades'));
    expect(mockRouter.push).toHaveBeenCalledWith('/trades');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(port.signOut).toHaveBeenCalled());
  });
});
