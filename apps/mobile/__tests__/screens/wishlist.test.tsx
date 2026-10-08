import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';

import WishlistScreen from '@/app/(tabs)/wishlist';
import EditWishScreen from '@/app/wishlist/edit';
import WishMatchesScreen from '@/app/wishlist/[id]';
import NewWishScreen from '@/app/wishlist/new';
import { offerTargetFor } from '@/src/features/offers/offerTargetStore';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import {
  CARD_ID,
  PRINTING_A,
  WISH_ID,
  cardDetailFixture,
  locationFixture,
  matchFixture,
  matchPage,
  notificationFixture,
  planFixture,
  wishFixture,
} from '../support/fixtures';
import { mockApi, noContent, ok, problem, type MockRoutes } from '../support/mockApi';
import { fakeRealtime } from '../support/realtime';
import { signedInRoutes } from '../support/routes';
import { mockParams, mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());

beforeEach(() => {
  resetRouterMock();
  resetAppState();
});

const PLAN = {
  ...planFixture(25),
  limits: [
    ...(planFixture(25).limits ?? []),
    {
      key: 'wishlist.items.max',
      allowed: true,
      kind: 'CAP' as const,
      window: 'TOTAL' as const,
      limit: 20,
      used: 2,
    },
  ],
};

function routes(extra: MockRoutes = {}): MockRoutes {
  return signedInRoutes({
    'GET /api/v1/wishlist': ok([
      wishFixture({ matchCount: 2, lastMatchedAt: '2026-10-05T09:00:00Z' }),
      wishFixture({
        id: 'wish-paused',
        card: { id: 'card-2', name: 'Lantern Fox', imageUrl: null },
        game: 'pokemon',
        active: false,
        notes: '',
      }),
    ]),
    'GET /api/v1/me/plan': ok(PLAN),
    ...extra,
    // Last: `{id}` would also match `/cards/suggest`.
    'GET /api/v1/cards/{id}': ok(cardDetailFixture()),
  });
}

const port = () => new FakeAuthPort(testUser());

