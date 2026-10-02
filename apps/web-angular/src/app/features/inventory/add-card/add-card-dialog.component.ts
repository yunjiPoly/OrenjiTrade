import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import {
  MatAutocompleteModule,
  MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  CardDetail,
  CardSuggestion,
  CatalogService,
  InventoryItemResponse,
  PrintingSummary,
} from '@orenji/api-client';
import {
  EMPTY,
  Subscription,
  catchError,
  debounceTime,
  distinctUntilChanged,
  filter,
  map,
  switchMap,
  tap,
} from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyError, friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { CardImageComponent } from '../../../shared/ui/card-image/card-image.component';
import { uniqueSuggestions } from '../../../shared/catalog/card-search-box/card-search-box.component';
import {
  QUERY_MAX_LENGTH,
  SUGGEST_DEBOUNCE_MS,
  SUGGEST_MIN_CHARS,
} from '../../../shared/catalog/catalog-constants';
import { GamesStore } from '../../../shared/catalog/games.store';
import { gameInfo } from '../../../shared/domain/games';
import { printingCode } from '../../../shared/inventory/inventory-labels';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { InventoryStore } from '../data/inventory.store';
import { ItemForm, createItemForm, newItemDefaults, toCreateRequest } from '../data/item-form';
import { ItemDetailsFieldsComponent } from '../editor/item-details-fields.component';
import { PrintingPickerComponent } from './printing-picker.component';

export interface AddCardDialogData {
  /** Binder preselected in the details (the binder being viewed). */
  binderId: string | null;
  /** Printing to start from (skips the search). */
  printingId?: string | null;
  cardId?: string | null;
}

type Step = 'search' | 'printing' | 'details';

const STEPS: readonly { id: Step; label: string }[] = [
  { id: 'search', label: 'Find the card' },
  { id: 'printing', label: 'Choose the printing' },
  { id: 'details', label: 'Add details' },
];

/**
 * "Add card": catalog autocomplete (`GET /cards/suggest`) → printing picker (`GET /cards/{id}`) →
 * details form → `POST /inventory/items`. Cards start private unless the collector chooses
 * otherwise, so they can be prepared now and published later.
 */
