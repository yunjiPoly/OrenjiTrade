import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import OnboardingScreen from '@/app/onboarding';
import { usePendingLink } from '@/src/account/pendingLink';
import type { UpdateTradingAreaRequest } from '@/src/api/types';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import {
  LEGAL_DOCUMENTS,
  NOT_ONBOARDED,
  TAGS,
  locationFixture,
  meFixture,
  privacyFixture,
  profileFixture,
} from '../support/fixtures';
import { mockApi, noContent, ok, problem, type MockRequest } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());
jest.mock('@/src/features/location/deviceLocation', () => ({
  readApproximatePosition: jest.fn(),
}));

const freshProfile = profileFixture({
  handle: 'maika_x1',
  displayName: 'maika_x1',
  bio: '',
  games: [],
  languages: [],
  tags: [],
  profileComplete: false,
});

function onboardingRoutes(extra = {}) {
  return signedInRoutes({
    'GET /api/v1/me': ok(meFixture({ onboarding: NOT_ONBOARDED })),
    'GET /api/v1/me/profile': ok(freshProfile),
    'GET /api/v1/me/location': ok({ discoverable: false }),
    'PUT /api/v1/me/profile': ({ body }: MockRequest) =>
      ok({ ...freshProfile, ...(body as object), profileComplete: true }),
    'PUT /api/v1/me/profile/tags': ok([TAGS[0]]),
    'PUT /api/v1/me/location/trading-area': ({ body }: MockRequest) => {
      const area = body as UpdateTradingAreaRequest;
      return ok(
        locationFixture({
          tradingArea: { ...area, source: area.source ?? 'MANUAL', label: 'Ville-Marie, Montréal' },
        })
      );
    },
    'PUT /api/v1/me/settings/privacy': ({ body }: MockRequest) => ok(body),
    ...extra,
  });
}

beforeEach(() => {
  resetRouterMock();
  resetAppState();
});

