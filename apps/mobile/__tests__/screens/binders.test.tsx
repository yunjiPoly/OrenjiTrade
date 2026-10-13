import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';

import BinderScreen from '@/app/binders/[id]';
import EditBinderScreen from '@/app/binders/edit';
import NewBinderScreen from '@/app/binders/new';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import {
  binderFixture,
  BINDER_ID,
  inventoryPage,
  ITEM_ID,
  itemFixture,
  publicBinderFixture,
  publicItemFixture,
} from '../support/fixtures';
import { mockApi, noContent, ok, problem } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { mockParams, mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());

beforeEach(() => {
  resetRouterMock();
  resetAppState();
});

const port = () => new FakeAuthPort(testUser());

const FILED = itemFixture({ binder: { id: BINDER_ID, name: 'Trade binder' } });
const OTHER = itemFixture({
  id: 'item-2',
  card: { id: 'c2', name: 'Tidal Otterling', game: 'pokemon' },
});

function ownRoutes(extra = {}) {
  return signedInRoutes({
    'GET /api/v1/binders/{id}': ok(binderFixture()),
    'GET /api/v1/binders/{id}/items': ok(inventoryPage([FILED])),
    ...extra,
  });
}

describe('Own binder', () => {
  beforeEach(() => {
    mockParams.current = { id: BINDER_ID };
  });

  it('shows the binder, its status and its cards', async () => {
    mockApi(ownRoutes());
    renderWithProviders(<BinderScreen />, { port: port() });
    expect(screen.getByTestId('binder-resolving')).toBeOnTheScreen();
    expect(await screen.findByTestId('binder-title')).toHaveTextContent('Trade binder');
    expect(screen.getByTestId('binder-counts')).toHaveTextContent('Trade binder · 1 card');
    expect(screen.getByTestId('binder-visibility')).toHaveTextContent('Private');
    expect(screen.getByText('Only you can see this binder and its cards.')).toBeOnTheScreen();
    expect(await screen.findByTestId(`item-${ITEM_ID}`)).toBeOnTheScreen();
    expect(screen.queryByTestId('binder-unpublish')).toBeNull();
    expect(screen.queryByTestId('binder-public-page')).toBeNull();
    fireEvent.press(screen.getByTestId('binder-edit'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/binders/edit',
      params: { id: BINDER_ID },
    });
  });

  it('publishes for 24 hours, then makes the binder private again', async () => {
    const published = binderFixture({
      visibility: 'TEMPORARILY_PUBLIC',
      publicUntil: '2099-01-01T00:00:00Z',
      effectivePublic: true,
    });
    let current = binderFixture();
    const api = mockApi(
      ownRoutes({
        'GET /api/v1/binders': () => ok([current]),
        'GET /api/v1/binders/{id}': () => ok(current),
        'POST /api/v1/binders/{id}/publish': () => {
          current = published;
          return ok(published);
        },
        'POST /api/v1/binders/{id}/unpublish': () => {
          current = binderFixture();
          return ok(current);
        },
      })
    );
    renderWithProviders(<BinderScreen />, { port: port() });
    fireEvent.press(await screen.findByTestId('binder-publish'));
    fireEvent.press(await screen.findByTestId('binder-publish-ONE_DAY'));
    expect(await screen.findByText('“Trade binder” is public for 24 hours.')).toBeOnTheScreen();
    expect(api.callsTo('POST /api/v1/binders/{id}/publish')[0]?.body).toEqual({ mode: 'ONE_DAY' });
    expect(await screen.findByTestId('binder-public-page')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('binder-public-page'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/binders/[id]',
      params: { id: BINDER_ID, view: 'public' },
    });
    fireEvent.press(screen.getByTestId('binder-unpublish'));
    expect(await screen.findByText('“Trade binder” is private now.')).toBeOnTheScreen();
  });

  it('confirms a stale binder', async () => {
    const api = mockApi(
      ownRoutes({
        'GET /api/v1/binders': ok([
          binderFixture({
            freshness: {
              state: 'STALE',
              confirmedAt: '2026-08-01T00:00:00Z',
              updatedAt: '2026-08-01T00:00:00Z',
              label: 'Updated 2 months ago',
            },
          }),
        ]),
        'GET /api/v1/binders/{id}': ok(
          binderFixture({
            freshness: {
              state: 'STALE',
              confirmedAt: '2026-08-01T00:00:00Z',
              updatedAt: '2026-08-01T00:00:00Z',
              label: 'Updated 2 months ago',
            },
          })
        ),
        'POST /api/v1/binders/{id}/confirm': ok(binderFixture()),
      })
    );
    renderWithProviders(<BinderScreen />, { port: port() });
    fireEvent.press(await screen.findByTestId('binder-confirm'));
    expect(
      await screen.findByText('“Trade binder” and its cards are confirmed as still available.')
    ).toBeOnTheScreen();
    expect(api.callsTo('POST /api/v1/binders/{id}/confirm')).toHaveLength(1);
  });

  it('removes a card from the binder (it becomes unfiled)', async () => {
    const api = mockApi(ownRoutes({ 'PATCH /api/v1/inventory/items/{id}': ok(itemFixture()) }));
    renderWithProviders(<BinderScreen />, { port: port() });
    fireEvent.press(await screen.findByTestId(`binder-remove-${ITEM_ID}`));
    expect(
      await screen.findByText('Emberfang Fox VMAX removed from “Trade binder”. It is unfiled now.')
    ).toBeOnTheScreen();
    expect(api.callsTo('PATCH /api/v1/inventory/items/{id}')[0]?.body).toEqual({ binderId: null });
  });

  it('adds other cards to the binder in one move', async () => {
    const api = mockApi(
      ownRoutes({
        'GET /api/v1/inventory/items': ok(inventoryPage([FILED, OTHER])),
        'POST /api/v1/inventory/items/bulk': ok({ updated: 1, skipped: [] }),
      })
    );
    renderWithProviders(<BinderScreen />, { port: port() });
    fireEvent.press(await screen.findByTestId('binder-add-cards'));
    const sheet = await screen.findByTestId('add-items-sheet');
    // Cards already in this binder are not offered.
    expect(await within(sheet).findByTestId('add-items-item-2')).toBeOnTheScreen();
    expect(within(sheet).queryByTestId(`add-items-${ITEM_ID}`)).toBeNull();
    expect(within(sheet).getByTestId('add-items-submit')).toBeDisabled();
    fireEvent.press(within(sheet).getByTestId('add-items-item-2'));
    fireEvent.press(within(sheet).getByTestId('add-items-submit'));
    expect(await screen.findByText('1 card added to “Trade binder”.')).toBeOnTheScreen();
    expect(api.callsTo('POST /api/v1/inventory/items/bulk')[0]?.body).toEqual({
      action: 'MOVE_TO_BINDER',
      binderId: BINDER_ID,
      itemIds: ['item-2'],
    });
  });

  it('offers a new card for the binder', async () => {
    mockApi(ownRoutes({ 'GET /api/v1/inventory/items': ok(inventoryPage([FILED])) }));
    renderWithProviders(<BinderScreen />, { port: port() });
    fireEvent.press(await screen.findByTestId('binder-add-cards'));
    expect(await screen.findByTestId('add-items-empty')).toHaveTextContent(
      /already in this binder/
    );
    fireEvent.press(screen.getByTestId('add-items-new-card'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/items/new',
      params: { binderId: BINDER_ID },
    });
  });

  it('deletes the binder after a confirmation', async () => {
    const api = mockApi(ownRoutes({ 'DELETE /api/v1/binders/{id}': noContent }));
    renderWithProviders(<BinderScreen />, { port: port() });
    fireEvent.press(await screen.findByTestId('binder-delete'));
    expect(
      await screen.findByText(/Its 1 card stay in your inventory as unfiled cards/)
    ).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('binder-delete-dialog-confirm'));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(api.callsTo('DELETE /api/v1/binders/{id}')).toHaveLength(1);
  });

  it('explains an empty binder and an item error', async () => {
    mockApi(ownRoutes({ 'GET /api/v1/binders/{id}/items': ok(inventoryPage([])) }));
    const { unmount } = renderWithProviders(<BinderScreen />, { port: port() });
    expect(await screen.findByText('This binder is empty')).toBeOnTheScreen();
    unmount();
    mockApi(
      ownRoutes({ 'GET /api/v1/binders/{id}/items': problem(500, 'INTERNAL_ERROR', 'boom') })
    );
    renderWithProviders(<BinderScreen />, { port: port() });
    expect(await screen.findByText('The cards could not load')).toBeOnTheScreen();
  });
});

