import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';

import CollectorScreen from '@/app/collectors/[id]';
import { useSessionNotice } from '@/src/auth/sessionNotice';
import { offerTargetFor } from '@/src/features/offers/offerTargetStore';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import {
  CONVERSATION_ID,
  PUBLIC_BINDER_ID,
  collectorFixture,
  conversationFixture,
  publicBinderSummaryFixture,
  publicItemFixture,
  publicItemsPage,
  ratingsPageFixture,
  referencesPageFixture,
  wishlistEntryFixture,
  PRINTING_A,
  printingFixture,
  ONTARIO,
} from '../support/fixtures';
import { mockApi, ok, problem, type MockRoutes } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { mockParams, mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());

const OTHER = collectorFixture({
  id: '00000000-0000-4000-8000-0000000000b1',
  handle: 'collector2',
  displayName: 'Noé Verdun',
  bio: 'Magic and Pokémon in Verdun.',
  location: { ...ONTARIO },
  lastActiveBucket: 'THIS_WEEK',
  onlineStatus: 'ONLINE',
  rating: { average: 4.8, count: 12 },
});

beforeEach(() => {
  resetRouterMock();
  resetAppState();
  mockParams.current = { id: 'collector2' };
});

function routes(extra: MockRoutes = {}): MockRoutes {
  return signedInRoutes({
    'GET /api/v1/collectors/{handle}/binders': ok([publicBinderSummaryFixture()]),
    'GET /api/v1/collectors/{handle}/inventory': ok(publicItemsPage([publicItemFixture()])),
    'GET /api/v1/collectors/{handle}/ratings': ok(ratingsPageFixture()),
    'GET /api/v1/collectors/{handle}/references': ok(referencesPageFixture()),
    'GET /api/v1/collectors/{handle}/wishlist': problem(404, 'NOT_FOUND', 'hidden'),
    'GET /api/v1/collectors/{handle}': ok(OTHER),
    ...extra,
  });
}

const render = (port = new FakeAuthPort(testUser())) =>
  renderWithProviders(<CollectorScreen />, { port });

