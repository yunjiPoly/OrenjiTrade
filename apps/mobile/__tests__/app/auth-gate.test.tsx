import { screen, waitFor } from '@testing-library/react-native';

import { useFlowLock } from '@/src/account/flowLock';
import { RootNavigator } from '@/src/navigation/RootNavigator';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import { NOT_ONBOARDED, meFixture } from '../support/fixtures';
import { mockApi, ok, problem } from '../support/mockApi';
import { mockRouter, mockSegments, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());
jest.mock('expo-splash-screen', () => ({
  hideAsync: jest.fn(async () => undefined),
  preventAutoHideAsync: jest.fn(async () => undefined),
}));

beforeEach(() => {
  resetRouterMock();
  resetAppState();
});

describe('auth gate (RootNavigator)', () => {
  it('keeps the boot screen up until Firebase and /me answered', () => {
    const port = new FakeAuthPort(null);
    port.subscribe.mockImplementationOnce(() => () => undefined);
    mockApi({});
    renderWithProviders(<RootNavigator />, { port });
    expect(screen.getByTestId('boot-screen')).toBeOnTheScreen();
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
  });

  it('sends signed-out visitors to sign in', async () => {
    mockSegments.current = ['(tabs)'];
    mockApi({});
    renderWithProviders(<RootNavigator />, { port: new FakeAuthPort(null) });
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/sign-in'));
    expect(screen.queryByTestId('boot-screen')).toBeNull();
  });

  it('routes the account states: consent, suspended, deletion pending, error, onboarding', async () => {
    const cases: [Parameters<typeof mockApi>[0], string][] = [
      [
        {
          'GET /api/v1/me': ok(
            meFixture({ requiredConsents: [{ documentType: 'TERMS', version: 'v2' }] })
          ),
        },
        '/consent',
      ],
      [{ 'GET /api/v1/me': problem(403, 'ACCOUNT_SUSPENDED', 'Suspended') }, '/suspended'],
      [{ 'GET /api/v1/me': ok(meFixture({ status: 'DELETION_REQUESTED' })) }, '/suspended'],
      [{ 'GET /api/v1/me': problem(500, 'INTERNAL_ERROR', 'boom') }, '/unavailable'],
      [{ 'GET /api/v1/me': ok(meFixture({ onboarding: NOT_ONBOARDED })) }, '/onboarding'],
    ];
    for (const [routes, target] of cases) {
      resetRouterMock();
      mockSegments.current = ['(tabs)'];
      mockApi(routes);
      const { unmount } = renderWithProviders(<RootNavigator />, {
        port: new FakeAuthPort(testUser()),
      });
      await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith(target));
      unmount();
    }
  });

  it('brings an onboarded collector from sign-in back to the tabs, and leaves the tabs alone', async () => {
    mockSegments.current = ['(auth)', 'sign-in'];
    mockApi({ 'GET /api/v1/me': ok(meFixture()) });
    const { unmount } = renderWithProviders(<RootNavigator />, {
      port: new FakeAuthPort(testUser()),
    });
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/'));
    unmount();

    resetRouterMock();
    mockSegments.current = ['(tabs)', 'profile'];
    const api = mockApi({ 'GET /api/v1/me': ok(meFixture()) });
    renderWithProviders(<RootNavigator />, { port: new FakeAuthPort(testUser()) });
    await waitFor(() => expect(api.callsTo('GET /api/v1/me')).toHaveLength(1));
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
  });

  it('holds still (and waits for /me) while sign-up holds the flow lock', async () => {
    useFlowLock.getState().lock('sign-up');
    mockSegments.current = ['(auth)', 'sign-up'];
    const api = mockApi({ 'GET /api/v1/me': ok(meFixture()) });
    renderWithProviders(<RootNavigator />, { port: new FakeAuthPort(testUser()) });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(api.callsTo('GET /api/v1/me')).toHaveLength(0);
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
    expect(screen.queryByTestId('boot-screen')).toBeNull();
  });
});
