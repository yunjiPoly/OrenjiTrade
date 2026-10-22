import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import OnboardingScreen from '@/app/onboarding';
import { usePendingLink } from '@/src/account/pendingLink';
import type { GameResponse, UpdateLocationRequest } from '@/src/api/types';
import { useBrowsingGameStore } from '@/src/features/games/browsingGame';
import { HANDLE_CHECK_DELAY_MS } from '@/src/features/onboarding/HandleField';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import {
  GAMES,
  NOT_ONBOARDED,
  TAGS,
  meFixture,
  privacyFixture,
  profileFixture,
} from '../support/fixtures';
import { mockApi, ok, problem, type MockRequest } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());

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
    'PUT /api/v1/me/location': ({ body }: MockRequest) => {
      const place = body as UpdateLocationRequest;
      return ok({
        discoverable: false,
        location: {
          regionCode: 'americas-north',
          regionName: 'Americas (North)',
          countryCode: place.countryCode,
          countryName: 'Canada',
          subdivisionCode: place.subdivisionCode,
          subdivisionName: 'Quebec',
          label: 'Quebec, Canada',
          city: place.city || null,
          showCity: place.showCity ?? true,
        },
      });
    },
    'PUT /api/v1/me/settings/privacy': ({ body }: MockRequest) => ok(body),
    'GET /api/v1/me/profile/handle-availability': ({ query }: MockRequest) => {
      const handle = query.get('handle') ?? '';
      return ok({
        handle,
        status: handle === 'taken_one' ? 'TAKEN' : 'AVAILABLE',
        available: handle !== 'taken_one',
      });
    },
    ...extra,
  });
}

beforeEach(() => {
  resetRouterMock();
  resetAppState();
});

/** Chooses `value` in the SelectSheet field `select` (opens the sheet, presses the option). */
async function choose(select: string, value: string) {
  fireEvent.press(await screen.findByTestId(select));
  fireEvent.press(await screen.findByTestId(`${select}-option-${value}`));
}

/** One Piece, picked like any game, whose cards are coming soon (no `hasCards`). */
const ONE_PIECE: GameResponse = {
  id: 'g5',
  slug: 'one-piece',
  name: 'One Piece Card Game',
  shortName: 'One Piece',
  status: 'ACTIVE',
  sortOrder: 4,
  schema: (GAMES[0] as GameResponse).schema,
  hasCards: false,
};

/** Lets the handle's live check run (typing pauses, the API answers). */
async function settleHandleCheck() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, HANDLE_CHECK_DELAY_MS + 50));
  });
}

