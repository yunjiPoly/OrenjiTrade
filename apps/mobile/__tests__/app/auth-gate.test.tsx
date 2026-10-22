import { act, screen, waitFor } from '@testing-library/react-native';

import { useFlowLock } from '@/src/account/flowLock';
import { resumableHref, usePendingLink } from '@/src/account/pendingLink';
import { reportAccountSignal } from '@/src/api/accountSignal';
import { ApiError } from '@/src/api/ApiError';
import { useSessionNotice } from '@/src/auth/sessionNotice';
import { RootNavigator } from '@/src/navigation/RootNavigator';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import { NOT_ONBOARDED, meFixture } from '../support/fixtures';
import { mockApi, ok, problem } from '../support/mockApi';
import {
  mockParams,
  mockPathname,
  mockRouter,
  mockSegments,
  resetRouterMock,
} from '../support/router';
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

  it('reopens a link opened while signed out once the collector signed in', async () => {
    mockSegments.current = ['collectors', '[id]'];
    mockPathname.current = '/collectors/collector5';
    mockParams.current = { id: 'collector5' };
    const port = new FakeAuthPort(null);
    mockApi({ 'GET /api/v1/me': ok(meFixture()) });
    renderWithProviders(<RootNavigator />, { port });
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/sign-in'));
    expect(usePendingLink.getState().href).toBe('/collectors/collector5');

    // On the sign-in screen, the collector signs in.
    mockSegments.current = ['(auth)', 'sign-in'];
    mockPathname.current = '/sign-in';
    mockParams.current = {};
    await act(async () => {
      await port.signIn('maika@example.test', 'correct-password');
    });
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/collectors/collector5'));
    expect(mockRouter.dismissTo).toHaveBeenCalledWith('/');
    expect(usePendingLink.getState().href).toBeNull();
  });

  it('forgets the screen on an explicit sign-out, but not when the session ended', async () => {
    mockSegments.current = ['(tabs)', 'profile'];
    mockPathname.current = '/profile';
    const port = new FakeAuthPort(testUser());
    mockApi({ 'GET /api/v1/me': ok(meFixture()) });
    const first = renderWithProviders(<RootNavigator />, { port });
    await waitFor(() => expect(screen.queryByTestId('boot-screen')).not.toBeOnTheScreen());
    await act(async () => {
      await port.signOut();
    });
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/sign-in'));
    expect(usePendingLink.getState().href).toBeNull();
    first.unmount();

    resetRouterMock();
    mockSegments.current = ['cards', '[id]'];
    mockPathname.current = '/cards/c1';
    mockParams.current = { id: 'c1', printing: 'p2' };
    const second = new FakeAuthPort(testUser());
    renderWithProviders(<RootNavigator />, { port: second });
    await waitFor(() => expect(screen.queryByTestId('boot-screen')).not.toBeOnTheScreen());
    act(() => useSessionNotice.getState().reportEnded());
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/sign-in'));
    expect(second.signOut).toHaveBeenCalled();
    expect(usePendingLink.getState().href).toBe('/cards/c1?printing=p2');
  });

  it('knows which screens are worth reopening', () => {
    expect(resumableHref(['collectors', '[id]'], '/collectors/c5', { id: 'c5' })).toBe(
      '/collectors/c5'
    );
    expect(resumableHref(['(tabs)', 'wishlist'], '/wishlist', {})).toBe('/wishlist');
    expect(resumableHref(['(tabs)'], '/', {})).toBeNull();
    // The Map tab is the home: only a map link (a region, a state or province) is reopened.
    expect(resumableHref(['(tabs)'], '/', { region: 'europe', subdivision: 'FR-IDF' })).toBe(
      '/?region=europe&subdivision=FR-IDF'
    );
    expect(resumableHref(['(tabs)'], '/', { region: 'europe' })).toBe('/?region=europe');
    expect(resumableHref(['(tabs)'], '/', { tab: 'cards' })).toBeNull();
    // Search is the first tab since stage R5: only a link into it is reopened (the onboarding
    // was left the moment the profile was saved when Search itself was remembered).
    expect(resumableHref(['(tabs)', 'search'], '/search', {})).toBeNull();
    expect(resumableHref(['(tabs)', 'search'], '/search', { segment: 'wishlist' })).toBe(
      '/search?segment=wishlist'
    );
    expect(
      resumableHref(['regions', '[region]', '[code]'], '/regions/europe/FR-IDF', {
        region: 'europe',
        code: 'FR-IDF',
      })
    ).toBe('/regions/europe/FR-IDF');
    expect(resumableHref(['(auth)', 'sign-in'], '/sign-in', {})).toBeNull();
    expect(resumableHref(['legal', '[key]'], '/legal/terms', { key: 'terms' })).toBeNull();
    expect(
      resumableHref(['messages', '[id]'], '/messages/m1', { id: 'm1', view: ['a', 'b'] })
    ).toBe('/messages/m1?view=a');
  });
});

