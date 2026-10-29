import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  booleanAttribute,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { RouterLink } from '@angular/router';
import {
  BinderResponse,
  BindersService,
  InventoryItemResponse,
  InventoryService,
} from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { ToastService } from '../../../core/feedback/toast.service';
import { ApiError } from '../../../core/http/api-error';
import { friendlyError } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { RegionContext } from '../../../core/region/region-context.service';
import { GamesStore } from '../../../shared/catalog/games.store';
import { gameInfo } from '../../../shared/domain/games';
import { RegionsStore } from '../../../shared/regions/regions.store';
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from '../../../shared/ui/confirm-dialog/confirm-dialog.component';
import { GameMonogramComponent } from '../../../shared/ui/game-monogram/game-monogram.component';
import {
  SegmentOption,
  SegmentedComponent,
} from '../../../shared/ui/segmented/segmented.component';
import {
  BINDER_COPY,
  BINDER_NOTE_MAX,
  BinderFormErrors,
  BinderFormValue,
  BinderVisibilityChoice,
  binderFormChanged,
  binderFormOf,
  hasBinderErrors,
  toBinderPatch,
  validateBinderForm,
  withDeckCore,
} from '../data/binder-form';
import { gameOpenForBinders } from '../data/binder-games';
import { binderGameError } from '../data/inventory-actions.service';
import { InventoryStore } from '../data/inventory.store';
import { DrawerFrameComponent } from '../drawer/drawer-frame.component';
import { PhotoSlotsComponent } from '../ui/photo-slots.component';

const VISIBILITIES: readonly SegmentOption<BinderVisibilityChoice>[] = [
  { value: 'PRIVATE', label: 'Private', icon: 'lock' },
  { value: 'PUBLIC', label: 'Public', icon: 'public' },
];

interface KeyCard {
  item: InventoryItemResponse;
  /** Added or taken out on save. */
  pending: 'add' | 'remove' | null;
}

/**
 * The Edit binder drawer (spec 9.12, board W15): the name, the game (read-only with a lock once
 * the binder holds a card), [Private | Public], and "Sell as a deck core" (purple) with its
 * photos, price, public note, the amber "Buyers can only find a deck core when it is public." and
 * the key cards (a same-game typeahead of your cards; they move in or out on save). "See its
 * cards", "Delete binder" and "Save changes" (Ctrl/Cmd+Enter); closing with changes asks first.
 */
