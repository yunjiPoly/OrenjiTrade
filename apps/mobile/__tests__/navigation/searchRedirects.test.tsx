import { screen, waitFor } from '@testing-library/react-native';

import HoldersRedirect from '@/app/holders';
import PlaceBindersRedirect from '@/app/regions/[region]/[code]';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import { CARD_ID, PRINTING_A } from '../support/fixtures';
import { mockApi, ok, problem } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { mockParams, mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());

beforeEach(() => {
  resetRouterMock();
  resetAppState();
});

const port = () => new FakeAuthPort(testUser());

describe('the screens of before stage R5 send their links on', () => {
  it('the public binders of a state open Search › Binders on that state', async () => {
    mockApi(signedInRoutes());
    mockParams.current = { region: 'americas-south', code: 'uy-mo' };
    renderWithProviders(<PlaceBindersRedirect />, { port: port() });
    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith({
        pathname: '/search',
        params: { segment: 'binders', region: 'americas-south', state: 'UY-MO' },
      })
    );
  });

  it('the card holders list opens the card page, a printing through its card', async () => {
    mockApi(signedInRoutes());
    mockParams.current = { card: CARD_ID, printing: PRINTING_A };
    const first = renderWithProviders(<HoldersRedirect />, { port: port() });
    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith({
        pathname: '/cards/[id]',
        params: { id: CARD_ID, printing: PRINTING_A },
      })
    );
    first.unmount();

    mockRouter.replace.mockClear();
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/printings/{id}': ok({ printing: { id: PRINTING_A, cardId: CARD_ID } }),
      })
    );
    mockParams.current = { printing: PRINTING_A };
    renderWithProviders(<HoldersRedirect />, { port: port() });
    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith({
        pathname: '/cards/[id]',
        params: { id: CARD_ID, printing: PRINTING_A },
      })
    );
    expect(api.callsTo('GET /api/v1/printings/{id}')).toHaveLength(1);
  });

  it('a holders link without a card, or with a printing that does not exist, says so', async () => {
    mockApi(signedInRoutes());
    mockParams.current = {};
    const first = renderWithProviders(<HoldersRedirect />, { port: port() });
    expect(await screen.findByTestId('holders-no-card')).toBeOnTheScreen();
    first.unmount();
    mockApi(
      signedInRoutes({
        'GET /api/v1/printings/{id}': problem(500, 'INTERNAL_ERROR', 'Down'),
      })
    );
    mockParams.current = { printing: PRINTING_A };
    renderWithProviders(<HoldersRedirect />, { port: port() });
    expect(await screen.findByTestId('holders-error')).toBeOnTheScreen();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});
