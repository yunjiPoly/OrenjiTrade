import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { hasModifierKey } from '@angular/cdk/keycodes';
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
import { ToastService } from '../../core/feedback/toast.service';
import { ShellIconComponent } from '../../core/layout/shell-icon/shell-icon.component';
import {
  type PrintingSelection,
  printingsWithCode,
} from '../catalog/printing-picker/printing-selection';
import { gameInfo } from '../domain/games';
import { printingCode } from '../inventory/inventory-labels';
import { CardImageComponent } from '../ui/card-image/card-image.component';
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from '../ui/confirm-dialog/confirm-dialog.component';
import { ErrorStateComponent } from '../ui/error-state/error-state.component';
import { SkeletonComponent } from '../ui/skeleton/skeleton.component';
import { PriceTermsStore } from './price-terms.store';
import { PickedCard, WishCardPickerComponent } from './wish-card-picker.component';
import { WishFieldsComponent } from './wish-fields.component';
import { specialEdition, specialFinish } from './wishlist-labels';
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

/**
 * Opens the dialog (520, spec 6.6); it closes with the saved wish, or `undefined` when cancelled
 * or removed. `returnFocus` is the element focus goes back to on close (the trigger, which may
 * have lost focus while the dialog chunk loaded); by default the element focused when it opens.
 */
export function openWishlistDialog(
  injector: Injector,
  data: WishlistDialogData,
  returnFocus: HTMLElement | null = null,
): MatDialogRef<WishlistItemDialogComponent, WishlistItemResponse> {
  return injector
    .get(MatDialog)
    .open<WishlistItemDialogComponent, WishlistDialogData, WishlistItemResponse>(
      WishlistItemDialogComponent,
      {
        data,
        injector,
        panelClass: 'app-dialog--form',
        autoFocus: 'first-tabbable',
        restoreFocus: returnFocus ?? true,
        maxHeight: '92dvh',
      },
    );
}

/** A value of the "Which copy" select: any printing, any printing of one rarity, or one printing. */
const ANY_COPY = 'any';
const RARITY_COPY = 'rarity:';

/** The select's value of a selection. */
export function copyValue(selection: PrintingSelection): string {
  return selection.printingId ?? (selection.rarity ? RARITY_COPY + selection.rarity : ANY_COPY);
}

/** The selection of a select value. */
export function copySelection(value: string): PrintingSelection {
  if (value.startsWith(RARITY_COPY)) {
    return { printingId: null, rarity: value.slice(RARITY_COPY.length) || null };
  }
  return value === ANY_COPY
    ? { printingId: null, rarity: null }
    : { printingId: value, rarity: null };
}

/**
 * The add/edit wish dialog of spec 6.6 (board W6, 520): first the card ("Find the card you want",
 * `GET /cards/suggest`), then the card with "{n} printings in the catalog" and Change, "Which
 * copy" (Any printing, any printing of one rarity, or one printing; an edition other than
 * Unlimited is named, two printings of one code differ by it), "Near Mint only", the price chips
 * (`GET /wishlist/price-terms`, never an amount) and the public note 0 / 280. Edit wish adds
 * "Remove from wishlist", confirmed by "You stop getting alerts for it." Wishlist alerts come from
 * collectors of the same platform region (ADR 0017). Saves with `POST /wishlist` or `PATCH
 * /wishlist/{id}`; the same selection twice (409) and usage limits (429, the limit dialog opens
 * too) are explained next to the buttons, outside the scrolling content, so the message is in
 * view whatever the scroll position; an invalid field also gets the focus. Once a card is chosen,
 * focus moves to its name (the autocomplete it came from is gone).
 */
