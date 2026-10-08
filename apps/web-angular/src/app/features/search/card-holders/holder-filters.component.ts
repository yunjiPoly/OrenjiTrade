import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { debounceTime } from 'rxjs';
import { editionLabel, languageLabel } from '../../../shared/catalog/catalog-labels';
import {
  AVAILABILITY_FILTERS,
  AvailabilityFilter,
  FRESHNESS_FILTERS,
  FreshnessFilter,
} from '../../../shared/discovery/discovery-labels';
import { conditionLabel } from '../../../shared/inventory/inventory-labels';
import {
  DEFAULT_HOLDER_FILTERS,
  HOLDER_SORTS,
  HolderFilters,
  HolderSort,
  MAX_PRICE,
  activeHolderFilterCount,
  parsePrice,
  priceRangeError,
  sameHolderFilters,
} from '../data/search-params';

/** Min ≤ max across the two price fields. */
function priceRange(group: AbstractControl): ValidationErrors | null {
  const min = parsePrice(group.get('minPrice')?.value as string | number | null);
  const max = parsePrice(group.get('maxPrice')?.value as string | number | null);
  return priceRangeError(min, max) ? { priceRange: true } : null;
}

/**
 * Filters of the card-holders results: availability, condition, price range (validated inline),
 * freshness, edition, language, accepts offers and sort. Valid changes are emitted (prices after
 * a short pause); the page keeps them in the URL.
 */
