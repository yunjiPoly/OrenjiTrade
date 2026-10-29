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
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import type { InventoryItemResponse } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { ToastService } from '../../../core/feedback/toast.service';
import { ApiError } from '../../../core/http/api-error';
import { friendlyError } from '../../../core/http/api-error-messages';
import { RegionContext } from '../../../core/region/region-context.service';
import { tcgplayerSearchUrl } from '../../../shared/catalog/tcgplayer';
import { gameInfo } from '../../../shared/domain/games';
import { printingCode, printingImageUrl } from '../../../shared/inventory/inventory-labels';
import { RegionsStore } from '../../../shared/regions/regions.store';
import { CardImageComponent } from '../../../shared/ui/card-image/card-image.component';
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from '../../../shared/ui/confirm-dialog/confirm-dialog.component';
import { GameMonogramComponent } from '../../../shared/ui/game-monogram/game-monogram.component';
import {
  CARD_FORM_COPY,
  CardFormErrors,
  CardFormValue,
  cardFormOf,
  hasErrors,
  legacyDetails,
  noteWithLegacy,
  serverCardErrors,
  temporaryPublicationEnded,
  toPatch,
  validateCardForm,
} from '../data/card-form';
import { InventoryActions, binderGameError } from '../data/inventory-actions.service';
import { InventoryStore } from '../data/inventory.store';
import { lastPriceMode } from '../data/item-price';
import { PhotoSlotsComponent } from '../ui/photo-slots.component';
import { CardFieldsComponent } from './card-fields.component';
import { DrawerFrameComponent } from './drawer-frame.component';

/**
 * The Edit card drawer (spec 9.8, board W12): the phone's Edit card beside the list. The header has
 * the art, the game, the name, the code and set, "Check TCGplayer price", Previous and Next
 * (Alt+↑ / Alt+↓, which save pending changes first and stay on the card when the save fails) and
 * Close. The fields are the phone's, then the photos; an old web form's condition, language and
 * edition show read-only with "Add to public note". The footer has "Delete this card" and "Save
 * changes" (Ctrl/Cmd+Enter), disabled as "No changes yet". Closing with changes asks first.
 */
