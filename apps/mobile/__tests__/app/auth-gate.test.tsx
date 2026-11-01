import { act, screen, waitFor } from '@testing-library/react-native';

import { useFlowLock } from '@/src/account/flowLock';
import { useGuestAction } from '@/src/account/guestAction';
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

  it('opens on Home for a signed-out visitor, and on Sign in for a member-only screen (stage R15)', async () => {
    mockSegments.current = ['(tabs)'];
    mockApi({});
    const home = renderWithProviders(<RootNavigator />, { port: new FakeAuthPort(null) });
    await waitFor(() => expect(screen.queryByTestId('boot-screen')).toBeNull());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
    home.unmount();

    // The public pages stay open to a guest.
    for (const [segments, pathname] of [
      [['cards', '[id]'], '/cards/c1'],
      [['binders', '[id]'], '/binders/b1'],
      [['settings', 'appearance'], '/settings/appearance'],
      [['(tabs)', 'inventory'], '/inventory'],
    ] as const) {
      resetRouterMock();
      mockSegments.current = [...segments];
      mockPathname.current = pathname;
      mockApi({});
      const view = renderWithProviders(<RootNavigator />, { port: new FakeAuthPort(null) });
      await waitFor(() => expect(screen.queryByTestId('boot-screen')).toBeNull());
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(mockRouter.dismissTo).not.toHaveBeenCalled();
      view.unmount();
    }

    // A deep link to a notification, a chat or a profile: Sign in, the link kept for after.
    resetRouterMock();
    mockSegments.current = ['notifications'];
    mockPathname.current = '/notifications';
    mockApi({});
    renderWithProviders(<RootNavigator />, { port: new FakeAuthPort(null) });
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/sign-in'));
    expect(usePendingLink.getState()).toMatchObject({ href: '/notifications', owner: null });
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
    // Straight to the link, in place of Sign in (stage R15: `dismissTo` pops back to it when it
    // is still in the stack).
    await waitFor(() =>
      expect(mockRouter.dismissTo).toHaveBeenCalledWith('/collectors/collector5')
    );
    expect(mockRouter.push).not.toHaveBeenCalled();
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
    // Stage R15: an explicit sign-out lands on Home as a guest.
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/'));
    expect(mockRouter.dismissTo).not.toHaveBeenCalledWith('/sign-in');
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

describe('auth gate: a suspension leaves the login on (owner decision of 2026-10-28)', () => {
  const UNTIL = '2026-11-02T15:00:00Z';

  it.each([
    ['with its end date', { suspendedUntil: UNTIL }],
    ['without an end date', {}],
  ])(
    'moves a collector suspended while signed in to Account suspended at the next request, %s',
    async (_label, extra) => {
      mockSegments.current = ['(tabs)', 'messages'];
      const port = new FakeAuthPort(testUser());
      const api = mockApi({
        'GET /api/v1/me': [
          ok(meFixture()),
          problem(403, 'ACCOUNT_SUSPENDED', 'This account is suspended', extra),
        ],
      });
      renderWithProviders(<RootNavigator />, { port });
      await waitFor(() => expect(api.callsTo('GET /api/v1/me')).toHaveLength(1));
      expect(mockRouter.dismissTo).not.toHaveBeenCalled();
      act(() => {
        reportAccountSignal(
          ApiError.fromProblem(403, {
            status: 403,
            errorCode: 'ACCOUNT_SUSPENDED',
            message: 'This account is suspended',
            ...extra,
          }),
          'http://localhost:8090/api/v1/conversations'
        );
      });
      await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/suspended'));
      // No "Your session has ended" detour: the session is kept and nobody is signed out.
      expect(useSessionNotice.getState().ended).toBe(false);
      expect(port.signOut).not.toHaveBeenCalled();
      expect(mockRouter.dismissTo).not.toHaveBeenCalledWith('/sign-in');
    }
  );

  it.each([
    ['with its end date', { suspendedUntil: UNTIL }],
    ['without an end date', {}],
  ])(
    'lands a suspended collector who signs in again on Account suspended, %s',
    async (_l, extra) => {
      mockSegments.current = ['(auth)', 'sign-in'];
      const port = new FakeAuthPort(testUser());
      mockApi({
        'GET /api/v1/me': problem(403, 'ACCOUNT_SUSPENDED', 'This account is suspended', extra),
      });
      renderWithProviders(<RootNavigator />, { port });
      await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/suspended'));
      expect(port.signOut).not.toHaveBeenCalled();
    }
  );
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
    // Home as a guest (stage R15).
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/'));
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
    // Home as a guest (stage R15).
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/'));
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
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/cards/c1?printing=p2'));
  });

  it('keeps a member screen left under Sign in by an ended session for its collector only (R15 review fix 1)', async () => {
    // Collector A's session ends on a chat.
    mockSegments.current = ['messages', '[id]'];
    mockPathname.current = '/messages/conv-1';
    mockParams.current = { id: 'conv-1' };
    const port = new FakeAuthPort(testUser());
    mockApi({ 'GET /api/v1/me': ok(meFixture()) });
    const view = renderWithProviders(<RootNavigator />, { port });
    await waitFor(() => expect(screen.queryByTestId('boot-screen')).not.toBeOnTheScreen());
    act(() => useSessionNotice.getState().reportEnded());
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/sign-in'));

    // Sign in left with a swipe: the profile under it, a member screen, sends them back to Sign
    // in, and that screen stays A's.
    mockRouter.dismissTo.mockClear();
    mockSegments.current = ['collectors', '[id]'];
    mockPathname.current = '/collectors/collector2';
    mockParams.current = { id: 'collector2' };
    view.rerender(<RootNavigator />);
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/sign-in'));
    expect(usePendingLink.getState()).toMatchObject({
      href: '/collectors/collector2',
      owner: 'uid-maika',
    });

    // Collector B creates an account on the same phone: the tabs, never A's screen.
    mockSegments.current = ['(auth)', 'sign-in'];
    mockPathname.current = '/sign-in';
    mockParams.current = {};
    act(() => useSessionNotice.getState().clear());
    await act(async () => {
      await port.signUp('bee@example.test', 'bee-password-1');
    });
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/'));
    expect(mockRouter.dismissTo).not.toHaveBeenCalledWith('/collectors/collector2');
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('forgets an action a guest left behind when a member link sends them to Sign in (R15 review fix 1)', async () => {
    // The sheet's Sign in, then a swipe back: the action is left. A link to Notifications
    // later opens Sign in for that screen only.
    useGuestAction.getState().open({ kind: 'message', listing: { itemId: 'item-1' } });
    useGuestAction.getState().hide();
    mockSegments.current = ['notifications'];
    mockPathname.current = '/notifications';
    mockApi({});
    renderWithProviders(<RootNavigator />, { port: new FakeAuthPort(null) });
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/sign-in'));
    expect(usePendingLink.getState()).toMatchObject({ href: '/notifications', owner: null });
    expect(useGuestAction.getState().pending).toBeNull();
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
