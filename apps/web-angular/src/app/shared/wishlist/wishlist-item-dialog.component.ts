import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { ReactiveFormsModule } from '@angular/forms';
import {
  CardDetail,
  CatalogService,
  PrintingSummary,
  WishlistItemResponse,
  WishlistService,
} from '@orenji/api-client';
import { Subscription, firstValueFrom, map, of, switchMap } from 'rxjs';
import { ApiError, toApiError } from '../../core/http/api-error';
import { friendlyError, friendlyMessage } from '../../core/http/api-error-messages';
import { silentErrors } from '../../core/http/http-context';
import { limitReachedInfo } from '../../core/limits/limit-reached';
import { CardImageComponent } from '../ui/card-image/card-image.component';
import { PrintingPickerComponent } from '../catalog/printing-picker/printing-picker.component';
import type { PrintingSelection } from '../catalog/printing-picker/printing-selection';
import { ErrorStateComponent } from '../ui/error-state/error-state.component';
import { GameChipComponent } from '../ui/game-chip/game-chip.component';
import { SkeletonComponent } from '../ui/skeleton/skeleton.component';
import { PriceTermsStore } from './price-terms.store';
import { PickedCard, WishCardPickerComponent } from './wish-card-picker.component';
import { WishFieldsComponent } from './wish-fields.component';
import {
  WISH_ITEMS_LIMIT_KEY,
  WishForm,
  WishFormValue,
  applyServerErrors,
  createWishForm,
  newWishDefaults,
  selectionOf,
  toCreateWishRequest,
  toUpdateWishRequest,
  wishFormFromItem,
} from './wishlist-form';

/**
 * Add a wish (optionally for a known card, printing or "any printing" of one rarity) or edit an
 * existing one.
 */
export type WishlistDialogData =
  | { mode: 'create'; cardId?: string | null; printingId?: string | null; rarity?: string | null }
  | { mode: 'edit'; item: WishlistItemResponse };

/** Opens the dialog; it closes with the saved wish, or `undefined` when cancelled. */
export function openWishlistDialog(
  injector: Injector,
  data: WishlistDialogData,
): MatDialogRef<WishlistItemDialogComponent, WishlistItemResponse> {
  return injector
    .get(MatDialog)
    .open<WishlistItemDialogComponent, WishlistDialogData, WishlistItemResponse>(
      WishlistItemDialogComponent,
      {
        data,
        injector,
        panelClass: 'app-dialog--lg',
        autoFocus: 'first-tabbable',
        restoreFocus: true,
        maxHeight: '92dvh',
      },
    );
}

/**
 * The add/edit wish dialog (stage S2): card autocomplete (`GET /cards/suggest`), then the public
 * note, "Near Mint only", one optional price term (`GET /wishlist/price-terms`) and which copy
 * (the shared printing picker: any printing by default, any printing of one rarity, or one
 * printing). Wishlist alerts come from collectors of the same platform region (ADR 0017). Saves
 * with `POST /wishlist` or `PATCH /wishlist/{id}`; the same selection twice (409) and plan limits
 * (429, the limit dialog opens too) are explained inline.
 */