@Component({
  selector: 'app-edit-card-drawer',
  imports: [
    MatButtonModule,
    MatIconModule,
    CardFieldsComponent,
    CardImageComponent,
    DrawerFrameComponent,
    GameMonogramComponent,
    PhotoSlotsComponent,
  ],
  template: `
    @let it = item();
    <app-drawer-frame
      titleId="edit-card-title"
      [modal]="modal()"
      (closeRequest)="requestClose()"
      (keydown)="onKey($event)"
      (dragover)="onDragOver($event)"
      (drop)="onDrop($event)"
    >
      <div drawerHead class="hd">
        <div class="hd__bar">
          <h2 id="edit-card-title" class="hd__title">Edit card</h2>
          <span class="hd__nav">
            <button
              matIconButton
              type="button"
              aria-label="Previous card"
              title="Previous card (Alt+↑)"
              [disabled]="!hasPrevious() || saving()"
              (click)="go(-1)"
              data-testid="edit-previous"
            >
              <mat-icon>keyboard_arrow_up</mat-icon>
            </button>
            <button
              matIconButton
              type="button"
              aria-label="Next card"
              title="Next card (Alt+↓)"
              [disabled]="!hasNext() || saving()"
              (click)="go(1)"
              data-testid="edit-next"
            >
              <mat-icon>keyboard_arrow_down</mat-icon>
            </button>
            <span class="hd__sep" aria-hidden="true"></span>
            <button matIconButton type="button" aria-label="Close" (click)="requestClose()">
              <mat-icon>close</mat-icon>
            </button>
          </span>
        </div>
        <p class="hd__pos">
          {{ position() }}
          <span class="hd__keys" aria-hidden="true"
            ><kbd>Alt+↑</kbd> <kbd>Alt+↓</kbd> save, then move</span
          >
        </p>
      </div>

      <div class="card">
        <app-card-image
          class="card__art"
          size="fill"
          [src]="image()"
          [game]="it.card.game"
          alt=""
        />
        <div class="card__text">
          <p class="card__game">
            <app-game-monogram [game]="it.card.game" size="16" />
            {{ gameLabel() }}
          </p>
          <p class="card__name">{{ it.card.name }}</p>
          <p class="card__meta">
            <span class="mono">{{ code() }}</span>
            @if (it.printing.setName) {
              · {{ it.printing.setName }}
            }
          </p>
          @if (it.printing.rarity) {
            <p class="card__meta">{{ it.printing.rarity }}</p>
          }
          <a class="card__tcg" [href]="tcgplayer()" target="_blank" rel="noopener noreferrer">
            Check TCGplayer price
            <mat-icon aria-hidden="true">open_in_new</mat-icon>
            <span class="visually-hidden">(opens TCGplayer in a new tab)</span>
          </a>
        </div>
      </div>

      @if (freshnessNotice(); as notice) {
        <div class="fresh" role="status">
          <mat-icon aria-hidden="true">history</mat-icon>
          <span>{{ notice }}</span>
          <button matButton type="button" [disabled]="saving()" (click)="confirmFresh()">
            Still available
          </button>
        </div>
      }

      <app-card-fields
        prefix="edit"
        [value]="form()"
        [errors]="errors()"
        [game]="it.card.game"
        [binders]="store.binders() ?? []"
        [regionName]="regionName()"
        [endedPublication]="ended()"
        (valueChange)="change($event)"
      >
        @if (legacy(); as details) {
          <p afterNote class="legacy">
            <span>{{ legacyLine(details) }}</span>
            <button type="button" class="legacy__add" (click)="addLegacy(details)">
              {{ copy.addToNote }}
            </button>
          </p>
        }
      </app-card-fields>

      <app-photo-slots
        class="photos"
        labelId="edit-photos"
        [photos]="it.images"
        [busy]="uploading()"
        [error]="photoError()"
        (upload)="upload($event)"
        (remove)="removePhoto($event)"
      />

      @if (saveError(); as error) {
        <p class="save-error" role="alert">{{ error }}</p>
      }

      <ng-container drawerFoot>
        <button type="button" class="delete" [disabled]="saving()" (click)="remove()">
          Delete this card
        </button>
        <span class="spacer"></span>
        <button
          matButton="filled"
          type="button"
          class="save"
          [disabled]="!dirty() || saving()"
          (click)="save()"
          data-testid="edit-save"
        >
          {{ saving() ? 'Saving…' : dirty() ? 'Save changes' : 'No changes yet' }}
        </button>
      </ng-container>
    </app-drawer-frame>
  `,
  styleUrl: './edit-card-drawer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditCardDrawerComponent {
  protected readonly store = inject(InventoryStore);
  private readonly actions = inject(InventoryActions);
  private readonly dialog = inject(MatDialog);
  private readonly injector = inject(Injector);
  private readonly toasts = inject(ToastService);
  private readonly region = inject(RegionContext);
  private readonly regions = inject(RegionsStore);

  readonly item = input.required<InventoryItemResponse>();
  /** "1 of 9 in Trade binder". */
  readonly position = input('');
  readonly hasPrevious = input(false, { transform: booleanAttribute });
  readonly hasNext = input(false, { transform: booleanAttribute });
  readonly modal = input(false, { transform: booleanAttribute });
  readonly closed = output<void>();
  readonly navigate = output<-1 | 1>();
  readonly deleted = output<InventoryItemResponse>();

  protected readonly copy = CARD_FORM_COPY;
  private readonly photos = viewChild(PhotoSlotsComponent);
  private readonly itemId = computed(() => this.item().id);
  /** The form of the card in the drawer; a new card (Previous, Next, another row) starts afresh. */
  protected readonly form = linkedSignal<string, CardFormValue>({
    source: this.itemId,
    computation: () => cardFormOf(untracked(this.item), Date.now(), lastPriceMode()),
  });
  protected readonly errors = signal<CardFormErrors>({});
  protected readonly saving = signal(false);
  protected readonly uploading = signal(false);
  protected readonly photoError = signal<string | null>(null);
  protected readonly saveError = signal<string | null>(null);

  protected readonly dirty = computed(() => toPatch(this.form(), this.item()) !== null);
  protected readonly image = computed(() => printingImageUrl(this.item().printing));
  protected readonly code = computed(() => printingCode(this.item().printing));
  protected readonly gameLabel = computed(() =>
    gameInfo(this.item().card.game).label.toUpperCase(),
  );
  protected readonly tcgplayer = computed(() =>
    tcgplayerSearchUrl(this.item().card.game, this.item().card.name),
  );
  protected readonly legacy = computed(() => legacyDetails(this.item()));
  protected readonly ended = computed(() => temporaryPublicationEnded(this.item()));
  protected readonly regionName = computed(() => {
    const home = this.region.home();
    return home ? this.regions.regionName(home) : null;
  });
  protected readonly freshnessNotice = computed(() => {
    const state = this.item().freshness.state;
    if (state === 'HIDDEN') {
      return 'This card is hidden from other collectors until you confirm it is still available.';
    }
    if (state === 'STALE' || state === 'AGING') {
      return 'This listing is getting old. Confirm it is still available to keep it fresh.';
    }
    return null;
  });

  constructor() {
    // A new card in the drawer: no old errors.
    effect(() => {
      this.itemId();
      untracked(() => {
        this.errors.set({});
        this.saveError.set(null);
        this.photoError.set(null);
      });
    });
  }

  protected legacyLine(details: string): string {
    return CARD_FORM_COPY.legacy(details);
  }

  protected change(change: Partial<CardFormValue>): void {
    this.form.update((value) => ({ ...value, ...change }));
    if (Object.keys(this.errors()).length) {
      this.errors.set(validateCardForm(this.form()));
    }
    this.saveError.set(null);
  }

  protected addLegacy(details: string): void {
    this.change({ publicNote: noteWithLegacy(this.form().publicNote, details) });
  }

  /** Saves; resolves true when there was nothing to save or the save worked. */
  async save(): Promise<boolean> {
    const patch = toPatch(this.form(), this.item());
    if (!patch) {
      return true;
    }
    const errors = validateCardForm(this.form());
    this.errors.set(errors);
    if (hasErrors(errors)) {
      this.saveError.set('Check the highlighted fields.');
      return false;
    }
    this.saving.set(true);
    this.saveError.set(null);
    try {
      const saved = await this.store.updateItem(this.item().id, patch);
      this.form.set(cardFormOf(saved, Date.now(), lastPriceMode()));
      const ref = this.toasts.show({ title: 'Saved', sub: saved.card.name, action: 'View' });
      ref
        .onAction()
        .subscribe(() =>
          document.querySelector<HTMLElement>(`[data-item-id="${saved.id}"]`)?.focus(),
        );
      return true;
    } catch (error) {
      const apiError = error as ApiError;
      const fields = serverCardErrors(apiError);
      this.errors.set(fields);
      const binder = this.store.bindersById().get(this.form().binderId ?? '');
      this.saveError.set(
        binderGameError(apiError, binder ? gameInfo(binder.game ?? '').label : null) ??
          (hasErrors(fields) ? 'Check the highlighted fields.' : friendlyError(apiError).message),
      );
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  /** Previous or Next: save first; a failed save stays on this card. */
  protected async go(step: -1 | 1): Promise<void> {
    if (await this.save()) {
      this.navigate.emit(step);
    }
  }

  /** Close; with unsaved changes ask "Discard your changes?" first. */
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
      message: 'The changes to this card are not saved.',
      confirmLabel: 'Discard',
      cancelLabel: 'Keep editing',
      tone: 'danger',
    });
  }

  protected async remove(): Promise<void> {
    const item = this.item();
    if (await this.actions.deleteOne(item)) {
      this.deleted.emit(item);
    }
  }

  protected async confirmFresh(): Promise<void> {
    this.saving.set(true);
    try {
      await this.actions.confirmOne(this.item());
    } finally {
      this.saving.set(false);
    }
  }

  protected async upload(file: File): Promise<void> {
    this.uploading.set(true);
    this.photoError.set(null);
    try {
      await this.store.uploadImage(this.item().id, file);
    } catch (error) {
      this.photoError.set(friendlyError(error as ApiError).message);
    } finally {
      this.uploading.set(false);
    }
  }

  protected async removePhoto(imageId: string): Promise<void> {
    this.uploading.set(true);
    this.photoError.set(null);
    try {
      await this.store.deleteImage(this.item(), imageId);
    } catch (error) {
      this.photoError.set(friendlyError(error as ApiError).message);
    } finally {
      this.uploading.set(false);
    }
  }

  protected onKey(event: KeyboardEvent): void {
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      const step = event.key === 'ArrowUp' ? -1 : 1;
      if ((step === -1 && this.hasPrevious()) || (step === 1 && this.hasNext())) {
        void this.go(step);
      }
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      void this.save();
    }
  }

  /** Images dropped on the open drawer go to Photos (spec 9.7). */
  protected onDragOver(event: DragEvent): void {
    if (event.dataTransfer?.types.includes('Files')) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  protected onDrop(event: DragEvent): void {
    const files = [...(event.dataTransfer?.files ?? [])];
    if (files.length === 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.photos()?.addFiles(files);
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