describe('Collector profile', () => {
  it('shows a skeleton, then the public profile with the state, never a distance', async () => {
    mockApi(routes());
    render();
    expect(screen.getByTestId('collector-loading')).toBeOnTheScreen();
    expect(await screen.findByTestId('collector-name')).toHaveTextContent('Noé Verdun');
    expect(screen.getByText('@collector2')).toBeOnTheScreen();
    expect(screen.getByTestId('collector-location')).toHaveTextContent('Ontario, Canada');
    expect(screen.queryByTestId('collector-distance')).toBeNull();
    expect(screen.getByTestId('collector-last-active')).toHaveTextContent('Active this week');
    expect(screen.getByLabelText('Online now')).toBeOnTheScreen();
    expect(screen.getByText('Magic and Pokémon in Verdun.')).toBeOnTheScreen();
    expect(screen.getByTestId('collector-tags')).toHaveTextContent('Local pickup');
    expect(screen.queryByTestId('public-preview-banner')).toBeNull();

    // The location card: the state or province only, no map, no zone, no distance (ADR 0017).
    expect(screen.getByTestId('collector-area-note')).toHaveTextContent(
      'On the map in Ontario, Canada. OrenjiTrade only shows the state or province, never a position or a distance.'
    );
    expect(screen.queryByTestId('collector-area-view')).toBeNull();
    expect(screen.queryByText(/km/)).toBeNull();
  });

  it('shows the city only when the API sends it (its owner shows it)', async () => {
    mockApi(
      routes({
        'GET /api/v1/collectors/{handle}': ok({
          ...OTHER,
          location: { ...ONTARIO, city: 'Ottawa' },
        }),
      })
    );
    render();
    expect(await screen.findByTestId('collector-location')).toHaveTextContent(
      'Ottawa, Ontario, Canada'
    );
  });

  it('lists the public binders and cards and opens the first binder', async () => {
    mockApi(routes());
    render();
    const binder = await screen.findByTestId(`collector-binder-${PUBLIC_BINDER_ID}`);
    expect(binder).toHaveTextContent(/Magic trades/);
    expect(await screen.findByTestId('collector-cards')).toBeOnTheScreen();
    const view = screen.getByTestId('collector-view-binder');
    await waitFor(() => expect(view).not.toBeDisabled());
    fireEvent.press(view);
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/binders/[id]',
      params: { id: PUBLIC_BINDER_ID },
    });
    fireEvent.press(binder);
    expect(mockRouter.push).toHaveBeenCalledTimes(2);
  });

  it('reports the collector and makes an offer on a public card', async () => {
    mockApi(routes());
    render();
    fireEvent.press(await screen.findByTestId('collector-report'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/report',
      params: {
        userId: OTHER.id,
        name: 'Noé Verdun',
        handle: 'collector2',
        source: 'PROFILE',
      },
    });
    const item = publicItemFixture();
    fireEvent.press(await screen.findByTestId(`make-offer-${item.id}`));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/offers/new',
      params: { item: item.id },
    });
    expect(offerTargetFor(item.id)).toMatchObject({
      cardName: 'Azure-Eyes Sky Dragon',
      seller: { id: OTHER.id, displayName: 'Noé Verdun', placeLabel: 'Ontario, Canada' },
    });
  });

  it('offers no offer on cards that refuse them', async () => {
    const item = publicItemFixture({ acceptsOffers: false });
    mockApi(
      routes({
        'GET /api/v1/collectors/{handle}/inventory': ok(publicItemsPage([item])),
      })
    );
    render();
    expect(await screen.findByTestId('collector-cards')).toBeOnTheScreen();
    expect(screen.queryByTestId(`make-offer-${item.id}`)).not.toBeOnTheScreen();
  });

  it('shows empty binders, and a retry when they fail', async () => {
    const api = mockApi(
      routes({
        'GET /api/v1/collectors/{handle}/binders': [problem(500, 'INTERNAL_ERROR', 'Boom'), ok([])],
        'GET /api/v1/collectors/{handle}/inventory': ok(publicItemsPage([])),
      })
    );
    render();
    const failed = await screen.findByTestId('collector-binders-error');
    expect(screen.getByTestId('collector-view-binder')).toBeDisabled();
    fireEvent.press(within(failed).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByTestId('collector-binders-empty')).toHaveTextContent(
      /When Noé Verdun publishes a binder/
    );
    expect(api.callsTo('GET /api/v1/collectors/{handle}/binders')).toHaveLength(2);
    expect(screen.queryByTestId('collector-cards')).toBeNull();
  });

  it('shows the ratings summary, ratings and references, with more on demand', async () => {
    const api = mockApi(
      routes({
        'GET /api/v1/collectors/{handle}/ratings': (request) =>
          ok(
            request.query.get('cursor')
              ? ratingsPageFixture({
                  items: [
                    {
                      ...ratingsPageFixture().items[0]!,
                      id: 'r2',
                      comment: 'Quick answers.',
                    },
                  ],
                })
              : ratingsPageFixture({ hasMore: true, nextCursor: 'c2' })
          ),
      })
    );
    render();
    expect(await screen.findByTestId('rating-summary')).toHaveTextContent(/4\.8/);
    expect(screen.getByTestId('rating-count')).toHaveTextContent('12 ratings');
    expect(screen.getByText('Smooth trade at the café.')).toBeOnTheScreen();
    expect(screen.getByText('Communication')).toBeOnTheScreen();
    expect(await screen.findByText('“Fair and friendly trader.”')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('ratings-more'));
    expect(await screen.findByText('Quick answers.')).toBeOnTheScreen();
    expect(api.callsTo('GET /api/v1/collectors/{handle}/ratings')[1]?.query.get('cursor')).toBe(
      'c2'
    );
  });

  it('shows empty ratings and references, and retries ratings that failed', async () => {
    mockApi(
      routes({
        'GET /api/v1/collectors/{handle}/ratings': [
          problem(500, 'INTERNAL_ERROR', 'Boom'),
          ok(ratingsPageFixture({ items: [], summary: { average: null, count: 0 } })),
        ],
        'GET /api/v1/collectors/{handle}/references': ok(referencesPageFixture({ items: [] })),
      })
    );
    render();
    const failed = await screen.findByTestId('ratings-error');
    fireEvent.press(within(failed).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('ratings-empty')).toHaveTextContent(/No ratings yet/);
    expect(screen.getByTestId('references-empty')).toHaveTextContent('No references yet.');
  });

  it('starts or opens the conversation when the collector accepts messages', async () => {
    const api = mockApi(routes({ 'POST /api/v1/conversations': ok(conversationFixture()) }));
    render();
    fireEvent.press(await screen.findByTestId('collector-message'));
    await waitFor(() =>
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/messages/[id]',
        params: { id: CONVERSATION_ID },
      })
    );
    expect(api.callsTo('POST /api/v1/conversations')[0]?.body).toEqual({ recipientId: OTHER.id });
  });

  it('respects the messaging permission and blocks', async () => {
    mockApi(routes({ 'GET /api/v1/collectors/{handle}': ok({ ...OTHER, canMessage: false }) }));
    const first = render();
    expect(await screen.findByTestId('collector-message')).toBeDisabled();
    expect(screen.getByTestId('collector-message-reason')).toHaveTextContent(
      'Noé Verdun does not accept messages from you.'
    );
    first.unmount();
    mockApi(
      routes({
        'GET /api/v1/collectors/{handle}': ok({ ...OTHER, canMessage: false, isBlocked: true }),
      })
    );
    render();
    expect(await screen.findByTestId('collector-message-reason')).toHaveTextContent(
      /because of a block/
    );
  });

  it('shows "Looking for" when the collector shows their wishlist, nothing when hidden', async () => {
    mockApi(
      routes({
        'GET /api/v1/collectors/{handle}/wishlist': ok([
          wishlistEntryFixture(),
          wishlistEntryFixture({
            card: { id: 'c2', name: 'Emberfang Fox VMAX', imageUrl: null },
            printing: printingFixture(),
            conditionMin: null,
          }),
        ]),
      })
    );
    const first = render();
    const section = await screen.findByTestId('collector-wishlist');
    expect(section).toHaveTextContent(/2 cards Noé Verdun is looking for/);
    const dragon = within(section).getByTestId(
      'collector-wish-00000000-0000-4000-8a00-000000000001'
    );
    expect(dragon).toHaveTextContent(/Azure-Eyes Sky Dragon/);
    expect(dragon).toHaveTextContent(/Any printing/);
    expect(dragon).toHaveTextContent(/Lightly Played or better/);
    const fox = within(section).getByTestId('collector-wish-c2');
    expect(fox).toHaveTextContent(/SVX-001 · Stellar Vortex/);
    // Never prices, radii or notes.
    expect(section).not.toHaveTextContent(/km|CA\$/);
    fireEvent.press(fox);
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/cards/[id]',
      params: { id: 'c2', printing: PRINTING_A },
    });
    first.unmount();

    mockApi(routes());
    render();
    await screen.findByTestId('collector-binders');
    await waitFor(() => expect(screen.queryByTestId('collector-wishlist')).toBeNull());
  });

  it('is the public preview of the own profile (edit, no Message)', async () => {
    mockParams.current = { id: 'maika' };
    mockApi(routes({ 'GET /api/v1/collectors/{handle}': ok(collectorFixture()) }));
    render();
    expect(await screen.findByTestId('public-preview-banner')).toBeOnTheScreen();
    expect(screen.queryByTestId('collector-message')).toBeNull();
    expect(screen.queryByTestId('collector-report')).toBeNull();
    fireEvent.press(screen.getByTestId('collector-edit-profile'));
    expect(mockRouter.push).toHaveBeenCalledWith('/settings/profile');
  });

  it('says when a collector is not on the map', async () => {
    mockApi(routes({ 'GET /api/v1/collectors/{handle}': ok({ ...OTHER, location: undefined }) }));
    render();
    expect(await screen.findByTestId('collector-location')).toHaveTextContent('Not on the map');
    expect(screen.getByTestId('collector-area-hidden')).toHaveTextContent(
      'Noé Verdun is not visible on the map.'
    );
    expect(screen.queryByTestId('collector-area-note')).toBeNull();
  });
});

