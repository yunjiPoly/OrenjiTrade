import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import CollectorScreen from '@/app/collectors/[id]';
import BlockedUsersScreen from '@/app/settings/blocked';
import SettingsScreen from '@/app/settings/index';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import {
  OTHER_ID,
  blockedUserFixture,
  collectorFixture,
  publicItemsPage,
  ratingsPageFixture,
  referencesPageFixture,
} from '../support/fixtures';
import { mockApi, noContent, ok, problem } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { mockParams, mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());

beforeEach(() => {
  resetRouterMock();
  resetAppState();
});

const port = () => new FakeAuthPort(testUser());

describe('Settings → Blocked users', () => {
  it('lists the blocked collectors and unblocks one', async () => {
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/me/blocks': [
          ok([
            blockedUserFixture(),
            blockedUserFixture({ id: 'x', handle: 'collector9', displayName: 'Zoé' }),
          ]),
          ok([blockedUserFixture({ id: 'x', handle: 'collector9', displayName: 'Zoé' })]),
        ],
        'DELETE /api/v1/users/{id}/block': noContent,
      })
    );
    renderWithProviders(<BlockedUsersScreen />, { port: port() });
    expect(screen.getByTestId('blocked-loading')).toBeOnTheScreen();
    const row = await screen.findByTestId('blocked-collector2');
    expect(row).toHaveTextContent(/Noé Verdun/);
    expect(row).toHaveTextContent(/@collector2 · blocked/);
    fireEvent.press(screen.getByRole('button', { name: 'Unblock Noé Verdun' }));
    expect(await screen.findByTestId('snackbar')).toHaveTextContent('Noé Verdun is unblocked.');
    expect(api.callsTo('DELETE /api/v1/users/{id}/block')[0]?.path).toBe(
      `/api/v1/users/${OTHER_ID}/block`
    );
    await waitFor(() => expect(screen.queryByTestId('blocked-collector2')).toBeNull());
    expect(screen.getByTestId('blocked-collector9')).toBeOnTheScreen();
  });

  it('explains an empty list, a failure with retry and a refused unblock', async () => {
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/me/blocks': [problem(503, 'SERVICE_UNAVAILABLE', 'down'), ok([])],
      })
    );
    renderWithProviders(<BlockedUsersScreen />, { port: port() });
    expect(await screen.findByTestId('blocked-error')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('blocked-error-retry'));
    expect(await screen.findByText('You have not blocked anyone')).toBeOnTheScreen();
    expect(api.callsTo('GET /api/v1/me/blocks')).toHaveLength(2);

    api.use({
      'GET /api/v1/me/blocks': ok([blockedUserFixture()]),
      'DELETE /api/v1/users/{id}/block': problem(500, 'INTERNAL_ERROR', 'boom'),
    });
    renderWithProviders(<BlockedUsersScreen />, { port: port() });
    fireEvent.press(await screen.findByRole('button', { name: 'Unblock Noé Verdun' }));
    expect(await screen.findByTestId('snackbar')).toHaveTextContent(/Please try again/);
    expect(screen.getByTestId('blocked-collector2')).toBeOnTheScreen();
  });

  it('is linked from Settings and from a blocked collector profile', async () => {
    mockApi(signedInRoutes({ 'GET /api/v1/me/blocks': ok([]) }));
    renderWithProviders(<SettingsScreen />, { port: port() });
    fireEvent.press(await screen.findByRole('link', { name: 'Blocked users' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/settings/blocked');

    mockParams.current = { id: 'collector2' };
    mockApi(
      signedInRoutes({
        'GET /api/v1/collectors/{handle}': ok(
          collectorFixture({
            id: OTHER_ID,
            handle: 'collector2',
            canMessage: false,
            isBlocked: true,
          })
        ),
        'GET /api/v1/collectors/{handle}/binders': ok([]),
        'GET /api/v1/collectors/{handle}/inventory': ok(publicItemsPage([])),
        'GET /api/v1/collectors/{handle}/ratings': ok(ratingsPageFixture()),
        'GET /api/v1/collectors/{handle}/references': ok(referencesPageFixture()),
        'GET /api/v1/collectors/{handle}/wishlist': problem(404, 'NOT_FOUND', 'hidden'),
      })
    );
    renderWithProviders(<CollectorScreen />, { port: port() });
    expect(await screen.findByTestId('collector-message-reason')).toHaveTextContent(
      /Messaging is unavailable because of a block/
    );
    fireEvent.press(screen.getByTestId('collector-message-blocked-users'));
    expect(mockRouter.push).toHaveBeenCalledWith('/settings/blocked');
  });
});