describe('Welcome (three steps)', () => {
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

  /** What VoiceOver reads as the bar's value: iOS says now / (max - min) as a percentage. */
  const spokenPercent = (label: string) => {
    const value = screen.getByLabelText(label).props.accessibilityValue as {
      min: number;
      max: number;
      now: number;
    };
    return Math.round((100 * value.now) / (value.max - value.min));
  };

  it('walks Who are you?, What do you collect? and Where do you ship from?, then opens Home on the first game picked', async () => {
    const api = mockApi(onboardingRoutes());
    renderWithProviders(<OnboardingScreen />, { port: new FakeAuthPort(testUser()) });

    // Step 1 of 3: no age step (sign-up asked it).
    expect(await screen.findByText('Who are you?')).toBeOnTheScreen();
    expect(screen.getByLabelText('Step 1 of 3')).toBeOnTheScreen();
    expect(spokenPercent('Step 1 of 3')).toBe(33);
    expect(screen.getByText('WELCOME TO ORENJITRADE')).toBeOnTheScreen();
    expect(screen.queryByText(/18 or older/)).toBeNull();
    // Deals ship by mail (ADR 0018): the first screen a collector fills in never asks where
    // they meet, neither in a text nor in a placeholder.
    expect(
      screen.getByPlaceholderText('What do you collect? Do you trade, sell or ship?')
    ).toBeOnTheScreen();
    expect(screen.queryAllByText(/\bmeet/i)).toHaveLength(0);
    expect(screen.queryAllByPlaceholderText(/\bmeet/i)).toHaveLength(0);
    fireEvent.changeText(screen.getByLabelText('Display name'), '');
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Enter a display name.')).toBeOnTheScreen();
    expect(api.callsTo('PUT /api/v1/me/profile')).toHaveLength(0);

    fireEvent.changeText(screen.getByLabelText('Display name'), 'Maïka');
    fireEvent.changeText(screen.getByLabelText('Handle'), 'Maika_QC');
    await settleHandleCheck();
    // The live check: a teal check once the handle is free.
    expect(await screen.findByLabelText('Available')).toBeOnTheScreen();
    expect(
      api.callsTo('GET /api/v1/me/profile/handle-availability').at(-1)?.query.get('handle')
    ).toBe('maika_qc');
    fireEvent.changeText(screen.getByLabelText('Bio (optional)'), 'Vintage binders.');
    expect(screen.getByText('16 / 500')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    // Step 2 of 3: the games, at least one.
    expect(await screen.findByText('What do you collect?')).toBeOnTheScreen();
    expect(screen.getByLabelText('Step 2 of 3')).toBeOnTheScreen();
    expect(spokenPercent('Step 2 of 3')).toBe(67);
    expect(api.callsTo('PUT /api/v1/me/profile')[0]?.body).toEqual({
      handle: 'maika_qc',
      displayName: 'Maïka',
      bio: 'Vintage binders.',
      games: [],
      languages: [],
    });
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    expect(screen.getByTestId('interests-missing')).toHaveTextContent('Choose at least one game.');

    // The first game picked opens first.
    fireEvent.press(await screen.findByRole('checkbox', { name: 'Pokémon' }));
    expect(screen.getByRole('checkbox', { name: 'Pokémon, Opens first' })).toBeChecked();
    fireEvent.press(screen.getByRole('checkbox', { name: 'Yu-Gi-Oh!' }));
    expect(screen.getByRole('checkbox', { name: 'Yu-Gi-Oh!' })).toBeChecked();
    expect(screen.queryByTestId('interests-missing')).toBeNull();
    fireEvent.press(screen.getByRole('checkbox', { name: 'English' }));
    fireEvent.press(await screen.findByRole('checkbox', { name: 'Tracked shipping' }));
    expect(screen.getByTestId('tag-count')).toHaveTextContent('1 / 12');
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    // Step 3 of 3: where do you ship from? Pickers fed by GET /regions: no map, no GPS (ADR 0017).
    expect(await screen.findByText('Where do you ship from?')).toBeOnTheScreen();
    expect(screen.getByLabelText('Step 3 of 3')).toBeOnTheScreen();
    expect(spokenPercent('Step 3 of 3')).toBe(100);
    expect(api.callsTo('PUT /api/v1/me/profile')[1]?.body).toMatchObject({
      games: ['pokemon', 'yugioh'],
      languages: ['en'],
    });
    expect(api.callsTo('PUT /api/v1/me/profile/tags')[0]?.body).toEqual({
      tagIds: ['tag-1'],
      customLabels: [],
    });
    // Home and Search open on the first game picked.
    expect(useBrowsingGameStore.getState().picked['uid-maika']).toBe('pokemon');
    expect(
      screen.getByText(
        'Collectors find binders by state or province. We never use GPS and never ask for your address.'
      )
    ).toBeOnTheScreen();
    expect(screen.queryByTestId('collector-map-view')).toBeNull();
    const optIn = screen.getByRole('switch', { name: 'Show me on the map' });
    expect(optIn).not.toBeChecked();

    // Finish without a state: what is missing is said, nothing is saved.
    fireEvent.press(screen.getByRole('button', { name: 'Finish' }));
    expect(await screen.findByTestId('location-missing')).toHaveTextContent(
      /Choose your country\./
    );
    expect(api.callsTo('PUT /api/v1/me/location')).toHaveLength(0);

    await choose('location-country', 'CA');
    await choose('location-subdivision', 'CA-QC');
    // The switch's line names the region and the province once chosen.
    expect(
      screen.getByText(
        'Collectors of Americas (North) can find your public binders in Quebec. Off until you turn it on.'
      )
    ).toBeOnTheScreen();
    fireEvent.changeText(screen.getByLabelText('City (optional)'), ' Laval ');
    fireEvent.press(screen.getByRole('switch', { name: 'Show my city on my profile' }));
    fireEvent.press(optIn);
    fireEvent.press(screen.getByRole('button', { name: 'Finish' }));

    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/'));
    expect(api.callsTo('PUT /api/v1/me/location')[0]?.body).toEqual({
      countryCode: 'CA',
      subdivisionCode: 'CA-QC',
      city: 'Laval',
      showCity: false,
    });
    expect(api.calls.some((call) => call.path.includes('trading-area'))).toBe(false);
    expect(api.callsTo('PUT /api/v1/me/settings/privacy')[0]?.body).toEqual({
      ...privacyFixture(),
      discoverable: true,
    });
    expect(screen.getByTestId('snackbar')).toHaveTextContent(
      'Welcome to OrenjiTrade! Your profile is ready.'
    );
  });

  it("says a handle is taken while it is typed, and maps the save's 409 onto the field", async () => {
    mockApi(onboardingRoutes({ 'PUT /api/v1/me/profile': problem(409, 'HANDLE_TAKEN', 'taken') }));
    renderWithProviders(<OnboardingScreen />, { port: new FakeAuthPort(testUser()) });
    expect(await screen.findByText('Who are you?')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByLabelText('Handle'), 'taken_one');
    await settleHandleCheck();
    expect(await screen.findByTestId('handle-error')).toHaveTextContent(
      'That handle is already taken. Try another one.'
    );
    expect(screen.queryByLabelText('Available')).toBeNull();
    // Another handle clears it; the save still decides.
    fireEvent.changeText(screen.getByLabelText('Handle'), 'collector1');
    expect(screen.queryByTestId('handle-error')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(
      await screen.findByText('That handle is already taken. Try another one.')
    ).toBeOnTheScreen();
    expect(screen.queryByText('What do you collect?')).toBeNull();
  });

  it('never checks a malformed handle', async () => {
    const api = mockApi(onboardingRoutes());
    renderWithProviders(<OnboardingScreen />, { port: new FakeAuthPort(testUser()) });
    expect(await screen.findByText('Who are you?')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByLabelText('Handle'), 'ab');
    await settleHandleCheck();
    expect(screen.queryByLabelText('Available')).toBeNull();
    expect(
      api
        .callsTo('GET /api/v1/me/profile/handle-availability')
        .some((call) => call.query.get('handle') === 'ab')
    ).toBe(false);
  });

  it('marks the next game with cards "Opens first" when the first picked has none yet', async () => {
    mockApi(
      onboardingRoutes({
        'GET /api/v1/me': ok(
          meFixture({ onboarding: { ...NOT_ONBOARDED, profileComplete: true } })
        ),
        'GET /api/v1/games': ok([...GAMES, ONE_PIECE]),
      })
    );
    renderWithProviders(<OnboardingScreen />, { port: new FakeAuthPort(testUser()) });
    // Resumes on step 2: the profile is saved, no game or tag yet.
    expect(await screen.findByText('What do you collect?')).toBeOnTheScreen();
    expect(screen.getByLabelText('Step 2 of 3')).toBeOnTheScreen();
    const onePiece = await screen.findByRole('checkbox', { name: 'One Piece, Cards coming soon' });
    fireEvent.press(onePiece);
    expect(screen.getByRole('checkbox', { name: 'One Piece, Cards coming soon' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
    fireEvent.press(screen.getByRole('checkbox', { name: 'Yu-Gi-Oh!' }));
    expect(screen.getByRole('checkbox', { name: 'Yu-Gi-Oh!, Opens first' })).toBeChecked();
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Where do you ship from?')).toBeOnTheScreen();
    expect(useBrowsingGameStore.getState().picked['uid-maika']).toBe('yugioh');
    // Back to the games.
    fireEvent.press(screen.getByRole('button', { name: 'Back to What do you collect?' }));
    expect(await screen.findByText('What do you collect?')).toBeOnTheScreen();
  });

  it('resumes on the place step once the profile and the interests are saved', async () => {
    mockApi(
      onboardingRoutes({
        'GET /api/v1/me': ok(
          meFixture({
            onboarding: { profileComplete: true, interestsSet: true, locationSet: false },
          })
        ),
      })
    );
    renderWithProviders(<OnboardingScreen />, { port: new FakeAuthPort(testUser()) });
    expect(await screen.findByText('Where do you ship from?')).toBeOnTheScreen();
    expect(screen.getByLabelText('Step 3 of 3')).toBeOnTheScreen();
  });

  it('lets the collector skip the location (nothing about it is sent)', async () => {
    const api = mockApi(
      onboardingRoutes({
        'GET /api/v1/me': ok(
          meFixture({
            onboarding: { profileComplete: true, interestsSet: true, locationSet: false },
          })
        ),
      })
    );
    renderWithProviders(<OnboardingScreen />, { port: new FakeAuthPort(testUser()) });
    expect(await screen.findByText('Where do you ship from?')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Skip for now' }));
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/'));
    expect(api.callsTo('PUT /api/v1/me/location')).toHaveLength(0);
    expect(api.callsTo('PUT /api/v1/me/settings/privacy')).toHaveLength(0);
  });

  it('reopens the link the gate remembered instead of Home', async () => {
    mockApi(
      onboardingRoutes({
        'GET /api/v1/me': ok(
          meFixture({
            onboarding: { profileComplete: true, interestsSet: true, locationSet: false },
          })
        ),
      })
    );
    renderWithProviders(<OnboardingScreen />, { port: new FakeAuthPort(testUser()) });
    expect(await screen.findByText('Where do you ship from?')).toBeOnTheScreen();
    usePendingLink.getState().set('/collectors/collector5');
    fireEvent.press(screen.getByRole('button', { name: 'Skip for now' }));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/collectors/collector5'));
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
    expect(usePendingLink.getState().href).toBeNull();
  });

  it('switches the region: the countries follow, a whole-country territory needs no state', async () => {
    const api = mockApi(
      onboardingRoutes({
        'GET /api/v1/me': ok(
          meFixture({
            onboarding: { profileComplete: true, interestsSet: true, locationSet: false },
          })
        ),
      })
    );
    renderWithProviders(<OnboardingScreen />, { port: new FakeAuthPort(testUser()) });
    expect(await screen.findByText('Where do you ship from?')).toBeOnTheScreen();
    await choose('location-region', 'europe');
    fireEvent.press(screen.getByTestId('location-country'));
    expect(await screen.findByTestId('location-country-option-FR')).toBeOnTheScreen();
    expect(screen.queryByTestId('location-country-option-CA')).toBeNull();
    fireEvent.press(screen.getByTestId('location-country-option-VA'));
    // Vatican City is one pseudo-subdivision: chosen with the country, no state picker.
    expect(screen.queryByTestId('location-subdivision')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Finish' }));
    await waitFor(() => expect(api.callsTo('PUT /api/v1/me/location')).toHaveLength(1));
    expect(api.callsTo('PUT /api/v1/me/location')[0]?.body).toMatchObject({
      countryCode: 'VA',
      subdivisionCode: 'VA',
    });
  });

  it('keeps the collector on the step when the API refuses the place', async () => {
    mockApi(
      onboardingRoutes({
        'GET /api/v1/me': ok(
          meFixture({
            onboarding: { profileComplete: true, interestsSet: true, locationSet: false },
          })
        ),
        'PUT /api/v1/me/location': problem(400, 'VALIDATION_FAILED', 'Unknown subdivision', {
          fieldErrors: [{ field: 'subdivisionCode', message: 'unknown subdivision' }],
        }),
      })
    );
    renderWithProviders(<OnboardingScreen />, { port: new FakeAuthPort(testUser()) });
    await choose('location-country', 'CA');
    await choose('location-subdivision', 'CA-ON');
    fireEvent.press(screen.getByRole('button', { name: 'Finish' }));
    expect(await screen.findByText('Unknown subdivision')).toBeOnTheScreen();
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
    expect(screen.getByText('Where do you ship from?')).toBeOnTheScreen();
  });

  it('offers Sign out on the first step', async () => {
    const port = new FakeAuthPort(testUser());
    mockApi(onboardingRoutes());
    renderWithProviders(<OnboardingScreen />, { port });
    expect(await screen.findByText('Who are you?')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(port.signOut).toHaveBeenCalled());
  });
});