@Component({
  selector: 'app-wishlist-item-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    CardImageComponent,
    ErrorStateComponent,
    GameChipComponent,
    SkeletonComponent,
    PrintingPickerComponent,
    WishCardPickerComponent,
    WishFieldsComponent,
  ],
  template: `
    <h2 mat-dialog-title>{{ editing ? 'Edit wish' : 'Add to wishlist' }}</h2>
    <mat-dialog-content class="wd__content">
      @if (cardError(); as error) {
        <app-error-state
          compact
          title="This card could not load"
          [message]="error"
          (retry)="reloadCard()"
        />
      } @else if (card(); as card) {
        <div class="wd__card" data-testid="wish-card">
          <app-card-image
            class="wd__card-img"
            [src]="cardImage()"
            [alt]="card.name ?? ''"
            [game]="card.game ?? ''"
          />
          <div class="wd__card-text">
            <app-game-chip [slug]="card.game ?? ''" />
            <h3 class="wd__card-name">{{ card.name }}</h3>
            <p class="wd__muted">
              {{ printings().length }} {{ printings().length === 1 ? 'printing' : 'printings' }}
              in the catalog
            </p>
          </div>
          @if (!editing) {
            <button matButton type="button" class="wd__change" (click)="changeCard()">
              <mat-icon aria-hidden="true">swap_horiz</mat-icon>
              Change card
            </button>
          }
        </div>
        @if (form(); as form) {
          <form id="wish-form" [formGroup]="form" (ngSubmit)="save()" novalidate class="wd__form">
            <app-wish-fields
              [form]="form"
              [terms]="priceTerms.terms()"
              [termsError]="priceTerms.status() === 'error'"
              [marketPrice]="selectedPrinting()?.marketPrice ?? null"
            />
            <app-printing-picker
              [printings]="printings()"
              [value]="selection()"
              [game]="card.game ?? ''"
              (valueChange)="choose($event)"
            />
            @if (selectionError(); as message) {
              <p class="wd__field-error" role="alert">{{ message }}</p>
            }
          </form>
        }
      } @else if (loadingCard()) {
        <div aria-busy="true">
          <span class="visually-hidden">Loading the card</span>
          <app-skeleton variant="list" lines="3" />
        </div>
      } @else {
        <p class="wd__lead">
          Which card are you looking for? We'll tell you when a collector of your region lists it.
        </p>
        <app-wish-card-picker (picked)="pick($event)" />
      }
      @if (error(); as error) {
        <p class="wd__error" role="alert" data-testid="wish-error">
          <mat-icon aria-hidden="true">error</mat-icon>
          {{ error }}
        </p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" mat-dialog-close>Cancel</button>
      <button matButton="filled" type="submit" form="wish-form" [disabled]="!form() || saving()">
        <mat-icon aria-hidden="true">{{ editing ? 'save' : 'favorite' }}</mat-icon>
        {{ saveLabel() }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .wd__content {
      min-height: 240px;
    }
    .wd__form {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-4);
    }
    .wd__field-error {
      margin: 0;
      color: var(--color-danger);
      font-size: var(--font-size-sm);
    }
    .wd__lead {
      margin: 0 0 var(--spacing-4);
      color: var(--color-text-muted);
    }
    .wd__card {
      display: flex;
      align-items: center;
      gap: var(--spacing-4);
      margin-bottom: var(--spacing-5);
      padding: var(--spacing-3);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface-variant);
    }
    .wd__card-img {
      flex: 0 0 64px;
      width: 64px;
    }
    .wd__card-text {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;
      min-width: 0;
    }
    .wd__card-name {
      font-size: var(--font-size-lg);
    }
    .wd__muted {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .wd__change {
      flex: 0 0 auto;
    }
    .wd__error {
      display: flex;
      align-items: flex-start;
      gap: var(--spacing-2);
      margin: var(--spacing-4) 0 0;
      padding: var(--spacing-3);
      border-radius: var(--radius-md);
      background: color-mix(in srgb, var(--color-danger) 10%, var(--color-surface));
      color: var(--color-danger);
      font-size: var(--font-size-sm);
    }
    @media (max-width: 599px) {
      .wd__card {
        flex-wrap: wrap;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WishlistItemDialogComponent {
  private readonly data = inject<WishlistDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef =
    inject<MatDialogRef<WishlistItemDialogComponent, WishlistItemResponse>>(MatDialogRef);
  private readonly catalog = inject(CatalogService);
  private readonly wishlistApi = inject(WishlistService);
  protected readonly priceTerms = inject(PriceTermsStore);

  protected readonly editing = this.data.mode === 'edit';

  protected readonly card = signal<CardDetail | null>(null);
  protected readonly loadingCard = signal(false);
  protected readonly cardError = signal<string | null>(null);
  protected readonly form = signal<WishForm | null>(null);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly printings = computed<PrintingSummary[]>(() => this.card()?.printings ?? []);
  /** Which copy, mirrored from the form (the picker's value). */
  protected readonly selection = signal<PrintingSelection>({ printingId: null, rarity: null });
  protected readonly selectedPrinting = computed(
    () => this.printings().find((printing) => printing.id === this.selection().printingId) ?? null,
  );
  /** A server error about which copy (the picker has no inline error of its own). */
  protected readonly selectionError = signal<string | null>(null);
  protected readonly cardImage = computed(() => this.card()?.primaryImageUrl ?? null);
  protected readonly saveLabel = computed(() => {
    if (this.saving()) {
      return 'Saving…';
    }
    return this.editing ? 'Save changes' : 'Add to wishlist';
  });

  private cardSubscription: Subscription | null = null;
  private cardRequest: { cardId: string | null; printingId: string | null } | null = null;

  constructor() {
    void this.priceTerms.load();
    inject(DestroyRef).onDestroy(() => this.cardSubscription?.unsubscribe());
    if (this.data.mode === 'edit') {
      const item = this.data.item;
      this.setForm(wishFormFromItem(item));
      if (item.card?.id) {
        this.openCard(item.card.id, null);
      }
    } else if (this.data.cardId || this.data.printingId) {
      this.openCard(this.data.cardId ?? null, this.data.printingId ?? null);
    }
  }

  /** The picker chose another copy. */
  protected choose(selection: PrintingSelection): void {
    const form = this.form();
    if (!form) {
      return;
    }
    form.patchValue({
      printingId: selection.printingId ?? '',
      rarity: selection.printingId ? '' : (selection.rarity ?? ''),
    });
    this.selectionError.set(null);
    this.selection.set(selection);
  }

  private setForm(value: WishFormValue): void {
    this.form.set(createWishForm(value));
    this.selection.set(selectionOf(value));
  }

  protected pick(picked: PickedCard): void {
    this.openCard(picked.cardId, picked.printingId);
  }

  protected changeCard(): void {
    this.cardSubscription?.unsubscribe();
    this.card.set(null);
    this.form.set(null);
    this.selection.set({ printingId: null, rarity: null });
    this.selectionError.set(null);
    this.cardError.set(null);
    this.error.set(null);
    this.cardRequest = null;
  }

  protected reloadCard(): void {
    if (this.cardRequest) {
      this.openCard(this.cardRequest.cardId, this.cardRequest.printingId);
    }
  }

  protected async save(): Promise<void> {
    const form = this.form();
    const card = this.card();
    if (!form || !card?.id || this.saving()) {
      return;
    }
    if (form.invalid) {
      form.markAllAsTouched();
      this.error.set('Check the highlighted fields.');
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      const value = form.getRawValue();
      const saved =
        this.data.mode === 'edit'
          ? await firstValueFrom(
              this.wishlistApi.updateWishlistItem(
                { id: this.data.item.id, updateWishlistItemRequest: toUpdateWishRequest(value) },
                'body',
                false,
                { context: silentErrors() },
              ),
            )
          : await firstValueFrom(
              this.wishlistApi.createWishlistItem(
                { createWishlistItemRequest: toCreateWishRequest(value, card.id) },
                'body',
                false,
                { context: silentErrors() },
              ),
            );
      this.dialogRef.close(saved);
    } catch (error) {
      this.showError(toApiError(error), form);
    } finally {
      this.saving.set(false);
    }
  }

  private showError(error: ApiError, form: WishForm): void {
    if (error.errorCode === 'LIMIT_REACHED') {
      // The limit dialog explains the plan limit as well (global interceptor).
      const info = limitReachedInfo(error);
      if (info.limitKey === WISH_ITEMS_LIMIT_KEY) {
        this.error.set(
          info.limit !== null
            ? `Your wishlist is full: your plan allows ${info.limit} wishes. Remove one or upgrade to add more.`
            : 'Your wishlist is full on your current plan. Remove a wish or upgrade to add more.',
        );
      } else {
        this.error.set(friendlyMessage(error));
      }
      return;
    }
    if (error.errorCode === 'CONFLICT') {
      this.error.set(
        error.message || 'This card is already on your wishlist with the same printing or rarity.',
      );
      return;
    }
    const fieldErrors = error.fieldErrors ?? {};
    this.selectionError.set(fieldErrors['printingId'] ?? fieldErrors['rarity'] ?? null);
    const unmapped = applyServerErrors(form, error.fieldErrors);
    this.error.set(
      unmapped.length
        ? `${friendlyError(error).message} (${unmapped.join('; ')})`
        : friendlyError(error).message,
    );
  }

  /** Loads the card (from a printing id when only that is known) and prepares the form. */
  private openCard(cardId: string | null, printingId: string | null): void {
    this.cardSubscription?.unsubscribe();
    this.cardRequest = { cardId, printingId };
    this.loadingCard.set(true);
    this.cardError.set(null);
    this.error.set(null);
    const cardIdOf = cardId
      ? of(cardId)
      : this.catalog
          .getPrinting({ id: printingId ?? '' }, 'body', false, { context: silentErrors() })
          .pipe(map((detail) => detail.card?.id ?? detail.printing?.cardId ?? ''));
    this.cardSubscription = cardIdOf
      .pipe(
        switchMap((id) => this.catalog.getCard({ id }, 'body', false, { context: silentErrors() })),
      )
      .subscribe({
        next: (card) => {
          this.loadingCard.set(false);
          this.card.set(card);
          if (!this.form()) {
            const known = (card.printings ?? []).some((printing) => printing.id === printingId);
            const rarity = this.data.mode === 'create' ? (this.data.rarity ?? null) : null;
            this.setForm(newWishDefaults(known ? { printingId } : { printingId: null, rarity }));
          }
        },
        error: (error: unknown) => {
          this.loadingCard.set(false);
          this.cardError.set(friendlyMessage(toApiError(error)));
        },
      });
  }
}
