import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';

import InventoryScreen from '@/app/(tabs)/inventory';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import {
  binderFixture,
  BINDER_ID,
  inventoryPage,
  ITEM_ID,
  itemFixture,
  listingStatusFixture,
  summaryFixture,
} from '../support/fixtures';
import { mockApi, ok, problem } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { mockParams, mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());

beforeEach(() => {
  resetRouterMock();
  resetAppState();
});

function render() {
  return renderWithProviders(<InventoryScreen />, { port: new FakeAuthPort(testUser()) });
}

const STALE = itemFixture({
  id: 'stale-1',
  card: { id: 'c2', name: 'Tidal Otterling', game: 'pokemon' },
  visibility: 'PUBLIC',
  freshness: {
    state: 'STALE',
    confirmedAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
    label: 'Updated 2 months ago',
  },
});

describe('Inventory tab', () => {
  it('shows a skeleton, then the cards with totals, and opens a card', async () => {
    mockApi(signedInRoutes());
    render();
    expect(screen.getByTestId('inventory-loading')).toBeOnTheScreen();
    const row = await screen.findByTestId(`item-${ITEM_ID}`);
    expect(within(row).getByText('Emberfang Fox VMAX')).toBeOnTheScreen();
    expect(within(row).getByText('×2')).toBeOnTheScreen();
    expect(within(row).getByText('Trade or sale')).toBeOnTheScreen();
    expect(within(row).getByText('Offers')).toBeOnTheScreen();
    expect(within(row).getByText('Private')).toBeOnTheScreen();
    expect(await screen.findByTestId('inventory-summary-totals')).toHaveTextContent(
      '1 card · 2 copies · 0 public now'
    );
    fireEvent.press(screen.getByRole('button', { name: /^Emberfang Fox VMAX, SVX-001/ }));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/items/[id]',
      params: { id: ITEM_ID },
    });
  });

  it('starts the add flow', async () => {
    mockApi(signedInRoutes());
    render();
    fireEvent.press(screen.getByTestId('inventory-add-card'));
    expect(mockRouter.push).toHaveBeenCalledWith('/items/new');
  });

  it('filters by binder, game and intent, sorts and searches', async () => {
    const api = mockApi(signedInRoutes());
    render();
    await screen.findByTestId(`item-${ITEM_ID}`);
    const last = () =>
      Object.fromEntries(api.callsTo('GET /api/v1/inventory/items').at(-1)?.query ?? []);

    fireEvent.press(screen.getByTestId('inventory-filter-binder'));
    fireEvent.press(await screen.findByTestId(`inventory-filter-binder-option-${BINDER_ID}`));
    await waitFor(() => expect(last().binderId).toBe(BINDER_ID));
    expect(screen.getByTestId('inventory-open-binder')).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId('inventory-filter-game'));
    fireEvent.press(await screen.findByTestId('inventory-filter-game-option-pokemon'));
    fireEvent.press(screen.getByTestId('inventory-filter-intent'));
    fireEvent.press(await screen.findByTestId('inventory-filter-intent-option-SALE'));
    fireEvent.press(screen.getByTestId('inventory-filter-visibility'));
    fireEvent.press(await screen.findByTestId('inventory-filter-visibility-option-PUBLIC'));
    fireEvent.press(screen.getByTestId('inventory-sort'));
    fireEvent.press(await screen.findByTestId('inventory-sort-option-price-asc'));
    fireEvent.changeText(screen.getByTestId('inventory-search'), 'fox');
    await waitFor(() =>
      expect(last()).toEqual({
        query: 'fox',
        game: 'pokemon',
        availability: 'SALE',
        visibility: 'PUBLIC',
        binderId: BINDER_ID,
        sort: 'price',
        direction: 'asc',
        page: '0',
        size: '24',
      })
    );

    fireEvent.press(screen.getByTestId('inventory-filter-binder'));
    fireEvent.press(await screen.findByTestId('inventory-filter-binder-option-unfiled'));
    await waitFor(() => expect(last().unfiled).toBe('true'));
    expect(screen.getByRole('button', { name: 'Binder: Unfiled' })).toBeOnTheScreen();
  });

  it('explains an empty inventory and an empty filter', async () => {
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/inventory/items': ok(inventoryPage([])),
        'GET /api/v1/inventory/summary': ok(summaryFixture({ totalItems: 0, totalQuantity: 0 })),
      })
    );
    render();
    expect(await screen.findByText('Your inventory is empty')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('inventory-empty-action'));
    expect(mockRouter.push).toHaveBeenCalledWith('/items/new');

    fireEvent.changeText(screen.getByTestId('inventory-search'), 'nothing');
    expect(await screen.findByText('No cards match')).toBeOnTheScreen();
    expect(api.callsTo('GET /api/v1/inventory/items').at(-1)?.query.get('query')).toBe('nothing');
    fireEvent.press(screen.getByTestId('inventory-empty-filtered-action'));
    // Back to the unfiltered list (from the cache), with an empty search field.
    expect(await screen.findByText('Your inventory is empty')).toBeOnTheScreen();
    expect(screen.getByTestId('inventory-search').props.value).toBe('');
  });

  it('selects cards and runs bulk actions (visibility, availability, move, delete)', async () => {
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/inventory/items': ok(inventoryPage([itemFixture(), STALE])),
        'GET /api/v1/inventory/summary': ok(summaryFixture({ totalItems: 2 })),
        'POST /api/v1/inventory/items/bulk': ({ body }) =>
          ok({
            updated: (body as { itemIds: string[] }).itemIds.length,
            skipped: [],
          }),
      })
    );
    render();
    await screen.findByTestId(`item-${ITEM_ID}`);
    expect(screen.queryByTestId('bulk-bar')).toBeNull();
    fireEvent.press(screen.getByTestId('inventory-select'));
    // Rows toggle their selection instead of opening the editor.
    fireEvent.press(screen.getByRole('checkbox', { name: /^Emberfang Fox VMAX, SVX-001/ }));
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(await screen.findByTestId('bulk-count')).toHaveTextContent('1 selected');
    fireEvent.press(screen.getByTestId('bulk-select-all'));
    expect(screen.getByTestId('bulk-count')).toHaveTextContent('2 selected');

    fireEvent.press(screen.getByTestId('bulk-visibility'));
    fireEvent.press(await screen.findByTestId('bulk-visibility-TEMPORARILY_PUBLIC'));
    fireEvent.press(await screen.findByTestId('bulk-duration-24h'));
    expect(await screen.findByTestId('snackbar')).toHaveTextContent(
      '2 cards are now public for 24 hours.'
    );
    const first = api.callsTo('POST /api/v1/inventory/items/bulk')[0]?.body as {
      action: string;
      itemIds: string[];
      visibility: string;
      publicUntil: string;
    };
    expect(first.action).toBe('SET_VISIBILITY');
    expect(first.visibility).toBe('TEMPORARILY_PUBLIC');
    expect(first.itemIds).toEqual([ITEM_ID, 'stale-1']);
    expect(first.publicUntil).toMatch(/^\d{4}-/);

    fireEvent.press(screen.getByTestId('bulk-availability'));
    fireEvent.press(await screen.findByTestId('bulk-availability-SALE'));
    await waitFor(() =>
      expect(api.callsTo('POST /api/v1/inventory/items/bulk').at(-1)?.body).toEqual({
        action: 'SET_AVAILABILITY',
        availability: 'SALE',
        itemIds: [ITEM_ID, 'stale-1'],
      })
    );
    fireEvent.press(screen.getByTestId('bulk-move'));
    fireEvent.press(await screen.findByTestId(`bulk-binder-${BINDER_ID}`));
    await waitFor(() =>
      expect(api.callsTo('POST /api/v1/inventory/items/bulk').at(-1)?.body).toEqual({
        action: 'MOVE_TO_BINDER',
        binderId: BINDER_ID,
        itemIds: [ITEM_ID, 'stale-1'],
      })
    );
    expect(await screen.findByTestId('snackbar')).toHaveTextContent(
      '2 cards moved to “Trade binder”.'
    );

    // Delete asks first, then clears the selection.
    fireEvent.press(screen.getByTestId('bulk-delete'));
    expect(await screen.findByText('Delete 2 cards?')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('bulk-delete-dialog-confirm'));
    await waitFor(() =>
      expect(api.callsTo('POST /api/v1/inventory/items/bulk').at(-1)?.body).toEqual({
        action: 'DELETE',
        itemIds: [ITEM_ID, 'stale-1'],
      })
    );
    await waitFor(() => expect(screen.queryByTestId('bulk-bar')).toBeNull());
    fireEvent.press(screen.getByTestId('inventory-select'));
    expect(screen.queryByTestId('item-stale-1-checkbox')).toBeNull();
  });

  it('reorders the binders with the arrows and saves the order', async () => {
    const second = binderFixture({ id: 'b-2', name: 'Sale binder', sortOrder: 1 });
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/binders': ok([binderFixture(), second]),
        'PUT /api/v1/binders/reorder': ok([second, binderFixture()]),
      })
    );
    mockParams.current = { view: 'binders' };
    render();
    fireEvent.press(await screen.findByTestId('binders-reorder'));
    const sheet = await screen.findByTestId('reorder-binders');
    expect(within(sheet).getByTestId('reorder-save')).toBeDisabled();
    fireEvent.press(within(sheet).getByTestId('reorder-b-2-up'));
    fireEvent.press(within(sheet).getByTestId('reorder-save'));
    expect(await screen.findByTestId('snackbar')).toHaveTextContent('Binder order saved.');
    expect(api.callsTo('PUT /api/v1/binders/reorder')[0]?.body).toEqual({
      binderIds: ['b-2', BINDER_ID],
    });
  });

  it('shows stale cards and confirms them all', async () => {
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/inventory/items': (request) =>
          ok(
            request.query.get('freshness') === 'STALE'
              ? inventoryPage([STALE])
              : request.query.get('freshness') === 'HIDDEN'
                ? inventoryPage([])
                : inventoryPage([itemFixture(), STALE])
          ),
        'GET /api/v1/inventory/summary': ok(summaryFixture({ totalItems: 2, staleCount: 1 })),
        'POST /api/v1/inventory/items/bulk': ok({ updated: 1, skipped: [] }),
      })
    );
    render();
    const row = await screen.findByTestId('item-stale-1');
    expect(within(row).getByLabelText('Freshness: Stale')).toBeOnTheScreen();
    expect(await screen.findByTestId('inventory-needs-confirmation')).toHaveTextContent(
      /1 card needs a confirmation/
    );
    fireEvent.press(screen.getByTestId('inventory-confirm-all'));
    expect(await screen.findByText('1 card confirmed as still available.')).toBeOnTheScreen();
    expect(api.callsTo('POST /api/v1/inventory/items/bulk')[0]?.body).toEqual({
      action: 'CONFIRM',
      itemIds: ['stale-1'],
    });
  });

  it('shows paused listings and resumes them after a confirmation', async () => {
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/me/listings/status': ok(
          listingStatusFixture({
            paused: true,
            canResume: true,
            strikes: 3,
            source: 'UNRESPONSIVE',
          })
        ),
        'POST /api/v1/me/listings/resume': ok(listingStatusFixture()),
      })
    );
    render();
    expect(await screen.findByText('Your public listings are paused')).toBeOnTheScreen();
    expect(screen.getByText(/3 conversations are waiting for your answer/)).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('listings-resume'));
    fireEvent.press(await screen.findByTestId('listings-resume-dialog-confirm'));
    expect(await screen.findByText('Your public listings are visible again.')).toBeOnTheScreen();
    expect(api.callsTo('POST /api/v1/me/listings/resume')).toHaveLength(1);
    await waitFor(() => expect(screen.queryByTestId('listings-paused')).not.toBeOnTheScreen());
  });

  it('explains a moderation pause and warns about strikes', async () => {
    mockApi(
      signedInRoutes({
        'GET /api/v1/me/listings/status': ok(
          listingStatusFixture({
            paused: true,
            source: 'MODERATION',
            pausedUntil: '2026-10-20T00:00:00Z',
          })
        ),
      })
    );
    const { unmount } = render();
    expect(
      await screen.findByText(/moderation team is reviewing your account until 2026-10-20/)
    ).toBeOnTheScreen();
    expect(screen.queryByTestId('listings-resume')).toBeNull();
    unmount();

    mockApi(
      signedInRoutes({
        'GET /api/v1/me/listings/status': ok(listingStatusFixture({ strikes: 1 })),
      })
    );
    render();
    expect(await screen.findByTestId('listings-strikes')).toHaveTextContent(
      /1 conversation waiting for your answer/
    );
  });

  it('shows an error with retry', async () => {
    mockApi(
      signedInRoutes({
        'GET /api/v1/inventory/items': [
          problem(500, 'INTERNAL_ERROR', 'boom'),
          ok(inventoryPage([itemFixture()])),
        ],
      })
    );
    render();
    expect(await screen.findByText('Your cards could not load')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('inventory-error-retry'));
    expect(await screen.findByTestId(`item-${ITEM_ID}`)).toBeOnTheScreen();
  });

  it('lists binders, opens one, creates one and explains an empty list', async () => {
    mockApi(
      signedInRoutes({
        'GET /api/v1/binders': ok([
          binderFixture(),
          binderFixture({
            id: 'b-2',
            name: 'Holo binder',
            kind: 'SALE',
            visibility: 'PUBLIC',
            effectivePublic: false,
            itemCount: 4,
            publicItemCount: 0,
          }),
        ]),
      })
    );
    const { unmount } = render();
    fireEvent.press(screen.getByTestId('inventory-view-binders'));
    expect(await screen.findByText('Trade binder')).toBeOnTheScreen();
    expect(screen.getByText(/For sale · 4 cards · 0 public/)).toBeOnTheScreen();
    expect(screen.getByText('Public · not visible')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('link', { name: /^Trade binder/ }));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/binders/[id]',
      params: { id: BINDER_ID },
    });
    fireEvent.press(screen.getByTestId('inventory-new-binder'));
    expect(mockRouter.push).toHaveBeenCalledWith('/binders/new');
    unmount();

    mockParams.current = { view: 'binders' };
    mockApi(signedInRoutes({ 'GET /api/v1/binders': ok([]) }));
    render();
    expect(await screen.findByText('No binders yet')).toBeOnTheScreen();
  });

  it('shows a binder list error with retry', async () => {
    mockParams.current = { view: 'binders' };
    mockApi(
      signedInRoutes({
        'GET /api/v1/binders': [problem(500, 'INTERNAL_ERROR', 'boom'), ok([binderFixture()])],
      })
    );
    render();
    expect(await screen.findByText('Your binders could not load')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('binders-error-retry'));
    expect(await screen.findByText('Trade binder')).toBeOnTheScreen();
  });
});