describe('auth gate: the 18+ confirmation (launch readiness, Review our terms since stage R12)', () => {
  it('sends an unconfirmed existing collector to Review our terms and remembers where they were', async () => {
    mockSegments.current = ['messages', '[id]'];
    mockPathname.current = '/messages/conv-1';
    mockParams.current = { id: 'conv-1' };
    mockApi({
      'GET /api/v1/me': ok(
        meFixture({
          onboarding: {
            profileComplete: true,
            interestsSet: true,
            locationSet: true,
            ageConfirmed: false,
          },
        })
      ),
    });
    renderWithProviders(<RootNavigator />, { port: new FakeAuthPort(testUser()) });
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/consent'));
    expect(mockRouter.dismissTo).not.toHaveBeenCalledWith('/onboarding');
    expect(usePendingLink.getState().href).toBe('/messages/conv-1');
  });

  it('reacts to 403 AGE_CONFIRMATION_REQUIRED from any endpoint by reloading /me and gating', async () => {
    mockSegments.current = ['(tabs)', 'profile'];
    const api = mockApi({
      'GET /api/v1/me': [
        ok(meFixture()),
        ok(
          meFixture({
            onboarding: {
              profileComplete: true,
              interestsSet: true,
              locationSet: true,
              ageConfirmed: false,
            },
          })
        ),
      ],
    });
    renderWithProviders(<RootNavigator />, { port: new FakeAuthPort(testUser()) });
    await waitFor(() => expect(api.callsTo('GET /api/v1/me')).toHaveLength(1));
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
    act(() => {
      reportAccountSignal(
        ApiError.fromProblem(403, {
          status: 403,
          errorCode: 'AGE_CONFIRMATION_REQUIRED',
          message: 'Confirm that you are 18 years of age or older to continue',
        }),
        'http://localhost:8090/api/v1/me/settings/privacy'
      );
    });
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/consent'));
    expect(api.callsTo('GET /api/v1/me')).toHaveLength(2);
  });
});

