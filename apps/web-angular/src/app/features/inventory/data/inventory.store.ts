import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import {
  BinderResponse,
  BindersService,
  BulkInventoryResponse,
  CreateBinderRequest,
  CreateInventoryItemRequest,
  InventoryItemResponse,
  InventoryService,
  InventorySummaryResponse,
  PageResponseInventoryItemResponse,
  PrivacySettings,
  PublishBinderRequest,
  SettingsService,
  UpdateBinderRequest,
  UpdateInventoryItemRequest,
} from '@orenji/api-client';
import { Observable, Subscription, firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { silentErrors } from '../../../core/http/http-context';
import { PublishMode } from '../../../shared/inventory/inventory-labels';
import { BulkAction, toBulkRequest } from './bulk-actions';
import { InventoryParams, toListRequest } from './inventory-params';
import { ownerIsVisible } from './visibility-status';

/** Cards confirmed at once by "Confirm all" (the bulk endpoint takes at most 500 ids). */
const CONFIRM_ALL_MAX = 500;
const CONFIRM_ALL_PAGE = 100;

/**
 * State and API calls of `/inventory` (provided by the page, shared with its dialogs through the
 * page injector). Reads keep signals (`binders`, `summary`, `page`, `privacy`); writes return
 * promises that reject with {@link ApiError} so the calling screen can explain failures, and
 * refresh the affected state on success. Requests are silent: screens show their own messages
 * (the global limit-reached dialog still opens on 429 LIMIT_REACHED).
 */
@Injectable()
export class InventoryStore {
  private readonly inventoryApi = inject(InventoryService);
  private readonly bindersApi = inject(BindersService);
  private readonly settingsApi = inject(SettingsService);

  private readonly bindersState = signal<BinderResponse[] | null>(null);
  private readonly bindersErrorState = signal<ApiError | null>(null);
  private readonly summaryState = signal<InventorySummaryResponse | null>(null);
  private readonly privacyState = signal<PrivacySettings | null>(null);
  private readonly pageState = signal<PageResponseInventoryItemResponse | null>(null);
  private readonly itemsLoadingState = signal(true);
  private readonly itemsErrorState = signal<ApiError | null>(null);
  private readonly selectionState = signal<ReadonlySet<string>>(new Set());
  private readonly busyItemsState = signal<ReadonlySet<string>>(new Set());

  readonly binders = this.bindersState.asReadonly();
  readonly bindersError = this.bindersErrorState.asReadonly();
  readonly summary = this.summaryState.asReadonly();
  readonly privacy = this.privacyState.asReadonly();
  readonly page = this.pageState.asReadonly();
  readonly itemsLoading = this.itemsLoadingState.asReadonly();
  readonly itemsError = this.itemsErrorState.asReadonly();
  readonly selection = this.selectionState.asReadonly();
  /** Items with a quick edit (quantity) in flight. */
  readonly busyItems = this.busyItemsState.asReadonly();

  readonly items = computed<InventoryItemResponse[]>(() => this.pageState()?.items ?? []);
  readonly ownerVisible = computed(() => ownerIsVisible(this.privacyState()));
  readonly bindersById = computed(
    () => new Map((this.bindersState() ?? []).map((binder) => [binder.id, binder])),
  );
  /** Items in no binder (every item minus the binders' counts). */
  readonly unfiledCount = computed(() => {
    const summary = this.summaryState();
    const binders = this.bindersState();
    if (!summary || !binders) {
      return null;
    }
    const filed = binders.reduce((total, binder) => total + binder.itemCount, 0);
    return Math.max(0, summary.totalItems - filed);
  });
  readonly selectedCount = computed(() => this.selectionState().size);
  readonly allSelected = computed(() => {
    const items = this.items();
    const selection = this.selectionState();
    return items.length > 0 && items.every((item) => selection.has(item.id));
  });

  private params: InventoryParams | null = null;
  private itemsSubscription: Subscription | null = null;
  private bindersSubscription: Subscription | null = null;
  private summarySubscription: Subscription | null = null;
  private privacySubscription: Subscription | null = null;
  /** Binder order saves, chained. */
  private orderSaves: Promise<void> = Promise.resolve();
  private orderTicket = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.itemsSubscription?.unsubscribe();
      this.bindersSubscription?.unsubscribe();
      this.summarySubscription?.unsubscribe();
      this.privacySubscription?.unsubscribe();
    });
  }

  // --- reads -------------------------------------------------------------------------------

  /** Loads the binders, summary and privacy settings (the items follow the URL). */
  loadContext(): void {
    this.loadBinders();
    this.loadSummary();
    this.privacySubscription?.unsubscribe();
    this.privacySubscription = this.settingsApi
      .getPrivacySettings('body', false, { context: silentErrors() })
      .subscribe({ next: (privacy) => this.privacyState.set(privacy), error: () => undefined });
  }

  loadBinders(): void {
    this.bindersErrorState.set(null);
    this.bindersSubscription?.unsubscribe();
    this.bindersSubscription = this.bindersApi
      .listMyBinders('body', false, { context: silentErrors() })
      .subscribe({
        next: (binders) => this.bindersState.set(binders ?? []),
        error: (error: unknown) => this.bindersErrorState.set(toApiError(error)),
      });
  }

  loadSummary(): void {
    this.summarySubscription?.unsubscribe();
    this.summarySubscription = this.inventoryApi
      .getInventorySummary('body', false, { context: silentErrors() })
      .subscribe({ next: (summary) => this.summaryState.set(summary), error: () => undefined });
  }

  /** Lists the items for `params` (the previous request is cancelled). Clears the selection. */
  loadItems(params: InventoryParams): void {
    const changed = JSON.stringify(params) !== JSON.stringify(this.params);
    this.params = params;
    if (changed) {
      this.clearSelection();
    }
    this.itemsSubscription?.unsubscribe();
    this.itemsLoadingState.set(true);
    this.itemsErrorState.set(null);
    this.itemsSubscription = this.inventoryApi
      .listInventoryItems(toListRequest(params), 'body', false, { context: silentErrors() })
      .subscribe({
        next: (page) => {
          this.pageState.set(page);
          this.itemsLoadingState.set(false);
          this.pruneSelection();
        },
        error: (error: unknown) => {
          this.itemsErrorState.set(toApiError(error));
          this.itemsLoadingState.set(false);
        },
      });
  }

  /** Reloads the items of the current view. */
  reloadItems(): void {
    if (this.params) {
      this.loadItems(this.params);
    }
  }

  /** Reloads everything a write may have changed. */
  refresh(options: { binders?: boolean } = {}): void {
    this.reloadItems();
    this.loadSummary();
    if (options.binders !== false) {
      this.loadBinders();
    }
  }

  // --- selection ---------------------------------------------------------------------------

  toggleSelection(id: string, selected?: boolean): void {
    const next = new Set(this.selectionState());
    const add = selected ?? !next.has(id);
    if (add) {
      next.add(id);
    } else {
      next.delete(id);
    }
    this.selectionState.set(next);
  }

  toggleAll(): void {
    this.selectionState.set(
      this.allSelected() ? new Set() : new Set(this.items().map((item) => item.id)),
    );
  }

  clearSelection(): void {
    if (this.selectionState().size > 0) {
      this.selectionState.set(new Set());
    }
  }

  private pruneSelection(): void {
    const ids = new Set(this.items().map((item) => item.id));
    const kept = [...this.selectionState()].filter((id) => ids.has(id));
    if (kept.length !== this.selectionState().size) {
      this.selectionState.set(new Set(kept));
    }
  }

  // --- item writes -------------------------------------------------------------------------

  async createItem(request: CreateInventoryItemRequest): Promise<InventoryItemResponse> {
    const item = await this.call(
      this.inventoryApi.createInventoryItem(
        { createInventoryItemRequest: request },
        'body',
        false,
        {
          context: silentErrors(),
        },
      ),
    );
    this.refresh();
    return item;
  }

  async updateItem(
    id: string,
    request: UpdateInventoryItemRequest,
  ): Promise<InventoryItemResponse> {
    const item = await this.call(
      this.inventoryApi.updateInventoryItem(
        { id, updateInventoryItemRequest: request },
        'body',
        false,
        { context: silentErrors() },
      ),
    );
    this.replaceItem(item);
    this.refresh({ binders: 'binderId' in request || 'visibility' in request });
    return item;
  }

  /** Quantity stepper: updates in place without reloading the list. */
  async setQuantity(item: InventoryItemResponse, quantity: number): Promise<void> {
    this.markBusy(item.id, true);
    try {
      const updated = await this.call(
        this.inventoryApi.updateInventoryItem(
          { id: item.id, updateInventoryItemRequest: { quantity } },
          'body',
          false,
          { context: silentErrors() },
        ),
      );
      this.replaceItem(updated);
      this.loadSummary();
    } finally {
      this.markBusy(item.id, false);
    }
  }

  async confirmItem(id: string): Promise<InventoryItemResponse> {
    const item = await this.call(
      this.inventoryApi.confirmInventoryItem({ id }, 'body', false, { context: silentErrors() }),
    );
    this.replaceItem(item);
    this.refresh();
    return item;
  }

  async deleteItem(id: string): Promise<void> {
    await this.call(
      this.inventoryApi.deleteInventoryItem({ id }, 'body', false, { context: silentErrors() }),
    );
    this.toggleSelection(id, false);
    this.refresh();
  }

  async uploadImage(id: string, file: Blob): Promise<InventoryItemResponse> {
    const item = await this.call(
      this.inventoryApi.uploadInventoryItemImage({ id, file }, 'body', false, {
        context: silentErrors(),
      }),
    );
    this.replaceItem(item);
    return item;
  }

  async deleteImage(id: string, imageId: string): Promise<void> {
    await this.call(
      this.inventoryApi.deleteInventoryItemImage({ id, imageId }, 'body', false, {
        context: silentErrors(),
      }),
    );
    this.reloadItems();
  }

  async bulk(action: BulkAction, itemIds: readonly string[]): Promise<BulkInventoryResponse> {
    const response = await this.call(
      this.inventoryApi.bulkUpdateInventoryItems(
        { bulkInventoryRequest: toBulkRequest(action, itemIds) },
        'body',
        false,
        { context: silentErrors() },
      ),
    );
    if (action.kind === 'delete') {
      this.clearSelection();
    }
    this.refresh({ binders: action.kind !== 'availability' });
    return response;
  }

  /** "Confirm all": confirms every stale or hidden item (up to 500 at once). */
  async confirmAllStale(): Promise<BulkInventoryResponse> {
    const ids: string[] = [];
    for (const freshness of ['STALE', 'HIDDEN'] as const) {
      for (let page = 0; ids.length < CONFIRM_ALL_MAX; page++) {
        const result = await this.call(
          this.inventoryApi.listInventoryItems(
            { freshness, page, size: CONFIRM_ALL_PAGE },
            'body',
            false,
            { context: silentErrors() },
          ),
        );
        ids.push(...(result.items ?? []).map((item) => item.id));
        if (page + 1 >= (result.totalPages ?? 0)) {
          break;
        }
      }
    }
    if (ids.length === 0) {
      return { updated: 0, skipped: [] };
    }
    return this.bulk({ kind: 'confirm' }, ids.slice(0, CONFIRM_ALL_MAX));
  }

  // --- binder writes -----------------------------------------------------------------------

  async createBinder(request: CreateBinderRequest): Promise<BinderResponse> {
    const binder = await this.call(
      this.bindersApi.createBinder({ createBinderRequest: request }, 'body', false, {
        context: silentErrors(),
      }),
    );
    this.bindersState.update((binders) => [...(binders ?? []), binder]);
    return binder;
  }

  async updateBinder(id: string, request: UpdateBinderRequest): Promise<BinderResponse> {
    return this.binderWrite(
      this.bindersApi.updateBinder({ id, updateBinderRequest: request }, 'body', false, {
        context: silentErrors(),
      }),
    );
  }

  async publishBinder(id: string, mode: PublishMode): Promise<BinderResponse> {
    return this.binderWrite(
      this.bindersApi.publishBinder(
        { id, publishBinderRequest: { mode: mode as PublishBinderRequest['mode'] } },
        'body',
        false,
        { context: silentErrors() },
      ),
      true,
    );
  }

  async unpublishBinder(id: string): Promise<BinderResponse> {
    return this.binderWrite(
      this.bindersApi.unpublishBinder({ id }, 'body', false, { context: silentErrors() }),
      true,
    );
  }

  async confirmBinder(id: string): Promise<BinderResponse> {
    return this.binderWrite(
      this.bindersApi.confirmBinder({ id }, 'body', false, { context: silentErrors() }),
      true,
    );
  }

  async deleteBinder(id: string, deleteItems = false): Promise<void> {
    await this.call(
      this.bindersApi.deleteBinder({ id, deleteItems }, 'body', false, { context: silentErrors() }),
    );
    this.bindersState.update((binders) => (binders ?? []).filter((binder) => binder.id !== id));
    this.refresh();
  }

  /**
   * Saves a new order. The list is updated right away; saves run one after the other (quick
   * keyboard moves never race) and only the latest answer is applied. On a failure the order is
   * reloaded from the server.
   */
  reorderBinders(ids: readonly string[]): Promise<void> {
    const byId = this.bindersById();
    this.bindersState.set(
      ids.map((id) => byId.get(id)).filter((binder): binder is BinderResponse => !!binder),
    );
    const ticket = ++this.orderTicket;
    const run = this.orderSaves.then(async () => {
      try {
        const binders = await this.call(
          this.bindersApi.reorderBinders(
            { reorderBindersRequest: { binderIds: [...ids] } },
            'body',
            false,
            { context: silentErrors() },
          ),
        );
        if (ticket === this.orderTicket) {
          this.bindersState.set(binders);
        }
      } catch (error) {
        this.loadBinders();
        throw error;
      }
    });
    this.orderSaves = run.catch(() => undefined);
    return run;
  }

  // --- helpers -----------------------------------------------------------------------------

  private async binderWrite(
    request: Observable<BinderResponse>,
    refreshItems = false,
  ): Promise<BinderResponse> {
    const binder = await this.call(request);
    this.bindersState.update((binders) =>
      (binders ?? []).map((candidate) => (candidate.id === binder.id ? binder : candidate)),
    );
    if (refreshItems) {
      this.refresh({ binders: false });
    }
    return binder;
  }

  private replaceItem(item: InventoryItemResponse): void {
    this.pageState.update((page) =>
      page
        ? {
            ...page,
            items: (page.items ?? []).map((candidate) =>
              candidate.id === item.id ? item : candidate,
            ),
          }
        : page,
    );
  }

  private markBusy(id: string, busy: boolean): void {
    const next = new Set(this.busyItemsState());
    if (busy) {
      next.add(id);
    } else {
      next.delete(id);
    }
    this.busyItemsState.set(next);
  }

  private async call<T>(request: Observable<T>): Promise<T> {
    try {
      return await firstValueFrom(request);
    } catch (error) {
      throw toApiError(error);
    }
  }
}
