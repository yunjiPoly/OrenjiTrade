import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import {
  useBinderItems,
  useCreateBinder,
  useDeleteBinder,
  useMyBinders,
  usePublicBinder,
  usePublicBinderItems,
  usePublishBinder,
} from '@/src/api/hooks/binders';
import {
  EMPTY_CARD_SEARCH,
  nextPage,
  useCard,
  useCardSearch,
  useCardSuggestions,
  useSets,
} from '@/src/api/hooks/catalog';
import {
  staleItemIds,
  useBulkInventory,
  useConfirmAllStale,
  useCreateInventoryItem,
  useDeleteInventoryItem,
  useInventoryItem,
  useInventoryItems,
  useResumeListings,
} from '@/src/api/hooks/inventory';
import { meKeys } from '@/src/api/queryKeys';
import { DEFAULT_INVENTORY_FILTERS } from '@/src/lib/inventoryFilters';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import {
  binderFixture,
  BINDER_ID,
  cardDetailFixture,
  cardPage,
  cardSummaryFixture,
  inventoryPage,
  ITEM_ID,
  itemFixture,
  listingStatusFixture,
  publicBinderFixture,
  publicItemFixture,
  SETS,
} from '../support/fixtures';
import { mockApi, noContent, ok } from '../support/mockApi';
import { signedInRoutes } from '../support/routes';
import { createTestQueryClient, resetAppState, TestProviders } from '../test-utils';

beforeEach(() => resetAppState());

function setup() {
  const queryClient = createTestQueryClient();
  const port = new FakeAuthPort(testUser());
  const wrapper = ({ children }: { children: ReactNode }) => (
    <TestProviders queryClient={queryClient} port={port}>
      {children}
    </TestProviders>
  );
  return { queryClient, wrapper };
}

describe('catalog hooks', () => {
  it('pages through GET /cards with the filters', async () => {
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/cards': [
          ok(cardPage([cardSummaryFixture()], 0, 2, 2)),
          ok(cardPage([cardSummaryFixture({ id: 'c2', slug: 'c2' })], 1, 2, 2)),
        ],
      })
    );
    const { wrapper } = setup();
    const { result } = renderHook(
      () => useCardSearch({ ...EMPTY_CARD_SEARCH, q: 'fox', game: 'pokemon', set: 'SVX' }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(1));
    expect(result.current.hasNextPage).toBe(true);
    const first = api.callsTo('GET /api/v1/cards')[0];
    expect(Object.fromEntries(first?.query ?? [])).toEqual({
      query: 'fox',
      game: 'pokemon',
      set: 'SVX',
      page: '0',
      size: '24',
    });
    await act(async () => {
      await result.current.fetchNextPage();
    });
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(result.current.hasNextPage).toBe(false);
    expect(api.callsTo('GET /api/v1/cards')[1]?.query.get('page')).toBe('1');
  });

  it('knows the next page', () => {
    expect(nextPage({ page: 0, totalPages: 2, items: [1] })).toBe(1);
    expect(nextPage({ page: 1, totalPages: 2, items: [1] })).toBeUndefined();
    expect(nextPage({ page: 0, totalPages: 3, items: [] })).toBeUndefined();
    expect(nextPage({})).toBeUndefined();
  });

  it('suggests only from two letters, loads a card and the sets of a game', async () => {
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/cards/suggest': ok([
          { kind: 'CARD', id: 'c1', name: 'Fox' },
          { kind: 'CARD', id: 'c1', name: 'Fox' },
        ]),
        'GET /api/v1/cards/{id}': ok(cardDetailFixture()),
        'GET /api/v1/sets': ok({ items: SETS, page: 0, size: 100, totalItems: 2, totalPages: 1 }),
      })
    );
    const { wrapper } = setup();
    const short = renderHook(() => useCardSuggestions('f'), { wrapper });
    expect(short.result.current.fetchStatus).toBe('idle');
    const suggest = renderHook(() => useCardSuggestions('fox'), { wrapper });
    await waitFor(() => expect(suggest.result.current.data).toHaveLength(1));
    expect(api.callsTo('GET /api/v1/cards/suggest')[0]?.query.get('q')).toBe('fox');

    const card = renderHook(() => useCard('card-1'), { wrapper });
    await waitFor(() => expect(card.result.current.data?.name).toBe('Emberfang Fox VMAX'));

    const sets = renderHook(() => useSets('pokemon'), { wrapper });
    await waitFor(() => expect(sets.result.current.data).toEqual(SETS));
    expect(api.callsTo('GET /api/v1/sets')[0]?.query.get('size')).toBe('100');
    expect(renderHook(() => useSets(null), { wrapper }).result.current.fetchStatus).toBe('idle');
  });
});

