import { HttpContext } from '@angular/common/http';
import { DestroyRef, Injectable, WritableSignal, computed, inject, signal } from '@angular/core';
import {
  BinderResponse,
  BindersService,
  BulkInventoryResponse,
  CreateBinderRequest,
  CreateInventoryItemRequest,
  InventoryItemResponse,
  InventoryService,
  InventorySummaryResponse,
  PrivacySettings,
  PublishBinderRequest,
  SettingsService,
  UpdateBinderRequest,
  UpdateInventoryItemRequest,
} from '@orenji/api-client';
import { Observable, Subscription, firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { SKIP_LIMIT_DIALOG, silentErrors } from '../../../core/http/http-context';
import { PublishMode } from '../../../shared/inventory/inventory-labels';
import { BulkAction, toBulkRequest } from './bulk-actions';
import { cardFormOf } from './card-form';
import { InventoryParams, listKey, toListRequest } from './inventory-params';
import { pruneSelection, selectAllLoaded, selectRange, toggleOne } from './selection';
import { ownerIsVisible } from './visibility-status';

/** Cards confirmed at once by "Still have them" (the bulk endpoint takes at most 500 ids). */
const CONFIRM_ALL_MAX = 500;
const CONFIRM_ALL_PAGE = 100;
/** How long a new or restored row is highlighted (spec 9.9: 1.5 s). */
export const HIGHLIGHT_MS = 1500;

/**
 * State and API calls of `/inventory` (provided by the page, shared with its drawers and dialogs).
 * The cards are loaded 100 at a time with "Load more" (spec 9.4); the summary keeps the full
 * totals. Writes return promises that reject with {@link ApiError} so the calling screen can
 * explain failures. Requests are silent: screens show their own messages (the global limit dialog
 * still opens on 429 LIMIT_REACHED, except where a screen explains the limit itself).
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
  private readonly itemsState = signal<InventoryItemResponse[] | null>(null);
  private readonly totalState = signal(0);
  private readonly pagesLoaded = signal(0);
  private readonly itemsLoadingState = signal(true);
  private readonly loadingMoreState = signal(false);
  private readonly itemsErrorState = signal<ApiError | null>(null);
  private readonly moreErrorState = signal<ApiError | null>(null);
  private readonly selectionState = signal<ReadonlySet<string>>(new Set());
  private readonly busyItemsState = signal<ReadonlySet<string>>(new Set());
  private readonly highlightState = signal<ReadonlySet<string>>(new Set());
  private readonly savedState = signal<ReadonlySet<string>>(new Set());
  private anchor: string | null = null;

  readonly binders = this.bindersState.asReadonly();
  readonly bindersError = this.bindersErrorState.asReadonly();
  readonly summary = this.summaryState.asReadonly();
  readonly privacy = this.privacyState.asReadonly();
  readonly itemsLoading = this.itemsLoadingState.asReadonly();
  readonly loadingMore = this.loadingMoreState.asReadonly();
  readonly itemsError = this.itemsErrorState.asReadonly();
  readonly moreError = this.moreErrorState.asReadonly();
  readonly selection = this.selectionState.asReadonly();
  /** Items with an inline edit in flight. */
  readonly busyItems = this.busyItemsState.asReadonly();
  /** Rows just added or restored (a 1.5 s tint). */
  readonly highlighted = this.highlightState.asReadonly();
  /** Rows just saved inline (a teal check for 600 ms). */
  readonly saved = this.savedState.asReadonly();

  /** `null` before the first answer. */
  readonly loaded = computed(() => this.itemsState());
  readonly items = computed<InventoryItemResponse[]>(() => this.itemsState() ?? []);
  /** Cards matching the current view (all pages). */
  readonly total = this.totalState.asReadonly();
  readonly hasMore = computed(() => this.items().length < this.totalState());
  readonly ownerVisible = computed(() => ownerIsVisible(this.privacyState()));
  readonly bindersById = computed(
    () => new Map((this.bindersState() ?? []).map((binder) => [binder.id, binder])),
  );
  readonly itemsById = computed(() => new Map(this.items().map((item) => [item.id, item])));
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
  readonly selectedItems = computed(() => {
    const selection = this.selectionState();
    return this.items().filter((item) => selection.has(item.id));
  });
  readonly allSelected = computed(() => {
    const items = this.items();
    const selection = this.selectionState();
    return items.length > 0 && items.every((item) => selection.has(item.id));
  });

  private params: InventoryParams | null = null;
  private key: string | null = null;
  private itemsSubscription: Subscription | null = null;
  private bindersSubscription: Subscription | null = null;
  private summarySubscription: Subscription | null = null;
  private privacySubscription: Subscription | null = null;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  /** Binder order saves, chained. */
  private orderSaves: Promise<void> = Promise.resolve();
  private orderTicket = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.itemsSubscription?.unsubscribe();
      this.bindersSubscription?.unsubscribe();
      this.summarySubscription?.unsubscribe();
      this.privacySubscription?.unsubscribe();
      this.timers.forEach((timer) => clearTimeout(timer));
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

  /**
   * Lists the first 100 cards for `params` (the previous request is cancelled). A new list (other
   * filters, binder or sort) clears the selection; the same list reloaded keeps it.
   */
  loadItems(params: InventoryParams, options: { keepSelection?: boolean } = {}): void {
    const key = listKey(params);
    const changed = key !== this.key;
    this.params = params;
    this.key = key;
    if (changed && !options.keepSelection) {
      this.clearSelection();
    }
    this.itemsSubscription?.unsubscribe();
    this.itemsLoadingState.set(true);
    this.itemsErrorState.set(null);
    this.moreErrorState.set(null);
    // A reload of the same list keeps as many rows as were loaded (up to the API's page).
    const pages = changed ? 1 : Math.max(1, this.pagesLoaded());
    this.itemsSubscription = this.loadPages(params, pages).subscribe({
      next: ({ items, total }) => {
        this.itemsState.set(items);
        this.totalState.set(total);
        this.pagesLoaded.set(pages);
        this.itemsLoadingState.set(false);
        this.selectionState.set(
          pruneSelection(
            this.selectionState(),
            items.map((item) => item.id),
          ),
        );
      },
      error: (error: unknown) => {
        this.itemsErrorState.set(toApiError(error));
        this.itemsLoadingState.set(false);
      },
    });
  }

  /** "Load more": the next 100 cards, appended. */
  loadMore(): void {
    const params = this.params;
    if (!params || this.loadingMoreState() || !this.hasMore()) {
      return;
    }
    const page = this.pagesLoaded();
    this.loadingMoreState.set(true);
    this.moreErrorState.set(null);
    this.inventoryApi
      .listInventoryItems(toListRequest(params, page), 'body', false, { context: silentErrors() })
      .subscribe({
        next: (result) => {
          const known = new Set(this.items().map((item) => item.id));
          const fresh = (result.items ?? []).filter((item) => !known.has(item.id));
          this.itemsState.set([...this.items(), ...fresh]);
          this.totalState.set(result.totalItems ?? this.totalState());
          this.pagesLoaded.set(page + 1);
          this.loadingMoreState.set(false);
        },
        error: (error: unknown) => {
          this.moreErrorState.set(toApiError(error));
          this.loadingMoreState.set(false);
        },
      });
  }

  /** Reloads the cards of the current view (keeping the selection and the loaded rows). */
  reloadItems(): void {
    if (this.params) {
      this.loadItems(this.params, { keepSelection: true });
    }
  }

  /** Reloads everything a write may have changed. */
  refresh(options: { binders?: boolean; items?: boolean } = {}): void {
    if (options.items !== false) {
      this.reloadItems();
    }
    this.loadSummary();
    if (options.binders !== false) {
      this.loadBinders();
    }
  }

  // --- selection ---------------------------------------------------------------------------

  /** A checkbox, Space or `x`; with `range` (Shift+click) every card since the last one clicked. */
  toggleSelection(id: string, selected?: boolean, range = false): void {
    const next = selected ?? !this.selectionState().has(id);
    this.selectionState.set(
      range
        ? selectRange(
            this.selectionState(),
            this.items().map((item) => item.id),
            this.anchor,
            id,
            next,
          )
        : toggleOne(this.selectionState(), id, next),
    );
    this.anchor = id;
  }

  /** Ctrl/Cmd+A: the loaded rows (again: none). */
  toggleAll(): void {
    this.selectionState.set(
      selectAllLoaded(
        this.selectionState(),
        this.items().map((item) => item.id),
      ),
    );
  }

  /** Selects exactly these cards. */
  select(ids: readonly string[]): void {
    this.selectionState.set(new Set(ids));
  }

  clearSelection(): void {
    if (this.selectionState().size > 0) {
      this.selectionState.set(new Set());
    }
    this.anchor = null;
  }

  // --- item writes -------------------------------------------------------------------------

  /**
   * Adds a card. The new row goes to the top of the list with a highlight (spec 9.9), without
   * reloading it, so the add loop stays quick. `explainLimit`: the caller explains a 429 itself.
   */
  async createItem(
    request: CreateInventoryItemRequest,
    options: { explainLimit?: boolean } = {},
  ): Promise<InventoryItemResponse> {
    const item = await this.call(
      this.inventoryApi.createInventoryItem(
        { createInventoryItemRequest: request },
        'body',
        false,
        { context: this.context(options.explainLimit) },
      ),
    );
    this.prepend(item);
    this.refresh({ items: false, binders: !!request.binderId });
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
    this.refresh({ items: false, binders: 'binderId' in request || 'visibility' in request });
    return item;
  }

  /**
   * An inline edit of the table (spec 9.4): PATCHes only the changed field with `confirm: true`,
   * so the save also confirms freshness; the row shows a check for 600 ms.
   */
  async inlineUpdate(
    item: InventoryItemResponse,
    patch: UpdateInventoryItemRequest,
  ): Promise<InventoryItemResponse> {
    this.markBusy(item.id, true);
    try {
      const updated = await this.updateItem(item.id, { ...patch, confirm: true });
      this.flash(this.savedState, item.id, 600);
      return updated;
    } finally {
      this.markBusy(item.id, false);
    }
  }

  setQuantity(item: InventoryItemResponse, quantity: number): Promise<InventoryItemResponse> {
    return this.inlineUpdate(item, { quantity });
  }

  setPrice(item: InventoryItemResponse, text: string | null): Promise<InventoryItemResponse> {
    return this.inlineUpdate(item, { askingPriceText: text });
  }

  setVisibility(
    item: InventoryItemResponse,
    visibility: 'PRIVATE' | 'PUBLIC',
  ): Promise<InventoryItemResponse> {
    return this.inlineUpdate(item, {
      visibility: visibility as UpdateInventoryItemRequest['visibility'],
    });
  }

  /** Files a card in a binder (or none); its visibility is sent as the card shows it. */
  setBinder(item: InventoryItemResponse, binderId: string | null): Promise<InventoryItemResponse> {
    return this.inlineUpdate(item, {
      binderId,
      visibility: cardFormOf(item).visibility as UpdateInventoryItemRequest['visibility'],
    });
  }

  async confirmItem(id: string): Promise<InventoryItemResponse> {
    const item = await this.call(
      this.inventoryApi.confirmInventoryItem({ id }, 'body', false, { context: silentErrors() }),
    );
    this.replaceItem(item);
    this.refresh({ items: false });
    return item;
  }

  /** Deletes a card (the API keeps it 10 minutes for an undo); the row leaves at once. */
  async deleteItem(id: string): Promise<void> {
    await this.call(
      this.inventoryApi.deleteInventoryItem({ id }, 'body', false, { context: silentErrors() }),
    );
    this.removeRows([id]);
    this.refresh({ items: false });
  }

  /** Undo of a delete: `POST /items/{id}/restore` for each card (no bulk restore yet). */
  async restoreItems(ids: readonly string[]): Promise<{ restored: number; failed: number }> {
    const results = await Promise.allSettled(
      ids.map((id) =>
        this.call(
          this.inventoryApi.restoreInventoryItem({ id }, 'body', false, {
            context: silentErrors(),
          }),
        ),
      ),
    );
    const restored = results.filter((result) => result.status === 'fulfilled').length;
    this.refresh();
    ids.forEach((id) => this.flash(this.highlightState, id, HIGHLIGHT_MS));
    return { restored, failed: ids.length - restored };
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

  async deleteImage(item: InventoryItemResponse, imageId: string): Promise<InventoryItemResponse> {
    await this.call(
      this.inventoryApi.deleteInventoryItemImage({ id: item.id, imageId }, 'body', false, {
        context: silentErrors(),
      }),
    );
    const updated = { ...item, images: item.images.filter((image) => image.id !== imageId) };
    this.replaceItem(updated);
    return updated;
  }

  async getItem(id: string): Promise<InventoryItemResponse> {
    return this.call(
      this.inventoryApi.getInventoryItem({ id }, 'body', false, { context: silentErrors() }),
    );
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
      const skipped = new Set(response.skipped.map((entry) => entry.itemId));
      this.removeRows(itemIds.filter((id) => !skipped.has(id)));
      this.clearSelection();
    }
    this.refresh();
    return response;
  }

  /** "Still have them": confirms every stale or hidden card (up to 500 at once). */
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

  /** Highlights rows for 1.5 s (a card just added). */
  highlight(ids: readonly string[]): void {
    ids.forEach((id) => this.flash(this.highlightState, id, HIGHLIGHT_MS));
  }

  // --- binder writes -----------------------------------------------------------------------

  async createBinder(
    request: CreateBinderRequest,
    options: { explainLimit?: boolean } = {},
  ): Promise<BinderResponse> {
    const binder = await this.call(
      this.bindersApi.createBinder({ createBinderRequest: request }, 'body', false, {
        context: this.context(options.explainLimit),
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
      'visibility' in request,
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

  async uploadBinderPhoto(id: string, file: Blob): Promise<BinderResponse> {
    return this.binderWrite(
      this.bindersApi.uploadBinderImage({ id, file }, 'body', false, { context: silentErrors() }),
    );
  }

  async deleteBinderPhoto(id: string, imageId: string): Promise<void> {
    await this.call(
      this.bindersApi.deleteBinderImage({ id, imageId }, 'body', false, {
        context: silentErrors(),
      }),
    );
    this.loadBinders();
  }

  /**
   * Deletes a binder once the order saves still queued are done: a save sent after the deletion
   * would name the deleted binder, be refused (404) and lose the move.
   */
  async deleteBinder(id: string, deleteItems = false): Promise<void> {
    await this.orderSaves;
    await this.call(
      this.bindersApi.deleteBinder({ id, deleteItems }, 'body', false, { context: silentErrors() }),
    );
    this.bindersState.update((binders) => (binders ?? []).filter((binder) => binder.id !== id));
    this.refresh();
  }

  /**
   * Saves a new order. The list is updated right away; saves run one after the other and only the
   * latest answer is applied. On a failure the order is reloaded from the server.
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

  private loadPages(
    params: InventoryParams,
    pages: number,
  ): Observable<{ items: InventoryItemResponse[]; total: number }> {
    // One request of up to 100 rows per loaded page, in order (a reload after "Load more").
    return new Observable((subscriber) => {
      const items: InventoryItemResponse[] = [];
      let total = 0;
      let current: Subscription | null = null;
      const next = (page: number) => {
        current = this.inventoryApi
          .listInventoryItems(toListRequest(params, page), 'body', false, {
            context: silentErrors(),
          })
          .subscribe({
            next: (result) => {
              const known = new Set(items.map((item) => item.id));
              items.push(...(result.items ?? []).filter((item) => !known.has(item.id)));
              total = result.totalItems ?? items.length;
              if (page + 1 < pages && items.length < total) {
                next(page + 1);
              } else {
                subscriber.next({ items, total });
                subscriber.complete();
              }
            },
            error: (error: unknown) => subscriber.error(error),
          });
      };
      next(0);
      return () => current?.unsubscribe();
    });
  }

  private context(explainLimit = false): HttpContext {
    const context = silentErrors();
    return explainLimit ? context.set(SKIP_LIMIT_DIALOG, true) : context;
  }

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

  private prepend(item: InventoryItemResponse): void {
    const items = this.itemsState() ?? [];
    if (!items.some((candidate) => candidate.id === item.id)) {
      this.itemsState.set([item, ...items]);
      this.totalState.update((total) => total + 1);
    } else {
      this.replaceItem(item);
    }
    this.flash(this.highlightState, item.id, HIGHLIGHT_MS);
  }

  private removeRows(ids: readonly string[]): void {
    const gone = new Set(ids);
    const items = this.itemsState();
    if (items) {
      const kept = items.filter((item) => !gone.has(item.id));
      this.totalState.update((total) => Math.max(0, total - (items.length - kept.length)));
      this.itemsState.set(kept);
    }
    if ([...gone].some((id) => this.selectionState().has(id))) {
      this.selectionState.set(new Set([...this.selectionState()].filter((id) => !gone.has(id))));
    }
  }

  private replaceItem(item: InventoryItemResponse): void {
    this.itemsState.update((items) =>
      items ? items.map((candidate) => (candidate.id === item.id ? item : candidate)) : items,
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

  private flash(
    state: WritableSignal<ReadonlySet<string>>,
    id: string,
    ms: number,
  ): void {
    state.set(new Set([...state(), id]));
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      const next = new Set(state());
      next.delete(id);
      state.set(next);
    }, ms);
    this.timers.add(timer);
  }

  private async call<T>(request: Observable<T>): Promise<T> {
    try {
      return await firstValueFrom(request);
    } catch (error) {
      throw toApiError(error);
    }
  }
}
