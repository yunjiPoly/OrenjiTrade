import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import type { BinderResponse, InventoryItemResponse } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ApiError } from '../../core/http/api-error';
import { friendlyError, friendlyMessage } from '../../core/http/api-error-messages';
import { GamesStore } from '../../shared/catalog/games.store';
import { PublishMode } from '../../shared/inventory/inventory-labels';
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from '../../shared/ui/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../shared/ui/error-state/error-state.component';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { SkeletonComponent } from '../../shared/ui/skeleton/skeleton.component';
import { AddCardDialogComponent, AddCardDialogData } from './add-card/add-card-dialog.component';
import { BinderListComponent } from './binder-list/binder-list.component';
import { BinderActionsService } from './binders/binder-actions.service';
import { BinderHeaderComponent } from './binders/binder-header.component';
import { BinderManagerDialogComponent } from './binders/binder-manager-dialog.component';
import { BulkBarComponent } from './bulk/bulk-bar.component';
import { BulkAction, bulkResultMessage } from './data/bulk-actions';
import {
  CLEARED_FILTERS,
  DEFAULT_INVENTORY_PAGE_SIZE,
  INVENTORY_PAGE_SIZES,
  UNFILED,
  activeFilterCount,
  parseInventoryParams,
} from './data/inventory-params';
import { InventoryStore } from './data/inventory.store';
import { binderVisibilityStatus, itemVisibilityStatus } from './data/visibility-status';
import {
  ItemEditorData,
  ItemEditorResult,
  ItemEditorSheetComponent,
} from './editor/item-editor-sheet.component';
import { InventoryItemCardComponent } from './items/inventory-item-card.component';
import { InventoryItemTableComponent } from './items/inventory-item-table.component';
import { InventoryRow, QuantityChange, SelectionChange } from './items/inventory-row';
import { InventorySummaryComponent } from './summary/inventory-summary.component';
import {
  InventoryParamChange,
  InventoryToolbarComponent,
} from './toolbar/inventory-toolbar.component';

/**
 * `/inventory`: the collector's cards and binders (Phase 3). Binder list on the left, filters on
 * top (all in the URL), grid or table of cards with quick quantity edits, an edit side panel,
 * multi-select bulk actions, the "Add card" flow, the binder manager and a summary strip with
 * "Confirm all". Signed-out visitors are invited to sign in.
 */
