import { CDK_DRAG_CONFIG, DragDropConfig } from '@angular/cdk/drag-drop';
import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { Router, RouterLink } from '@angular/router';
import type { BinderResponse, InventoryItemResponse } from '@orenji/api-client';
import { AuthService } from '../../core/auth/auth.service';
import { isEditableTarget } from '../../core/keyboard/keyboard-shortcuts.service';
import { friendlyMessage } from '../../core/http/api-error-messages';
import { ShellLayout } from '../../core/layout/shell-layout.service';
import { ShellTabTitleDirective } from '../../core/layout/shell-tab-title.directive';
import { GamesStore } from '../../shared/catalog/games.store';
import { printingImageUrl } from '../../shared/inventory/inventory-labels';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../shared/ui/error-state/error-state.component';
import { SkeletonComponent } from '../../shared/ui/skeleton/skeleton.component';
import {
  UnderlineTab,
  UnderlineTabsComponent,
} from '../../shared/ui/underline-tabs/underline-tabs.component';
import { BinderActionsService } from './binders/binder-actions.service';
import { BindersTabComponent } from './binders/binders-tab.component';
import { EditBinderDrawerComponent } from './binders/edit-binder-drawer.component';
import { BulkDockComponent } from './bulk/bulk-dock.component';
import { binderVisibilityChoice, deckCoreTag } from './data/binder-form';
import { binderGame } from './data/binder-games';
import { BulkAction } from './data/bulk-actions';
import { cardFormOf } from './data/card-form';
import { InventoryActions } from './data/inventory-actions.service';
import {
  InventoryParams,
  InventoryView,
  UNFILED,
  hasActiveFilters,
  parseInventoryParams,
  rememberView,
  rememberedView,
  CLEARED_FILTERS,
} from './data/inventory-params';
import { InventoryStore } from './data/inventory.store';
import { itemPriceText } from './data/item-price';
import { itemVisibilityTag } from './data/visibility-status';
import { AddCardsDrawerComponent } from './drawer/add-cards-drawer.component';
import { AddManyChoice } from './drawer/add-many.component';
import { EditCardDrawerComponent } from './drawer/edit-card-drawer.component';
import { InventoryGridComponent } from './grid/inventory-grid.component';
import { ImportHandoff, sourceOfFile } from './import/import-handoff.service';
import {
  InventoryRow,
  QuantityChange,
  RowAction,
  SelectionChange,
  shortAge,
} from './items/inventory-row';
import { ListingsPausedBannerComponent } from './listing-status/listings-paused-banner.component';
import { BinderPaneAction, BinderPaneComponent, CardDrag } from './pane/binder-pane.component';
import { QuickAddRowsComponent } from './quick-add/quick-add-rows.component';
import { InventoryTableComponent, RowDrag } from './table/inventory-table.component';
import {
  InventoryParamChange,
  InventoryToolbarComponent,
} from './toolbar/inventory-toolbar.component';
import { SegmentedComponent } from '../../shared/ui/segmented/segmented.component';

type Drawer =
  | { kind: 'add'; cardId: string | null; printingId: string | null }
  | { kind: 'binder'; binderId: string; focusCore: boolean };

/** CDK drag starts after 4 px (spec 9.7). */
const DRAG_CONFIG: DragDropConfig = { dragStartThreshold: 4, pointerDirectionChangeThreshold: 5 };

/**
 * `/inventory` (web redesign spec 9, boards W10 to W15): the lead area. At lg and xl the binder
 * pane (256), the list and a 440 drawer that pushes it; at md the pane hides and drawers lie over
 * the list; below 960 the phone's design. Cards: the header (Inventory, Cards | Binders, Import,
 * Add cards with its menu), the summary and the binder strip, the banners, the toolbar, quick add
 * rows (Shift+N), the table or the grid with "Load more", selection and the bulk dock, drag to a
 * binder, a `.ydk` or `.csv` dropped anywhere opening Import. Binders: the binders by game. The
 * drawers: Edit card (`?item=`), Add cards (`?add=`), Edit binder.
 */