describe('Collector profile visibility (like the web)', () => {
  it('PRIVATE (or unknown, suspended, deleted): "not available", whatever the reason', async () => {
    mockApi(routes({ 'GET /api/v1/collectors/{handle}': problem(404, 'NOT_FOUND', 'Not found') }));
    render();
    const empty = await screen.findByTestId('collector-not-found');
    expect(empty).toHaveTextContent(/This collector is not available/);
    expect(empty).toHaveTextContent(/does not exist, is private, or is no longer active/);
    fireEvent.press(within(empty).getByRole('button', { name: 'Back to the map' }));
    expect(mockRouter.navigate).toHaveBeenCalledWith('/');
  });

  it('MEMBERS while signed out: sign-in required, nothing is requested', async () => {
    const api = mockApi(routes());
    render(new FakeAuthPort());
    expect(await screen.findByTestId('collector-members-only')).toHaveTextContent(
      /Collector profiles are for members/
    );
    expect(api.callsTo('GET /api/v1/collectors/{handle}')).toHaveLength(0);
    fireEvent.press(screen.getByTestId('collector-sign-in'));
    expect(mockRouter.push).toHaveBeenCalledWith('/sign-in');
    fireEvent.press(screen.getByTestId('collector-sign-up'));
    expect(mockRouter.push).toHaveBeenCalledWith('/sign-up');
  });

  it('a 401 ends the session: signed out, so the gate opens sign-in instead of looping', async () => {
    mockApi(
      routes({ 'GET /api/v1/collectors/{handle}': problem(401, 'UNAUTHENTICATED', 'Sign in') })
    );
    const port = new FakeAuthPort(testUser());
    render(port);
    expect(await screen.findByTestId('collector-members-only')).toBeOnTheScreen();
    await waitFor(() => expect(port.signOut).toHaveBeenCalled());
    expect(useSessionNotice.getState().ended).toBe(true);
    // Signed out now: the buttons open the auth screens.
    fireEvent.press(screen.getByTestId('collector-sign-in'));
    expect(mockRouter.push).toHaveBeenCalledWith('/sign-in');
  });

  it('shows an error with retry for other failures', async () => {
    const api = mockApi(
      routes({
        'GET /api/v1/collectors/{handle}': [problem(500, 'INTERNAL_ERROR', 'Boom'), ok(OTHER)],
      })
    );
    render();
    expect(await screen.findByText('We could not load this profile')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('collector-name')).toHaveTextContent('Noé Verdun');
    expect(api.callsTo('GET /api/v1/collectors/{handle}')).toHaveLength(2);
  });

  it('shows the offline error when the network is down', async () => {
    mockApi(routes({ 'GET /api/v1/collectors/{handle}': problem(0, 'NETWORK_ERROR', 'offline') }));
    render();
    expect(await screen.findByTestId('collector-error')).toBeOnTheScreen();
  });
});

