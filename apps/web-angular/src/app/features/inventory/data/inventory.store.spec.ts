import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import {
  BinderResponse,
  BindersService,
  InventoryItemResponse,
  InventoryService,
  InventorySummaryResponse,
  PrivacySettings,
  SettingsService,
} from '@orenji/api-client';
import { Subject, of, throwError } from 'rxjs';
import { ApiError } from '../../../core/http/api-error';
import { parseInventoryParams } from './inventory-params';
import { InventoryStore, RESTORE_MAX_WAITS } from './inventory.store';

function problem(status: number, body: Record<string, unknown>): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: { status, message: 'x', ...body } });
}

function item(id: string, overrides: Partial<InventoryItemResponse> = {}): InventoryItemResponse {
  return {
    id,
    printing: { id: 'p1' },
    card: { id: 'c1', name: `Card ${id}`, game: 'yugioh' },
    quantity: 1,
    condition: 'NEAR_MINT',
    language: 'en',
    edition: 'FIRST_EDITION',
    finish: 'NORMAL',
    currency: 'CAD',
    availability: 'TRADE' as InventoryItemResponse['availability'],
    acceptsOffers: false,
    notes: '',
    publicNotes: '',
    visibility: 'PRIVATE' as InventoryItemResponse['visibility'],
    effectivePublic: false,
    freshness: {
      state: 'ACTIVE' as InventoryItemResponse['freshness']['state'],
      confirmedAt: '',
      updatedAt: '',
      label: 'Updated just now',
    },
    images: [],
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

function binder(id: string, itemCount: number): BinderResponse {
  return {
    id,
    name: `Binder ${id}`,
    description: '',
    kind: 'TRADE' as BinderResponse['kind'],
    visibility: 'PRIVATE' as BinderResponse['visibility'],
    sortOrder: 0,
    itemCount,
    publicItemCount: 0,
    effectivePublic: false,
    games: [],
    freshness: item('x').freshness,
    createdAt: '',
    updatedAt: '',
  };
}

const summary: InventorySummaryResponse = {
  totalItems: 5,
  totalQuantity: 7,
  byVisibility: { PRIVATE: 5, PUBLIC: 0, TEMPORARILY_PUBLIC: 0 },
  byGame: {},
  agingCount: 0,
  staleCount: 1,
  hiddenCount: 1,
  effectivePublicCount: 0,
};

describe('InventoryStore', () => {
  let store: InventoryStore;
  let inventory: Record<string, ReturnType<typeof vi.fn>>;
  let binders: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    inventory = {
      listInventoryItems: vi.fn(() =>
        of({ items: [item('a'), item('b')], page: 0, size: 24, totalItems: 2, totalPages: 1 }),
      ),
      getInventorySummary: vi.fn(() => of(summary)),
      updateInventoryItem: vi.fn(() => of(item('a', { quantity: 3 }))),
      bulkUpdateInventoryItems: vi.fn(() => of({ updated: 2, skipped: [] })),
    };
    binders = {
      listMyBinders: vi.fn(() => of([binder('b1', 2), binder('b2', 1)])),
      reorderBinders: vi.fn(() => throwError(() => new HttpErrorResponse({ status: 500 }))),
    };
    TestBed.configureTestingModule({
      providers: [
        InventoryStore,
        { provide: InventoryService, useValue: inventory },
        { provide: BindersService, useValue: binders },
        {
          provide: SettingsService,
          useValue: {
            getPrivacySettings: vi.fn(() =>
              of({ discoverable: false, profileVisibility: 'MEMBERS' } as PrivacySettings),
            ),
          },
        },
      ],
    });
    store = TestBed.inject(InventoryStore);
  });

  it('loads the context and derives the unfiled count and owner visibility', () => {
    store.loadContext();
    expect(store.binders()?.length).toBe(2);
    expect(store.summary()?.totalItems).toBe(5);
    expect(store.unfiledCount()).toBe(2);
    expect(store.ownerVisible()).toBe(false);
  });

  it('lists items for the URL state and keeps the selection only for the same view', () => {
    store.loadItems(parseInventoryParams({ binder: 'unfiled', q: 'fox' }));
    expect(inventory['listInventoryItems']).toHaveBeenCalledWith(
      expect.objectContaining({ unfiled: true, query: 'fox' }),
      'body',
      false,
      expect.anything(),
    );
    expect(store.items().map((entry) => entry.id)).toEqual(['a', 'b']);

    store.toggleAll();
    expect(store.allSelected()).toBe(true);
    store.reloadItems();
    expect(store.selectedCount()).toBe(2);
    store.loadItems(parseInventoryParams({}));
    expect(store.selectedCount()).toBe(0);
  });

  it('updates a quantity in place', async () => {
    store.loadItems(parseInventoryParams({}));
    await store.setQuantity(store.items()[0], 3);
    expect(store.items()[0].quantity).toBe(3);
    expect(store.busyItems().size).toBe(0);
  });

  it('saves an inline edit with confirm: true, only the changed field (spec 9.4, M8)', async () => {
    store.loadItems(parseInventoryParams({}));
    await store.setPrice(store.items()[0], '$12.50');
    expect(inventory['updateInventoryItem']).toHaveBeenLastCalledWith(
      { id: 'a', updateInventoryItemRequest: { askingPriceText: '$12.50', confirm: true } },
      'body',
      false,
      expect.anything(),
    );
    await store.setVisibility(store.items()[0], 'PUBLIC');
    expect(inventory['updateInventoryItem']).toHaveBeenLastCalledWith(
      { id: 'a', updateInventoryItemRequest: { visibility: 'PUBLIC', confirm: true } },
      'body',
      false,
      expect.anything(),
    );
  });

  it("moves a temporarily public card to a binder with its stored visibility (F4)", async () => {
    const until = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const card = item('t', {
      visibility: 'TEMPORARILY_PUBLIC' as InventoryItemResponse['visibility'],
      publicUntil: until,
    });
    await store.setBinder(card, 'b2');
    expect(inventory['updateInventoryItem']).toHaveBeenLastCalledWith(
      {
        id: 't',
        updateInventoryItemRequest: {
          binderId: 'b2',
          visibility: 'TEMPORARILY_PUBLIC',
          confirm: true,
        },
      },
      'body',
      false,
      expect.anything(),
    );
  });

  describe('Undo of a delete (F1: one restore per card, paced against the per-minute limit)', () => {
    let sleeps: number[];
    const sleep = (ms: number) => {
      sleeps.push(ms);
      return Promise.resolve();
    };

    beforeEach(() => {
      sleeps = [];
    });

    it('waits out a 429 in the middle and restores every card', async () => {
      let calls = 0;
      inventory['restoreInventoryItem'] = vi.fn(({ id }: { id: string }) => {
        calls++;
        return calls === 3
          ? throwError(() => problem(429, { errorCode: 'RATE_LIMITED', retryAfterSeconds: 7 }))
          : of(item(id));
      });
      const waits: number[] = [];
      const outcome = await store.restoreItems(['1', '2', '3', '4', '5', '6'], {
        sleep,
        onWait: (seconds) => waits.push(seconds),
      });
      expect(outcome.restored.sort()).toEqual(['1', '2', '3', '4', '5', '6']);
      expect(outcome.gone).toEqual([]);
      expect(outcome.waiting).toEqual([]);
      expect(sleeps).toEqual([7000]);
      expect(waits).toEqual([7]);
      expect(inventory['restoreInventoryItem']).toHaveBeenCalledTimes(7);
    });

    it('sends at most four restores at once', async () => {
      let open = 0;
      let most = 0;
      inventory['restoreInventoryItem'] = vi.fn(({ id }: { id: string }) => {
        const answer = new Subject<InventoryItemResponse>();
        open++;
        most = Math.max(most, open);
        setTimeout(() => {
          open--;
          answer.next(item(id));
          answer.complete();
        });
        return answer;
      });
      const outcome = await store.restoreItems(['1', '2', '3', '4', '5', '6', '7', '8', '9']);
      expect(outcome.restored.length).toBe(9);
      expect(most).toBe(4);
    });

    it('hands back the cards still waiting after the last pause, with the server\'s delay', async () => {
      inventory['restoreInventoryItem'] = vi.fn(({ id }: { id: string }) =>
        id === '1'
          ? of(item(id))
          : throwError(() => problem(429, { errorCode: 'RATE_LIMITED', retryAfterSeconds: 40 })),
      );
      const outcome = await store.restoreItems(['1', '2', '3'], { sleep });
      expect(outcome.restored).toEqual(['1']);
      expect(outcome.waiting.sort()).toEqual(['2', '3']);
      expect(outcome.retryAfterSeconds).toBe(40);
      expect(sleeps.length).toBe(RESTORE_MAX_WAITS);
    });

    it('says which cards are past the 10 minutes and which may still come back', async () => {
      inventory['restoreInventoryItem'] = vi.fn(({ id }: { id: string }) =>
        id === 'old'
          ? throwError(() => problem(409, { errorCode: 'RESTORE_WINDOW_CLOSED' }))
          : id === 'offline'
            ? throwError(() => new HttpErrorResponse({ status: 0 }))
            : of(item(id)),
      );
      const outcome = await store.restoreItems(['ok', 'old', 'offline'], { sleep });
      expect(outcome).toEqual({
        restored: ['ok'],
        gone: ['old'],
        waiting: ['offline'],
        retryAfterSeconds: null,
      });
      expect(sleeps).toEqual([]);
    });
  });

  it('confirms every stale and hidden item through one bulk call', async () => {
    inventory['listInventoryItems'].mockImplementation((params: { freshness?: string }) =>
      of({
        items: params.freshness === 'STALE' ? [item('s1')] : [item('h1')],
        totalPages: 1,
      }),
    );
    const response = await store.confirmAllStale();
    expect(response.updated).toBe(2);
    expect(inventory['bulkUpdateInventoryItems']).toHaveBeenCalledWith(
      { bulkInventoryRequest: { itemIds: ['s1', 'h1'], action: 'CONFIRM' } },
      'body',
      false,
      expect.anything(),
    );
  });

  it('reorders right away and reloads the server order when saving fails', async () => {
    store.loadBinders();
    const saving = store.reorderBinders(['b2', 'b1']);
    expect(store.binders()?.map((entry) => entry.id)).toEqual(['b2', 'b1']);
    await expect(saving).rejects.toBeInstanceOf(ApiError);
    expect(store.binders()?.map((entry) => entry.id)).toEqual(['b1', 'b2']);
  });

  it('saves quick successive moves one after the other and keeps the latest order', async () => {
    const calls: string[][] = [];
    binders['reorderBinders'].mockImplementation(
      (params: { reorderBindersRequest: { binderIds: string[] } }) => {
        calls.push(params.reorderBindersRequest.binderIds);
        const order = params.reorderBindersRequest.binderIds;
        return of(order.map((id) => binder(id, 0)));
      },
    );
    store.loadBinders();
    const first = store.reorderBinders(['b2', 'b1']);
    const second = store.reorderBinders(['b1', 'b2']);
    await Promise.all([first, second]);
    expect(calls).toEqual([
      ['b2', 'b1'],
      ['b1', 'b2'],
    ]);
    expect(store.binders()?.map((entry) => entry.id)).toEqual(['b1', 'b2']);
  });

  it('deletes a binder only after the order saves still in flight', async () => {
    const pending = new Subject<BinderResponse[]>();
    const calls: string[] = [];
    binders['reorderBinders'].mockImplementation(() => {
      calls.push('reorder');
      return pending;
    });
    binders['deleteBinder'] = vi.fn(() => {
      calls.push('delete');
      return of(undefined);
    });
    store.loadBinders();
    const saving = store.reorderBinders(['b2', 'b1']);
    const deleting = store.deleteBinder('b1');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toEqual(['reorder']);

    pending.next([binder('b2', 0), binder('b1', 0)]);
    pending.complete();
    await Promise.all([saving, deleting]);
    expect(calls).toEqual(['reorder', 'delete']);
  });
});
