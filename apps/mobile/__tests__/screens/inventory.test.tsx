import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';

import InventoryScreen from '@/app/(tabs)/inventory';
import { useInventoryUiStore } from '@/src/features/inventory/inventoryUiStore';
import { lightPalette } from '@/src/theme';

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
  useInventoryUiStore.setState({ lastSavedId: null, failedPhotos: {} });
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

const TEXT_PRICE = itemFixture({
  id: 'text-1',
  card: { id: 'c3', name: 'Ash Blossom & Joyous Spring', game: 'yugioh' },
  askingPrice: null,
  askingPriceText: '85% TCG',
  condition: '',
  conditionStated: false,
  quantity: 1,
});

const NO_PRICE = itemFixture({
  id: 'none-1',
  card: { id: 'c4', name: 'Called by the Grave', game: 'yugioh' },
  askingPrice: null,
  askingPriceText: null,
  quantity: 4,
});

describe('Inventory (screen 1)', () => {
  it('shows a skeleton, then only the picture, name, code, price and copies of each card', async () => {
    mockApi(
      signedInRoutes({
        'GET /api/v1/inventory/items': ok(inventoryPage([itemFixture(), TEXT_PRICE, NO_PRICE])),
        'GET /api/v1/inventory/summary': ok(
          summaryFixture({
            totalItems: 20,
            totalQuantity: 31,
            byVisibility: { PRIVATE: 3, PUBLIC: 16, TEMPORARILY_PUBLIC: 1 },
          })
        ),
      })
    );
    render();
    expect(screen.getByTestId('inventory-loading')).toBeOnTheScreen();
    const row = await screen.findByTestId(`item-${ITEM_ID}`);
    expect(row).toHaveTextContent(/Emberfang Fox VMAX/);
    expect(row).toHaveTextContent(/SVX-001/);
    // A card priced before R2 shows its amount; the copies after a ×.
    expect(within(row).getByTestId(`item-${ITEM_ID}-price`)).toHaveTextContent('$40.00');
    expect(row).toHaveTextContent(/×2$/);
    // Nothing else: no set name, condition, intent, offers or visibility.
    expect(row).not.toHaveTextContent(/Stellar Vortex|Near Mint|NM|Trade or sale|Offers|Private/);

    // The price exactly as typed; nothing at all without one.
    expect(screen.getByTestId('item-text-1-price')).toHaveTextContent('85% TCG');
    expect(screen.queryByTestId('item-none-1-price')).toBeNull();
    expect(screen.getByTestId('item-none-1')).toHaveTextContent(/×4$/);

    expect(
      screen.getByRole('button', {
        name: /^Ash Blossom & Joyous Spring, SVX-001, 85% TCG, 1 copy$/,
      })
    ).toBeOnTheScreen();
    expect(await screen.findByTestId('inventory-summary-totals')).toHaveTextContent(
      '20 cards · 31 copies · 17 public'
    );
    // The header and the switch.
    expect(screen.getByRole('header', { name: 'Inventory' })).toBeOnTheScreen();
    expect(screen.getByTestId('notification-bell-inventory')).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Cards, 20' })).toBeSelected();
    expect(screen.getByRole('tab', { name: 'Binders, 1' })).toBeOnTheScreen();
    // No sponsored row in the inventory (stage F1: no ads).
    expect(screen.queryByText(/Sponsored/i)).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: /^Emberfang Fox VMAX, SVX-001/ }));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/items/[id]',
      params: { id: ITEM_ID },
    });
  });

  it('opens Add cards from the header and from an empty inventory', async () => {
    mockApi(
      signedInRoutes({
        'GET /api/v1/inventory/items': ok(inventoryPage([])),
        'GET /api/v1/inventory/summary': ok(summaryFixture({ totalItems: 0, totalQuantity: 0 })),
      })
    );
    render();
    fireEvent.press(screen.getByRole('button', { name: 'Add cards' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/items/new');
    expect(await screen.findByText('Your inventory is empty')).toBeOnTheScreen();
    // Nothing to select yet.
    expect(screen.queryByTestId('inventory-select')).toBeNull();
    fireEvent.press(screen.getByTestId('inventory-empty-action'));
    expect(mockRouter.push).toHaveBeenCalledTimes(2);
  });

  it('rings the card saved last while the tab is on screen (screen 8)', async () => {
    useInventoryUiStore.setState({ lastSavedId: 'text-1' });
    mockApi(
      signedInRoutes({
        'GET /api/v1/inventory/items': ok(inventoryPage([itemFixture(), TEXT_PRICE])),
      })
    );
    render();
    expect(await screen.findByTestId('item-text-1')).toHaveStyle({
      borderColor: lightPalette.primary,
    });
    expect(screen.getByTestId(`item-${ITEM_ID}`)).toHaveStyle({ borderColor: lightPalette.border });

    // In Select mode the orange ring means "selected": the saved card is not ringed there.
    fireEvent.press(screen.getByTestId('inventory-select'));
    expect(screen.getByTestId('item-text-1')).toHaveStyle({ borderColor: lightPalette.border });
    fireEvent.press(screen.getByTestId(`item-${ITEM_ID}`));
    expect(screen.getByTestId(`item-${ITEM_ID}`)).toHaveStyle({
      borderColor: lightPalette.primary,
    });
    expect(screen.getByTestId('item-text-1')).toHaveStyle({ borderColor: lightPalette.border });
  });

  it('filters and sorts in the sheet, counting the cards before they are shown (screen 2)', async () => {
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/inventory/items': (request) =>
          ok(
            request.query.get('size') === '1'
              ? inventoryPage([itemFixture()], 0, 9, request.query.get('game') ? 9 : 20)
              : inventoryPage([itemFixture()])
          ),
        'GET /api/v1/inventory/summary': ok(
          summaryFixture({ totalItems: 20, byGame: { yugioh: 12, pokemon: 8 } })
        ),
        'GET /api/v1/binders': ok([
          binderFixture({ id: 'b-z', name: 'Staples' }),
          binderFixture({ id: 'b-a', name: 'For trade' }),
        ]),
      })
    );
    render();
    await screen.findByTestId(`item-${ITEM_ID}`);
    const lists = () =>
      api
        .callsTo('GET /api/v1/inventory/items')
        .filter((call) => call.query.get('size') !== '1')
        .map((call) => Object.fromEntries(call.query));
    // Recently added by default.
    expect(lists()[0]).toEqual({ sort: 'created', page: '0', size: '24' });
    expect(screen.getByRole('button', { name: 'Filter and sort' })).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId('inventory-filters-open'));
    const sheet = await screen.findByTestId('inventory-filters');
    expect(within(sheet).getByText('Filter and sort')).toBeOnTheScreen();
    // The games the collector owns, in the catalogue's order; the binders by name.
    const games = within(sheet).getByTestId('filter-game-group');
    expect(
      within(games)
        .getAllByRole('radio')
        .map((chip) => chip.props.accessibilityLabel)
    ).toEqual(['All games', 'Pokémon', 'Yu-Gi-Oh!']);
    const binders = within(sheet).getByTestId('filter-binder-group');
    expect(
      within(binders)
        .getAllByRole('radio')
        .map((chip) => chip.props.accessibilityLabel)
    ).toEqual(['All cards', 'No binder', 'For trade', 'Staples']);
    expect(await within(sheet).findByText('Show 20 cards')).toBeOnTheScreen();

    fireEvent.press(within(sheet).getByTestId('filter-game-yugioh'));
    expect(await within(sheet).findByText('Show 9 cards')).toBeOnTheScreen();
    fireEvent.press(within(sheet).getByTestId('filter-sort-price'));
    fireEvent.press(within(sheet).getByTestId('filter-binder-unfiled'));
    fireEvent.press(within(sheet).getByTestId('filter-visibility-PUBLIC'));
    // Nothing applies before "Show".
    expect(lists()).toHaveLength(1);
    fireEvent.press(within(sheet).getByTestId('inventory-filters-show'));
    await waitFor(() =>
      expect(lists().at(-1)).toEqual({
        game: 'yugioh',
        unfiled: 'true',
        markedPublic: 'true',
        sort: 'price',
        page: '0',
        size: '24',
      })
    );
    expect(screen.getByTestId('inventory-filters-count')).toHaveTextContent('3');
    expect(screen.getByRole('button', { name: 'Filter and sort, 3 filters on' })).toBeOnTheScreen();

    // The search stays when the filters are cleared.
    fireEvent.changeText(screen.getByTestId('inventory-search'), 'fox');
    await waitFor(() => expect(lists().at(-1)?.query).toBe('fox'));
    fireEvent.press(screen.getByTestId('inventory-filters-open'));
    fireEvent.press(await screen.findByTestId('inventory-filters-clear'));
    fireEvent.press(screen.getByTestId('inventory-filters-show'));
    await waitFor(() =>
      expect(lists().at(-1)).toEqual({ query: 'fox', sort: 'created', page: '0', size: '24' })
    );
    expect(screen.queryByTestId('inventory-filters-count')).toBeNull();
  });

  it('explains an empty search and clears it', async () => {
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/inventory/items': (request) =>
          ok(inventoryPage(request.query.get('query') ? [] : [itemFixture()])),
      })
    );
    render();
    await screen.findByTestId(`item-${ITEM_ID}`);
    fireEvent.changeText(screen.getByTestId('inventory-search'), 'nothing');
    expect(await screen.findByText('No cards match')).toBeOnTheScreen();
    expect(api.callsTo('GET /api/v1/inventory/items').at(-1)?.query.get('query')).toBe('nothing');
    fireEvent.press(screen.getByTestId('inventory-empty-filtered-action'));
    expect(await screen.findByTestId(`item-${ITEM_ID}`)).toBeOnTheScreen();
    expect(screen.getByTestId('inventory-search').props.value).toBe('');
  });

  it('runs the bulk actions of Select mode, and undoes a bulk delete', async () => {
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/inventory/items': ok(inventoryPage([itemFixture(), STALE])),
        'GET /api/v1/inventory/summary': ok(summaryFixture({ totalItems: 2 })),
        'POST /api/v1/inventory/items/bulk': ({ body }) =>
          ok({
            updated: (body as { itemIds: string[] }).itemIds.length,
            skipped: [],
          }),
        [`POST /api/v1/inventory/items/${ITEM_ID}/restore`]: ok(itemFixture()),
        'POST /api/v1/inventory/items/stale-1/restore': ok(STALE),
      })
    );
    render();
    await screen.findByTestId(`item-${ITEM_ID}`);
    expect(screen.queryByTestId('bulk-bar')).toBeNull();
    fireEvent.press(screen.getByTestId('inventory-select'));
    // Rows toggle their selection instead of opening Edit card.
    fireEvent.press(screen.getByRole('checkbox', { name: /^Emberfang Fox VMAX, SVX-001/ }));
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(await screen.findByTestId('bulk-count')).toHaveTextContent('1 selected');
    fireEvent.press(screen.getByTestId('bulk-select-all'));
    expect(screen.getByTestId('bulk-count')).toHaveTextContent('2 selected');
    // The actions that still make sense; availability and a temporary publication are gone.
    const bar = screen.getByTestId('bulk-bar');
    expect(
      within(bar)
        .getAllByRole('button')
        .map((button) => button.props.accessibilityLabel)
    ).toEqual([
      'Clear selection',
      'Move to binder',
      'Make public',
      'Make private',
      'Still available',
      'Delete',
    ]);

    const bulk = () => api.callsTo('POST /api/v1/inventory/items/bulk').at(-1)?.body;
    fireEvent.press(screen.getByTestId('bulk-visibility-PUBLIC'));
    expect(await screen.findByTestId('snackbar')).toHaveTextContent('2 cards are now public.');
    expect(bulk()).toEqual({
      action: 'SET_VISIBILITY',
      visibility: 'PUBLIC',
      itemIds: [ITEM_ID, 'stale-1'],
    });
    fireEvent.press(screen.getByTestId('bulk-visibility-PRIVATE'));
    await waitFor(() =>
      expect(bulk()).toEqual({
        action: 'SET_VISIBILITY',
        visibility: 'PRIVATE',
        itemIds: [ITEM_ID, 'stale-1'],
      })
    );
    fireEvent.press(screen.getByTestId('bulk-confirm'));
    await waitFor(() =>
      expect(bulk()).toEqual({ action: 'CONFIRM', itemIds: [ITEM_ID, 'stale-1'] })
    );
    fireEvent.press(screen.getByTestId('bulk-move'));
    fireEvent.press(await screen.findByTestId(`bulk-binder-${BINDER_ID}`));
    await waitFor(() =>
      expect(bulk()).toEqual({
        action: 'MOVE_TO_BINDER',
        binderId: BINDER_ID,
        itemIds: [ITEM_ID, 'stale-1'],
      })
    );

    // Delete asks in a sheet, then offers Undo.
    fireEvent.press(screen.getByTestId('bulk-delete'));
    expect(await screen.findByText('Delete 2 cards?')).toBeOnTheScreen();
    expect(
      screen.getByText('They leave your inventory and any binder. Their photos are deleted too.')
    ).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('bulk-delete-sheet-confirm'));
    await waitFor(() =>
      expect(bulk()).toEqual({ action: 'DELETE', itemIds: [ITEM_ID, 'stale-1'] })
    );
    expect(await screen.findByTestId('snackbar')).toHaveTextContent(/2 cards deleted/);
    await waitFor(() => expect(screen.queryByTestId('bulk-bar')).toBeNull());
    fireEvent.press(screen.getByTestId('snackbar-undo'));
    expect(await screen.findByText('2 cards restored')).toBeOnTheScreen();
    expect(api.callsTo(`POST /api/v1/inventory/items/${ITEM_ID}/restore`)).toHaveLength(1);
    expect(api.callsTo('POST /api/v1/inventory/items/stale-1/restore')).toHaveLength(1);
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
});

