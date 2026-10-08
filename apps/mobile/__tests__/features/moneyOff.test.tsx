import { fireEvent, screen } from '@testing-library/react-native';

import ProfileScreen from '@/app/(tabs)/profile';
import CollectorScreen from '@/app/collectors/[id]';
import SettingsScreen from '@/app/settings/index';
import { ApiError } from '@/src/api/ApiError';
import { LimitReachedNotice } from '@/src/features/limits/LimitReachedNotice';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import {
  collectorFixture,
  publicBinderSummaryFixture,
  publicItemsPage,
  ratingsPageFixture,
  referencesPageFixture,
} from '../support/fixtures';
import { mockApi, ok, problem, type MockRoutes } from '../support/mockApi';
import { flags } from '../support/paymentFixtures';
import { signedInRoutes } from '../support/routes';
import { mockParams, mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());
jest.mock('@/src/components/map/mapEngine', () => ({ currentMapEngine: () => 'native' }));

/** The launch configuration: every money feature off (`protectedPayments`, `premiumPlans`, ...). */
const MONEY_OFF = flags({
  premiumPlans: false,
  credits: false,
  donations: false,
  protectedPayments: false,
  advertising: false,
});

function routes(extra: MockRoutes = {}): MockRoutes {
  return signedInRoutes({
    'GET /api/v1/public/feature-flags': ok(MONEY_OFF),
    'GET /api/v1/ads': ok([]),
    'GET /api/v1/collectors/{handle}/binders': ok([publicBinderSummaryFixture()]),
    'GET /api/v1/collectors/{handle}/inventory': ok(publicItemsPage([])),
    'GET /api/v1/collectors/{handle}/ratings': ok(ratingsPageFixture()),
    'GET /api/v1/collectors/{handle}/references': ok(referencesPageFixture()),
    'GET /api/v1/collectors/{handle}/wishlist': problem(404, 'NOT_FOUND', 'hidden'),
    'GET /api/v1/collectors/{handle}': ok(
      collectorFixture({
        id: '00000000-0000-4000-8000-0000000000b1',
        handle: 'collector2',
        displayName: 'Noé Verdun',
      })
    ),
    ...extra,
  });
}

const port = () => new FakeAuthPort(testUser());
const MONEY_WORDS = /premium|subscri|credit|donat|support orenjitrade|checkout|pay/i;

beforeEach(() => {
  resetRouterMock();
  resetAppState();
});

describe('launch configuration: every money flag off', () => {
  it('shows no pay, subscribe, credits or donate entry point on the Profile tab', async () => {
    mockApi(routes());
    renderWithProviders(<ProfileScreen />, { port: port() });
    expect(await screen.findByTestId('profile-trades')).toBeOnTheScreen();
    expect(screen.queryByTestId('profile-premium')).toBeNull();
    expect(screen.queryByTestId('profile-credits')).toBeNull();
    expect(screen.queryByTestId('profile-support')).toBeNull();
    expect(screen.queryByText(MONEY_WORDS)).toBeNull();
  });

  it('lists no Payouts section in Settings', async () => {
    const api = mockApi(routes());
    renderWithProviders(<SettingsScreen />, { port: port() });
    expect(await screen.findByTestId('settings-sign-out')).toBeOnTheScreen();
    expect(api.callsTo('GET /api/v1/public/feature-flags').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('settings-link-payouts')).toBeNull();
    expect(screen.queryByText(/payout/i)).toBeNull();
  });

  it('explains a reached plan limit without naming Premium', async () => {
    const limit = new ApiError({
      status: 429,
      errorCode: 'LIMIT_REACHED',
      message: 'Limit',
      problem: { limitKey: 'binders.max', limit: 5, used: 5, planCode: 'FREE' },
    });
    const api = mockApi(routes());
    renderWithProviders(<LimitReachedNotice error={limit} />, { port: port() });
    expect(await screen.findByTestId('limit-reached-message')).toHaveTextContent(
      'You have used 5 of 5 binders on the Free plan. Delete a binder you no longer need.'
    );
    // The flags answered: the Premium action stays hidden (never a flash of it before).
    expect(api.callsTo('GET /api/v1/public/feature-flags').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('limit-reached-premium')).toBeNull();
    expect(screen.queryByText(/Premium/)).toBeNull();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('shows no sponsored placement on another collector profile', async () => {
    mockParams.current = { id: 'collector2' };
    const api = mockApi(routes());
    renderWithProviders(<CollectorScreen />, { port: port() });
    expect(await screen.findByTestId('collector-name')).toBeOnTheScreen();
    expect(screen.queryByText(/Sponsored/)).toBeNull();
    expect(api.callsTo('GET /api/v1/ads')).toHaveLength(0);
    // Report and Block remain (trust and safety is not a money feature).
    expect(screen.getByTestId('collector-report')).toBeOnTheScreen();
    expect(screen.getByTestId('collector-block')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('collector-block'));
    expect(screen.getByTestId('block-dialog')).toBeOnTheScreen();
  });
});