describe('inventory hooks', () => {
  it('lists items for the filters and shows an item from the list at once', async () => {
    const api = mockApi(signedInRoutes());
    const { wrapper } = setup();
    const list = renderHook(
      () => useInventoryItems({ ...DEFAULT_INVENTORY_FILTERS, binder: 'unfiled', sort: 'name' }),
      { wrapper }
    );
    await waitFor(() => expect(list.result.current.data?.pages[0]?.items).toHaveLength(1));
    const query = api.callsTo('GET /api/v1/inventory/items')[0]?.query;
    expect(query?.get('unfiled')).toBe('true');
    expect(query?.get('sort')).toBe('name');
    expect(api.callsTo('GET /api/v1/inventory/items')[0]?.headers.get('Authorization')).toMatch(
      /^Bearer token-/
    );

    api.use({
      'GET /api/v1/inventory/items/{id}': () =>
        new Promise((resolve) => setTimeout(() => resolve(ok(itemFixture({ quantity: 9 }))), 50)),
    });
    const item = renderHook(() => useInventoryItem(ITEM_ID), { wrapper });
    // Placeholder from the cached list while the item itself loads, then the item.
    expect(item.result.current.data?.quantity).toBe(2);
    expect(item.result.current.isPlaceholderData).toBe(true);
    await waitFor(() => expect(item.result.current.data?.quantity).toBe(9));
  });

  it('creates, deletes and moves items, refreshing inventory and binders', async () => {
    const api = mockApi(
      signedInRoutes({
        'POST /api/v1/inventory/items': ok(itemFixture(), 201),
        'DELETE /api/v1/inventory/items/{id}': noContent,
        'POST /api/v1/inventory/items/bulk': ok({ updated: 1, skipped: [] }),
      })
    );
    const { wrapper, queryClient } = setup();
    const binders = renderHook(() => useMyBinders(), { wrapper });
    await waitFor(() => expect(binders.result.current.data).toHaveLength(1));

    const create = renderHook(() => useCreateInventoryItem(), { wrapper });
    await act(async () => {
      await create.result.current.mutateAsync({ printingId: 'p-1', quantity: 1 });
    });
    expect(api.callsTo('POST /api/v1/inventory/items')[0]?.body).toEqual({
      printingId: 'p-1',
      quantity: 1,
    });
    // The binder list was refreshed (item counts change).
    await waitFor(() => expect(api.callsTo('GET /api/v1/binders')).toHaveLength(2));

    const remove = renderHook(() => useDeleteInventoryItem(), { wrapper });
    queryClient.setQueryData(meKeys.inventoryItem('uid-maika', ITEM_ID), itemFixture());
    await act(async () => {
      await remove.result.current.mutateAsync(ITEM_ID);
    });
    expect(api.callsTo('DELETE /api/v1/inventory/items/{id}')[0]?.path).toBe(
      `/api/v1/inventory/items/${ITEM_ID}`
    );
    // The deleted item is not refetched (it would answer 404 while its screen closes).
    expect(api.callsTo('GET /api/v1/inventory/items/{id}')).toHaveLength(0);

    const bulk = renderHook(() => useBulkInventory(), { wrapper });
    await act(async () => {
      await bulk.result.current.mutateAsync({
        action: 'MOVE_TO_BINDER',
        binderId: BINDER_ID,
        itemIds: [ITEM_ID],
      });
    });
    expect(api.callsTo('POST /api/v1/inventory/items/bulk')[0]?.body).toEqual({
      action: 'MOVE_TO_BINDER',
      binderId: BINDER_ID,
      itemIds: [ITEM_ID],
    });
  });

  it('confirms every stale and hidden item at once', async () => {
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/inventory/items': (request) =>
          ok(
            request.query.get('freshness') === 'STALE'
              ? inventoryPage([itemFixture({ id: 'stale-1' })])
              : inventoryPage([itemFixture({ id: 'hidden-1' })])
          ),
        'POST /api/v1/inventory/items/bulk': ok({ updated: 2, skipped: [] }),
      })
    );
    const { wrapper } = setup();
    await renderHook(() => useMyBinders(), { wrapper }); // signs the session in
    await waitFor(() => expect(api.callsTo('GET /api/v1/binders')).toHaveLength(1));
    expect(await staleItemIds()).toEqual(['stale-1', 'hidden-1']);
    const confirmAll = renderHook(() => useConfirmAllStale(), { wrapper });
    await act(async () => {
      await confirmAll.result.current.mutateAsync();
    });
    expect(api.callsTo('POST /api/v1/inventory/items/bulk')[0]?.body).toEqual({
      action: 'CONFIRM',
      itemIds: ['stale-1', 'hidden-1'],
    });
  });

  it('resumes paused listings', async () => {
    mockApi(
      signedInRoutes({
        'POST /api/v1/me/listings/resume': ok(listingStatusFixture({ paused: false })),
      })
    );
    const { wrapper, queryClient } = setup();
    const resume = renderHook(() => useResumeListings(), { wrapper });
    await act(async () => {
      await resume.result.current.mutateAsync();
    });
    expect(queryClient.getQueryData(meKeys.listingStatus('uid-maika'))).toMatchObject({
      paused: false,
    });
  });
});