@Component({
  selector: 'app-holder-filters',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
  ],
  template: `
    <form
      class="hf"
      [formGroup]="form"
      aria-label="Filter holders"
      (submit)="$event.preventDefault()"
    >
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Sort</mat-label>
        <mat-select formControlName="sort">
          @for (option of sorts; track option.value) {
            <mat-option [value]="option.value">{{ option.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Availability</mat-label>
        <mat-select formControlName="availability">
          <mat-option [value]="null">Any availability</mat-option>
          @for (option of availabilities; track option.value) {
            <mat-option [value]="option.value">{{ option.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Condition</mat-label>
        <mat-select formControlName="condition">
          <mat-option [value]="null">Any condition</mat-option>
          @for (condition of conditions(); track condition) {
            <mat-option [value]="condition">{{ conditionName(condition) }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <div class="hf__prices" role="group" aria-labelledby="hf-price-label">
        <span class="visually-hidden" id="hf-price-label">Price range</span>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Min price</mat-label>
          <input
            matInput
            type="number"
            inputmode="decimal"
            min="0"
            [max]="maxPrice"
            step="1"
            formControlName="minPrice"
          />
          @if (form.controls.minPrice.invalid) {
            <mat-error>Enter 0 to {{ maxPrice }}.</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Max price</mat-label>
          <input
            matInput
            type="number"
            inputmode="decimal"
            min="0"
            [max]="maxPrice"
            step="1"
            formControlName="maxPrice"
          />
          @if (form.controls.maxPrice.invalid) {
            <mat-error>Enter 0 to {{ maxPrice }}.</mat-error>
          }
        </mat-form-field>
        @if (form.hasError('priceRange')) {
          <p class="hf__error" role="alert">The minimum price must not be above the maximum.</p>
        }
      </div>

      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Freshness</mat-label>
        <mat-select formControlName="freshness">
          <mat-option [value]="null">Any freshness</mat-option>
          @for (option of freshnesses; track option.value) {
            <mat-option [value]="option.value">{{ option.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Edition</mat-label>
        <mat-select formControlName="edition">
          <mat-option [value]="null">Any edition</mat-option>
          @for (edition of editions(); track edition) {
            <mat-option [value]="edition">{{ editionName(edition) }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Language</mat-label>
        <mat-select formControlName="language">
          <mat-option [value]="null">Any language</mat-option>
          @for (language of languages(); track language) {
            <mat-option [value]="language">{{ languageName(language) }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <mat-checkbox formControlName="acceptsOffers">Accepts offers</mat-checkbox>

      @if (activeCount() > 0) {
        <button matButton type="button" (click)="reset()">
          <mat-icon aria-hidden="true">filter_alt_off</mat-icon>
          Clear filters ({{ activeCount() }})
        </button>
      }
    </form>
  `,
  styles: `
    :host {
      display: block;
    }
    .hf {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      align-items: start;
      gap: var(--spacing-3);
      font-size: var(--font-size-sm);
    }
    .hf mat-form-field {
      width: 100%;
    }
    .hf__prices {
      display: grid;
      grid-template-columns: 1fr 1fr;
      grid-column: span 2;
      gap: var(--spacing-3);
    }
    .hf__error {
      grid-column: 1 / -1;
      margin: 0;
      color: var(--color-danger);
      font-size: var(--font-size-xs);
    }
    mat-checkbox {
      align-self: center;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HolderFiltersComponent {
  readonly filters = input.required<HolderFilters>();
  /** Values of the card's game schema (fallbacks when unknown). */
  readonly conditions = input<readonly string[]>([
    'MINT',
    'NEAR_MINT',
    'LIGHTLY_PLAYED',
    'MODERATELY_PLAYED',
    'HEAVILY_PLAYED',
    'DAMAGED',
  ]);
  readonly editions = input<readonly string[]>([]);
  readonly languages = input<readonly string[]>([]);
  readonly changed = output<HolderFilters>();

  protected readonly sorts = HOLDER_SORTS;
  protected readonly availabilities = AVAILABILITY_FILTERS;
  protected readonly freshnesses = FRESHNESS_FILTERS;
  protected readonly maxPrice = MAX_PRICE;
  protected readonly activeCount = computed(() => activeHolderFilterCount(this.filters()));

  protected readonly form = new FormGroup(
    {
      sort: new FormControl<HolderSort>('freshness', { nonNullable: true }),
      availability: new FormControl<AvailabilityFilter | null>(null),
      condition: new FormControl<string | null>(null),
      minPrice: new FormControl<number | null>(null, [
        Validators.min(0),
        Validators.max(MAX_PRICE),
      ]),
      maxPrice: new FormControl<number | null>(null, [
        Validators.min(0),
        Validators.max(MAX_PRICE),
      ]),
      freshness: new FormControl<FreshnessFilter | null>(null),
      edition: new FormControl<string | null>(null),
      language: new FormControl<string | null>(null),
      acceptsOffers: new FormControl(false, { nonNullable: true }),
    },
    { validators: priceRange },
  );

  constructor() {
    effect(() => {
      const filters = this.filters();
      untracked(() =>
        this.form.setValue(
          {
            sort: filters.sort,
            availability: filters.availability,
            condition: filters.condition,
            minPrice: filters.minPrice,
            maxPrice: filters.maxPrice,
            freshness: filters.freshness,
            edition: filters.edition,
            language: filters.language,
            acceptsOffers: filters.acceptsOffers,
          },
          { emitEvent: false },
        ),
      );
    });
    this.form.valueChanges.pipe(debounceTime(350), takeUntilDestroyed()).subscribe(() => {
      if (this.form.invalid) {
        return;
      }
      const value = this.form.getRawValue();
      const next: HolderFilters = {
        sort: value.sort,
        availability: value.availability,
        condition: value.condition,
        minPrice: parsePrice(value.minPrice),
        maxPrice: parsePrice(value.maxPrice),
        freshness: value.freshness,
        edition: value.edition,
        language: value.language,
        acceptsOffers: value.acceptsOffers,
        page: 0,
      };
      if (!sameHolderFilters(next, { ...this.filters(), page: 0 })) {
        this.changed.emit(next);
      }
    });
  }

  protected conditionName(value: string): string {
    return conditionLabel(value);
  }

  protected editionName(value: string): string {
    return editionLabel(value);
  }

  protected languageName(value: string): string {
    return languageLabel(value);
  }

  protected reset(): void {
    this.changed.emit({ ...DEFAULT_HOLDER_FILTERS, sort: this.filters().sort });
  }
}