@Component({
  selector: 'app-inventory-page',
  providers: [
    InventoryStore,
    InventoryActions,
    BinderActionsService,
    { provide: CDK_DRAG_CONFIG, useValue: DRAG_CONFIG },
  ],
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    AddCardsDrawerComponent,
    BinderPaneComponent,
    BindersTabComponent,
    BulkDockComponent,
    EditBinderDrawerComponent,
    EditCardDrawerComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    InventoryGridComponent,
    InventoryTableComponent,
    InventoryToolbarComponent,
    ListingsPausedBannerComponent,
    QuickAddRowsComponent,
    SegmentedComponent,
    ShellTabTitleDirective,
    SkeletonComponent,
    UnderlineTabsComponent,
  ],
  templateUrl: './inventory-page.component.html',
  styleUrl: './inventory-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(dragenter)': 'onFileDrag($event)',
    '(dragover)': 'onFileDrag($event)',
    '(dragleave)': 'onFileLeave($event)',
    '(drop)': 'onFileDrop($event)',
  },
})
export class InventoryPageComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly handoff = inject(ImportHandoff);
  protected readonly layout = inject(ShellLayout);
  protected readonly store = inject(InventoryStore);
  protected readonly actions = inject(InventoryActions);
  private readonly binderActions = inject(BinderActionsService);
  protected readonly games = inject(GamesStore);

  /** Query parameters (bound by the router). */
  readonly tab = input<string | undefined>();
  readonly binder = input<string | undefined>();
  readonly q = input<string | undefined>();
  readonly game = input<string | undefined>();
  readonly visibility = input<string | undefined>();
  readonly freshness = input<string | undefined>();
  readonly sort = input<string | undefined>();
  readonly dir = input<string | undefined>();
  readonly view = input<string | undefined>();
  readonly item = input<string | undefined>();
  /** `?add=new` (the "n" shortcut), or `?card=<cardId>&add=<printingId>` (a card page). */
  readonly add = input<string | undefined>();
  readonly card = input<string | undefined>();
  /** `?quick=1`: Shift+N. */
  readonly quick = input<string | undefined>();

  private readonly table = viewChild(InventoryTableComponent);
  private readonly grid = viewChild(InventoryGridComponent);
  private readonly editDrawer = viewChild(EditCardDrawerComponent);
  private readonly binderDrawer = viewChild(EditBinderDrawerComponent);

  protected readonly unfiled = UNFILED;
  protected readonly skeletonRows = Array.from({ length: 8 }, (_, index) => index);
  protected readonly skeletonTiles = Array.from({ length: 14 }, (_, index) => index);
  /** `null` until Firebase restored the session. */
  protected readonly signedIn = signal<boolean | null>(null);
  protected readonly bulkBusy = signal(false);
  protected readonly confirming = signal(false);
  protected readonly drawer = signal<Drawer | null>(null);
  protected readonly quickOpen = signal(false);
  protected readonly selectMode = signal(false);
  protected readonly drag = signal<(CardDrag & { ids: string[]; arts: (string | null)[] }) | null>(
    null,
  );
  protected readonly fileOver = signal(false);
  private readonly storedView = signal<InventoryView>(rememberedView());
  /** The element that opened a drawer gets the focus back when it closes. */
  private opener: HTMLElement | null = null;

  protected readonly params = computed<InventoryParams>(() =>
    parseInventoryParams({
      tab: this.tab(),
      binder: this.binder(),
      q: this.q(),
      game: this.game(),
      visibility: this.visibility(),
      freshness: this.freshness(),
      sort: this.sort(),
      dir: this.dir(),
      view: this.view(),
      item: this.item(),
    }),
  );
  protected readonly currentView = computed<InventoryView>(
    () => this.params().view ?? this.storedView(),
  );
  protected readonly wide = computed(() => !this.layout.narrow() && !this.layout.medium());
  protected readonly drawerModal = computed(() => !this.wide());
  protected readonly editItem = computed(() => {
    const id = this.params().item;
    return id ? (this.store.itemsById().get(id) ?? this.loadedEdit()) : null;
  });
  private readonly loadedEdit = signal<InventoryItemResponse | null>(null);
  protected readonly drawerOpen = computed(() => !!this.drawer() || !!this.params().item);
  protected readonly selectedBinder = computed<BinderResponse | null>(() => {
    const id = this.params().binder;
    return id && id !== UNFILED ? (this.store.bindersById().get(id) ?? null) : null;
  });
  protected readonly editingBinder = computed(() => {
    const drawer = this.drawer();
    return drawer?.kind === 'binder'
      ? (this.store.bindersById().get(drawer.binderId) ?? null)
      : null;
  });
  /** A binder id in the URL that is not (or no longer) one of the collector's binders. */
  protected readonly unknownBinder = computed(() => {
    const id = this.params().binder;
    return !!id && id !== UNFILED && this.store.binders() !== null && !this.selectedBinder();
  });
  protected readonly listTitle = computed(() => {
    const binder = this.params().binder;
    if (binder === UNFILED) {
      return 'Unfiled';
    }
    return this.selectedBinder()?.name ?? 'All cards';
  });
  protected readonly tabs = computed<UnderlineTab[]>(() => {
    const summary = this.store.summary();
    const binders = this.store.binders();
    const cards = this.params().tab === 'cards';
    return [
      {
        id: 'cards',
        label: 'Cards',
        count: summary?.totalItems ?? null,
        commands: [],
        queryParams: { tab: null } as Record<string, string | null>,
        active: cards,
      },
      {
        id: 'binders',
        label: 'Binders',
        count: binders?.length ?? null,
        commands: [],
        queryParams: { tab: 'binders', item: null },
        active: !cards,
      },
    ];
  });
  protected readonly summaryLine = computed(() => {
    const summary = this.store.summary();
    if (!summary || summary.totalItems === 0) {
      return null;
    }
    const pub = summary.byVisibility.PUBLIC + summary.byVisibility.TEMPORARILY_PUBLIC;
    return {
      cards: `${summary.totalItems} ${summary.totalItems === 1 ? 'card' : 'cards'}`,
      rest: ` · ${summary.totalQuantity} ${summary.totalQuantity === 1 ? 'copy' : 'copies'} · ${pub} public`,
    };
  });
  /** "For trade: do you still have these 9 cards?" (spec 9.3). */
  protected readonly needsConfirm = computed(() => {
    const summary = this.store.summary();
    return summary ? summary.staleCount + summary.hiddenCount : 0;
  });
  protected readonly hiddenCount = computed(() => this.store.summary()?.hiddenCount ?? 0);
  /** "3 public cards aren't visible yet" (spec 9.3). */
  protected readonly notVisible = computed(() => {
    const summary = this.store.summary();
    if (!summary) {
      return 0;
    }
    const pub = summary.byVisibility.PUBLIC + summary.byVisibility.TEMPORARILY_PUBLIC;
    return Math.max(0, pub - summary.effectivePublicCount - summary.hiddenCount);
  });
  protected readonly rows = computed<InventoryRow[]>(() => {
    const selection = this.store.selection();
    const busy = this.store.busyItems();
    const highlighted = this.store.highlighted();
    const saved = this.store.saved();
    const binders = this.store.bindersById();
    const ownerVisible = this.store.ownerVisible();
    const now = Date.now();
    return this.store.items().map((item) => {
      const state = item.freshness.state;
      return {
        item,
        tag: itemVisibilityTag(item, {
          binder: item.binder ? binders.get(item.binder.id) : null,
          ownerVisible,
          now,
        }),
        binderName: item.binder ? (binders.get(item.binder.id)?.name ?? item.binder.name) : null,
        price: itemPriceText(item),
        age: shortAge(item.updatedAt, now),
        dot: state === 'AGING' ? 'aging' : state === 'STALE' || state === 'HIDDEN' ? 'stale' : null,
        selected: selection.has(item.id),
        busy: busy.has(item.id),
        highlighted: highlighted.has(item.id),
        saved: saved.has(item.id),
      };
    });
  });
  protected readonly listFiltered = computed(() => hasActiveFilters(this.params()));
  protected readonly isEmptyInventory = computed(
    () => this.store.summary()?.totalItems === 0 && !hasActiveFilters(this.params()),
  );
  protected readonly errorMessage = computed(() => {
    const error = this.store.itemsError();
    return error ? friendlyMessage(error) : '';
  });
  protected readonly editPosition = computed(() => {
    const item = this.editItem();
    if (!item) {
      return '';
    }
    const at = this.store.items().findIndex((candidate) => candidate.id === item.id);
    const total = this.store.total();
    return at < 0 ? `In ${this.listTitle()}` : `${at + 1} of ${total} in ${this.listTitle()}`;
  });
  protected readonly editNeighbours = computed(() => {
    const item = this.editItem();
    const items = this.store.items();
    const at = item ? items.findIndex((candidate) => candidate.id === item.id) : -1;
    return {
      previous: at > 0 ? items[at - 1] : null,
      next: at >= 0 && at < items.length - 1 ? items[at + 1] : null,
    };
  });
  protected readonly dragCount = computed(() => this.drag()?.count ?? 1);
  protected readonly dragArts = computed(() => this.drag()?.arts ?? []);
  protected readonly coreTag = deckCoreTag;
  protected readonly binderChoice = binderVisibilityChoice;

  private handledAdd: string | null = null;
  private handledQuick = false;

  constructor() {
    void this.auth.ready().then(() => {
      const signedIn = this.auth.isAuthenticated();
      this.signedIn.set(signedIn);
      if (signedIn) {
        void this.games.load();
        this.store.loadContext();
      }
    });
    // The cards follow the URL (not the drawer or the view).
    effect(() => {
      const params = this.params();
      if (this.signedIn() && params.tab === 'cards') {
        untracked(() => this.store.loadItems(params));
      }
    });
    // `?item=` of a card not among the loaded rows (a link): fetch it for the drawer.
    effect(() => {
      const id = this.params().item;
      const known = id ? this.store.itemsById().has(id) : true;
      if (this.signedIn() && id && !known && this.store.loaded() !== null) {
        untracked(() => {
          if (this.loadedEdit()?.id !== id) {
            this.store.getItem(id).then(
              (item) => this.loadedEdit.set(item),
              () => this.navigate({ item: null }, true),
            );
          }
        });
      }
    });
    // "n" and the card page: Add cards.
    effect(() => {
      const printingId = this.add();
      const cardId = this.card();
      const key = `${cardId}|${printingId}`;
      const fresh = printingId === 'new' && !cardId;
      if (!printingId && !cardId) {
        this.handledAdd = null;
      }
      if (this.signedIn() && (cardId || fresh) && this.handledAdd !== key) {
        this.handledAdd = key;
        untracked(() => {
          this.navigate({ add: null, card: null, tab: null }, true);
          this.openAdd(fresh ? null : (cardId ?? null), fresh ? null : (printingId ?? null));
        });
      }
    });
    // Shift+N: quick add rows (the table view, not below 960).
    effect(() => {
      const quick = this.quick() === '1';
      if (!quick) {
        this.handledQuick = false;
      }
      if (this.signedIn() && quick && !this.handledQuick) {
        this.handledQuick = true;
        untracked(() => {
          this.navigate({ quick: null, tab: null, view: 'table' }, true);
          this.openQuick();
        });
      }
    });
    // Ctrl/Cmd+Z (outside a text field): the last Undo (spec 4.9).
    const onKey = (event: KeyboardEvent) => this.onDocumentKey(event);
    this.document.addEventListener('keydown', onKey);
    inject(DestroyRef).onDestroy(() => this.document.removeEventListener('keydown', onKey));
  }

  protected get returnUrl(): string {
    return this.router.url;
  }

  // --- filters, view and pages ---------------------------------------------------------------

  protected onParams(change: InventoryParamChange): void {
    this.navigate(change, 'q' in change);
  }

  protected clearFilters(): void {
    this.navigate({ ...CLEARED_FILTERS, binder: null });
  }

  protected setView(view: InventoryView): void {
    rememberView(view);
    this.storedView.set(view);
    this.selectMode.set(false);
    if (view === 'grid') {
      this.quickOpen.set(false);
    }
    this.navigate({ view: null }, true);
  }

  protected reload(): void {
    this.store.refresh();
  }

  protected showStale(): void {
    const summary = this.store.summary();
    this.navigate({ freshness: summary && summary.staleCount > 0 ? 'STALE' : 'HIDDEN', tab: null });
  }

  protected showNotVisible(): void {
    this.navigate({ visibility: 'PUBLIC', freshness: null, tab: null });
  }

  protected async stillHaveThem(): Promise<void> {
    this.confirming.set(true);
    try {
      await this.actions.confirmAll();
    } finally {
      this.confirming.set(false);
    }
  }

  // --- drawers -------------------------------------------------------------------------------

  protected openEdit(item: InventoryItemResponse): void {
    this.rememberOpener();
    this.drawer.set(null);
    this.navigate({ item: item.id }, !!this.params().item);
  }

  protected openAdd(cardId: string | null = null, printingId: string | null = null): void {
    this.rememberOpener();
    if (this.params().item) {
      this.navigate({ item: null }, true);
    }
    this.drawer.set({ kind: 'add', cardId, printingId });
  }

  protected openQuick(): void {
    if (this.layout.narrow()) {
      // No quick add rows below 960 (spec 16): Add cards instead.
      this.openAdd();
      return;
    }
    this.drawer.set(null);
    this.quickOpen.set(true);
  }

  protected openBinder(binder: BinderResponse, focusCore = false): void {
    this.rememberOpener();
    if (this.params().item) {
      this.navigate({ item: null }, true);
    }
    this.drawer.set({ kind: 'binder', binderId: binder.id, focusCore });
  }

  protected closeDrawer(): void {
    this.drawer.set(null);
    if (this.params().item) {
      this.navigate({ item: null }, true);
    }
    this.loadedEdit.set(null);
    const opener = this.opener;
    this.opener = null;
    setTimeout(() => {
      if (opener?.isConnected) {
        opener.focus();
      }
    });
  }

  protected editNavigate(step: -1 | 1): void {
    const target = step === -1 ? this.editNeighbours().previous : this.editNeighbours().next;
    if (target) {
      this.navigate({ item: target.id }, true);
    }
  }

  protected onEditDeleted(item: InventoryItemResponse): void {
    const { next, previous } = this.editNeighbours();
    const target = next ?? previous;
    this.navigate({ item: target && target.id !== item.id ? target.id : null }, true);
  }

  protected onAddMany(choice: AddManyChoice): void {
    if (choice === 'quick') {
      this.drawer.set(null);
      this.navigate({ view: 'table' }, true);
      this.openQuick();
      return;
    }
    void this.router.navigate(['/inventory/import'], {
      queryParams: { source: choice === 'csv' ? 'csv' : 'ydk' },
    });
  }

  protected viewAdded(id: string): void {
    this.drawer.set(null);
    this.navigate({ item: id }, false);
  }

  protected seeBinderCards(binder: BinderResponse): void {
    this.drawer.set(null);
    this.navigate({ tab: null, binder: binder.id, item: null });
  }

  protected onBinderDeleted(binder: BinderResponse): void {
    this.drawer.set(null);
    if (this.params().binder === binder.id) {
      this.navigate({ binder: null });
    }
  }

  // --- rows ----------------------------------------------------------------------------------

  protected onSelection(change: SelectionChange): void {
    this.store.toggleSelection(change.id, change.selected, change.range ?? false);
  }

  protected onQuantity(change: QuantityChange): void {
    void this.actions.inline('copies', () => this.store.setQuantity(change.item, change.quantity));
  }

  protected onPrice(change: { item: InventoryItemResponse; text: string | null }): void {
    void this.actions.inline('price', () => this.store.setPrice(change.item, change.text));
  }

  protected onRowAction(action: RowAction): void {
    switch (action.kind) {
      case 'edit':
        this.openEdit(action.item);
        return;
      case 'move':
        void this.actions.inline('binder', () =>
          this.store.setBinder(action.item, action.binderId),
        );
        return;
      case 'visibility':
        void this.actions.inline('visibility', () =>
          this.store.setVisibility(action.item, action.visibility),
        );
        return;
      case 'confirm':
        void this.actions.confirmOne(action.item);
        return;
      case 'delete':
        void this.actions.deleteOne(action.item);
        return;
    }
  }

  protected onEscape(): void {
    if (this.store.selectedCount() > 0) {
      this.store.clearSelection();
    }
  }

  protected async onBulk(action: BulkAction): Promise<void> {
    const ids = [...this.store.selection()];
    this.bulkBusy.set(true);
    try {
      await this.actions.bulk(action, ids);
    } finally {
      this.bulkBusy.set(false);
    }
  }

  protected async newBinderFromSelection(): Promise<void> {
    const selection = this.binderActions.selectionOf(this.store.selection());
    const games = new Set(selection.map((item) => item.card.game));
    const result = await this.binderActions.create({
      selection,
      game: games.size === 1 ? [...games][0] : null,
    });
    if (result) {
      this.store.clearSelection();
      if (result.deckCore) {
        this.openBinder(result.binder, true);
      }
    }
  }

  // --- binders -------------------------------------------------------------------------------

  protected async newBinder(): Promise<void> {
    const pane = this.selectedBinder();
    const result = await this.binderActions.create({ game: pane ? binderGame(pane) : null });
    if (!result) {
      return;
    }
    if (result.deckCore) {
      this.openBinder(result.binder, true);
    } else if (this.params().tab === 'cards') {
      this.navigate({ binder: result.binder.id });
    }
  }

  protected async onBinderAction(action: BinderPaneAction): Promise<void> {
    switch (action.kind) {
      case 'edit':
        this.openBinder(action.binder);
        return;
      case 'visibility':
        await this.binderActions.toggleVisibility(action.binder);
        return;
      case 'move':
        await this.binderActions.move(action.binder, action.offset);
        return;
      case 'delete':
        if (await this.binderActions.remove(action.binder)) {
          this.onBinderDeleted(action.binder);
        }
        return;
    }
  }

  protected onReorder(event: { binder: BinderResponse; offset: number }): void {
    void this.binderActions.move(event.binder, event.offset);
  }

  protected async setBinderVisibility(binder: BinderResponse, choice: string): Promise<void> {
    if (choice !== binderVisibilityChoice(binder)) {
      await this.binderActions.toggleVisibility(binder);
    }
  }

  protected confirmBinder(binder: BinderResponse): void {
    void this.binderActions.confirm(binder);
  }

  // --- drag to a binder (spec 9.7) -----------------------------------------------------------

  protected onDragStart(item: InventoryItemResponse): void {
    const selection = this.store.selection();
    const items = selection.has(item.id) ? this.store.selectedItems() : [item];
    this.drag.set({
      ids: items.map((candidate) => candidate.id),
      games: [...new Set(items.map((candidate) => candidate.card.game))],
      count: items.length,
      over: null,
      arts: items.slice(0, 3).map((candidate) => printingImageUrl(candidate.printing)),
    });
  }

  protected onDragMove(event: RowDrag): void {
    const drag = this.drag();
    if (!drag) {
      return;
    }
    const over = this.targetAt(event.pointer);
    if (over !== drag.over) {
      this.drag.set({ ...drag, over });
    }
  }

  protected async onDragEnd(event: RowDrag): Promise<void> {
    const drag = this.drag();
    this.drag.set(null);
    if (!drag) {
      return;
    }
    const over = this.targetAt(event.pointer);
    if (!over) {
      return;
    }
    if (over === UNFILED) {
      await this.actions.bulk({ kind: 'move', binderId: null, binderName: null }, drag.ids);
      return;
    }
    const binder = this.store.bindersById().get(over);
    const game = binder ? binderGame(binder) : null;
    if (!binder || (game && drag.games.some((candidate) => candidate !== game))) {
      return;
    }
    await this.actions.bulk(
      { kind: 'move', binderId: binder.id, binderName: binder.name, binderGame: game },
      drag.ids,
    );
  }

  private targetAt(point: { x: number; y: number }): string | null {
    const element = this.document.elementFromPoint(point.x, point.y);
    return element?.closest<HTMLElement>('[data-drop-target]')?.dataset['dropTarget'] ?? null;
  }

  // --- file drop (spec 9.7): a .ydk or .csv opens Import -------------------------------------

  protected onFileDrag(event: DragEvent): void {
    if (!event.dataTransfer?.types.includes('Files') || this.drawerOpen()) {
      return;
    }
    event.preventDefault();
    this.fileOver.set(true);
  }

  protected onFileLeave(event: DragEvent): void {
    if (
      !event.relatedTarget ||
      !(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node)
    ) {
      this.fileOver.set(false);
    }
  }

  protected onFileDrop(event: DragEvent): void {
    this.fileOver.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (!file || this.drawerOpen()) {
      return;
    }
    event.preventDefault();
    const source = sourceOfFile(file.name);
    this.handoff.give(file);
    void this.router.navigate(['/inventory/import'], {
      queryParams: { source: source === 'COLLECTR_CSV' ? 'csv' : 'ydk' },
    });
  }

  // --- helpers -------------------------------------------------------------------------------

  protected isPrivate(item: InventoryItemResponse): boolean {
    return cardFormOf(item).visibility === 'PRIVATE';
  }

  private onDocumentKey(event: KeyboardEvent): void {
    const mod = event.ctrlKey || event.metaKey;
    if (mod && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'z') {
      if (
        isEditableTarget(event.target) ||
        this.document.querySelector('.cdk-overlay-container [role="dialog"]')
      ) {
        return;
      }
      if (this.actions.hasUndo()) {
        event.preventDefault();
        void this.actions.undoLast();
      }
    }
  }

  private rememberOpener(): void {
    const active = this.document.activeElement as HTMLElement | null;
    this.opener = active && active !== this.document.body ? active : null;
  }

  private navigate(queryParams: Record<string, string | null>, replaceUrl = false): void {
    void this.router.navigate([], { queryParams, queryParamsHandling: 'merge', replaceUrl });
  }
}