describe('Collector profile: Block / Unblock (launch readiness)', () => {
  it('blocks the collector after a confirmation, then offers Unblock', async () => {
    const api = mockApi(
      routes({
        'GET /api/v1/collectors/{handle}': [ok(OTHER), ok({ ...OTHER, isBlocked: true })],
        'POST /api/v1/users/{id}/block': { status: 204 },
        'DELETE /api/v1/users/{id}/block': { status: 204 },
      })
    );
    render();
    expect(await screen.findByTestId('collector-name')).toHaveTextContent('Noé Verdun');
    expect(screen.getByTestId('collector-report')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Block Noé Verdun' }));
    const dialog = screen.getByTestId('block-dialog');
    expect(within(dialog).getByText('Block Noé Verdun?')).toBeOnTheScreen();
    expect(within(dialog).getByText(/Settings → Blocked users/)).toBeOnTheScreen();
    fireEvent.press(within(dialog).getByRole('button', { name: 'Block' }));
    await waitFor(() => expect(api.callsTo('POST /api/v1/users/{id}/block')).toHaveLength(1));
    expect(api.callsTo('POST /api/v1/users/{id}/block')[0]?.path).toBe(
      '/api/v1/users/00000000-0000-4000-8000-0000000000b1/block'
    );
    expect(screen.getByTestId('snackbar')).toHaveTextContent('Noé Verdun is blocked.');
    // The profile is read again: blocked now, Unblock in place of Block.
    expect(await screen.findByRole('button', { name: 'Unblock Noé Verdun' })).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Unblock Noé Verdun' }));
    await waitFor(() => expect(api.callsTo('DELETE /api/v1/users/{id}/block')).toHaveLength(1));
    expect(screen.getByTestId('snackbar')).toHaveTextContent('Noé Verdun is unblocked.');
  });

  it("never offers Block on the collector's own profile", async () => {
    // The fixture's default is the signed-in collector's own profile.
    mockApi(routes({ 'GET /api/v1/collectors/{handle}': ok(collectorFixture()) }));
    render();
    expect(await screen.findByTestId('public-preview-banner')).toBeOnTheScreen();
    expect(screen.queryByTestId('collector-block')).toBeNull();
    expect(screen.queryByTestId('collector-report')).toBeNull();
  });
});
