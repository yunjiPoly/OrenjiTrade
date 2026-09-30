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
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleChange, MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectChange, MatSelectModule } from '@angular/material/select';
import type { GameResponse } from '@orenji/api-client';
import { debounceTime, distinctUntilChanged, map } from 'rxjs';
import { QUERY_MAX_LENGTH } from '../../../shared/catalog/catalog-constants';
import {
  API_FRESHNESS_LABELS,
  API_FRESHNESS_STATES,
  INVENTORY_AVAILABILITIES,
  VISIBILITIES,
  VISIBILITY_INFO,
  conditionLabel,
} from '../../../shared/inventory/inventory-labels';
import { AVAILABILITIES } from '../../../shared/ui/availability-chip/availability';
import {
  CLEARED_FILTERS,
  INVENTORY_SORTS,
  InventoryParams,
  activeFilterCount,
} from '../data/inventory-params';

/** Query parameters to merge into the URL. */
export type InventoryParamChange = Record<string, string | null>;

const ALL = 'ALL';

/**
 * Filters of `/inventory`: search, visibility segmented control (All / Private / Public /
 * Temporarily public), game, availability, condition and freshness, sort and the grid/table
 * toggle. Emits query-parameter changes; the page owns the URL.
 */
@Component({
  selector: 'app-inventory-toolbar',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
  ],
  template: `
    <div class="tb" role="toolbar" aria-label="Inventory filters">
      <div class="tb__row">
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="tb__search">
          <mat-label>Search your cards</mat-label>
          <mat-icon matPrefix aria-hidden="true">search</mat-icon>
          <input
            matInput
            type="search"
            [formControl]="query"
            [attr.maxlength]="maxLength"
            autocomplete="off"
            enterkeyhint="search"
          />
        </mat-form-field>

        <mat-button-toggle-group
          class="tb__visibility"
          name="visibility"
          aria-label="Visibility"
          hideSingleSelectionIndicator
          [value]="params().visibility ?? all"
          (change)="onVisibility($event)"
        >
          <mat-button-toggle [value]="all">All</mat-button-toggle>
          @for (visibility of visibilities; track visibility) {
            <mat-button-toggle [value]="visibility">
              <mat-icon aria-hidden="true">{{ visibilityInfo[visibility].icon }}</mat-icon>
              {{ visibilityInfo[visibility].label }}
            </mat-button-toggle>
          }
        </mat-button-toggle-group>
      </div>

      <div class="tb__row tb__row--filters">
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="tb__select">
          <mat-label>Game</mat-label>
          <mat-select [value]="params().game ?? all" (selectionChange)="onSelect('game', $event)">
            <mat-option [value]="all">All games</mat-option>
            @for (game of games(); track game.slug) {
              <mat-option [value]="game.slug">{{ game.shortName || game.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="tb__select">
          <mat-label>Availability</mat-label>
          <mat-select
            [value]="params().availability ?? all"
            (selectionChange)="onSelect('availability', $event)"
          >
            <mat-option [value]="all">Any availability</mat-option>
            @for (value of availabilities; track value) {
              <mat-option [value]="value">{{ availabilityLabels[value].label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="tb__select">
          <mat-label>Condition</mat-label>
          <mat-select
            [value]="params().condition ?? all"
            (selectionChange)="onSelect('condition', $event)"
          >
            <mat-option [value]="all">Any condition</mat-option>
            @for (value of conditionOptions(); track value) {
              <mat-option [value]="value">{{ conditionText(value) }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="tb__select">
          <mat-label>Freshness</mat-label>
          <mat-select
            [value]="params().freshness ?? all"
            (selectionChange)="onSelect('freshness', $event)"
          >
            <mat-option [value]="all">Any freshness</mat-option>
            @for (value of freshnessStates; track value) {
              <mat-option [value]="value">{{ freshnessLabels[value] }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="tb__select tb__sort">
          <mat-label>Sort by</mat-label>
          <mat-select [value]="params().sort" (selectionChange)="onSort($event)">
            @for (option of sorts; track option.value) {
              <mat-option [value]="option.value">{{ option.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <span class="tb__spacer"></span>

        @if (hasCriteria()) {
          <button matButton type="button" (click)="clear()">
            <mat-icon aria-hidden="true">filter_alt_off</mat-icon>
            Clear filters
          </button>
        }
        <mat-button-toggle-group
          class="tb__view"
          name="view"
          aria-label="Layout"
          hideSingleSelectionIndicator
          [value]="params().view"
          (change)="onView($event)"
        >
          <mat-button-toggle value="grid" aria-label="Grid view">
            <mat-icon aria-hidden="true">grid_view</mat-icon>
          </mat-button-toggle>
          <mat-button-toggle value="table" aria-label="Table view">
            <mat-icon aria-hidden="true">table_rows</mat-icon>
          </mat-button-toggle>
        </mat-button-toggle-group>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .tb {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-3);
    }
    .tb__row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--spacing-2) var(--spacing-3);
    }
    .tb__search {
      flex: 1 1 260px;
      min-width: 0;
    }
    .tb__visibility mat-icon {
      width: 18px;
      height: 18px;
      margin-right: 4px;
      font-size: 18px;
      vertical-align: -4px;
    }
    .tb__select {
      flex: 0 1 170px;
      min-width: 140px;
      --mat-form-field-container-height: 44px;
      --mat-form-field-container-vertical-padding: 10px;
    }
    .tb__sort {
      flex-basis: 210px;
    }
    .tb__spacer {
      flex: 1 1 auto;
    }
    @media (max-width: 599px) {
      .tb__visibility {
        width: 100%;
        overflow-x: auto;
      }
      .tb__select {
        flex: 1 1 calc(50% - var(--spacing-2));
        min-width: 0;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InventoryToolbarComponent {
  readonly params = input.required<InventoryParams>();
  readonly games = input<readonly GameResponse[]>([]);
  readonly paramsChange = output<InventoryParamChange>();

  protected readonly all = ALL;
  protected readonly maxLength = QUERY_MAX_LENGTH;
  protected readonly visibilities = VISIBILITIES;
  protected readonly visibilityInfo = VISIBILITY_INFO;
  protected readonly availabilities = INVENTORY_AVAILABILITIES;
  protected readonly availabilityLabels = AVAILABILITIES;
  protected readonly freshnessStates = API_FRESHNESS_STATES;
  protected readonly freshnessLabels = API_FRESHNESS_LABELS;
  protected readonly sorts = INVENTORY_SORTS;
  protected readonly conditionText = conditionLabel;
  protected readonly query = new FormControl('', { nonNullable: true });

  /** Conditions of the selected game, or of every game. */
  protected readonly conditionOptions = computed(() => {
    const game = this.params().game;
    const games = this.games().filter((candidate) => !game || candidate.slug === game);
    const seen = new Set<string>();
    for (const candidate of games) {
      for (const condition of candidate.schema?.conditions ?? []) {
        seen.add(condition);
      }
    }
    return [...seen];
  });
  protected readonly hasCriteria = computed(
    () => !!this.params().q || activeFilterCount(this.params()) > 0,
  );

  constructor() {
    effect(() => {
      const q = this.params().q;
      untracked(() => {
        if (this.query.value.trim() !== q) {
          this.query.setValue(q, { emitEvent: false });
        }
      });
    });
    this.query.valueChanges
      .pipe(
        map((value) => value.trim().slice(0, QUERY_MAX_LENGTH)),
        debounceTime(300),
        distinctUntilChanged(),
        takeUntilDestroyed(),
      )
      .subscribe((q) => {
        if (q !== this.params().q) {
          this.paramsChange.emit({ q: q || null, page: null });
        }
      });
  }

  protected onVisibility(event: MatButtonToggleChange): void {
    this.emitFilter('visibility', event.value as string);
  }

  protected onSelect(
    key: 'game' | 'availability' | 'condition' | 'freshness',
    event: MatSelectChange,
  ) {
    this.emitFilter(key, event.value as string);
  }

  protected onSort(event: MatSelectChange): void {
    const sort = event.value as string;
    this.paramsChange.emit({ sort: sort === 'updated' ? null : sort, page: null });
  }

  protected onView(event: MatButtonToggleChange): void {
    this.paramsChange.emit({ view: event.value === 'table' ? 'table' : null });
  }

  protected clear(): void {
    this.query.setValue('', { emitEvent: false });
    this.paramsChange.emit({ ...CLEARED_FILTERS });
  }

  private emitFilter(key: string, value: string): void {
    this.paramsChange.emit({ [key]: value === ALL ? null : value, page: null });
  }
}