describe('Public binder', () => {
  beforeEach(() => {
    mockParams.current = { id: 'pub-1' };
  });

  function publicRoutes(extra = {}) {
    return signedInRoutes({
      'GET /api/v1/public/binders/{id}': ok(publicBinderFixture({ id: 'pub-1' })),
      'GET /api/v1/public/binders/{id}/items': ok({
        items: [publicItemFixture()],
        page: 0,
        size: 24,
        totalItems: 1,
        totalPages: 1,
      }),
      ...extra,
    });
  }

  it('shows someone else’s binder: owner state and public cards only, never a distance', async () => {
    const api = mockApi(publicRoutes());
    renderWithProviders(<BinderScreen />, { port: port() });
    expect(await screen.findByTestId('public-binder-title')).toHaveTextContent(
      'Yu-Gi-Oh! trade binder'
    );
    expect(screen.getByTestId('public-binder-owner-area')).toHaveTextContent('Quebec, Canada');
    expect(screen.queryByText(/km/)).toBeNull();
    expect(await screen.findByText('Azure-Eyes Sky Dragon')).toBeOnTheScreen();
    expect(screen.getByText('“Pack fresh.”')).toBeOnTheScreen();
    // No owner actions, no coordinates.
    expect(screen.queryByTestId('binder-publish')).toBeNull();
    expect(screen.queryByText(/-?\d{1,3}\.\d{3,}/)).toBeNull();
    fireEvent.press(screen.getByTestId('public-binder-owner'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/collectors/[id]',
      params: { id: 'collector1' },
    });
    fireEvent.press(screen.getByTestId('public-binder-availability'));
    fireEvent.press(await screen.findByTestId('public-binder-availability-option-SALE'));
    await waitFor(() =>
      expect(
        api.callsTo('GET /api/v1/public/binders/{id}/items').at(-1)?.query.get('availability')
      ).toBe('SALE')
    );
  });

  it('reports the owner and makes an offer on a card of someone else’s binder', async () => {
    mockApi(publicRoutes());
    renderWithProviders(<BinderScreen />, { port: port() });
    fireEvent.press(await screen.findByTestId('public-binder-report'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/report',
      params: {
        userId: '00000000-0000-4000-8000-000000000001',
        name: 'Collector One',
        handle: 'collector1',
        source: 'BINDER',
        binderId: 'pub-1',
      },
    });
    const item = publicItemFixture();
    fireEvent.press(await screen.findByTestId(`make-offer-${item.id}`));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/offers/new',
      params: { item: item.id },
    });
  });

  it('opens the owner’s own binder as the public sees it', async () => {
    mockParams.current = { id: BINDER_ID, view: 'public' };
    mockApi(publicRoutes());
    renderWithProviders(<BinderScreen />, { port: port() });
    expect(await screen.findByTestId('public-binder-title')).toBeOnTheScreen();
    expect(screen.queryByTestId('binder-title')).toBeNull();
  });

  it('says when a binder is not public', async () => {
    mockApi(
      publicRoutes({ 'GET /api/v1/public/binders/{id}': problem(404, 'NOT_FOUND', 'Not found') })
    );
    renderWithProviders(<BinderScreen />, { port: port() });
    expect(await screen.findByText('This binder is not available')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('public-binder-not-found-action'));
    expect(mockRouter.navigate).toHaveBeenCalledWith('/');
  });

  it('explains the daily binder views limit', async () => {
    mockApi(
      publicRoutes({
        'GET /api/v1/public/binders/{id}': problem(429, 'LIMIT_REACHED', 'Limit', {
          limitKey: 'binder.views.per_day',
          limit: 30,
          used: 30,
          resetsAt: '2099-01-01T00:00:00Z',
          planCode: 'FREE',
        }),
      })
    );
    renderWithProviders(<BinderScreen />, { port: port() });
    expect(await screen.findByText("You reached today's binder views")).toBeOnTheScreen();
    expect(screen.getByText(/You have used 30 of 30 public binder views today/)).toBeOnTheScreen();
  });

  it('shows an error with retry', async () => {
    mockApi(
      publicRoutes({
        'GET /api/v1/public/binders/{id}': [
          problem(500, 'INTERNAL_ERROR', 'boom'),
          ok(publicBinderFixture({ id: 'pub-1' })),
        ],
      })
    );
    renderWithProviders(<BinderScreen />, { port: port() });
    fireEvent.press(await screen.findByTestId('public-binder-error-retry'));
    expect(await screen.findByTestId('public-binder-title')).toBeOnTheScreen();
  });
});