describe('Onboarding', () => {
  it('shows a skeleton while loading, then an error with retry', async () => {
    const api = mockApi(
      onboardingRoutes({
        'GET /api/v1/me/profile': [problem(503, 'SERVICE_UNAVAILABLE', 'down'), ok(freshProfile)],
      })
    );
    renderWithProviders(<OnboardingScreen />, {
      port: new FakeAuthPort(testUser({ displayName: 'Maïka from sign-up' })),
    });
    expect(screen.getByTestId('onboarding-loading')).toBeOnTheScreen();
    expect(await screen.findByText('We could not load your profile')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Who are you?')).toBeOnTheScreen();
    expect(api.callsTo('GET /api/v1/me/profile').length).toBeGreaterThanOrEqual(2);
  });

  it('walks profile → interests → trading area with validation and the map opt-in off by default', async () => {
    const api = mockApi(onboardingRoutes());
    renderWithProviders(<OnboardingScreen />, { port: new FakeAuthPort(testUser()) });

    // Step 1: profile.
    expect(await screen.findByText('Who are you?')).toBeOnTheScreen();
    expect(screen.getByLabelText('Step 1 of 3 · Profile')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByLabelText('Display name'), '');
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Enter a display name.')).toBeOnTheScreen();
    expect(api.callsTo('PUT /api/v1/me/profile')).toHaveLength(0);

    fireEvent.changeText(screen.getByLabelText('Display name'), 'Maïka');
    fireEvent.changeText(screen.getByLabelText('Handle'), 'Maika_QC');
    fireEvent.changeText(screen.getByLabelText('Bio'), 'Vintage binders.');
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    // Step 2: interests (at least one game or tag).
    expect(await screen.findByText('What do you collect?')).toBeOnTheScreen();
    expect(api.callsTo('PUT /api/v1/me/profile')[0]?.body).toEqual({
      handle: 'maika_qc',
      displayName: 'Maïka',
      bio: 'Vintage binders.',
      games: [],
      languages: [],
    });
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByTestId('interests-missing')).toHaveTextContent(
      /Choose at least one game or one tag\./
    );

    fireEvent.press(await screen.findByRole('checkbox', { name: 'Pokémon' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Add tag Local pickup' }));
    expect(screen.getByTestId('tag-count')).toHaveTextContent('1 / 12');
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    // Step 3: trading area.
    expect(await screen.findByText('Where do you trade?')).toBeOnTheScreen();
    expect(api.callsTo('PUT /api/v1/me/profile/tags')[0]?.body).toEqual({
      tagIds: ['tag-1'],
      customLabels: [],
    });
    expect(screen.getByTestId('area-public-label')).toHaveTextContent('No trading area saved yet.');
    const optIn = screen.getByRole('switch', { name: 'Show me on the map' });
    expect(optIn).not.toBeChecked();

    // A city quick pick sets its public centre and suggested radius (10 km), like the web.
    fireEvent.press(screen.getByRole('button', { name: 'Laval' }));
    expect(screen.getByTestId('area-centre-summary')).toHaveTextContent(
      'Centre: Laval city centre.'
    );
    fireEvent.press(screen.getByRole('button', { name: 'Increase trading radius' }));
    fireEvent.press(optIn);
    fireEvent.press(screen.getByRole('button', { name: 'Finish' }));

    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/'));
    expect(api.callsTo('PUT /api/v1/me/location/trading-area')[0]?.body).toEqual({
      lat: 45.606,
      lng: -73.712,
      radiusKm: 15,
      source: 'MANUAL',
    });
    expect(api.callsTo('PUT /api/v1/me/settings/privacy')[0]?.body).toEqual({
      ...privacyFixture(),
      discoverable: true,
    });
    expect(screen.getByTestId('snackbar')).toHaveTextContent(
      'Welcome to OrenjiTrade! Your profile is ready.'
    );
  });

  it('maps a taken handle onto the field', async () => {
    mockApi(onboardingRoutes({ 'PUT /api/v1/me/profile': problem(409, 'HANDLE_TAKEN', 'taken') }));
    renderWithProviders(<OnboardingScreen />, { port: new FakeAuthPort(testUser()) });
    expect(await screen.findByText('Who are you?')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByLabelText('Handle'), 'collector1');
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(
      await screen.findByText('That handle is already taken. Try another one.')
    ).toBeOnTheScreen();
    expect(screen.queryByText('What do you collect?')).toBeNull();
  });

  it('lets the collector skip the trading area (nothing about location is sent)', async () => {
    const api = mockApi(
      onboardingRoutes({
        'GET /api/v1/me': ok(
          meFixture({
            onboarding: { profileComplete: true, interestsSet: true, tradingAreaSet: false },
          })
        ),
      })
    );
    renderWithProviders(<OnboardingScreen />, { port: new FakeAuthPort(testUser()) });
    expect(await screen.findByText('Where do you trade?')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Skip for now' }));
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/'));
    expect(api.callsTo('PUT /api/v1/me/location/trading-area')).toHaveLength(0);
    expect(api.callsTo('PUT /api/v1/me/settings/privacy')).toHaveLength(0);
  });

  it('sends a device position once, only to the API, and shows only the server label', async () => {
    const { readApproximatePosition } = jest.requireMock(
      '@/src/features/location/deviceLocation'
    ) as {
      readApproximatePosition: jest.Mock;
    };
    readApproximatePosition.mockResolvedValueOnce({ status: 'ok', lat: 45.519, lng: -73.586 });
    const api = mockApi(
      onboardingRoutes({
        'GET /api/v1/me': ok(
          meFixture({
            onboarding: { profileComplete: true, interestsSet: true, tradingAreaSet: false },
          })
        ),
      })
    );
    renderWithProviders(<OnboardingScreen />, { port: new FakeAuthPort(testUser()) });
    fireEvent.press(await screen.findByRole('button', { name: 'Use my current location' }));

    expect(await screen.findByTestId('area-device-message')).toHaveTextContent(
      /Trading area set near Ville-Marie, Montréal\./
    );
    expect(api.callsTo('PUT /api/v1/me/location/trading-area')[0]?.body).toEqual({
      lat: 45.519,
      lng: -73.586,
      radiusKm: 5,
      source: 'DEVICE',
    });
    // Never rendered as numbers, never drawn as a point.
    expect(screen.queryByText(/45\.519|73\.586/)).toBeNull();
    await waitFor(() => expect(screen.queryByTestId('trading-area-pin')).not.toBeOnTheScreen());
    expect(screen.getByTestId('area-centre-summary')).toHaveTextContent(/your device location/);
  });

  it('explains a denied location permission', async () => {
    const { readApproximatePosition } = jest.requireMock(
      '@/src/features/location/deviceLocation'
    ) as {
      readApproximatePosition: jest.Mock;
    };
    readApproximatePosition.mockResolvedValueOnce({ status: 'denied' });
    const api = mockApi(
      onboardingRoutes({
        'GET /api/v1/me': ok(
          meFixture({
            onboarding: { profileComplete: true, interestsSet: true, tradingAreaSet: false },
          })
        ),
      })
    );
    renderWithProviders(<OnboardingScreen />, { port: new FakeAuthPort(testUser()) });
    fireEvent.press(await screen.findByRole('button', { name: 'Use my current location' }));
    expect(await screen.findByTestId('area-device-message')).toHaveTextContent(
      /Location permission was denied/
    );
    expect(api.callsTo('PUT /api/v1/me/location/trading-area')).toHaveLength(0);
  });
});

describe('Onboarding age step (18+ rule)', () => {
  const AGE_LABEL = 'I confirm I am 18 years of age or older';
  const unconfirmed = (rest: Record<string, boolean>) =>
    meFixture({ onboarding: { ...NOT_ONBOARDED, ...rest, ageConfirmed: false } });

  it('asks an existing collector only for the confirmation, then sends them back', async () => {
    const api = mockApi(
      onboardingRoutes({
        'GET /api/v1/me': [
          ok(unconfirmed({ profileComplete: true, interestsSet: true, tradingAreaSet: true })),
          ok(meFixture()),
        ],
        'GET /api/v1/me/profile': ok(profileFixture()),
        'POST /api/v1/me/consents': noContent,
      })
    );
    renderWithProviders(<OnboardingScreen />, { port: new FakeAuthPort(testUser()) });
    expect(await screen.findByText('Are you 18 or older?')).toBeOnTheScreen();
    expect(screen.getByLabelText('Step 1 of 4 · Age')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Handle')).toBeNull();
    expect(screen.getByText('Je confirme avoir 18 ans ou plus')).toBeOnTheScreen();

    // The terms are readable from the step.
    fireEvent.press(screen.getByTestId('onboarding-age-terms'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/legal/[key]',
      params: { key: 'terms' },
    });

    // Unticked: nothing is recorded.
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(
      screen.getByText('You must confirm that you are 18 years of age or older to use OrenjiTrade.')
    ).toBeOnTheScreen();
    expect(api.callsTo('POST /api/v1/me/consents')).toHaveLength(0);

    // The gate remembered where the collector was sent to onboarding from.
    usePendingLink.getState().set('/collectors/collector5');
    fireEvent.press(screen.getByRole('checkbox', { name: AGE_LABEL }));
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    // The remembered link replaces onboarding (back leads to the tabs), the tabs otherwise.
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/collectors/collector5'));
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
    expect(usePendingLink.getState().href).toBeNull();
    expect(api.callsTo('POST /api/v1/me/consents')[0]?.body).toEqual({
      documentType: 'AGE_CONFIRMATION',
      version: '2026-10-05',
      language: 'en',
    });
    expect(screen.getByTestId('snackbar')).toHaveTextContent(
      'Thanks for confirming. Welcome back!'
    );
  });

  it('puts the confirmation first for a new account, then continues to the profile step', async () => {
    const api = mockApi(
      onboardingRoutes({
        'GET /api/v1/me': [ok(unconfirmed({})), ok(meFixture({ onboarding: NOT_ONBOARDED }))],
        'POST /api/v1/me/consents': noContent,
      })
    );
    renderWithProviders(<OnboardingScreen />, { port: new FakeAuthPort(testUser()) });
    expect(await screen.findByText('Are you 18 or older?')).toBeOnTheScreen();
    expect(screen.getByLabelText('Step 1 of 4 · Age')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('checkbox', { name: AGE_LABEL }));
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Who are you?')).toBeOnTheScreen();
    expect(screen.getByLabelText('Step 2 of 4 · Profile')).toBeOnTheScreen();
    expect(api.callsTo('POST /api/v1/me/consents')).toHaveLength(1);
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
  });

  it('shows the failure of the confirmation and offers Sign out so nobody is stuck', async () => {
    const port = new FakeAuthPort(testUser());
    mockApi(
      onboardingRoutes({
        'GET /api/v1/me': ok(
          unconfirmed({ profileComplete: true, interestsSet: true, tradingAreaSet: true })
        ),
        'GET /api/v1/me/profile': ok(profileFixture()),
        'POST /api/v1/me/consents': problem(429, 'RATE_LIMITED', 'slow down'),
      })
    );
    renderWithProviders(<OnboardingScreen />, { port });
    usePendingLink.getState().set('/collectors/collector5');
    fireEvent.press(await screen.findByRole('checkbox', { name: AGE_LABEL }));
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(/Too many requests in a short time/)).toBeOnTheScreen();
    // Nothing recorded: the collector stays, and the remembered link waits for the retry.
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(usePendingLink.getState().href).toBe('/collectors/collector5');
    fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(port.signOut).toHaveBeenCalled());
  });

  it('retries the legal documents when they cannot be loaded', async () => {
    const api = mockApi(
      onboardingRoutes({
        'GET /api/v1/me': ok(
          unconfirmed({ profileComplete: true, interestsSet: true, tradingAreaSet: true })
        ),
        'GET /api/v1/me/profile': ok(profileFixture()),
        'GET /api/v1/public/legal/documents': [
          problem(503, 'SERVICE_UNAVAILABLE', 'down'),
          ok(LEGAL_DOCUMENTS),
        ],
      })
    );
    renderWithProviders(<OnboardingScreen />, { port: new FakeAuthPort(testUser()) });
    expect(await screen.findByText('We could not load the confirmation')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('checkbox', { name: AGE_LABEL })).toBeOnTheScreen();
    expect(api.callsTo('GET /api/v1/public/legal/documents')).toHaveLength(2);
  });

  it('never asks an onboarded account whose API does not report the flag', async () => {
    mockApi(
      onboardingRoutes({
        'GET /api/v1/me': ok(
          meFixture({
            onboarding: { profileComplete: false, interestsSet: false, tradingAreaSet: false },
          })
        ),
      })
    );
    renderWithProviders(<OnboardingScreen />, { port: new FakeAuthPort(testUser()) });
    expect(await screen.findByText('Who are you?')).toBeOnTheScreen();
    expect(screen.getByLabelText('Step 1 of 3 · Profile')).toBeOnTheScreen();
    expect(screen.queryByText('Are you 18 or older?')).toBeNull();
  });
});