describe('Wishlist tab', () => {
  it('lists wishes with their criteria, matches, usage and filters', async () => {
    mockApi(
      routes({
        'GET /api/v1/me/location': ok(
          locationFixture({ discoverable: true, publicPoint: { lat: 45.503, lng: -73.569 } })
        ),
      })
    );
    renderWithProviders(<WishlistScreen />, { port: port() });
    expect(screen.getByTestId('wishlist-loading')).toBeOnTheScreen();
    expect(await screen.findByTestId(`wish-${WISH_ID}`)).toBeOnTheScreen();
    expect(screen.getByTestId(`wish-criteria-${WISH_ID}`)).toHaveTextContent(
      /Lightly Played or better.*Up to \$25\.00.*Within 10 km.*Trade or buy/
    );
    expect(screen.getByTestId(`wish-match-count-${WISH_ID}`)).toHaveTextContent('2 matches');
    expect(screen.getByTestId('wish-match-count-wish-paused')).toHaveTextContent('No matches yet');
    expect(screen.getByTestId('wishlist-count')).toHaveTextContent('2');
    expect(screen.getByTestId('wishlist-total-matches')).toHaveTextContent('2');
    expect(await screen.findByTestId('wishlist-usage')).toHaveTextContent(
      '2 of 20 wishes · Free plan'
    );
    // Discoverable with a trading area: no readiness hint.
    expect(screen.queryByTestId('match-readiness')).toBeNull();

    fireEvent.press(screen.getByTestId('wishlist-filter-paused'));
    expect(screen.queryByTestId(`wish-${WISH_ID}`)).toBeNull();
    expect(screen.getByTestId('wish-wish-paused')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('wishlist-filter-matches'));
    expect(screen.getByTestId(`wish-${WISH_ID}`)).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId(`wish-matches-${WISH_ID}`));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/wishlist/[id]',
      params: { id: WISH_ID },
    });
    fireEvent.press(screen.getByTestId('wishlist-add'));
    expect(mockRouter.push).toHaveBeenCalledWith('/wishlist/new');
  });

  it('explains why matches cannot arrive yet', async () => {
    mockApi(routes({ 'GET /api/v1/me/location': ok(locationFixture({ discoverable: false })) }));
    renderWithProviders(<WishlistScreen />, { port: port() });
    expect(await screen.findByTestId('match-readiness')).toHaveTextContent(
      /Show yourself on the map to get matches/
    );
    fireEvent.press(screen.getByTestId('match-readiness-action'));
    expect(mockRouter.push).toHaveBeenCalledWith('/settings/location');
  });

  it('pauses alerts (optimistic, restored on failure) and removes a wish after confirming', async () => {
    const api = mockApi(
      routes({
        'PATCH /api/v1/wishlist/{id}': [
          ok(wishFixture({ matchCount: 2, active: false })),
          problem(500, 'INTERNAL_ERROR', 'Boom'),
        ],
        'DELETE /api/v1/wishlist/{id}': noContent,
      })
    );
    renderWithProviders(<WishlistScreen />, { port: port() });
    await screen.findByTestId(`wish-${WISH_ID}`);
    fireEvent.press(screen.getByTestId(`wish-active-${WISH_ID}`));
    expect(await screen.findByTestId('snackbar')).toHaveTextContent(
      'Alerts paused for Azure-Eyes Sky Dragon.'
    );
    expect(api.callsTo('PATCH /api/v1/wishlist/{id}')[0]?.body).toEqual({ active: false });
    expect(screen.getByTestId(`wish-active-${WISH_ID}`).props.accessibilityState?.checked).toBe(
      false
    );
    fireEvent.press(screen.getByTestId(`wish-active-${WISH_ID}`));
    await waitFor(() =>
      expect(screen.getByTestId('snackbar')).toHaveTextContent(/Please try again in a moment/)
    );
    await waitFor(() =>
      expect(screen.getByTestId(`wish-active-${WISH_ID}`).props.accessibilityState?.checked).toBe(
        false
      )
    );

    fireEvent.press(screen.getByTestId(`wish-menu-${WISH_ID}`));
    fireEvent.press(await screen.findByTestId('wish-remove'));
    const dialog = await screen.findByTestId('wish-remove-dialog');
    expect(dialog).toHaveTextContent(/Remove Azure-Eyes Sky Dragon\?/);
    fireEvent.press(within(dialog).getByTestId('wish-remove-dialog-confirm'));
    await waitFor(() => expect(screen.queryByTestId(`wish-${WISH_ID}`)).not.toBeOnTheScreen());
    expect(api.callsTo('DELETE /api/v1/wishlist/{id}')).toHaveLength(1);
  });

  it('shows the empty wishlist and an error with retry', async () => {
    mockApi(
      routes({
        'GET /api/v1/wishlist': [problem(500, 'INTERNAL_ERROR', 'Boom'), ok([])],
        'GET /api/v1/me/location': ok(locationFixture({ tradingArea: undefined })),
      })
    );
    renderWithProviders(<WishlistScreen />, { port: port() });
    expect(await screen.findByTestId('wishlist-error')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('wishlist-empty')).toHaveTextContent(/Your wishlist is empty/);
    expect(await screen.findByTestId('match-readiness')).toHaveTextContent(/Set your trading area/);
    fireEvent.press(screen.getByText('Add a card'));
    expect(mockRouter.push).toHaveBeenCalledWith('/wishlist/new');
  });

  it('refreshes match counts when a match notification is pushed', async () => {
    const rt = fakeRealtime();
    let matches = 2;
    mockApi(
      routes({
        'GET /api/v1/wishlist': () => ok([wishFixture({ matchCount: matches })]),
        'GET /api/v1/notifications/unread-count': ok({ count: 0 }),
      })
    );
    renderWithProviders(<WishlistScreen />, { port: port(), realtime: rt.client });
    expect(await screen.findByTestId(`wish-match-count-${WISH_ID}`)).toHaveTextContent('2 matches');
    await waitFor(() => expect(rt.client.state).toBe('connected'));
    matches = 3;
    act(() => rt.current().push('/user/queue/notifications', notificationFixture()));
    await waitFor(() =>
      expect(screen.getByTestId(`wish-match-count-${WISH_ID}`)).toHaveTextContent('3 matches')
    );
  });
});