describe('Binder form', () => {
  it('creates a binder and opens it', async () => {
    const api = mockApi(
      signedInRoutes({
        'POST /api/v1/binders': ok(binderFixture({ id: 'b-new', name: 'Holos' }), 201),
      })
    );
    renderWithProviders(<NewBinderScreen />, { port: port() });
    expect(
      screen.getByText('New binders are private. Fill them first, then publish when you are ready.')
    ).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('binder-save'));
    expect(await screen.findByText('Give your binder a name.')).toBeOnTheScreen();
    expect(api.callsTo('POST /api/v1/binders')).toHaveLength(0);

    fireEvent.changeText(screen.getByTestId('binder-name'), '  Holos ');
    fireEvent.press(screen.getByTestId('binder-kind-SALE'));
    fireEvent.press(screen.getByTestId('binder-save'));
    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith({
        pathname: '/binders/[id]',
        params: { id: 'b-new' },
      })
    );
    expect(api.callsTo('POST /api/v1/binders')[0]?.body).toEqual({ name: 'Holos', kind: 'SALE' });
    expect(await screen.findByText('Binder “Holos” created.')).toBeOnTheScreen();
  });

  it('explains the binders limit of the plan', async () => {
    mockApi(
      signedInRoutes({
        'POST /api/v1/binders': problem(429, 'LIMIT_REACHED', 'Limit reached', {
          limitKey: 'binders.max',
          limit: 5,
          used: 5,
          planCode: 'FREE',
        }),
      })
    );
    renderWithProviders(<NewBinderScreen />, { port: port() });
    fireEvent.changeText(screen.getByTestId('binder-name'), 'Sixth');
    fireEvent.press(screen.getByTestId('binder-save'));
    expect(
      await screen.findByText('You reached the number of binders your plan allows')
    ).toBeOnTheScreen();
    expect(screen.getByTestId('binder-limit-message')).toHaveTextContent(
      /^You have used 5 of 5 binders on the Free plan\. Delete a binder/
    );
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('renames a binder', async () => {
    mockParams.current = { id: BINDER_ID };
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/binders/{id}': ok(binderFixture()),
        'PATCH /api/v1/binders/{id}': ok(binderFixture({ name: 'Trades 2026' })),
      })
    );
    renderWithProviders(<EditBinderScreen />, { port: port() });
    const name = await screen.findByTestId('binder-name');
    expect(name.props.value).toBe('Trade binder');
    fireEvent.changeText(name, 'Trades 2026');
    fireEvent.press(screen.getByTestId('binder-save'));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(api.callsTo('PATCH /api/v1/binders/{id}')[0]?.body).toEqual({
      name: 'Trades 2026',
      kind: 'TRADE',
      description: 'Duplicates for trade.',
    });
  });

  it('shows a server error and a missing binder', async () => {
    mockParams.current = { id: BINDER_ID };
    mockApi(
      signedInRoutes({
        'GET /api/v1/binders/{id}': ok(binderFixture()),
        'PATCH /api/v1/binders/{id}': problem(500, 'INTERNAL_ERROR', 'boom'),
      })
    );
    const { unmount } = renderWithProviders(<EditBinderScreen />, { port: port() });
    fireEvent.press(await screen.findByTestId('binder-save'));
    expect(await screen.findByTestId('binder-error')).toBeOnTheScreen();
    unmount();

    mockApi(
      signedInRoutes({
        'GET /api/v1/binders': ok([]),
        'GET /api/v1/binders/{id}': problem(404, 'NOT_FOUND', 'Not found'),
      })
    );
    renderWithProviders(<EditBinderScreen />, { port: port() });
    expect(await screen.findByText('Binder not found')).toBeOnTheScreen();
  });
});
