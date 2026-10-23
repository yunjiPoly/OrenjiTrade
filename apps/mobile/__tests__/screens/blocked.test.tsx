import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

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

/** Sets the system text size (Jest's React Native starts at 2); undone after the test. */
let restoreAfter: (() => void) | null = null;
function setFontScale(fontScale: number): () => void {
  const window = Dimensions.get('window');
  const screenSize = Dimensions.get('screen');
  act(() => {
    Dimensions.set({ window: { ...window, fontScale }, screen: { ...screenSize, fontScale } });
  });
  return () => Dimensions.set({ window, screen: screenSize });
}
afterEach(() => {
  if (restoreAfter) {
    act(restoreAfter);
    restoreAfter = null;
  }
});

describe('Settings › Blocked collectors', () => {
  it('lists the blocked collectors and unblocks one', async () => {
    // The mockup's size (Jest's React Native starts at 2): "@handle · blocked {when}" on one line.
    restoreAfter = setFontScale(1);
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
    expect(await screen.findByTestId('snackbar')).toHaveTextContent(/Noé Verdun is unblocked\.$/);
    expect(api.callsTo('DELETE /api/v1/users/{id}/block')[0]?.path).toBe(
      `/api/v1/users/${OTHER_ID}/block`
    );
    await waitFor(() => expect(screen.queryByTestId('blocked-collector2')).toBeNull());
    expect(screen.getByTestId('blocked-collector9')).toBeOnTheScreen();
  });

  it('gives the handle a line of its own at the largest text size (review fix 1)', async () => {
    restoreAfter = setFontScale(3.1);
    mockApi(
      signedInRoutes({
        'GET /api/v1/me/blocks': ok([
          blockedUserFixture({ handle: 'uxcy_mvklemg2tx_abcdefgh', displayName: 'Cy Spambot' }),
        ]),
      })
    );
    renderWithProviders(<BlockedUsersScreen />, { port: port() });
    const handle = await screen.findByTestId('blocked-handle-uxcy_mvklemg2tx_abcdefgh');
    // One line, made smaller to fit rather than broken in the middle of the handle.
    expect(handle).toHaveTextContent('@uxcy_mvklemg2tx_abcdefgh');
    expect(handle).toHaveProp('numberOfLines', 1);
    expect(handle).toHaveProp('adjustsFontSizeToFit', true);
    const row = screen.getByTestId('blocked-uxcy_mvklemg2tx_abcdefgh');
    expect(within(row).getByText(/^Blocked /)).toBeOnTheScreen();
    expect(screen.queryByText(/ · blocked /)).toBeNull();
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

  it('is linked from Settings; a blocked collector profile offers Unblock', async () => {
    mockApi(signedInRoutes({ 'GET /api/v1/me/blocks': ok([]) }));
    renderWithProviders(<SettingsScreen />, { port: port() });
    fireEvent.press(await screen.findByRole('link', { name: 'Blocked collectors' }));
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
        'GET /api/v1/me/blocks': ok([blockedUserFixture()]),
      })
    );
    renderWithProviders(<CollectorScreen />, { port: port() });
    // Stage R6: the header and Unblock, in place of the sections and Message.
    expect(await screen.findByTestId('collector-blocked')).toHaveTextContent(
      /You blocked collector2/
    );
    expect(screen.getByRole('button', { name: 'Unblock collector2' })).toBeOnTheScreen();
    expect(screen.queryByTestId('collector-message')).toBeNull();
  });
});