@Component({
  selector: 'app-inventory-page',
  providers: [InventoryStore, BinderActionsService],
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatPaginatorModule,
    BinderHeaderComponent,
    BinderListComponent,
    BulkBarComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    InventoryItemCardComponent,
    InventoryItemTableComponent,
    InventorySummaryComponent,
    InventoryToolbarComponent,
    PageHeaderComponent,
    SkeletonComponent,
  ],
  templateUrl: './inventory-page.component.html',
  styleUrl: './inventory-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InventoryPageComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly injector = inject(Injector);
  private readonly snackBar = inject(MatSnackBar);
  private readonly binderActions = inject(BinderActionsService);
  protected readonly store = inject(InventoryStore);
  protected readonly games = inject(GamesStore);

  /** Query parameters (bound by the router). */
  readonly binder = input<string | undefined>();
  readonly q = input<string | undefined>();
  readonly game = input<string | undefined>();
  readonly visibility = input<string | undefined>();
  readonly availability = input<string | undefined>();
  readonly condition = input<string | undefined>();
  readonly freshness = input<string | undefined>();
  readonly sort = input<string | undefined>();
  readonly view = input<string | undefined>();
  readonly page = input<string | undefined>();
  readonly size = input<string | undefined>();
  /** `?card=<cardId>&add=<printingId>` opens "Add card" on that card (card detail CTA). */
  readonly add = input<string | undefined>();
  readonly card = input<string | undefined>();

  protected readonly unfiled = UNFILED;
  protected readonly pageSizes = INVENTORY_PAGE_SIZES;
  protected readonly defaultSize = DEFAULT_INVENTORY_PAGE_SIZE;
  protected readonly skeletons = Array.from({ length: 8 }, (_, index) => index);
  /** `null` until Firebase restored the session. */
  protected readonly signedIn = signal<boolean | null>(null);
  protected readonly bulkBusy = signal(false);
  protected readonly bulkResult = signal<string | null>(null);
  protected readonly confirming = signal(false);
  protected readonly binderBusy = signal(false);

  protected readonly params = computed(() =>
    parseInventoryParams({
      binder: this.binder(),
      q: this.q(),
      game: this.game(),
      visibility: this.visibility(),
      availability: this.availability(),
      condition: this.condition(),
      freshness: this.freshness(),
      sort: this.sort(),
      view: this.view(),
      page: this.page(),
      size: this.size(),
    }),
  );
  protected readonly hasFilters = computed(
    () => !!this.params().q || activeFilterCount(this.params()) > 0,
  );
  protected readonly selectedBinder = computed<BinderResponse | null>(() => {
    const id = this.params().binder;
    return id && id !== UNFILED ? (this.store.bindersById().get(id) ?? null) : null;
  });
  /** A binder id in the URL that is not (or no longer) one of the collector's binders. */
  protected readonly unknownBinder = computed(() => {
    const id = this.params().binder;
    return !!id && id !== UNFILED && this.store.binders() !== null && !this.selectedBinder();
  });
  protected readonly binderStatus = computed(() => {
    const binder = this.selectedBinder();
    return binder
      ? binderVisibilityStatus(binder, { ownerVisible: this.store.ownerVisible() })
      : null;
  });
  protected readonly listTitle = computed(() => {
    const binder = this.params().binder;
    if (binder === UNFILED) {
      return 'Unfiled cards';
    }
    return this.selectedBinder()?.name ?? 'All cards';
  });
  protected readonly rows = computed<InventoryRow[]>(() => {
    const selection = this.store.selection();
    const busy = this.store.busyItems();
    const binders = this.store.bindersById();
    const ownerVisible = this.store.ownerVisible();
    return this.store.items().map((item) => ({
      item,
      status: itemVisibilityStatus(item, {
        binder: item.binder ? binders.get(item.binder.id) : null,
        ownerVisible,
      }),
      selected: selection.has(item.id),
      busy: busy.has(item.id),
    }));
  });
  protected readonly isEmptyInventory = computed(
    () => this.store.summary()?.totalItems === 0 && !this.hasFilters(),
  );
  /** Something is set to public but the collector cannot be seen (ADR 0004 privacy rules). */
  protected readonly showPrivacyBanner = computed(() => {
    if (this.store.ownerVisible() !== false) {
      return false;
    }
    const summary = this.store.summary();
    const publicItems = summary
      ? summary.byVisibility.PUBLIC + summary.byVisibility.TEMPORARILY_PUBLIC
      : 0;
    return (
      publicItems > 0 ||
      (this.store.binders() ?? []).some((binder) => binder.visibility !== 'PRIVATE')
    );
  });
  protected readonly errorMessage = computed(() => {
    const error = this.store.itemsError();
    return error ? friendlyMessage(error) : '';
  });

  private addHandled: string | null = null;

  constructor() {
    void this.auth.ready().then(() => {
      const signedIn = this.auth.isAuthenticated();
      this.signedIn.set(signedIn);
      if (signedIn) {
        void this.games.load();
        this.store.loadContext();
      }
    });
    effect(() => {
      const params = this.params();
      if (this.signedIn()) {
        untracked(() => {
          this.bulkResult.set(null);
          this.store.loadItems(params);
        });
      }
    });
    effect(() => {
      const printingId = this.add();
      const cardId = this.card();
      const key = `${cardId}|${printingId}`;
      if (this.signedIn() && cardId && this.addHandled !== key) {
        this.addHandled = key;
        untracked(() => {
          this.navigate({ add: null, card: null }, true);
          void this.openAddCard({ printingId, cardId });
        });
      }
    });
  }

  protected get returnUrl(): string {
    return this.router.url;
  }

  // --- filters and pages -------------------------------------------------------------------

  protected onParams(change: InventoryParamChange): void {
    this.navigate(change, 'q' in change);
  }

  protected clearFilters(): void {
    this.navigate({ ...CLEARED_FILTERS });
  }

  protected onPage(event: PageEvent): void {
    this.navigate({
      page: event.pageIndex ? String(event.pageIndex) : null,
      size: event.pageSize === DEFAULT_INVENTORY_PAGE_SIZE ? null : String(event.pageSize),
    });
    globalThis.scrollTo?.({ top: 0, behavior: 'smooth' });
  }

  protected reload(): void {
    this.store.refresh();
  }

  // --- items -------------------------------------------------------------------------------

  protected async openAddCard(start: { printingId?: string; cardId?: string } = {}): Promise<void> {
    const binder = this.selectedBinder();
    await firstValueFrom(
      this.dialog
        .open<AddCardDialogComponent, AddCardDialogData, InventoryItemResponse>(
          AddCardDialogComponent,
          {
            data: { binderId: binder?.id ?? null, ...start },
            injector: this.injector,
            panelClass: 'app-dialog--lg',
            autoFocus: 'first-tabbable',
            restoreFocus: true,
          },
        )
        .afterClosed(),
    );
  }

  protected openEditor(item: InventoryItemResponse): void {
    this.dialog.open<ItemEditorSheetComponent, ItemEditorData, ItemEditorResult>(
      ItemEditorSheetComponent,
      {
        data: { item },
        injector: this.injector,
        panelClass: 'app-side-sheet',
        position: { right: '0', top: '0' },
        height: '100dvh',
        maxHeight: '100dvh',
        width: 'min(560px, 100vw)',
        maxWidth: '100vw',
        autoFocus: 'dialog',
        restoreFocus: true,
      },
    );
  }

  protected async onQuantity(change: QuantityChange): Promise<void> {
    try {
      await this.store.setQuantity(change.item, change.quantity);
    } catch (error) {
      this.snackBar.open(friendlyError(error as ApiError).message, 'OK', { duration: 6000 });
    }
  }

  protected onSelection(change: SelectionChange): void {
    this.store.toggleSelection(change.id, change.selected);
  }

  protected async onBulk(action: BulkAction): Promise<void> {
    const ids = [...this.store.selection()];
    if (ids.length === 0) {
      return;
    }
    if (action.kind === 'delete' && !(await this.confirmBulkDelete(ids.length))) {
      return;
    }
    this.bulkBusy.set(true);
    try {
      const response = await this.store.bulk(action, ids);
      const message = bulkResultMessage(action, response);
      this.bulkResult.set(message);
      this.snackBar.open(message, 'OK', { duration: 5000 });
    } catch (error) {
      this.bulkResult.set(friendlyError(error as ApiError).message);
    } finally {
      this.bulkBusy.set(false);
    }
  }

  protected async confirmAll(): Promise<void> {
    this.confirming.set(true);
    try {
      const response = await this.store.confirmAllStale();
      this.snackBar.open(bulkResultMessage({ kind: 'confirm' }, response), 'OK', {
        duration: 5000,
      });
    } catch (error) {
      this.snackBar.open(friendlyError(error as ApiError).message, 'OK', { duration: 8000 });
    } finally {
      this.confirming.set(false);
    }
  }

  // --- binders -----------------------------------------------------------------------------

  protected async newBinder(): Promise<void> {
    const binder = await this.binderActions.create();
    if (binder) {
      this.navigate({ binder: binder.id, page: null });
    }
  }

  protected openBinderManager(): void {
    this.dialog.open(BinderManagerDialogComponent, {
      injector: this.injector,
      panelClass: 'app-dialog--lg',
      autoFocus: 'first-tabbable',
      restoreFocus: true,
    });
  }

  protected async publishBinder(binder: BinderResponse, mode: PublishMode): Promise<void> {
    await this.binderWork(() => this.binderActions.publish(binder, mode));
  }

  protected async unpublishBinder(binder: BinderResponse): Promise<void> {
    await this.binderWork(() => this.binderActions.unpublish(binder));
  }

  protected async confirmBinder(binder: BinderResponse): Promise<void> {
    await this.binderWork(() => this.binderActions.confirm(binder));
  }

  protected async editBinder(binder: BinderResponse): Promise<void> {
    await this.binderActions.edit(binder);
  }

  protected async deleteBinder(binder: BinderResponse): Promise<void> {
    if (await this.binderActions.remove(binder)) {
      this.navigate({ binder: null, page: null });
    }
  }

  // --- helpers -----------------------------------------------------------------------------

  private async binderWork(action: () => Promise<unknown>): Promise<void> {
    this.binderBusy.set(true);
    try {
      await action();
    } finally {
      this.binderBusy.set(false);
    }
  }

  private confirmBulkDelete(count: number): Promise<boolean | undefined> {
    return firstValueFrom(
      this.dialog
        .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
          data: {
            title: `Delete ${count} ${count === 1 ? 'card' : 'cards'}?`,
            message: 'They are removed from your inventory, your binders and every listing.',
            confirmLabel: 'Delete',
            tone: 'danger',
          },
          panelClass: 'app-dialog--md',
        })
        .afterClosed(),
    );
  }

  private navigate(queryParams: Record<string, string | null>, replaceUrl = false): void {
    void this.router.navigate([], { queryParams, queryParamsHandling: 'merge', replaceUrl });
  }
}