@Component({
  selector: 'app-add-card-dialog',
  imports: [
    ReactiveFormsModule,
    MatAutocompleteModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    CardImageComponent,
    ErrorStateComponent,
    ItemDetailsFieldsComponent,
    PrintingPickerComponent,
    SkeletonComponent,
  ],
  template: `
    <h2 mat-dialog-title>Add a card</h2>
    <ol class="ac__steps" aria-label="Steps">
      @for (entry of steps; track entry.id; let i = $index) {
        <li
          class="ac__step"
          [class.ac__step--done]="i < stepIndex()"
          [attr.aria-current]="entry.id === step() ? 'step' : null"
        >
          <span class="ac__step-dot" aria-hidden="true">{{ i + 1 }}</span>
          {{ entry.label }}
        </li>
      }
    </ol>

    <mat-dialog-content class="ac__content">
      @switch (step()) {
        @case ('search') {
          <form class="ac__search" (submit)="$event.preventDefault()">
            <mat-form-field appearance="outline" subscriptSizing="dynamic" class="ac__field">
              <mat-label>Card name or printing code</mat-label>
              <mat-icon matPrefix aria-hidden="true">search</mat-icon>
              <input
                matInput
                [formControl]="query"
                [matAutocomplete]="panel"
                [attr.maxlength]="maxLength"
                autocomplete="off"
                spellcheck="false"
                cdkFocusInitial
              />
            </mat-form-field>
            <span class="visually-hidden" aria-live="polite">{{ announcement() }}</span>
          </form>
          <mat-autocomplete
            #panel="matAutocomplete"
            class="csb-panel"
            [displayWith]="displayWith"
            (optionSelected)="choose($event)"
          >
            @for (suggestion of suggestions(); track trackKey(suggestion)) {
              <mat-option [value]="suggestion" class="csb-option">
                <span class="csb-option__row">
                  <app-card-image
                    class="csb-option__img"
                    size="xs"
                    [src]="suggestion.imageUrl"
                    [game]="suggestion.game"
                    alt=""
                  />
                  <span class="csb-option__text">
                    <span class="csb-option__name">{{ suggestion.name }}</span>
                    <span class="csb-option__meta">
                      {{ gameLabel(suggestion.game) }}
                      @if (suggestion.printingCode) {
                        · <span class="mono">{{ suggestion.printingCode }}</span>
                      }
                    </span>
                  </span>
                  @if (suggestion.kind === 'PRINTING') {
                    <span class="csb-option__kind">Printing</span>
                  }
                </span>
              </mat-option>
            }
            @if (status() === 'empty') {
              <mat-option disabled>No cards match “{{ lastQuery() }}”.</mat-option>
            }
            @if (status() === 'error') {
              <mat-option disabled>Suggestions are unavailable. Try again.</mat-option>
            }
          </mat-autocomplete>
          <p class="ac__hint">
            Type at least two letters of the name, or a printing code like AZR-EN001.
          </p>
        }
        @case ('printing') {
          @if (cardError(); as error) {
            <app-error-state
              title="This card could not load"
              [message]="error"
              (retry)="reloadCard()"
            />
          } @else if (card(); as card) {
            <div class="ac__card">
              <app-card-image
                class="ac__card-img"
                [src]="card.primaryImageUrl"
                [alt]="card.name ?? ''"
                [game]="card.game"
              />
              <div>
                <p class="ac__game">{{ gameLabel(card.game) }}</p>
                <h3 class="ac__card-name">{{ card.name }}</h3>
                <p class="ac__hint">
                  {{ printings().length }}
                  {{ printings().length === 1 ? 'printing' : 'printings' }}. Pick the one you own.
                </p>
              </div>
            </div>
            <app-printing-picker
              [printings]="printings()"
              [game]="card.game ?? ''"
              [(selected)]="printingId"
            />
          } @else {
            <app-skeleton variant="list" lines="3" />
          }
        }
        @case ('details') {
          @if (selectedPrinting(); as printing) {
            <div class="ac__card ac__card--compact">
              <app-card-image
                class="ac__card-img"
                [src]="printingImage()"
                [alt]="card()?.name ?? ''"
                [game]="card()?.game"
              />
              <div>
                <h3 class="ac__card-name">{{ card()?.name }}</h3>
                <p class="ac__hint mono">{{ code(printing) }} · {{ printing.setName }}</p>
              </div>
            </div>
          }
          @if (form(); as form) {
            <form id="add-card-form" [formGroup]="form" (ngSubmit)="create()" novalidate>
              <app-item-details-fields
                [form]="form"
                [schema]="schema()"
                [binders]="store.binders() ?? []"
              />
            </form>
          }
          @if (error(); as error) {
            <p class="ac__error" role="alert">{{ error }}</p>
          }
        }
      }
    </mat-dialog-content>

    <mat-dialog-actions class="ac__actions">
      @if (step() !== 'search') {
        <button matButton type="button" (click)="back()">
          <mat-icon aria-hidden="true">arrow_back</mat-icon>
          Back
        </button>
      }
      <span class="ac__spacer"></span>
      <button matButton type="button" mat-dialog-close>Cancel</button>
      @if (step() === 'printing') {
        <button matButton="filled" type="button" [disabled]="!printingId()" (click)="toDetails()">
          Continue
        </button>
      }
      @if (step() === 'details') {
        <button matButton="filled" type="submit" form="add-card-form" [disabled]="saving()">
          <mat-icon aria-hidden="true">add</mat-icon>
          {{ saving() ? 'Adding…' : 'Add to inventory' }}
        </button>
      }
    </mat-dialog-actions>
  `,
  styles: `
    .ac__steps {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-2) var(--spacing-4);
      margin: 0;
      padding: 0 var(--spacing-6) var(--spacing-3);
      list-style: none;
      font-size: var(--font-size-sm);
      color: var(--color-text-muted);
    }
    .ac__step {
      display: flex;
      align-items: center;
      gap: var(--spacing-2);
    }
    .ac__step[aria-current='step'] {
      color: var(--color-ink);
      font-weight: var(--font-weight-semibold);
    }
    .ac__step-dot {
      display: grid;
      place-items: center;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      border: 1px solid var(--color-border-strong);
      font-size: var(--font-size-xs);
    }
    .ac__step[aria-current='step'] .ac__step-dot,
    .ac__step--done .ac__step-dot {
      border-color: var(--color-primary);
      background: var(--color-primary);
      color: var(--color-on-primary);
    }
    .ac__content {
      min-height: 280px;
    }
    .ac__field {
      width: 100%;
    }
    .ac__hint {
      margin: var(--spacing-2) 0 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .ac__card {
      display: flex;
      align-items: center;
      gap: var(--spacing-4);
      margin-bottom: var(--spacing-4);
    }
    .ac__card-img {
      flex: 0 0 72px;
      width: 72px;
    }
    .ac__card--compact .ac__card-img {
      flex-basis: 48px;
      width: 48px;
    }
    .ac__game {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
      text-transform: uppercase;
    }
    .ac__card-name {
      font-size: var(--font-size-lg);
    }
    .ac__error {
      margin: var(--spacing-3) 0 0;
      color: var(--color-danger);
    }
    .ac__actions {
      display: flex;
    }
    .ac__spacer {
      flex: 1 1 auto;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddCardDialogComponent {
  private readonly data = inject<AddCardDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef =
    inject<MatDialogRef<AddCardDialogComponent, InventoryItemResponse>>(MatDialogRef);
  private readonly catalog = inject(CatalogService);
  private readonly games = inject(GamesStore);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly store = inject(InventoryStore);

  protected readonly steps = STEPS;
  protected readonly maxLength = QUERY_MAX_LENGTH;
  protected readonly step = signal<Step>('search');
  protected readonly stepIndex = computed(() =>
    STEPS.findIndex((entry) => entry.id === this.step()),
  );

  // Search
  protected readonly query = new FormControl<string | CardSuggestion>('', { nonNullable: true });
  protected readonly suggestions = signal<CardSuggestion[]>([]);
  protected readonly status = signal<'idle' | 'loading' | 'results' | 'empty' | 'error'>('idle');
  protected readonly lastQuery = signal('');
  protected readonly announcement = computed(() => {
    switch (this.status()) {
      case 'results':
        return `${this.suggestions().length} suggestions available.`;
      case 'empty':
        return 'No matching cards.';
      default:
        return '';
    }
  });

  // Printing
  protected readonly card = signal<CardDetail | null>(null);
  protected readonly cardError = signal<string | null>(null);
  protected readonly printingId = signal<string | null>(null);
  protected readonly printings = computed<PrintingSummary[]>(() => this.card()?.printings ?? []);
  protected readonly selectedPrinting = computed(
    () => this.printings().find((printing) => printing.id === this.printingId()) ?? null,
  );
  protected readonly printingImage = computed(
    () =>
      this.selectedPrinting()?.images?.find((image) => image.kind === 'FRONT')?.url ??
      this.card()?.primaryImageUrl ??
      null,
  );

  // Details
  protected readonly schema = computed(() => this.games.schema(this.card()?.game));
  protected readonly form = signal<ItemForm | null>(null);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  private cardSubscription: Subscription | null = null;
  private cardId: string | null = null;
  /** Printing the details form was built for. */
  private formPrinting: string | null = null;

  constructor() {
    void this.games.load();
    this.query.valueChanges
      .pipe(
        filter((value): value is string => typeof value === 'string'),
        map((value) => value.trim().slice(0, QUERY_MAX_LENGTH)),
        tap((value) => {
          if (value.length < SUGGEST_MIN_CHARS) {
            this.suggestions.set([]);
            this.status.set('idle');
          }
        }),
        debounceTime(SUGGEST_DEBOUNCE_MS),
        distinctUntilChanged(),
        switchMap((q) => {
          if (q.length < SUGGEST_MIN_CHARS) {
            return EMPTY;
          }
          this.status.set('loading');
          return this.catalog
            .suggestCards({ q, limit: 10 }, 'body', false, { context: silentErrors() })
            .pipe(
              tap((items) => {
                const unique = uniqueSuggestions(items ?? []);
                this.suggestions.set(unique);
                this.lastQuery.set(q);
                this.status.set(unique.length ? 'results' : 'empty');
              }),
              catchError(() => {
                this.suggestions.set([]);
                this.status.set('error');
                return EMPTY;
              }),
            );
        }),
        takeUntilDestroyed(),
      )
      .subscribe();
    inject(DestroyRef).onDestroy(() => this.cardSubscription?.unsubscribe());

    if (this.data.cardId) {
      this.openCard(this.data.cardId, this.data.printingId ?? null);
    }
  }

  protected readonly displayWith = (value: string | CardSuggestion | null): string =>
    !value ? '' : typeof value === 'string' ? value : (value.name ?? '');

  protected trackKey(suggestion: CardSuggestion): string {
    return `${suggestion.kind}:${suggestion.id}:${suggestion.printingId ?? ''}`;
  }

  protected gameLabel(slug: string | null | undefined): string {
    return slug ? gameInfo(slug).label : '';
  }

  protected code(printing: PrintingSummary): string {
    return printingCode(printing);
  }

  protected choose(event: MatAutocompleteSelectedEvent): void {
    const suggestion = event.option.value as CardSuggestion;
    if (!suggestion.id) {
      return;
    }
    this.openCard(
      suggestion.id,
      suggestion.kind === 'PRINTING' ? (suggestion.printingId ?? null) : null,
    );
  }

  protected reloadCard(): void {
    if (this.cardId) {
      this.openCard(this.cardId, this.printingId());
    }
  }

  protected toDetails(): void {
    const printing = this.selectedPrinting();
    if (!printing) {
      return;
    }
    // Keep what was typed when coming back from the printing step without changing it.
    if (!this.form() || this.formPrinting !== printing.id) {
      this.form.set(createItemForm(newItemDefaults(printing, this.schema(), this.data.binderId)));
      this.formPrinting = printing.id ?? null;
    }
    this.error.set(null);
    this.step.set('details');
  }

  protected back(): void {
    this.error.set(null);
    this.step.set(this.step() === 'details' ? 'printing' : 'search');
  }

  protected async create(): Promise<void> {
    const form = this.form();
    const printingId = this.printingId();
    if (!form || !printingId) {
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
      const item = await this.store.createItem(toCreateRequest(form.getRawValue(), printingId));
      this.snackBar.open(`${item.card.name} added to your inventory.`, 'OK', { duration: 5000 });
      this.dialogRef.close(item);
    } catch (error) {
      const apiError = error as ApiError;
      for (const [field, message] of Object.entries(apiError.fieldErrors ?? {})) {
        form.get(field)?.setErrors({ server: message });
      }
      this.error.set(friendlyError(apiError).message);
    } finally {
      this.saving.set(false);
    }
  }

  private openCard(cardId: string, printingId: string | null): void {
    this.cardSubscription?.unsubscribe();
    this.cardId = cardId;
    if (this.card()?.id !== cardId) {
      this.card.set(null);
      this.form.set(null);
    }
    this.cardError.set(null);
    this.step.set('printing');
    this.cardSubscription = this.catalog
      .getCard({ id: cardId }, 'body', false, { context: silentErrors() })
      .subscribe({
        next: (card) => {
          this.card.set(card);
          const printings = card.printings ?? [];
          const wanted = printings.find((printing) => printing.id === printingId);
          this.printingId.set(
            wanted?.id ?? (printings.length === 1 ? (printings[0].id ?? null) : null),
          );
        },
        error: (error: unknown) => this.cardError.set(friendlyMessage(toApiError(error))),
      });
  }
}
