import { waitFor } from '@testing-library/react-native';

import {
  PushOpener,
  type PushPayload,
  type PushResponses,
} from '@/src/features/notifications/pushOpener';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import { CARD_ID } from '../support/fixtures';
import { mockApi, noContent } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());

/** Stage R9: a tapped push notification opens the same target as its row, once. */

beforeEach(() => {
  resetRouterMock();
  resetAppState();
});

function fakeSource(opened: PushPayload | null) {
  let listener: ((payload: PushPayload) => void) | null = null;
  const source: PushResponses = {
    last: async () => opened,
    subscribe: (next) => {
      listener = next;
      return () => {
        listener = null;
      };
    },
  };
  return { source, tap: (payload: PushPayload) => listener?.(payload) };
}

const ID_1 = '00000000-0000-4000-9b00-0000000000a1';
const ID_2 = '00000000-0000-4000-9b00-0000000000a2';

describe('push notifications', () => {
  it('follow the tap that opened the app and the next ones to their row target, marking them read', async () => {
    const api = mockApi(signedInRoutes({ 'POST /api/v1/notifications/{id}/read': noContent }));
    const push = fakeSource({
      notificationId: ID_1,
      type: 'WISHLIST_ALERT',
      deepLink: `/cards/${CARD_ID}?printing=p1`,
    });
    renderWithProviders(<PushOpener source={push.source} />, {
      port: new FakeAuthPort(testUser()),
    });
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith(`/cards/${CARD_ID}?printing=p1`)
    );
    await waitFor(() =>
      expect(api.callsTo('POST /api/v1/notifications/{id}/read')[0]?.path).toBe(
        `/api/v1/notifications/${ID_1}/read`
      )
    );
    push.tap({
      notificationId: ID_2,
      type: 'RATING_RECEIVED',
      deepLink: '/collectors/x?tab=ratings',
    });
    expect(mockRouter.push).toHaveBeenLastCalledWith('/collectors/maika?tab=ratings');
    // The same tap delivered again is followed once.
    push.tap({
      notificationId: ID_2,
      type: 'RATING_RECEIVED',
      deepLink: '/collectors/x?tab=ratings',
    });
    push.tap({
      notificationId: 'n3',
      type: 'BINDER_STALE_WARNING',
      deepLink: '/inventory?binder=b1',
    });
    expect(mockRouter.push).toHaveBeenCalledTimes(3);
    expect(mockRouter.push).toHaveBeenLastCalledWith('/notifications');
  });

  it('wait for a signed-in collector', async () => {
    mockApi({});
    const push = fakeSource({
      notificationId: ID_1,
      type: 'SALE_RECORDED',
      deepLink: '/messages/c1',
    });
    renderWithProviders(<PushOpener source={push.source} />, { port: new FakeAuthPort(null) });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockRouter.push).not.toHaveBeenCalled();
  });
});