describe('binder hooks', () => {
  it('creates, publishes and deletes binders', async () => {
    const api = mockApi(
      signedInRoutes({
        'POST /api/v1/binders': ok(binderFixture({ id: 'b-new', name: 'New' }), 201),
        'POST /api/v1/binders/{id}/publish': ok(
          binderFixture({ visibility: 'PUBLIC', effectivePublic: true })
        ),
        'DELETE /api/v1/binders/{id}': noContent,
        'GET /api/v1/binders/{id}/items': ok(inventoryPage([itemFixture()])),
      })
    );
    const { wrapper, queryClient } = setup();
    const binders = renderHook(() => useMyBinders(), { wrapper });
    await waitFor(() => expect(binders.result.current.data).toHaveLength(1));

    const create = renderHook(() => useCreateBinder(), { wrapper });
    await act(async () => {
      await create.result.current.mutateAsync({ name: 'New', kind: 'TRADE' });
    });
    expect(api.callsTo('POST /api/v1/binders')[0]?.body).toEqual({ name: 'New', kind: 'TRADE' });

    const publish = renderHook(() => usePublishBinder(), { wrapper });
    await act(async () => {
      await publish.result.current.mutateAsync({ id: BINDER_ID, mode: 'ONE_DAY' });
    });
    expect(api.callsTo('POST /api/v1/binders/{id}/publish')[0]?.body).toEqual({ mode: 'ONE_DAY' });
    expect(queryClient.getQueryData(meKeys.binder('uid-maika', BINDER_ID))).toMatchObject({
      visibility: 'PUBLIC',
    });

    const items = renderHook(() => useBinderItems(BINDER_ID, ' fox '), { wrapper });
    await waitFor(() => expect(items.result.current.data?.pages[0]?.items).toHaveLength(1));
    expect(api.callsTo('GET /api/v1/binders/{id}/items')[0]?.query.get('query')).toBe('fox');

    const remove = renderHook(() => useDeleteBinder(), { wrapper });
    const before = api.callsTo('GET /api/v1/binders/{id}/items').length;
    await act(async () => {
      await remove.result.current.mutateAsync(BINDER_ID);
    });
    expect(api.callsTo('DELETE /api/v1/binders/{id}')[0]?.query.get('deleteItems')).toBe('false');
    // The deleted binder's items are not refetched.
    expect(api.callsTo('GET /api/v1/binders/{id}/items')).toHaveLength(before);
  });

  it('reads public binders with the token when signed in', async () => {
    const api = mockApi(
      signedInRoutes({
        'GET /api/v1/public/binders/{id}': ok(publicBinderFixture()),
        'GET /api/v1/public/binders/{id}/items': ok({
          items: [publicItemFixture()],
          page: 0,
          size: 24,
          totalItems: 1,
          totalPages: 1,
        }),
      })
    );
    const { wrapper } = setup();
    const binder = renderHook(() => usePublicBinder(BINDER_ID), { wrapper });
    await waitFor(() => expect(binder.result.current.data?.owner.handle).toBe('collector1'));
    expect(api.callsTo('GET /api/v1/public/binders/{id}')[0]?.headers.get('Authorization')).toMatch(
      /^Bearer /
    );
    const items = renderHook(
      () => usePublicBinderItems(BINDER_ID, { q: '', availability: 'SALE', game: null }),
      { wrapper }
    );
    await waitFor(() => expect(items.result.current.data?.pages[0]?.items).toHaveLength(1));
    expect(api.callsTo('GET /api/v1/public/binders/{id}/items')[0]?.query.get('availability')).toBe(
      'SALE'
    );
  });
});
