import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

import NotificationsScreen from '@/app/notifications';
import { NotificationBell } from '@/src/features/notifications/NotificationBell';
import { notificationTime } from '@/src/features/notifications/notificationRows';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import {
  BINDER_ID,
  binderFixture,
  CARD_ID,
  notificationFixture,
  notificationPage,
} from '../support/fixtures';
import { mockApi, noContent, ok, problem, type MockRoutes } from '../support/mockApi';
import { fakeRealtime } from '../support/realtime';
import { signedInRoutes } from '../support/routes';
import { mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());

/**
 * Notifications and the bell (stage R9; mockup v50 screen 31): New and Earlier without chats,
 * "Mark all as read", each kind's target, the reminders answered in place, paging, the empty and
 * error states, live pushes, the bell's dot and name.
 */

const WINDOW = Dimensions.get('window');

beforeEach(() => {
  // The default text size (the Jest window says 2, the largest sizes: see the last test).
  Dimensions.set({ window: { ...WINDOW, fontScale: 1 }, screen: { ...WINDOW, fontScale: 1 } });
  resetRouterMock();
  resetAppState();
});

afterAll(() => {
  Dimensions.set({ window: WINDOW, screen: WINDOW });
});

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const wish = notificationFixture({
  id: 'n-wish',
  createdAt: minutesAgo(5),
  data: {
    cardId: CARD_ID,
    printingId: 'p1',
    cardName: 'Maxx "C"',
    province: 'Quebec',
    collectorHandle: 'maya_k',
    askingPriceText: '$14.00',
    cardImageUrl: '/api/v1/public/card-images/c1',
    game: 'yugioh',
    deepLink: `/cards/${CARD_ID}?printing=p1`,
  },
});
const sale = notificationFixture({
  id: 'n-sale',
  type: 'SALE_RECORDED',
  title: 'duelist.jp marked Ash Blossom as sold to you',
  body: 'Open the chat to see the details and rate each other.',
  createdAt: minutesAgo(60),
  data: {
    conversationId: 'conv-1',
    sellerHandle: 'duelist.jp',
    itemName: 'Ash Blossom',
    hasTracking: true,
    deepLink: '/messages/conv-1',
  },
});
const rating = notificationFixture({
  id: 'n-rating',
  type: 'RATING_RECEIVED',
  title: 'New rating from sakura.tcg',
  body: 'sakura.tcg rated you 5/5.',
  createdAt: minutesAgo(26 * 60),
  readAt: minutesAgo(60),
  data: { raterHandle: 'sakura.tcg', overall: 5, deepLink: '/collectors/old?tab=ratings' },
});
const reminder = notificationFixture({
  id: 'n-remind',
  type: 'BINDER_STALE_WARNING',
  title: 'Confirm your listings are still available',
  body: 'Your binder will be hidden.',
  createdAt: minutesAgo(3 * 24 * 60),
  readAt: minutesAgo(60),
  data: { binderId: BINDER_ID, binderName: 'For trade', itemCount: 9 },
});
const report = notificationFixture({
  id: 'n-report',
  type: 'REPORT_DECISION',
  title: 'Your report was reviewed',
  body: 'Thanks for your report.',
  createdAt: minutesAgo(30 * 24 * 60),
  readAt: minutesAgo(60),
  data: { status: 'ACTIONED', deepLink: '/settings/reports' },
});

function routes(extra: MockRoutes = {}): MockRoutes {
  return signedInRoutes({
    'GET /api/v1/notifications': (request) =>
      ok(
        notificationPage(
          request.query.get('unreadOnly') === 'true'
            ? [wish, sale]
            : [wish, sale, rating, reminder, report]
        )
      ),
    'GET /api/v1/notifications/unread-count': ok({ count: 2 }),
    'POST /api/v1/notifications/{id}/read': noContent,
    'POST /api/v1/notifications/read-all': ok({ updated: 2 }),
    'GET /api/v1/binders': ok([binderFixture()]),
    ...extra,
  });
}

const port = () => new FakeAuthPort(testUser());

