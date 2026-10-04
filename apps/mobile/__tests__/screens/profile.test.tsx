import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import ProfileScreen from '@/app/(tabs)/profile';
import CollectorScreen from '@/app/collectors/[id]';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import { collectorFixture, locationFixture, meFixture, profileFixture } from '../support/fixtures';
import { mockApi, ok, problem } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { mockParams, mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());

beforeEach(() => {
  resetRouterMock();
  resetAppState();
});

describe('Profile tab', () => {
  it('shows a skeleton, then the collector, their interests, area and visibility', async () => {
    mockApi(signedInRoutes());
    renderWithProviders(<ProfileScreen />, { port: new FakeAuthPort(testUser()) });
    expect(screen.getByTestId('profile-loading')).toBeOnTheScreen();

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
    const { unmount } = renderWithProviders(<ProfileScreen />, {
      port: new FakeAuthPort(testUser()),
    });
    await waitFor(() =>
      expect(screen.getByTestId('profile-visibility')).toHaveTextContent(
        'Visible on the map at an approximate position.'
      )
    );
    unmount();

    mockApi(signedInRoutes({ 'GET /api/v1/me/location': ok({ discoverable: true }) }));
    renderWithProviders(<ProfileScreen />, { port: new FakeAuthPort(testUser()) });
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
    renderWithProviders(<ProfileScreen />, { port: new FakeAuthPort(testUser()) });
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
    renderWithProviders(<ProfileScreen />, { port: new FakeAuthPort(testUser()) });
    expect(await screen.findByText('We could not load your profile')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('profile-name')).toHaveTextContent('Maïka Test');
    expect(api.callsTo('GET /api/v1/me/profile')).toHaveLength(2);
  });

  it('opens the editor, the public preview and Settings, and signs out', async () => {
    const port = new FakeAuthPort(testUser());
    mockApi(signedInRoutes());
    renderWithProviders(<ProfileScreen />, { port });
    fireEvent.press(await screen.findByRole('button', { name: 'Edit profile' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/settings/profile');
    fireEvent.press(screen.getByRole('button', { name: 'Public preview' }));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/collectors/[id]',
      params: { id: 'maika' },
    });
    fireEvent.press(screen.getByRole('link', { name: 'Settings' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/settings');
    fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(port.signOut).toHaveBeenCalled());
  });
});

describe('Public collector profile', () => {
  it('is the owner public preview, with a label and a distance bucket only', async () => {
    mockParams.current = { id: 'maika' };
    mockApi(signedInRoutes({ 'GET /api/v1/collectors/{handle}': ok(collectorFixture()) }));
    renderWithProviders(<CollectorScreen />, { port: new FakeAuthPort(testUser()) });
    expect(await screen.findByTestId('collector-name')).toHaveTextContent('Maïka Test');
    await waitFor(() => expect(screen.getByTestId('public-preview-banner')).toBeOnTheScreen());
    expect(screen.getByTestId('collector-location')).toHaveTextContent(
      'Near Ville-Marie, Montréal'
    );
    expect(screen.getByText('1–5 km away')).toBeOnTheScreen();
    expect(screen.getByText('★ 4.5 (2)')).toBeOnTheScreen();
    expect(screen.queryByText(/45\.503|73\.569/)).toBeNull();
  });

  it('shows another collector without the preview banner, and an error state', async () => {
    mockParams.current = { id: 'collector2' };
    mockApi(
      signedInRoutes({
        'GET /api/v1/me': ok(meFixture()),
        'GET /api/v1/collectors/{handle}': [
          problem(404, 'NOT_FOUND', 'Not found'),
          ok(
            collectorFixture({
              id: 'other',
              handle: 'collector2',
              displayName: 'Other',
              location: undefined,
            })
          ),
        ],
      })
    );
    renderWithProviders(<CollectorScreen />, { port: new FakeAuthPort(testUser()) });
    expect(await screen.findByText('We could not load this profile')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('collector-name')).toHaveTextContent('Other');
    expect(screen.getByTestId('collector-location')).toHaveTextContent('Not on the map');
    expect(screen.queryByTestId('public-preview-banner')).toBeNull();
  });
});
