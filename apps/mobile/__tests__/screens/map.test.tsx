import { fireEvent, screen } from '@testing-library/react-native';

import MapScreen from '@/app/(tabs)/index';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import { meFixture } from '../support/fixtures';
import { mockApi, ok } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());

beforeEach(() => {
  resetRouterMock();
  resetAppState();
});

const render = () => renderWithProviders(<MapScreen />, { port: new FakeAuthPort(testUser()) });

describe('Map tab (ADR 0017: a placeholder until the region map reaches the app)', () => {
  it('names the home region and leads to region-scoped search', async () => {
    const api = mockApi(
      signedInRoutes({ 'GET /api/v1/me': ok(meFixture({ homeRegion: 'europe' })) })
    );
    render();
    expect(await screen.findByText('Europe')).toBeOnTheScreen();
    expect(screen.getByTestId('map-placeholder')).toHaveTextContent(
      /The region map is coming to the app/
    );
    expect(screen.getByTestId('map-placeholder')).toHaveTextContent(/map of Europe/);
    fireEvent.press(screen.getByRole('button', { name: 'Search your region' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/search');
    // No collector position is asked for, and there is no map to draw one on.
    expect(api.calls.some((call) => /collectors\/nearby|preview/.test(call.path))).toBe(false);
    expect(screen.queryByTestId('collector-map-view')).toBeNull();
    expect(screen.queryByTestId('map-choose-location')).toBeNull();
  });

  it('defaults to Americas (North) and invites a collector without a location to choose one', async () => {
    mockApi(
      signedInRoutes({
        'GET /api/v1/me': ok(
          meFixture({
            homeRegion: undefined,
            onboarding: { profileComplete: true, locationSet: false, interestsSet: true },
          })
        ),
      })
    );
    render();
    fireEvent.press(await screen.findByTestId('map-choose-location'));
    expect(mockRouter.push).toHaveBeenCalledWith('/settings/location');
    expect(screen.getByText('Americas (North)')).toBeOnTheScreen();
    expect(screen.getByTestId('map-privacy-note')).toHaveTextContent(
      /never uses your GPS: collectors choose their state or province/
    );
  });
});