@Component({
  selector: 'app-wishlist-item-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    CardImageComponent,
    ErrorStateComponent,
    SkeletonComponent,
    ShellIconComponent,
    WishCardPickerComponent,
    WishFieldsComponent,
  ],
  template: `
    <div class="wd__head">
      <h2 mat-dialog-title class="wd__title">{{ editing ? 'Edit wish' : 'Add a wish' }}</h2>
      <button type="button" class="wd__close" aria-label="Close" mat-dialog-close>
        <app-shell-icon name="close" [size]="20" />
      </button>
    </div>
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
            size="xs"
            [src]="cardImage()"
            [alt]="''"
            [game]="card.game ?? ''"
          />
          <div class="wd__card-text">
            <span class="wd__game">{{ gameLabel() }}</span>
            <h3 #cardHeading class="wd__card-name" tabindex="-1">{{ card.name }}</h3>
            <span class="wd__muted">
              {{ printings().length }} {{ printings().length === 1 ? 'printing' : 'printings' }}
              in the catalog
            </span>
          </div>
          @if (!editing) {
            <button type="button" class="wd__change" (click)="changeCard()">Change</button>
          }
        </div>
        @if (form(); as form) {
          <form id="wish-form" [formGroup]="form" (ngSubmit)="save()" novalidate class="wd__form">
            <div class="wd__copy">
              <mat-form-field appearance="outline" subscriptSizing="dynamic" class="wd__select">
                <mat-label>Which copy</mat-label>
                <mat-select
                  data-testid="wish-copy"
                  panelClass="wd__copy-panel"
                  [value]="copy()"
                  (valueChange)="chooseCopy($event)"
                >
                  <mat-option value="any" data-testid="printing-option-any"
                    >Any printing</mat-option
                  >
                  @for (rarity of rarities(); track rarity) {
                    <mat-option
                      [value]="'rarity:' + rarity"
                      [attr.data-testid]="'printing-option-rarity-' + rarity"
                      >Any printing · {{ rarity }}</mat-option
                    >
                  }
                  @for (printing of orderedPrintings(); track printing.id) {
                    <mat-option
                      [value]="printing.id"
                      [attr.data-testid]="'printing-option-' + printing.id"
                      ><span class="mono">{{ code(printing) }}</span
                      >{{ copyRest(printing) }}</mat-option
                    >
                  }
                </mat-select>
              </mat-form-field>
              @if (copyHint(); as hint) {
                <p class="wd__hint" data-testid="wish-copy-hint">{{ hint }}</p>
              }
              @if (selectionError(); as message) {
                <p class="wd__field-error" role="alert" data-testid="wish-selection-error">
                  {{ message }}
                </p>
              }
            </div>
            <app-wish-fields
              [form]="form"
              [terms]="priceTerms.terms()"
              [termsError]="priceTerms.status() === 'error'"
              (retryTerms)="priceTerms.load()"
            />
          </form>
        }
      } @else if (loadingCard()) {
        <div aria-busy="true">
          <span class="visually-hidden">Loading the card</span>
          <app-skeleton variant="list" lines="3" />
        </div>
      } @else {
        <app-wish-card-picker (picked)="pick($event)" />
      }
    </mat-dialog-content>
    @if (error(); as error) {
      <p class="wd__error" role="alert" data-testid="wish-error">
        <mat-icon aria-hidden="true">error</mat-icon>
        {{ error }}
      </p>
    }
    <mat-dialog-actions class="wd__actions">
      @if (editing) {
        <button
          type="button"
          class="wd__remove"
          data-testid="wish-remove"
          [disabled]="removing() || saving()"
          (click)="remove()"
        >
          Remove from wishlist
        </button>
      }
      <span class="wd__spacer"></span>
      <button matButton="outlined" type="button" mat-dialog-close>Cancel</button>
      <!-- Still focusable while saving: a refused save leaves the focus here, in the dialog. -->
      <button
        #submitButton
        matButton="filled"
        class="wd__submit"
        type="submit"
        form="wish-form"
        [disabled]="!form() || saving()"
        [disabledInteractive]="saving()"
      >
        {{ saveLabel() }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .wd__head {
      display: flex;
      align-items: center;
      gap: var(--spacing-2);
      padding-right: 16px;
    }
    .wd__title {
      flex: 1;
      min-width: 0;
    }
    .wd__close {
      display: grid;
      flex: 0 0 auto;
      place-items: center;
      width: 40px;
      height: 40px;
      border: 0;
      border-radius: 50%;
      background: transparent;
      color: var(--color-text-muted);
      cursor: pointer;
    }
    .wd__close:hover {
      background: var(--color-surface-variant);
    }
    .wd__content {
      min-height: 200px;
    }
    .wd__form {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-4);
    }
    .wd__copy {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-1);
    }
    .wd__select {
      width: 100%;
    }
    .wd__hint {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-meta);
      line-height: 18px;
    }
    .wd__field-error {
      margin: 0;
      color: var(--color-danger);
      font-size: var(--font-size-sm);
    }
    .wd__card {
      display: flex;
      align-items: center;
      gap: var(--spacing-3);
      margin-bottom: var(--spacing-4);
      padding: 12px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-row);
      background: var(--color-surface-variant);
    }
    .wd__card-img {
      flex: 0 0 42px;
      width: 42px;
    }
    .wd__card-text {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .wd__game {
      color: var(--color-text-muted);
      font-size: var(--font-size-tag);
      font-weight: var(--font-weight-semibold);
      letter-spacing: 0.6px;
      text-transform: uppercase;
    }
    .wd__card-name {
      margin: 0;
      font-size: var(--font-size-md);
      font-weight: var(--font-weight-semibold);
    }
    .wd__card-name:focus:not(:focus-visible) {
      outline: none;
    }
    .wd__muted {
      color: var(--color-text-muted);
      font-size: var(--font-size-meta);
    }
    .wd__change {
      flex: 0 0 auto;
      min-height: 36px;
      padding: 0 12px;
      border: 0;
      border-radius: var(--radius-pill);
      background: transparent;
      color: var(--color-accent);
      font: inherit;
      font-weight: var(--font-weight-semibold);
      cursor: pointer;
    }
    .wd__actions {
      display: flex;
      align-items: center;
      gap: var(--spacing-2);
    }
    .wd__spacer {
      flex: 1;
    }
    .wd__remove {
      min-height: 40px;
      padding: 0 8px;
      border: 0;
      background: transparent;
      color: var(--color-danger);
      font: inherit;
      font-weight: var(--font-weight-semibold);
      cursor: pointer;
    }
    .wd__remove:disabled {
      opacity: 0.5;
      cursor: default;
    }
    .wd__error mat-icon {
      flex: 0 0 auto;
    }
    .wd__error {
      display: flex;
      flex: 0 0 auto;
      align-items: flex-start;
      gap: var(--spacing-2);
      margin: var(--spacing-3) 24px 0;
      padding: var(--spacing-3);
      border-radius: var(--radius-md);
      background: color-mix(in srgb, var(--color-danger) 10%, var(--color-surface));
      color: var(--color-danger);
      font-size: var(--font-size-sm);
    }
    @media (max-width: 599px) {
      .wd__actions {
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
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly dialog = inject(MatDialog);
  private readonly toasts = inject(ToastService);
  protected readonly priceTerms = inject(PriceTermsStore);
  private readonly cardHeading = viewChild<ElementRef<HTMLElement>>('cardHeading');
  private readonly submitButton = viewChild('submitButton', { read: ElementRef });

  protected readonly editing = this.data.mode === 'edit';

  protected readonly card = signal<CardDetail | null>(null);
  protected readonly loadingCard = signal(false);
  protected readonly cardError = signal<string | null>(null);
  protected readonly form = signal<WishForm | null>(null);
  protected readonly saving = signal(false);
  protected readonly removing = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly printings = computed<PrintingSummary[]>(() => this.card()?.printings ?? []);
  /** Which copy, mirrored from the form (the picker's value). */
  protected readonly selection = signal<PrintingSelection>({ printingId: null, rarity: null });
  protected readonly selectedPrinting = computed(
    () => this.printings().find((printing) => printing.id === this.selection().printingId) ?? null,
  );
  protected readonly copy = computed(() => copyValue(this.selection()));
  protected readonly gameLabel = computed(() => gameInfo(this.card()?.game ?? '').label);
  /** "Any printing · Ultra Rare" rows: the card's rarities when it has several (or the wish's). */
  protected readonly rarities = computed(() => {
    const rarities = [
      ...new Set(
        this.printings()
          .map((printing) => printing.rarity)
          .filter(Boolean) as string[],
      ),
    ];
    const own = this.selection().rarity;
    if (own && !rarities.includes(own)) {
      rarities.push(own);
    }
    return rarities.length > 1 || own ? rarities : [];
  });
  /** The printings, those of a typed code several printings share first. */
  protected readonly orderedPrintings = computed(() => {
    const code = this.sharedCode();
    const printings = this.printings();
    if (!code) {
      return printings;
    }
    const sharing = printingsWithCode(printings, code);
    return [...sharing, ...printings.filter((printing) => !sharing.includes(printing))];
  });
  protected readonly copyHint = computed(() => {
    const selection = this.selection();
    const printing = this.selectedPrinting();
    if (printing) {
      return `Only ${this.code(printing)}${this.copyRest(printing)}.`;
    }
    const any = selection.rarity
      ? `Any printing in ${selection.rarity}`
      : 'Any printing of the card';
    const code = this.sharedCode();
    const sharing = code ? printingsWithCode(this.printings(), code) : [];
    if (code && sharing.length > 1) {
      // A typed code several printings share never picks one of them: say so.
      return `${any}. ${sharing.length} printings share the code ${code}: choose one in Which copy for that copy only.`;
    }
    return null;
  });
  /** A server error about which copy (the picker has no inline error of its own). */
  protected readonly selectionError = signal<string | null>(null);
  protected readonly cardImage = computed(() => this.card()?.primaryImageUrl ?? null);
  protected readonly saveLabel = computed(() => {
    if (this.saving()) {
      return 'Saving…';
    }
    return this.editing ? 'Save changes' : 'Add to wishlist';
  });

  /**
   * A printing code typed in the autocomplete that several printings of the card share: the form
   * starts on "Any printing" and the picker is narrowed to that code (never a silent pick).
   */
  protected readonly sharedCode = signal<string | null>(null);

  private cardSubscription: Subscription | null = null;
  private formSubscription: Subscription | null = null;
  private cardRequest: {
    cardId: string | null;
    printingId: string | null;
    code: string | null;
  } | null = null;

  constructor() {
    void this.priceTerms.load();
    inject(DestroyRef).onDestroy(() => {
      this.cardSubscription?.unsubscribe();
      this.formSubscription?.unsubscribe();
    });
    // While the form holds unsaved input a click outside must not discard it (`disableClose`,
    // see setForm): Escape, which that switch also turns off, still closes the dialog.
    this.dialogRef
      .keydownEvents()
      .pipe(takeUntilDestroyed())
      .subscribe((event) => {
        if (this.dialogRef.disableClose && event.key === 'Escape' && !hasModifierKey(event)) {
          event.preventDefault();
          this.dialogRef.close();
        }
      });
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

  protected code(printing: PrintingSummary): string {
    return printingCode(printing);
  }

  /** " · Azure Dawn · Ultra Rare · 1st Edition" after the mono code (no price, no count). */
  protected copyRest(printing: PrintingSummary): string {
    const rest = [
      printing.setName,
      printing.rarity,
      specialEdition(printing.edition) ?? (this.sharesCode(printing) ? 'Unlimited' : null),
      specialFinish(printing.finish),
    ].filter(Boolean);
    return rest.length ? ` · ${rest.join(' · ')}` : '';
  }

  /** Two printings of one code differ only by edition or finish: both are then named. */
  private sharesCode(printing: PrintingSummary): boolean {
    const code = printingCode(printing);
    return !!code && this.printings().filter((other) => printingCode(other) === code).length > 1;
  }

  protected chooseCopy(value: string): void {
    this.choose(copySelection(value));
  }

  /** "Which copy" chose another copy. */
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

  /**
   * Installs the form. From its first change on (a typed note, a box, another copy) a click on
   * the backdrop no longer closes the dialog; back on its initial value it does again.
   */
  private setForm(value: WishFormValue): void {
    const form = createWishForm(value);
    this.form.set(form);
    this.selection.set(selectionOf(value));
    const initial = JSON.stringify(form.getRawValue());
    this.formSubscription?.unsubscribe();
    this.dialogRef.disableClose = false;
    this.formSubscription = form.valueChanges.subscribe(() => {
      this.dialogRef.disableClose = JSON.stringify(form.getRawValue()) !== initial;
    });
  }

  protected pick(picked: PickedCard): void {
    this.openCard(picked.cardId, null, true, picked.printingCode);
  }

  protected changeCard(): void {
    this.cardSubscription?.unsubscribe();
    this.formSubscription?.unsubscribe();
    this.dialogRef.disableClose = false;
    this.card.set(null);
    this.form.set(null);
    this.selection.set({ printingId: null, rarity: null });
    this.sharedCode.set(null);
    this.selectionError.set(null);
    this.cardError.set(null);
    this.error.set(null);
    this.cardRequest = null;
  }

  /**
   * "Remove from wishlist" (Edit wish, spec 6.6): confirmed by "You stop getting alerts for it.",
   * then `DELETE /wishlist/{id}`; the dialog closes without a wish (the callers read it again).
   */
  protected async remove(): Promise<void> {
    if (this.data.mode !== 'edit' || this.removing()) {
      return;
    }
    const item = this.data.item;
    const confirmed = await firstValueFrom(
      this.dialog
        .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
          data: {
            title: `Remove ${item.card?.name ?? 'this wish'}?`,
            message: 'You stop getting alerts for it.',
            confirmLabel: 'Remove from wishlist',
            cancelLabel: 'Keep it',
            tone: 'danger',
          },
          autoFocus: 'first-tabbable',
          restoreFocus: true,
        })
        .afterClosed(),
    );
    if (!confirmed) {
      return;
    }
    this.removing.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(
        this.wishlistApi.deleteWishlistItem({ id: item.id }, 'body', false, {
          context: silentErrors(),
        }),
      );
      this.toasts.show({ title: 'Removed from your wishlist', sub: item.card?.name ?? undefined });
      this.dialogRef.close();
    } catch (error) {
      this.error.set(`This wish could not be removed. ${friendlyMessage(toApiError(error))}`);
      this.keepFocusInDialog();
    } finally {
      this.removing.set(false);
    }
  }

  protected reloadCard(): void {
    if (this.cardRequest) {
      const { cardId, printingId, code } = this.cardRequest;
      this.openCard(cardId, printingId, false, code);
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
      this.focusFirstProblem();
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
    if (error.errorCode === 'LIMIT_REACHED' || error.errorCode === 'CONFLICT') {
      // No field to send the focus to: it stays on (or returns to) the save button.
      this.keepFocusInDialog();
    }
    if (error.errorCode === 'LIMIT_REACHED') {
      // The limit dialog explains the usage limit as well (global interceptor).
      const info = limitReachedInfo(error);
      if (info.limitKey === WISH_ITEMS_LIMIT_KEY) {
        this.error.set(
          info.limit !== null
            ? `Your wishlist is full: it holds up to ${info.limit} wishes. Remove one to add another.`
            : 'Your wishlist is full. Remove a wish to add another.',
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
    if (unmapped.length) {
      this.error.set(`${friendlyError(error).message} (${unmapped.join('; ')})`);
    } else if (Object.keys(fieldErrors).length) {
      // Every problem sits next to its field: the generic "Validation failed" adds nothing.
      this.error.set('Check the highlighted fields.');
    } else {
      this.error.set(friendlyError(error).message);
    }
    if (Object.keys(fieldErrors).length) {
      this.focusFirstProblem();
    }
  }

  /**
   * After the next render: focus the first invalid field (the browser scrolls it into view), or
   * scroll the first inline error (price term, which copy) into view.
   */
  private focusFirstProblem(): void {
    afterNextRender(
      {
        write: () => {
          const root = this.host.nativeElement;
          const field = root.querySelector<HTMLElement>(
            'textarea.ng-invalid, input.ng-invalid:not([type="checkbox"])',
          );
          if (field) {
            field.focus();
            return;
          }
          root
            .querySelector<HTMLElement>('.wf__error, .wd__field-error')
            ?.scrollIntoView({ block: 'nearest' });
        },
      },
      { injector: this.injector },
    );
  }

  /**
   * After the next render: when a refused save left the focus nowhere (on the page's body), the
   * save button takes it, so the keyboard stays in the dialog next to the error. A focus held
   * elsewhere (a field, or the limit dialog that opens on top) is left alone.
   */
  private keepFocusInDialog(): void {
    afterNextRender(
      {
        write: () => {
          const active = this.document.activeElement;
          if (!active || active === this.document.body) {
            (this.submitButton()?.nativeElement as HTMLElement | undefined)?.focus();
          }
        },
      },
      { injector: this.injector },
    );
  }

  /**
   * After the next render: the chosen card's name takes the focus when it was picked in the
   * autocomplete (which is gone now) or when the focus was lost while it loaded.
   */
  private focusCard(picked: boolean): void {
    afterNextRender(
      {
        write: () => {
          const heading = this.cardHeading()?.nativeElement;
          const active = this.document.activeElement;
          const container = this.host.nativeElement.closest('mat-dialog-container');
          const lost =
            !active ||
            active === this.document.body ||
            active === container ||
            !(container ?? this.host.nativeElement).contains(active);
          if (heading && (picked || lost)) {
            heading.focus();
          }
        },
      },
      { injector: this.injector },
    );
  }

  /**
   * Loads the card (from a printing id when only that is known) and prepares the form. `code` is
   * a printing code typed in the autocomplete: it preselects a printing only when exactly one
   * printing of the card carries it.
   */
  private openCard(
    cardId: string | null,
    printingId: string | null,
    picked = false,
    code: string | null = null,
  ): void {
    this.cardSubscription?.unsubscribe();
    this.cardRequest = { cardId, printingId, code };
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
            const printings = card.printings ?? [];
            const coded = printingsWithCode(printings, code);
            const wanted = coded.length === 1 ? (coded[0].id ?? null) : printingId;
            const known = !!wanted && printings.some((printing) => printing.id === wanted);
            const rarity = this.data.mode === 'create' ? (this.data.rarity ?? null) : null;
            this.sharedCode.set(coded.length > 1 ? code : null);
            this.setForm(
              newWishDefaults(known ? { printingId: wanted } : { printingId: null, rarity }),
            );
          }
          this.focusCard(picked);
        },
        error: (error: unknown) => {
          this.loadingCard.set(false);
          this.cardError.set(friendlyMessage(toApiError(error)));
        },
      });
  }
}
