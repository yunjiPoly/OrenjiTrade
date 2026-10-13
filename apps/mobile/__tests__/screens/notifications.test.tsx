import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import NotificationsScreen from '@/app/notifications';
import { NotificationBell } from '@/src/features/notifications/NotificationBell';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import { CARD_ID, notificationFixture, notificationPage } from '../support/fixtures';
import { mockApi, noContent, ok, problem, type MockRoutes } from '../support/mockApi';
import { fakeRealtime } from '../support/realtime';
import { signedInRoutes } from '../support/routes';
import { mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());

beforeEach(() => {
  resetRouterMock();
  resetAppState();
});

const match = notificationFixture();
const message = notificationFixture({
  id: 'n-message',
  type: 'MESSAGE',
  title: 'New message from Noé',
  body: 'Noé sent you a message.',
  data: { conversationId: 'conv-1', deepLink: '/messages/conv-1' },
  readAt: new Date().toISOString(),
});
const offer = notificationFixture({
  id: 'n-offer',
  type: 'OFFER_RECEIVED',
  title: 'New offer on Lantern Fox',
  body: 'Noé offered 40.00 CAD.',
  data: { offerId: 'o1', deepLink: '/offers/o1' },
  createdAt: '2026-01-01T12:00:00Z',
});

function routes(extra: MockRoutes = {}): MockRoutes {
  return signedInRoutes({
    'GET /api/v1/notifications': (request) =>
      ok(
        notificationPage(
          request.query.get('unreadOnly') === 'true' ? [match, offer] : [match, message, offer]
        )
      ),
    'GET /api/v1/notifications/unread-count': ok({ count: 2 }),
    'POST /api/v1/notifications/{id}/read': noContent,
    'POST /api/v1/notifications/read-all': ok({ updated: 2 }),
    ...extra,
  });
}

const port = () => new FakeAuthPort(testUser());