describe('Inventory › Binders (kept until stage R3)', () => {
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

describe('Undo of a bulk delete that fails', () => {
  it('says the card can no longer be restored', async () => {
    mockApi(
      signedInRoutes({
        'GET /api/v1/inventory/items': ok(inventoryPage([itemFixture()])),
        'POST /api/v1/inventory/items/bulk': ok({ updated: 1, skipped: [] }),
        [`POST /api/v1/inventory/items/${ITEM_ID}/restore`]: problem(
          409,
          'RESTORE_WINDOW_CLOSED',
          'This card can no longer be restored'
        ),
      })
    );
    render();
    await screen.findByTestId(`item-${ITEM_ID}`);
    fireEvent.press(screen.getByTestId('inventory-select'));
    fireEvent.press(screen.getByRole('checkbox', { name: /^Emberfang Fox VMAX/ }));
    fireEvent.press(await screen.findByTestId('bulk-delete'));
    fireEvent.press(await screen.findByTestId('bulk-delete-sheet-confirm'));
    await act(async () => {
      fireEvent.press(await screen.findByTestId('snackbar-undo'));
    });
    expect(await screen.findByText('This card can no longer be restored.')).toBeOnTheScreen();
  });

  it('says a full inventory as the plain limit of stage F1, with nothing to buy', async () => {
    mockApi(
      signedInRoutes({
        'GET /api/v1/inventory/items': ok(inventoryPage([itemFixture()])),
        'POST /api/v1/inventory/items/bulk': ok({ updated: 1, skipped: [] }),
        [`POST /api/v1/inventory/items/${ITEM_ID}/restore`]: problem(
          429,
          'LIMIT_REACHED',
          'Limit reached',
          { limitKey: 'inventory.items.max', limit: 100, used: 100 }
        ),
      })
    );
    render();
    await screen.findByTestId(`item-${ITEM_ID}`);
    fireEvent.press(screen.getByTestId('inventory-select'));
    fireEvent.press(screen.getByRole('checkbox', { name: /^Emberfang Fox VMAX/ }));
    fireEvent.press(await screen.findByTestId('bulk-delete'));
    fireEvent.press(await screen.findByTestId('bulk-delete-sheet-confirm'));
    await act(async () => {
      fireEvent.press(await screen.findByTestId('snackbar-undo'));
    });
    expect(await screen.findByText('You have used 100 of 100 inventory cards.')).toBeOnTheScreen();
    expect(screen.queryByText(/Premium|plan|upgrade/i)).toBeNull();
  });
});