describe('Add and edit a wish', () => {
  it('adds a card from its page: criteria, radius bounded by the plan, notes', async () => {
    mockParams.current = { cardId: CARD_ID };
    const api = mockApi(
      routes({
        'POST /api/v1/wishlist': (request) =>
          ok(wishFixture({ ...(request.body as object), matchCount: 0 }), 201),
      })
    );
    renderWithProviders(<NewWishScreen />, { port: port() });
    expect(await screen.findByTestId('wish-card')).toHaveTextContent(/Emberfang Fox VMAX/);
    // The FREE plan caps the radius at 25 km: the stepper stops there.
    await waitFor(() => expect(screen.getByTestId('wish-radius-value')).toHaveTextContent('25 km'));
    expect(screen.getByTestId('wish-radius-increase')).toBeDisabled();
    fireEvent.press(screen.getByTestId('wish-radius-decrease'));
    fireEvent.press(screen.getByTestId('wish-radius-decrease'));
    fireEvent.press(screen.getByTestId('wish-radius-decrease'));
    expect(screen.getByTestId('wish-radius-value')).toHaveTextContent('10 km');
    fireEvent.press(screen.getByTestId('wish-condition'));
    fireEvent.press(await screen.findByTestId('wish-condition-option-LIGHTLY_PLAYED'));
    fireEvent.changeText(screen.getByTestId('wish-max-price'), '25');
    fireEvent.press(screen.getByTestId('wish-trade-TRADE'));
    fireEvent.changeText(screen.getByTestId('wish-notes'), 'Fictional wish');
    fireEvent.press(screen.getByTestId('wish-save'));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(api.callsTo('POST /api/v1/wishlist')[0]?.body).toEqual({
      cardId: CARD_ID,
      conditionMin: 'LIGHTLY_PLAYED',
      maxPrice: 25,
      currency: 'CAD',
      radiusKm: 10,
      tradePreference: 'TRADE',
      notes: 'Fictional wish',
      active: true,
    });
    expect(screen.getByTestId('snackbar')).toHaveTextContent(/is on your wishlist/);
  });

  it('starts from the card autocomplete, keeps a picked printing, and explains refusals', async () => {
    const api = mockApi(
      routes({
        'GET /api/v1/cards/suggest': ok([
          {
            kind: 'PRINTING',
            id: CARD_ID,
            printingId: PRINTING_A,
            name: 'Azure-Eyes Sky Dragon',
            game: 'yugioh',
            printingCode: 'AZR-EN001',
            imageUrl: null,
          },
        ]),
        'POST /api/v1/wishlist': [
          problem(409, 'CONFLICT', 'This card is already on your wishlist with the same filters.'),
          problem(429, 'LIMIT_REACHED', 'Limit', { limitKey: 'wishlist.items.max', limit: 20 }),
        ],
      })
    );
    renderWithProviders(<NewWishScreen />, { port: port() });
    expect(await screen.findByTestId('wish-card-step')).toHaveTextContent(
      /Which card are you looking for\?/
    );
    fireEvent.changeText(screen.getByTestId('card-picker-input'), 'AZR');
    fireEvent.press(await screen.findByTestId('suggestion-PRINTING-AZR-EN001'));
    expect(await screen.findByTestId('wish-printing')).toHaveTextContent(/SVX-001/);
    expect(screen.queryByTestId('wish-rarity')).toBeNull();
    // Inline validation first.
    fireEvent.changeText(screen.getByTestId('wish-max-price'), '1.234');
    fireEvent.press(screen.getByTestId('wish-save'));
    expect(await screen.findByText('Use at most two decimals.')).toBeOnTheScreen();
    expect(api.callsTo('POST /api/v1/wishlist')).toHaveLength(0);
    fireEvent.changeText(screen.getByTestId('wish-max-price'), '');
    fireEvent.press(screen.getByTestId('wish-save'));
    expect(await screen.findByTestId('wish-error')).toHaveTextContent(
      /This card is already on your wishlist with the same filters\.$/
    );
    expect(
      (api.callsTo('POST /api/v1/wishlist')[0]?.body as { printingId?: string }).printingId
    ).toBe(PRINTING_A);
    fireEvent.press(screen.getByTestId('wish-save'));
    expect(await screen.findByTestId('wish-error')).toHaveTextContent(
      /Your wishlist is full: your plan allows 20 wishes\. Remove one or upgrade to add more\.$/
    );
    // Another card can be chosen.
    fireEvent.press(screen.getByTestId('wish-change-card'));
    expect(await screen.findByTestId('wish-card-step')).toBeOnTheScreen();
  });

  it('edits a wish with a PATCH of every field', async () => {
    mockParams.current = { id: WISH_ID };
    const api = mockApi(
      routes({ 'PATCH /api/v1/wishlist/{id}': ok(wishFixture({ radiusKm: 9 })) })
    );
    renderWithProviders(<EditWishScreen />, { port: port() });
    expect(await screen.findByTestId('wish-radius-value')).toHaveTextContent('10 km');
    fireEvent.press(screen.getByTestId('wish-radius-decrease'));
    fireEvent.press(screen.getByTestId('wish-save'));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(api.callsTo('PATCH /api/v1/wishlist/{id}')[0]?.body).toMatchObject({
      radiusKm: 9,
      conditionMin: 'LIGHTLY_PLAYED',
      maxPrice: 25,
      printingId: null,
      notes: 'For my deck.',
    });
    expect(screen.getByTestId('snackbar')).toHaveTextContent('Wish updated.');
  });

  it('says when the wish to edit no longer exists', async () => {
    mockParams.current = { id: 'gone' };
    mockApi(routes());
    renderWithProviders(<EditWishScreen />, { port: port() });
    expect(await screen.findByTestId('wish-not-found')).toBeOnTheScreen();
  });
});

