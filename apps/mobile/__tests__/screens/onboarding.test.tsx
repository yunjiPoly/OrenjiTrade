import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import OnboardingScreen from '@/app/onboarding';
import type { UpdateTradingAreaRequest } from '@/src/api/types';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import {
  NOT_ONBOARDED,
  TAGS,
  locationFixture,
  meFixture,
  privacyFixture,
  profileFixture,
} from '../support/fixtures';
import { mockApi, ok, problem, type MockRequest } from '../support/mockApi';
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

    fireEvent.press(screen.getByRole('radio', { name: 'Laval' }));
    fireEvent.press(screen.getByRole('button', { name: 'Increase trading radius' }));
    fireEvent.press(optIn);
    fireEvent.press(screen.getByRole('button', { name: 'Finish' }));

    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/'));
    expect(api.callsTo('PUT /api/v1/me/location/trading-area')[0]?.body).toEqual({
      lat: 45.606,
      lng: -73.712,
      radiusKm: 6,
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
    // Never rendered as numbers.
    expect(screen.queryByText(/45\.519|73\.586/)).toBeNull();
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