describe('Notifications', () => {
  it('lists New and Earlier without chats, each row with its sentence, line and time', async () => {
    const api = mockApi(routes());
    renderWithProviders(<NotificationsScreen />, { port: port() });
    expect(screen.getByTestId('notifications-loading')).toBeOnTheScreen();
    const list = await screen.findByTestId('notifications-list');
    expect(within(list).getByText('New')).toBeOnTheScreen();
    expect(within(list).getByText('Earlier')).toBeOnTheScreen();
    expect(screen.getByTestId('notifications-mark-all')).toBeOnTheScreen();
    expect(screen.getByText('maya_k · $14.00')).toBeOnTheScreen();
    expect(screen.getByText('5 min')).toBeOnTheScreen();
    expect(screen.getByText('Tracking added. Rate them when it arrives.')).toBeOnTheScreen();
    // The labels' rules are in notificationRows.test.ts; here they show on their rows.
    for (const notification of [sale, rating, report]) {
      expect(screen.getByText(notificationTime(notification.createdAt).short)).toBeOnTheScreen();
    }
    expect(screen.getAllByTestId('notification-unread-dot')).toHaveLength(2);
    expect(screen.getByTestId(`notification-${wish.id}`).props.accessibilityLabel).toBe(
      'Maxx "C" from your wishlist was listed in Quebec. maya_k · $14.00, 5 minutes ago, unread'
    );
    expect(screen.getByTestId(`notification-card-${wish.id}`)).toBeOnTheScreen();
    // The unread ones are listed once, under New; every read of the list leaves chats out.
    expect(screen.getAllByTestId(`notification-${wish.id}`)).toHaveLength(1);
    for (const call of api.callsTo('GET /api/v1/notifications')) {
      expect(call.query.getAll('excludeTypes')).toEqual(['MESSAGE']);
    }
    const reads = api.callsTo('GET /api/v1/notifications');
    expect(reads.find((call) => call.query.get('unreadOnly') === 'true')?.query.get('limit')).toBe(
      '50'
    );
    expect(reads.find((call) => call.query.get('unreadOnly') === 'false')?.query.get('limit')).toBe(
      '20'
    );
  });

  it('marks a row read and opens its target: Who has this card, the chat, your ratings', async () => {
    const api = mockApi(routes());
    renderWithProviders(<NotificationsScreen />, { port: port() });
    fireEvent.press(await screen.findByTestId(`notification-${wish.id}`));
    expect(mockRouter.push).toHaveBeenCalledWith(`/cards/${CARD_ID}?printing=p1`);
    await waitFor(() =>
      expect(api.callsTo('POST /api/v1/notifications/{id}/read')[0]?.path).toBe(
        `/api/v1/notifications/${wish.id}/read`
      )
    );
    // Read since, it keeps its place in New without its dot.
    await waitFor(() => expect(screen.getAllByTestId('notification-unread-dot')).toHaveLength(1));
    // The chat's Back then says "Back to Notifications" (review fix 1, U1).
    fireEvent.press(screen.getByTestId(`notification-${sale.id}`));
    expect(mockRouter.push).toHaveBeenCalledWith('/messages/conv-1?from=notifications');
    fireEvent.press(screen.getByTestId(`notification-${rating.id}`));
    expect(mockRouter.push).toHaveBeenCalledWith('/collectors/maika?tab=ratings');
    // A report decision opens nothing (and it is read already: no second request).
    mockRouter.push.mockClear();
    fireEvent.press(screen.getByTestId(`notification-${report.id}`));
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(screen.getByText('We took action.')).toBeOnTheScreen();
  });

  it('marks an unread notice without a target read in place', async () => {
    const notice = notificationFixture({
      id: 'n-offer',
      type: 'OFFER_RECEIVED',
      title: 'New offer on Lantern Fox',
      body: 'Noé offered 40.00 CAD.',
      data: { offerId: 'o1', deepLink: '/offers/o1' },
    });
    const api = mockApi(
      routes({
        'GET /api/v1/notifications': ok(notificationPage([notice])),
        'GET /api/v1/notifications/unread-count': ok({ count: 1 }),
      })
    );
    renderWithProviders(<NotificationsScreen />, { port: port() });
    const row = await screen.findByTestId(`notification-${notice.id}`);
    expect(row.props.accessibilityRole).toBe('button');
    expect(row.props.accessibilityHint).toBe('Marks it as read');
    fireEvent.press(row);
    await waitFor(() =>
      expect(api.callsTo('POST /api/v1/notifications/{id}/read')).toHaveLength(1)
    );
    expect(mockRouter.push).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryAllByTestId('notification-unread-dot')).toHaveLength(0));
  });

  it('shows the whole text of a row that opens nothing, before and after it is read', async () => {
    // An admin broadcast may run to 1000 characters; a paused-listings notice is three sentences.
    const broadcast = notificationFixture({
      id: 'n-broadcast',
      type: 'SYSTEM',
      title: 'Maintenance this Sunday',
      body:
        'Scheduled maintenance on Sunday from 2 to 4 a.m. Eastern: the app may be slow or ' +
        'unavailable for a few minutes, and messages sent then arrive once it is back.',
      createdAt: minutesAgo(2),
      data: {},
    });
    const paused = notificationFixture({
      id: 'n-paused',
      type: 'SYSTEM',
      title: 'Your public listings are paused',
      body:
        '3 conversations are waiting for your answer, so your public listings are paused. ' +
        'Reply to collectors and confirm in your inventory that you are available to show ' +
        'your listings again.',
      createdAt: minutesAgo(90),
      readAt: minutesAgo(60),
      data: { kind: 'LISTINGS_PAUSED', deepLink: '/inventory' },
    });
    const api = mockApi(
      routes({
        'GET /api/v1/notifications': (request) =>
          ok(
            notificationPage(
              request.query.get('unreadOnly') === 'true' ? [broadcast] : [broadcast, wish, paused]
            )
          ),
      })
    );
    renderWithProviders(<NotificationsScreen />, { port: port() });
    // The default text size (beforeEach): a row with a target keeps the mockup's one line.
    expect((await screen.findByText('maya_k · $14.00')).props.numberOfLines).toBe(1);
    for (const notice of [broadcast, paused]) {
      expect(screen.getByText(notice.body).props.numberOfLines).toBeUndefined();
    }
    fireEvent.press(screen.getByTestId(`notification-${broadcast.id}`));
    await waitFor(() =>
      expect(api.callsTo('POST /api/v1/notifications/{id}/read')).toHaveLength(1)
    );
    expect(mockRouter.push).not.toHaveBeenCalled();
    // Read, it opens nothing and its text is still whole.
    await waitFor(() =>
      expect(screen.getByTestId(`notification-${broadcast.id}`).props.accessibilityRole).not.toBe(
        'button'
      )
    );
    expect(screen.getByText(broadcast.body).props.numberOfLines).toBeUndefined();
  });

  it('marks all as read: New empties into Earlier, without dots', async () => {
    const api = mockApi(routes());
    renderWithProviders(<NotificationsScreen />, { port: port() });
    fireEvent.press(await screen.findByTestId('notifications-mark-all'));
    await waitFor(() => expect(api.callsTo('POST /api/v1/notifications/read-all')).toHaveLength(1));
    await waitFor(() => expect(screen.queryByText('New')).not.toBeOnTheScreen());
    expect(screen.getByText('Earlier')).toBeOnTheScreen();
    expect(screen.queryAllByTestId('notification-unread-dot')).toHaveLength(0);
    expect(screen.queryByTestId('notifications-mark-all')).not.toBeOnTheScreen();
    expect(screen.getByTestId(`notification-${wish.id}`)).toBeOnTheScreen();
  });

  it('answers a reminder in place: "Still have them" confirms the binder, then a teal check', async () => {
    let binder = binderFixture();
    const confirmed = binderFixture({
      freshness: {
        state: 'ACTIVE',
        confirmedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        label: 'Updated just now',
      },
    });
    const api = mockApi(
      routes({
        'GET /api/v1/binders': () => ok([binder]),
        'POST /api/v1/binders/{id}/confirm': () => {
          binder = confirmed;
          return ok(confirmed);
        },
      })
    );
    renderWithProviders(<NotificationsScreen />, { port: port() });
    expect(await screen.findByText('Confirm them, or they leave search soon.')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId(`notification-review-${reminder.id}`));
    expect(mockRouter.push).toHaveBeenCalledWith(`/binders/${BINDER_ID}?from=notifications`);
    fireEvent.press(screen.getByTestId(`notification-still-have-${reminder.id}`));
    expect(await screen.findByText('Confirmed. They stay in search.')).toBeOnTheScreen();
    expect(api.callsTo('POST /api/v1/binders/{id}/confirm')[0]?.path).toBe(
      `/api/v1/binders/${BINDER_ID}/confirm`
    );
    expect(screen.queryByTestId(`notification-still-have-${reminder.id}`)).not.toBeOnTheScreen();
  });

  it('shows a reminder confirmed since as confirmed, and "Review the binder" only once hidden', async () => {
    const hidden = notificationFixture({
      id: 'n-hidden',
      type: 'BINDER_HIDDEN',
      createdAt: minutesAgo(10),
      readAt: minutesAgo(5),
      data: { binderId: 'b2', binderName: 'Spares', itemCount: 0 },
    });
    mockApi(
      routes({
        'GET /api/v1/notifications': ok(notificationPage([hidden, reminder])),
        'GET /api/v1/binders': ok([
          binderFixture({ id: 'b2', name: 'Spares' }),
          binderFixture({
            freshness: {
              state: 'ACTIVE',
              confirmedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              label: '',
            },
          }),
        ]),
      })
    );
    renderWithProviders(<NotificationsScreen />, { port: port() });
    expect(await screen.findByTestId(`notification-confirmed-${reminder.id}`)).toBeOnTheScreen();
    expect(screen.getByTestId(`notification-review-${hidden.id}`)).toBeOnTheScreen();
    expect(screen.queryByTestId(`notification-still-have-${hidden.id}`)).not.toBeOnTheScreen();
    expect(screen.getByText('Spares:')).toBeOnTheScreen();
  });

  it('says why a confirm failed and keeps the buttons', async () => {
    mockApi(
      routes({
        'POST /api/v1/binders/{id}/confirm': problem(500, 'INTERNAL_ERROR', 'Boom'),
      })
    );
    renderWithProviders(<NotificationsScreen />, { port: port() });
    fireEvent.press(await screen.findByTestId(`notification-still-have-${reminder.id}`));
    expect(await screen.findByTestId('snackbar')).toBeOnTheScreen();
    expect(screen.getByTestId(`notification-still-have-${reminder.id}`)).toBeOnTheScreen();
  });

  it('pages Earlier by cursor', async () => {
    const older = notificationFixture({
      id: 'n-older',
      type: 'SYSTEM',
      title: 'Welcome to OrenjiTrade',
      body: 'Add your cards.',
      readAt: minutesAgo(60),
      createdAt: minutesAgo(40 * 24 * 60),
      data: {},
    });
    const api = mockApi(
      routes({
        'GET /api/v1/notifications': (request) => {
          if (request.query.get('unreadOnly') === 'true') {
            return ok(notificationPage([wish]));
          }
          return request.query.get('cursor') === 'c2'
            ? ok(notificationPage([older]))
            : ok(notificationPage([wish, rating], { hasMore: true, nextCursor: 'c2' }));
        },
      })
    );
    renderWithProviders(<NotificationsScreen />, { port: port() });
    expect(await screen.findByText('Welcome to OrenjiTrade')).toBeOnTheScreen();
    expect(
      api.callsTo('GET /api/v1/notifications').some((call) => call.query.get('cursor') === 'c2')
    ).toBe(true);
  });

  it('lists every unread notification under New, over several pages, before Earlier', async () => {
    const second = notificationFixture({
      id: 'n-wish-2',
      createdAt: minutesAgo(30),
      data: { cardName: 'Nibiru', province: 'Ontario', collectorHandle: 'lucas.tcg' },
    });
    const api = mockApi(
      routes({
        'GET /api/v1/notifications': (request) => {
          if (request.query.get('unreadOnly') === 'false') {
            return ok(notificationPage([wish, second, rating]));
          }
          // More unread than one page of New holds (review fix 1, F4).
          return request.query.get('cursor') === 'u2'
            ? ok(notificationPage([second]))
            : ok(notificationPage([wish], { hasMore: true, nextCursor: 'u2' }));
        },
        'GET /api/v1/notifications/unread-count': ok({ count: 2 }),
      })
    );
    renderWithProviders(<NotificationsScreen />, { port: port() });
    const list = await screen.findByTestId('notifications-list');
    const keys = () =>
      (screen.getByTestId('notifications-list').props.data as { key: string }[]).map(
        (row) => row.key
      );
    // The unread one of New's next page is never listed under Earlier: Earlier waits.
    expect(keys()).toEqual(['heading-fresh', wish.id]);
    expect(screen.queryByText('Earlier')).not.toBeOnTheScreen();
    fireEvent(list, 'onEndReached');
    await waitFor(() =>
      expect(keys()).toEqual(['heading-fresh', wish.id, second.id, 'heading-earlier', rating.id])
    );
    expect(screen.getAllByTestId('notification-unread-dot')).toHaveLength(2);
    expect(
      api
        .callsTo('GET /api/v1/notifications')
        .filter((call) => call.query.get('cursor') === 'u2')
        .map((call) => call.query.get('limit'))
    ).toEqual(['50']);
  });

  it('marks all as read while New has pages left: Earlier lists them all, without dots', async () => {
    mockApi(
      routes({
        'GET /api/v1/notifications': (request) =>
          request.query.get('unreadOnly') === 'true'
            ? ok(notificationPage([wish], { hasMore: true, nextCursor: 'u2' }))
            : ok(notificationPage([wish, sale, rating])),
      })
    );
    renderWithProviders(<NotificationsScreen />, { port: port() });
    fireEvent.press(await screen.findByTestId('notifications-mark-all'));
    await waitFor(() => expect(screen.getByText('Earlier')).toBeOnTheScreen());
    expect(screen.queryByText('New')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('notifications-empty')).not.toBeOnTheScreen();
    for (const notification of [wish, sale, rating]) {
      expect(screen.getByTestId(`notification-${notification.id}`)).toBeOnTheScreen();
    }
    expect(screen.queryAllByTestId('notification-unread-dot')).toHaveLength(0);
  });

  it('shows the empty state, and an error with "Try again"', async () => {
    mockApi(
      routes({
        'GET /api/v1/notifications': [
          problem(500, 'INTERNAL_ERROR', 'Boom'),
          problem(500, 'INTERNAL_ERROR', 'Boom'),
          ok(notificationPage([])),
          ok(notificationPage([])),
        ],
        'GET /api/v1/notifications/unread-count': ok({ count: 0 }),
      })
    );
    renderWithProviders(<NotificationsScreen />, { port: port() });
    expect(await screen.findByTestId('notifications-error')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    const empty = await screen.findByTestId('notifications-empty');
    expect(empty).toHaveTextContent(/No notifications yet/);
    expect(empty).toHaveTextContent(
      /We'll tell you when a card you want is listed in your region\./
    );
  });

  it('opens Settings › Notifications from the gear, and goes back', async () => {
    mockApi(routes());
    renderWithProviders(<NotificationsScreen />, { port: port() });
    fireEvent.press(await screen.findByTestId('notifications-settings'));
    expect(mockRouter.push).toHaveBeenCalledWith('/settings/notifications');
    expect(screen.getByLabelText('Notification settings')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('BackButton'));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it('adds a pushed notification under New once, and ignores a chat', async () => {
    const rt = fakeRealtime();
    mockApi(routes());
    renderWithProviders(<NotificationsScreen />, { port: port(), realtime: rt.client });
    await screen.findByTestId('notifications-list');
    await waitFor(() => expect(rt.client.state).toBe('connected'));
    const pushed = notificationFixture({
      id: 'n-new',
      createdAt: new Date().toISOString(),
      data: { cardName: 'Nibiru', province: 'Ontario', collectorHandle: 'lucas.tcg' },
    });
    const chat = notificationFixture({
      id: 'n-chat',
      type: 'MESSAGE',
      title: 'New message from Noé',
      data: { conversationId: 'conv-2' },
    });
    act(() => rt.current().push('/user/queue/notifications', pushed));
    act(() => rt.current().push('/user/queue/notifications', pushed));
    act(() => rt.current().push('/user/queue/notifications', chat));
    expect(await screen.findByText('lucas.tcg')).toBeOnTheScreen();
    expect(screen.getAllByTestId('notification-n-new')).toHaveLength(1);
    expect(screen.queryByText('New message from Noé')).not.toBeOnTheScreen();
    expect(screen.getAllByTestId('notification-unread-dot')).toHaveLength(3);
  });
});

describe('At the largest text sizes', () => {
  it('leaves the card picture out, lets the line wrap and keeps "Mark all as read" small', async () => {
    Dimensions.set({ window: { ...WINDOW, fontScale: 2 }, screen: { ...WINDOW, fontScale: 2 } });
    mockApi(routes());
    renderWithProviders(<NotificationsScreen />, { port: port() });
    expect(await screen.findByText('maya_k · $14.00')).toBeOnTheScreen();
    expect(screen.queryByTestId(`notification-card-${wish.id}`)).not.toBeOnTheScreen();
    expect(screen.getByText('maya_k · $14.00').props.numberOfLines).toBeUndefined();
    expect(screen.getByText('Mark all as read').props.maxFontSizeMultiplier).toBe(1.35);
  });
});

describe('The bell', () => {
  it('shows an orange dot while anything is unread, says how many, and opens Notifications', async () => {
    const api = mockApi(routes({ 'GET /api/v1/notifications/unread-count': ok({ count: 3 }) }));
    renderWithProviders(<NotificationBell testID="bell" variant="round" />, { port: port() });
    expect(await screen.findByTestId('bell-dot')).toBeOnTheScreen();
    expect(screen.getByTestId('bell').props.accessibilityLabel).toBe('Notifications, 3 new');
    expect(
      api.callsTo('GET /api/v1/notifications/unread-count')[0]?.query.getAll('excludeTypes')
    ).toEqual(['MESSAGE']);
    fireEvent.press(screen.getByTestId('bell'));
    expect(mockRouter.push).toHaveBeenCalledWith('/notifications');
  });

  it('has no dot and says "Notifications" when nothing is unread', async () => {
    mockApi(routes({ 'GET /api/v1/notifications/unread-count': ok({ count: 0 }) }));
    renderWithProviders(<NotificationBell />, { port: port() });
    await waitFor(() =>
      expect(screen.getByTestId('notification-bell').props.accessibilityLabel).toBe('Notifications')
    );
    expect(screen.queryByTestId('notification-bell-dot')).not.toBeOnTheScreen();
  });

  it('counts a pushed chat for Messages only, not for the bell', async () => {
    const rt = fakeRealtime();
    mockApi(routes({ 'GET /api/v1/notifications/unread-count': ok({ count: 0 }) }));
    renderWithProviders(<NotificationBell />, { port: port(), realtime: rt.client });
    await waitFor(() => expect(rt.client.state).toBe('connected'));
    act(() =>
      rt
        .current()
        .push(
          '/user/queue/notifications',
          notificationFixture({ id: 'n-chat', type: 'MESSAGE', data: { conversationId: 'c' } })
        )
    );
    expect(screen.queryByTestId('notification-bell-dot')).not.toBeOnTheScreen();
    act(() =>
      rt.current().push('/user/queue/notifications', notificationFixture({ id: 'n-alert' }))
    );
    expect(await screen.findByTestId('notification-bell-dot')).toBeOnTheScreen();
    expect(screen.getByTestId('notification-bell').props.accessibilityLabel).toBe(
      'Notifications, 1 new'
    );
  });

  it('is hidden while signed out', async () => {
    mockApi({});
    renderWithProviders(<NotificationBell />, { port: new FakeAuthPort(null) });
    await waitFor(() => expect(screen.queryByTestId('notification-bell')).not.toBeOnTheScreen());
  });
});