describe('Matches of a wish', () => {
  beforeEach(() => {
    mockParams.current = { id: WISH_ID };
  });

  it('lists matches with the collector’s approximate place and distance bucket', async () => {
    const api = mockApi(
      routes({
        'GET /api/v1/wishlist/{id}/matches': ok(matchPage()),
        'POST /api/v1/conversations': ok(
          {
            id: 'conv-1',
            other: matchFixture().collector,
            unreadCount: 0,
            muted: false,
            archived: false,
            createdAt: 'x',
          },
          201
        ),
        'POST /api/v1/wishlist/matches/{id}/dismiss': noContent,
      })
    );
    renderWithProviders(<WishMatchesScreen />, { port: port() });
    const match = matchFixture();
    expect(await screen.findByTestId(`match-${match.id}`)).toBeOnTheScreen();
    expect(screen.getByTestId('wish-matches-head')).toHaveTextContent(
      /Matches for Azure-Eyes Sky Dragon/
    );
    expect(screen.getByTestId('match-distance')).toHaveTextContent('1–5 km away');
    expect(screen.getByTestId(`match-${match.id}`)).toHaveTextContent(/Verdun, Montréal/);
    expect(screen.getByTestId('match-price')).toHaveTextContent('$45.00');
    // Nothing on screen carries a coordinate.
    expect(screen.toJSON()).not.toEqual(expect.stringContaining('45.458'));

    fireEvent.press(screen.getByTestId(`match-on-map-${match.id}`));
    expect(mockRouter.navigate).toHaveBeenCalledWith({
      pathname: '/',
      params: { printing: match.item.printing.id },
    });
    fireEvent.press(screen.getByTestId(`match-message-${match.id}`));
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/messages/[id]',
        params: { id: 'conv-1' },
      })
    );
    expect(api.callsTo('POST /api/v1/conversations')[0]?.body).toEqual({
      recipientId: match.collector.id,
    });

    // The listing accepts offers: "Make an offer" opens the form with the card and its holder.
    fireEvent.press(screen.getByTestId(`match-offer-${match.id}`));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/offers/new',
      params: { item: match.item.id },
    });
    expect(offerTargetFor(match.item.id)?.seller.displayName).toBe(match.collector.displayName);

    fireEvent.press(screen.getByTestId(`match-dismiss-${match.id}`));
    await waitFor(() => expect(screen.queryByTestId(`match-${match.id}`)).not.toBeOnTheScreen());
    expect(api.callsTo('POST /api/v1/wishlist/matches/{id}/dismiss')).toHaveLength(1);
    expect(await screen.findByTestId('wish-matches-empty')).toBeOnTheScreen();
  });

  it('shows no matches yet (with the map), a missing wish, and an error with retry', async () => {
    mockApi(routes({ 'GET /api/v1/wishlist/{id}/matches': ok(matchPage([])) }));
    const first = renderWithProviders(<WishMatchesScreen />, { port: port() });
    expect(await screen.findByTestId('wish-matches-empty')).toHaveTextContent(/No matches yet/);
    fireEvent.press(screen.getByText('Who has it on the map'));
    expect(mockRouter.navigate).toHaveBeenCalledWith({ pathname: '/', params: { card: CARD_ID } });
    first.unmount();

    mockParams.current = { id: 'gone' };
    mockApi(routes({ 'GET /api/v1/wishlist/{id}/matches': problem(404, 'NOT_FOUND', 'Gone') }));
    const second = renderWithProviders(<WishMatchesScreen />, { port: port() });
    expect(await screen.findByTestId('wish-matches-not-found')).toBeOnTheScreen();
    second.unmount();

    mockParams.current = { id: WISH_ID };
    mockApi(
      routes({
        'GET /api/v1/wishlist/{id}/matches': [
          problem(500, 'INTERNAL_ERROR', 'Boom'),
          ok(matchPage()),
        ],
      })
    );
    renderWithProviders(<WishMatchesScreen />, { port: port() });
    expect(await screen.findByTestId('wish-matches-error')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId(`match-${matchFixture().id}`)).toBeOnTheScreen();
  });
});