@Component({
  selector: 'app-edit-binder-drawer',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatSlideToggleModule,
    RouterLink,
    DrawerFrameComponent,
    GameMonogramComponent,
    PhotoSlotsComponent,
    SegmentedComponent,
  ],
  templateUrl: './edit-binder-drawer.component.html',
  styleUrl: './edit-binder-drawer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditBinderDrawerComponent {
  protected readonly store = inject(InventoryStore);
  protected readonly games = inject(GamesStore);
  private readonly bindersApi = inject(BindersService);
  private readonly inventoryApi = inject(InventoryService);
  private readonly dialog = inject(MatDialog);
  private readonly injector = inject(Injector);
  private readonly toasts = inject(ToastService);
  private readonly region = inject(RegionContext);
  private readonly regions = inject(RegionsStore);

  readonly binder = input.required<BinderResponse>();
  readonly modal = input(false, { transform: booleanAttribute });
  /** Open on the deck core fields (New binder with "Sell as a deck core"). */
  readonly focusCore = input(false, { transform: booleanAttribute });
  readonly closed = output<void>();
  readonly seeCards = output<BinderResponse>();
  readonly deleted = output<BinderResponse>();

  protected readonly copy = BINDER_COPY;
  protected readonly noteMax = BINDER_NOTE_MAX;
  protected readonly visibilities = VISIBILITIES;
  private readonly binderId = computed(() => this.binder().id);
  protected readonly form = linkedSignal<string, BinderFormValue>({
    source: this.binderId,
    computation: () => binderFormOf(untracked(this.binder)),
  });
  protected readonly errors = signal<BinderFormErrors>({});
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  protected readonly photoBusy = signal(false);
  protected readonly photoError = signal<string | null>(null);
  protected readonly keyCards = signal<KeyCard[]>([]);
  protected readonly keyLoading = signal(false);
  protected readonly keyQuery = signal('');
  protected readonly keyOptions = signal<InventoryItemResponse[]>([]);

  protected readonly cardsDirty = computed(() => this.keyCards().some((card) => card.pending));
  protected readonly dirty = computed(
    () => binderFormChanged(this.form(), this.binder()) || this.cardsDirty(),
  );
  protected readonly gameLabel = computed(() => gameInfo(this.form().game).label);
  protected readonly gameChoices = computed(() =>
    (this.games.games() ?? []).filter((game) => gameOpenForBinders(game)),
  );
  protected readonly photos = computed(() =>
    [...(this.binder().photos ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
  );
  protected readonly visibilityHint = computed(() => {
    if (this.form().visibility === 'PRIVATE') {
      return 'Only you see it and its cards.';
    }
    const home = this.region.home();
    return home
      ? `Collectors in ${this.regions.regionName(home)} can find it.`
      : 'Collectors in your region can find it.';
  });

  constructor() {
    void this.games.load();
    effect(() => {
      const id = this.binderId();
      untracked(() => {
        this.errors.set({});
        this.saveError.set(null);
        this.keyQuery.set('');
        this.keyOptions.set([]);
        void this.loadKeyCards(id);
      });
    });
    effect(() => {
      if (this.focusCore()) {
        setTimeout(() => document.getElementById('eb-core')?.scrollIntoView({ block: 'start' }));
      }
    });
  }

  protected countLine(): string {
    const count = this.binder().itemCount;
    return `${count} ${count === 1 ? 'card' : 'cards'} in this binder`;
  }

  protected change(change: Partial<BinderFormValue>): void {
    this.form.update((value) => ({ ...value, ...change }));
    if (Object.keys(this.errors()).length) {
      this.errors.set(validateBinderForm(this.form()));
    }
    this.saveError.set(null);
  }

  protected setCore(on: boolean): void {
    this.form.update((value) => withDeckCore(value, on));
  }

  protected text(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
  }

  protected async searchKeyCards(query: string): Promise<void> {
    this.keyQuery.set(query);
    const q = query.trim();
    if (q.length < 2) {
      this.keyOptions.set([]);
      return;
    }
    try {
      const page = await firstValueFrom(
        this.inventoryApi.listInventoryItems(
          { query: q, game: this.form().game, size: 8, sort: 'name', direction: 'asc' },
          'body',
          false,
          { context: silentErrors() },
        ),
      );
      const inBinder = new Set(this.keyCards().map((card) => card.item.id));
      this.keyOptions.set((page.items ?? []).filter((item) => !inBinder.has(item.id)));
    } catch {
      this.keyOptions.set([]);
    }
  }

  protected addKeyCard(item: InventoryItemResponse): void {
    this.keyCards.update((cards) => [...cards, { item, pending: 'add' }]);
    this.keyOptions.set([]);
    this.keyQuery.set('');
  }

  protected toggleKeyCard(card: KeyCard): void {
    this.keyCards.update((cards) =>
      card.pending === 'add'
        ? cards.filter((candidate) => candidate !== card)
        : cards.map((candidate) =>
            candidate === card
              ? { ...candidate, pending: candidate.pending === 'remove' ? null : 'remove' }
              : candidate,
          ),
    );
  }

  /** Saves; resolves true when it worked or there was nothing to save. */
  async save(): Promise<boolean> {
    if (!this.dirty()) {
      return true;
    }
    const errors = validateBinderForm(this.form());
    this.errors.set(errors);
    if (hasBinderErrors(errors)) {
      this.saveError.set('Check the highlighted fields.');
      return false;
    }
    const binder = this.binder();
    this.saving.set(true);
    this.saveError.set(null);
    try {
      const gameId = this.games.game(this.form().game)?.id ?? null;
      if (binderFormChanged(this.form(), binder)) {
        const saved = await this.store.updateBinder(
          binder.id,
          toBinderPatch(this.form(), binder, Date.now(), gameId),
        );
        this.form.set(binderFormOf(saved));
      }
      await this.saveKeyCards(binder);
      this.toasts.show({ title: 'Saved', sub: this.form().name.trim() });
      return true;
    } catch (error) {
      const apiError = error as ApiError;
      this.saveError.set(
        binderGameError(apiError, gameInfo(binder.game ?? this.form().game).label) ??
          friendlyError(apiError).message,
      );
      if (apiError.errorCode === 'BINDER_GAME_LOCKED') {
        this.form.update((value) => ({ ...value, game: binder.game ?? value.game }));
        this.store.loadBinders();
      }
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  async requestClose(): Promise<boolean> {
    if (!(await this.confirmLeave())) {
      return false;
    }
    this.closed.emit();
    return true;
  }

  /**
   * Whether the drawer may show something else (another card, Add cards, a binder): with unsaved
   * changes it asks "Discard your changes?" first.
   */
  async confirmLeave(): Promise<boolean> {
    if (!this.dirty()) {
      return true;
    }
    return this.confirm({
      title: 'Discard your changes?',
      message: 'The changes to this binder are not saved.',
      confirmLabel: 'Discard',
      cancelLabel: 'Keep editing',
      tone: 'danger',
    });
  }

  protected async remove(): Promise<void> {
    const binder = this.binder();
    const confirmed = await this.confirm({
      title: `Delete ${binder.name}?`,
      message: binder.sellsAsCore ? BINDER_COPY.deleteBodyCore : BINDER_COPY.deleteBodyPlain,
      confirmLabel: 'Delete binder',
      cancelLabel: 'Keep it',
      tone: 'danger',
    });
    if (!confirmed) {
      return;
    }
    try {
      await this.store.deleteBinder(binder.id);
      this.toasts.show({ title: 'Binder deleted', sub: binder.name });
      this.deleted.emit(binder);
    } catch (error) {
      this.saveError.set(friendlyError(error as ApiError).message);
    }
  }

  protected async upload(file: File): Promise<void> {
    this.photoBusy.set(true);
    this.photoError.set(null);
    try {
      await this.store.uploadBinderPhoto(this.binder().id, file);
    } catch (error) {
      this.photoError.set(friendlyError(error as ApiError).message);
    } finally {
      this.photoBusy.set(false);
    }
  }

  protected async removePhoto(imageId: string): Promise<void> {
    this.photoBusy.set(true);
    this.photoError.set(null);
    try {
      await this.store.deleteBinderPhoto(this.binder().id, imageId);
    } catch (error) {
      this.photoError.set(friendlyError(error as ApiError).message);
    } finally {
      this.photoBusy.set(false);
    }
  }

  protected onKey(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      void this.save();
    }
  }

  private async loadKeyCards(id: string): Promise<void> {
    this.keyCards.set([]);
    if (this.binder().itemCount === 0) {
      return;
    }
    this.keyLoading.set(true);
    try {
      const page = await firstValueFrom(
        this.bindersApi.listBinderItems({ id, size: 100 }, 'body', false, {
          context: silentErrors(),
        }),
      );
      if (this.binderId() === id) {
        this.keyCards.set((page.items ?? []).map((item) => ({ item, pending: null })));
      }
    } catch {
      // The key cards stay empty; the rest of the drawer works.
    } finally {
      this.keyLoading.set(false);
    }
  }

  private async saveKeyCards(binder: BinderResponse): Promise<void> {
    const added = this.keyCards()
      .filter((card) => card.pending === 'add')
      .map((card) => card.item.id);
    const removed = this.keyCards()
      .filter((card) => card.pending === 'remove')
      .map((card) => card.item.id);
    if (added.length) {
      await this.store.bulk(
        { kind: 'move', binderId: binder.id, binderName: binder.name, binderGame: binder.game },
        added,
      );
    }
    if (removed.length) {
      await this.store.bulk({ kind: 'move', binderId: null, binderName: null }, removed);
    }
    if (added.length || removed.length) {
      await this.loadKeyCards(binder.id);
    }
  }

  private confirm(data: ConfirmDialogData): Promise<boolean> {
    return firstValueFrom(
      this.dialog
        .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
          data,
          panelClass: 'app-dialog--confirm',
          injector: this.injector,
          autoFocus: 'first-tabbable',
          restoreFocus: true,
        })
        .afterClosed(),
    ).then((result) => !!result);
  }
}
