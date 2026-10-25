import { act, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { useFlowLock } from '@/src/account/flowLock';
import { useCanBrowse, useIsAuthenticated } from '@/src/api/hooks/useUid';
import { HomeScreen } from '@/src/features/home/HomeScreen';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import { feedPageFixture } from '../support/fixtures';
import { mockApi, ok } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());

/**
 * While sign-up creates the account (it holds the `sign-up` flow lock from the Firebase user's
 * creation to the consents), no read goes out: the first call with the new token provisions the
 * account, and the display name the collector chose is only in the token once sign-up refreshed it
 * (stage R15; Home stays mounted under Sign up for a guest). Review fix 1, finding F7: the hold had
 * no unit test.
 */

function Probe() {
  const authenticated = useIsAuthenticated();
  const browse = useCanBrowse();
  return <Text testID="probe">{`authenticated=${authenticated} browse=${browse}`}</Text>;
}

beforeEach(() => {
  resetRouterMock();
  resetAppState();
});

describe('the sign-up hold (stage R15)', () => {
  it('keeps Home’s reads back while sign-up holds the lock, and lets them go after', async () => {
    useFlowLock.getState().lock('sign-up');
    const api = mockApi(signedInRoutes({ 'GET /api/v1/feed': ok(feedPageFixture([])) }));
    renderWithProviders(
      <>
        <Probe />
        <HomeScreen />
      </>,
      { port: new FakeAuthPort(testUser()) }
    );
    expect(await screen.findByTestId('probe')).toHaveTextContent(
      'authenticated=false browse=false'
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(api.callsTo('GET /api/v1/feed')).toHaveLength(0);

    act(() => useFlowLock.getState().unlock());
    await waitFor(() =>
      expect(screen.getByTestId('probe')).toHaveTextContent('authenticated=true browse=true')
    );
    await waitFor(() => expect(api.callsTo('GET /api/v1/feed').length).toBeGreaterThan(0));
  });

  it('holds only for sign-up: another flow lock leaves a signed-in collector reading', async () => {
    useFlowLock.getState().lock('google-sign-in');
    mockApi(signedInRoutes({ 'GET /api/v1/feed': ok(feedPageFixture([])) }));
    renderWithProviders(<Probe />, { port: new FakeAuthPort(testUser()) });
    await waitFor(() =>
      expect(screen.getByTestId('probe')).toHaveTextContent('authenticated=true browse=true')
    );
  });
});