describe('auth gate: a remembered link belongs to its collector (stage R12, review fix 1)', () => {
  const UNCONFIRMED = {
    profileComplete: true,
    interestsSet: true,
    locationSet: true,
    ageConfirmed: false,
  };

  it('forgets the screen kept for Review our terms when the collector signs out there', async () => {
    // Collector A searches a card in Quebec when the gate asks the 18+ confirmation.
    mockSegments.current = ['(tabs)', 'search'];
    mockPathname.current = '/search';
    mockParams.current = { q: 'blue eyes alternate art', place: 'CA-QC', segment: 'cards' };
    const port = new FakeAuthPort(testUser());
    mockApi({
      'GET /api/v1/me': [
        ok(meFixture({ onboarding: UNCONFIRMED })),
        ok(meFixture({ handle: 'bee', displayName: 'Bee' })),
      ],
    });
    renderWithProviders(<RootNavigator />, { port });
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/consent'));
    const kept = '/search?q=blue+eyes+alternate+art&place=CA-QC&segment=cards';
    expect(usePendingLink.getState()).toMatchObject({ href: kept, owner: 'uid-maika' });

    // A signs out on Review our terms.
    mockSegments.current = ['(account)', 'consent'];
    mockPathname.current = '/consent';
    mockParams.current = {};
    await act(async () => {
      await port.signOut();
    });
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/sign-in'));
    expect(usePendingLink.getState().href).toBeNull();

    // Collector B creates an account on the same phone: the tabs, never A's search.
    mockSegments.current = ['(auth)', 'sign-in'];
    mockPathname.current = '/sign-in';
    await act(async () => {
      await port.signUp('bee@example.test', 'bee-password-1');
    });
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('forgets the screen kept for the welcome when the collector signs out there', async () => {
    mockSegments.current = ['messages', '[id]'];
    mockPathname.current = '/messages/conv-1';
    mockParams.current = { id: 'conv-1' };
    const port = new FakeAuthPort(testUser());
    mockApi({
      'GET /api/v1/me': [
        ok(meFixture({ onboarding: NOT_ONBOARDED })),
        ok(meFixture({ handle: 'bee', displayName: 'Bee' })),
      ],
    });
    renderWithProviders(<RootNavigator />, { port });
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/onboarding'));
    expect(usePendingLink.getState()).toMatchObject({
      href: '/messages/conv-1',
      owner: 'uid-maika',
    });

    mockSegments.current = ['onboarding'];
    mockPathname.current = '/onboarding';
    mockParams.current = {};
    await act(async () => {
      await port.signOut();
    });
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/sign-in'));
    expect(usePendingLink.getState().href).toBeNull();

    mockSegments.current = ['(auth)', 'sign-in'];
    mockPathname.current = '/sign-in';
    await act(async () => {
      await port.signUp('bee@example.test', 'bee-password-1');
    });
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('reopens a screen whose session ended for the same collector only', async () => {
    const ended = async () => {
      mockSegments.current = ['cards', '[id]'];
      mockPathname.current = '/cards/c1';
      mockParams.current = { id: 'c1', printing: 'p2' };
      const port = new FakeAuthPort(testUser());
      mockApi({ 'GET /api/v1/me': ok(meFixture()) });
      const view = renderWithProviders(<RootNavigator />, { port });
      await waitFor(() => expect(screen.queryByTestId('boot-screen')).not.toBeOnTheScreen());
      act(() => useSessionNotice.getState().reportEnded());
      await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/sign-in'));
      expect(usePendingLink.getState()).toMatchObject({
        href: '/cards/c1?printing=p2',
        owner: 'uid-maika',
      });
      mockSegments.current = ['(auth)', 'sign-in'];
      mockPathname.current = '/sign-in';
      mockParams.current = {};
      // Signing in again clears the notice (as `session.signIn` and `session.signUp` do).
      act(() => useSessionNotice.getState().clear());
      return { port, view };
    };

    // Another account signs in: the tabs, and the screen is forgotten.
    const first = await ended();
    await act(async () => {
      await first.port.signUp('bee@example.test', 'bee-password-1');
    });
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/'));
    await waitFor(() => expect(usePendingLink.getState().href).toBeNull());
    expect(mockRouter.push).not.toHaveBeenCalled();
    first.view.unmount();

    // The same collector signs in again: their screen reopens.
    resetRouterMock();
    resetAppState();
    const second = await ended();
    await act(async () => {
      await second.port.signIn('maika@example.test', 'correct-password');
    });
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/cards/c1?printing=p2'));
  });

  it('never pushes a remembered link on top of the welcome; the welcome takes it when it ends', async () => {
    // The welcome's second step completed the account (`/me` says onboarded) while its third,
    // "Where do you ship from?", is still on screen.
    mockSegments.current = ['onboarding'];
    mockPathname.current = '/onboarding';
    mockParams.current = {};
    usePendingLink.getState().set('/messages/conv-1', 'uid-maika');
    const api = mockApi({ 'GET /api/v1/me': ok(meFixture()) });
    renderWithProviders(<RootNavigator />, { port: new FakeAuthPort(testUser()) });
    await waitFor(() => expect(api.callsTo('GET /api/v1/me')).toHaveLength(1));
    await waitFor(() => expect(screen.queryByTestId('boot-screen')).not.toBeOnTheScreen());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(usePendingLink.getState().href).toBe('/messages/conv-1');
  });

  it('keeps a link opened while signed out for whoever signs in', () => {
    usePendingLink.getState().set('/collectors/collector5');
    expect(usePendingLink.getState().take('uid-anyone')).toBe('/collectors/collector5');
    usePendingLink.getState().set('/messages/conv-1', 'uid-maika');
    expect(usePendingLink.getState().take('uid-bee')).toBeNull();
    expect(usePendingLink.getState().href).toBeNull();
    usePendingLink.getState().set('/messages/conv-1', 'uid-maika');
    expect(usePendingLink.getState().take('uid-maika')).toBe('/messages/conv-1');
  });
});