describe('Notification centre', () => {
  it('groups notifications by day with their kind, and filters unread ones', async () => {
    const api = mockApi(routes());
    renderWithProviders(<NotificationsScreen />, { port: port() });
    expect(screen.getByTestId('notifications-loading')).toBeOnTheScreen();
    expect(await screen.findByText(match.title)).toBeOnTheScreen();
    expect(screen.getByText('Today')).toBeOnTheScreen();
    expect(screen.getByText('Older')).toBeOnTheScreen();
    expect(screen.getByText('Wishlist alert')).toBeOnTheScreen();
    expect(screen.getAllByTestId('notification-unread-dot')).toHaveLength(2);
    expect(await screen.findByText('Unread (2)')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('notifications-view-unread'));
    await waitFor(() => expect(screen.queryByText(message.title)).not.toBeOnTheScreen());
    expect(api.callsTo('GET /api/v1/notifications').at(-1)?.query.get('unreadOnly')).toBe('true');
  });

  it('opens a notification on its screen and marks it read', async () => {
    const api = mockApi(routes());
    renderWithProviders(<NotificationsScreen />, { port: port() });
    fireEvent.press(await screen.findByTestId(`notification-${match.id}`));
    // A wishlist alert opens the card page.
    expect(mockRouter.push).toHaveBeenCalledWith(`/cards/${CARD_ID}`);
    await waitFor(() =>
      expect(api.callsTo('POST /api/v1/notifications/{id}/read')).toHaveLength(1)
    );
    expect(await screen.findByText('Unread (1)')).toBeOnTheScreen();
    // A read notification opens without a second mark.
    fireEvent.press(screen.getByTestId(`notification-${message.id}`));
    expect(mockRouter.push).toHaveBeenCalledWith('/messages/conv-1');
    expect(api.callsTo('POST /api/v1/notifications/{id}/read')).toHaveLength(1);
  });

  it('opens offers, trades, reports, ratings and disputes, and marks one read in place', async () => {
    const trade = notificationFixture({
      id: 'n-trade',
      type: 'TRADE_UPDATE',
      title: 'Trade updated',
      body: 'Noé confirmed the exchange.',
      data: { tradeId: 't1', deepLink: '/trades/t1' },
      readAt: new Date().toISOString(),
    });
    const decision = notificationFixture({
      id: 'n-report',
      type: 'REPORT_DECISION',
      title: 'Your report was reviewed',
      body: 'The moderation team reviewed your report.',
      data: { deepLink: '/settings/reports' },
      readAt: new Date().toISOString(),
    });
    const rating = notificationFixture({
      id: 'n-rating',
      type: 'RATING_RECEIVED',
      title: 'New rating from Noé',
      body: 'Noé rated you 5/5.',
      data: { ratingId: 'r1', deepLink: '/collectors/maika?tab=ratings' },
      readAt: new Date().toISOString(),
    });
    const dispute = notificationFixture({
      id: 'n-dispute',
      type: 'DISPUTE_UPDATE',
      title: 'Dispute opened',
      body: 'A dispute was opened.',
      data: { disputeId: 'd1', tradeId: 't1' },
      readAt: new Date().toISOString(),
    });
    const api = mockApi(
      routes({
        'GET /api/v1/notifications': ok(
          notificationPage([match, offer, trade, decision, rating, dispute])
        ),
      })
    );
    renderWithProviders(<NotificationsScreen />, { port: port() });
    fireEvent.press(await screen.findByTestId(`notification-${offer.id}`));
    expect(mockRouter.push).toHaveBeenCalledWith('/offers/o1');
    await waitFor(() =>
      expect(api.callsTo('POST /api/v1/notifications/{id}/read')[0]?.path).toBe(
        `/api/v1/notifications/${offer.id}/read`
      )
    );
    fireEvent.press(screen.getByTestId(`notification-${trade.id}`));
    expect(mockRouter.push).toHaveBeenCalledWith('/trades/t1');
    fireEvent.press(screen.getByTestId(`notification-${decision.id}`));
    expect(mockRouter.push).toHaveBeenCalledWith('/settings/reports');
    fireEvent.press(screen.getByTestId(`notification-${rating.id}`));
    expect(mockRouter.push).toHaveBeenCalledWith('/collectors/maika?tab=ratings');
    fireEvent.press(screen.getByTestId(`notification-${dispute.id}`));
    expect(mockRouter.push).toHaveBeenCalledWith('/disputes/d1');
    fireEvent.press(screen.getByTestId(`notification-read-${match.id}`));
    await waitFor(() => expect(screen.queryAllByTestId('notification-unread-dot')).toHaveLength(0));
  });

  it('marks all as read and opens the preferences', async () => {
    const api = mockApi(routes());
    renderWithProviders(<NotificationsScreen />, { port: port() });
    await screen.findByText(match.title);
    await screen.findByText('Unread (2)');
    fireEvent.press(screen.getByTestId('notifications-mark-all'));
    expect(await screen.findByTestId('snackbar')).toHaveTextContent(
      '2 notifications marked as read.'
    );
    expect(api.callsTo('POST /api/v1/notifications/read-all')).toHaveLength(1);
    expect(screen.queryAllByTestId('notification-unread-dot')).toHaveLength(0);
    expect(screen.getByTestId('notifications-mark-all')).toBeDisabled();
    fireEvent.press(screen.getByTestId('notifications-preferences'));
    expect(mockRouter.push).toHaveBeenCalledWith('/settings/notifications');
  });

  it('shows empty, caught-up and error-with-retry states', async () => {
    mockApi(
      routes({
        'GET /api/v1/notifications': [
          problem(500, 'INTERNAL_ERROR', 'Boom'),
          ok(notificationPage([])),
        ],
        'GET /api/v1/notifications/unread-count': ok({ count: 0 }),
      })
    );
    renderWithProviders(<NotificationsScreen />, { port: port() });
    expect(await screen.findByTestId('notifications-error')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('notifications-empty')).toHaveTextContent(
      /No notifications yet/
    );
    fireEvent.press(screen.getByTestId('notifications-view-unread'));
    expect(await screen.findByTestId('notifications-caught-up')).toHaveTextContent(
      /You're all caught up/
    );
  });

  it('receives pushed notifications live (counted once) at the top of the list', async () => {
    const rt = fakeRealtime();
    mockApi(routes());
    renderWithProviders(<NotificationsScreen />, { port: port(), realtime: rt.client });
    await screen.findByText(match.title);
    await screen.findByText('Unread (2)');
    await waitFor(() => expect(rt.client.state).toBe('connected'));
    const pushed = notificationFixture({
      id: 'n-new',
      title: 'Wishlist match: Lantern Fox',
      createdAt: new Date().toISOString(),
    });
    act(() => rt.current().push('/user/queue/notifications', pushed));
    act(() => rt.current().push('/user/queue/notifications', pushed));
    expect(await screen.findByText('Wishlist match: Lantern Fox')).toBeOnTheScreen();
    expect(screen.getByText('Unread (3)')).toBeOnTheScreen();
  });
});

describe('Notification bell', () => {
  it('shows the live unread badge and opens the centre', async () => {
    mockApi(routes({ 'GET /api/v1/notifications/unread-count': ok({ count: 120 }) }));
    renderWithProviders(<NotificationBell />, { port: port() });
    expect(await screen.findByTestId('notification-bell-badge')).toHaveTextContent('99+');
    expect(screen.getByTestId('notification-bell').props.accessibilityLabel).toBe(
      'Notifications, 120 unread'
    );
    fireEvent.press(screen.getByTestId('notification-bell'));
    expect(mockRouter.push).toHaveBeenCalledWith('/notifications');
  });

  it('is hidden while signed out', async () => {
    mockApi({});
    renderWithProviders(<NotificationBell />, { port: new FakeAuthPort(null) });
    await waitFor(() => expect(screen.queryByTestId('notification-bell')).not.toBeOnTheScreen());
  });
});
