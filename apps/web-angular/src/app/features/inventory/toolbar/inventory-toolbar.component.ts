import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  effect,
  input,
  output,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import type { BinderResponse, GameResponse } from '@orenji/api-client';
import { debounceTime, distinctUntilChanged, map } from 'rxjs';
import { QUERY_MAX_LENGTH } from '../../../shared/catalog/catalog-constants';
import { gameInfo } from '../../../shared/domain/games';
import { GameMonogramComponent } from '../../../shared/ui/game-monogram/game-monogram.component';
import {
  SegmentOption,
  SegmentedComponent,
} from '../../../shared/ui/segmented/segmented.component';
import { groupBindersByGame } from '../data/binder-games';
import {
  CLEARED_FILTERS,
  DEFAULT_DIRECTION,
  INVENTORY_SORTS,
  InventoryParams,
  InventorySort,
  InventoryView,
  UNFILED,
  hasActiveFilters,
} from '../data/inventory-params';

/** Query parameters to merge into the URL. */
export type InventoryParamChange = Record<string, string | null>;

type VisibilityChoice = 'ALL' | 'PUBLIC' | 'PRIVATE';

const VISIBILITY_OPTIONS: readonly SegmentOption<VisibilityChoice>[] = [
  { value: 'ALL', label: 'All' },
  { value: 'PUBLIC', label: 'Public' },
  { value: 'PRIVATE', label: 'Private' },
];

const VIEW_OPTIONS: readonly SegmentOption<InventoryView>[] = [
  { value: 'table', label: 'Table', icon: 'view_list' },
  { value: 'grid', label: 'Grid', icon: 'grid_view' },
];

/**
 * The toolbar of Inventory › Cards (spec 9.3; 56 tall, sticky under the top bar): "Search your
 * cards" ("/" focuses it), "Game: All games", [All | Public | Private], "Sort: Recently added"
 * with its direction, "Clear filters" when anything differs from the defaults, "Select" in the
 * grid, and [Table | Grid]. At md, where the binder pane is hidden, a "Binder" menu takes its
 * place. Emits query-parameter changes; the page owns the URL.
 */
@Component({
  selector: 'app-inventory-toolbar',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    GameMonogramComponent,
    SegmentedComponent,
  ],
  template: `
    <div class="tb" role="group" aria-label="Inventory filters">
      <label class="tb__search" data-page-search>
        <mat-icon aria-hidden="true">search</mat-icon>
        <span class="visually-hidden">Search your cards</span>
        <input
          type="search"
          placeholder="Search your cards"
          autocomplete="off"
          [maxLength]="maxLength"
          [formControl]="query"
          data-page-search
          data-testid="inventory-search"
          (keydown.escape)="clearQuery($event)"
        />
      </label>

      <div class="tb__rest">
        @if (showBinderMenu()) {
          <button type="button" class="tb__menu" [matMenuTriggerFor]="binderMenu">
            <span class="tb__muted">Binder:</span> {{ binderLabel() }}
            <mat-icon aria-hidden="true">expand_more</mat-icon>
          </button>
          <mat-menu #binderMenu="matMenu">
            <button
              mat-menu-item
              type="button"
              role="menuitemradio"
              [attr.aria-checked]="!params().binder"
              (click)="emit({ binder: null })"
            >
              All cards
            </button>
            <button
              mat-menu-item
              type="button"
              role="menuitemradio"
              [attr.aria-checked]="params().binder === unfiled"
              (click)="emit({ binder: unfiled })"
            >
              Unfiled
            </button>
            @for (group of binderGroups(); track group.game) {
              @for (binder of group.binders; track binder.id) {
                <button
                  mat-menu-item
                  type="button"
                  role="menuitemradio"
                  [attr.aria-checked]="params().binder === binder.id"
                  (click)="emit({ binder: binder.id })"
                >
                  <app-game-monogram [game]="group.game" size="16" />
                  <span>{{ binder.name }}</span>
                </button>
              }
            }
          </mat-menu>
        }

        <button
          type="button"
          class="tb__menu"
          [matMenuTriggerFor]="gameMenu"
          data-testid="inventory-game"
        >
          <span class="tb__muted">Game:</span> {{ gameLabel() }}
          <mat-icon aria-hidden="true">expand_more</mat-icon>
        </button>
        <mat-menu #gameMenu="matMenu">
          <button
            mat-menu-item
            type="button"
            role="menuitemradio"
            [attr.aria-checked]="!params().game"
            (click)="emit({ game: null })"
          >
            All games
          </button>
          @for (game of games(); track game.slug) {
            <button
              mat-menu-item
              type="button"
              role="menuitemradio"
              [attr.aria-checked]="params().game === game.slug"
              (click)="emit({ game: game.slug ?? null })"
            >
              <app-game-monogram [game]="game.slug ?? ''" size="16" />
              <span>{{ nameOf(game) }}</span>
            </button>
          }
        </mat-menu>

        <app-segmented
          label="Who can see it"
          size="sm"
          [options]="visibilityOptions"
          [value]="params().visibility ?? 'ALL'"
          (valueChange)="emit({ visibility: $event === 'ALL' ? null : $event })"
        />

        <div class="tb__sort">
          <button
            type="button"
            class="tb__menu"
            [matMenuTriggerFor]="sortMenu"
            data-testid="inventory-sort"
          >
            <span class="tb__muted">Sort:</span> {{ sortLabel() }}
            <mat-icon aria-hidden="true">expand_more</mat-icon>
          </button>
          <button
            type="button"
            class="tb__dir"
            [attr.aria-label]="directionLabel()"
            [title]="directionLabel()"
            (click)="flipDirection()"
            data-testid="inventory-direction"
          >
            <mat-icon aria-hidden="true">{{
              params().dir === 'asc' ? 'arrow_upward' : 'arrow_downward'
            }}</mat-icon>
          </button>
        </div>
        <mat-menu #sortMenu="matMenu">
          @for (sort of sorts; track sort.value) {
            <button
              mat-menu-item
              type="button"
              role="menuitemradio"
              [attr.aria-checked]="params().sort === sort.value"
              (click)="chooseSort(sort.value)"
            >
              <mat-icon>{{ params().sort === sort.value ? 'check' : '' }}</mat-icon>
              <span>{{ sort.label }}</span>
            </button>
          }
        </mat-menu>

        @if (filtersOn()) {
          <button type="button" class="tb__link" (click)="clear()" data-testid="clear-filters">
            Clear filters
          </button>
        }

        <span class="tb__spacer"></span>

        @if (params().view === 'grid' || selectMode()) {
          <button
            type="button"
            class="tb__link"
            [attr.aria-pressed]="selectMode()"
            (click)="toggleSelect.emit()"
          >
            {{ selectMode() ? 'Done' : 'Select' }}
          </button>
        }
        <app-segmented
          label="View"
          size="sm"
          [options]="viewOptions"
          [value]="view()"
          (valueChange)="viewChange.emit($event)"
        />
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      container-type: inline-size;
    }
    .tb {
      display: flex;
      flex-wrap: nowrap;
      align-items: center;
      gap: 8px 12px;
      min-height: 56px;
      padding: 8px 0;
    }
    .tb__search {
      display: flex;
      flex: 0 1 320px;
      align-items: center;
      gap: 8px;
      min-width: 180px;
      height: 40px;
      padding: 0 12px;
      border: 1px solid var(--color-border-input);
      border-radius: var(--radius-input);
      background: var(--color-surface);
      color: var(--color-text-muted);
    }
    .tb__search:focus-within {
      border-color: var(--color-accent);
    }
    .tb__search input {
      flex: 1 1 auto;
      min-width: 0;
      border: 0;
      outline: none !important;
      background: transparent;
      color: var(--color-ink);
      font: inherit;
      font-size: var(--font-size-sm);
    }
    .tb__search input::placeholder {
      color: var(--color-text-muted);
    }
    .tb__search mat-icon {
      width: 20px;
      height: 20px;
      font-size: 20px;
    }
    .tb__menu {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 40px;
      padding: 0 10px 0 12px;
      border: 1px solid var(--color-border);
      border-radius: 10px;
      background: var(--color-surface);
      color: var(--color-ink);
      font: inherit;
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
      white-space: nowrap;
      cursor: pointer;
    }
    .tb__menu:hover,
    .tb__dir:hover {
      background: var(--color-surface-variant);
    }
    .tb__menu mat-icon,
    .tb__dir mat-icon {
      width: 18px;
      height: 18px;
      font-size: 18px;
      color: var(--color-text-muted);
    }
    .tb__muted {
      color: var(--color-text-muted);
    }
    .tb__sort {
      display: inline-flex;
    }
    .tb__sort .tb__menu {
      border-radius: 10px 0 0 10px;
    }
    .tb__dir {
      display: inline-grid;
      place-items: center;
      width: 36px;
      height: 40px;
      border: 1px solid var(--color-border);
      border-left: 0;
      border-radius: 0 10px 10px 0;
      background: var(--color-surface);
      cursor: pointer;
    }
    .tb__link {
      height: 40px;
      padding: 0 6px;
      border: 0;
      background: transparent;
      color: var(--color-accent);
      font: inherit;
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      cursor: pointer;
    }
    .tb__link:hover {
      text-decoration: underline;
    }
    .tb__spacer {
      flex: 1 1 auto;
    }
    .tb__rest {
      display: contents;
    }
    @container (max-width: 940px) {
      .tb {
        flex-wrap: wrap;
      }
    }
    /* A phone-sized window (spec 16): the search, then one row of filters that scrolls. */
    @container (max-width: 600px) {
      .tb__search {
        flex: 1 1 100%;
      }
      .tb__rest {
        display: flex;
        flex: 1 1 100%;
        align-items: center;
        gap: 8px;
        overflow-x: auto;
        padding-bottom: 4px;
      }
      .tb__rest > * {
        flex: none;
      }
      .tb__muted,
      .tb__spacer {
        display: none;
      }
    }
    .tb button:focus-visible,
    .tb__search:has(input:focus-visible) {
      outline: var(--focus-width) solid var(--color-focus-ring);
      outline-offset: 2px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InventoryToolbarComponent {
  readonly params = input.required<InventoryParams>();
  readonly view = input.required<InventoryView>();
  readonly games = input<readonly GameResponse[]>([]);
  readonly binders = input<readonly BinderResponse[]>([]);
  /** At md the pane is hidden: the toolbar carries a Binder menu. */
  readonly showBinderMenu = input(false, { transform: booleanAttribute });
  readonly selectMode = input(false, { transform: booleanAttribute });
  readonly paramsChange = output<InventoryParamChange>();
  /** Clear filters was used: its link leaves with the filters, the page places the focus (A1). */
  readonly cleared = output<void>();
  readonly viewChange = output<InventoryView>();
  readonly toggleSelect = output<void>();

  protected readonly maxLength = QUERY_MAX_LENGTH;
  protected readonly sorts = INVENTORY_SORTS;
  protected readonly unfiled = UNFILED;
  protected readonly visibilityOptions = VISIBILITY_OPTIONS;
  protected readonly viewOptions = VIEW_OPTIONS;
  protected readonly query = new FormControl('', { nonNullable: true });

  protected readonly filtersOn = computed(() => hasActiveFilters(this.params()));
  protected readonly binderGroups = computed(() => groupBindersByGame(this.binders()));
  protected readonly gameLabel = computed(() => {
    const slug = this.params().game;
    return slug ? gameInfo(slug).label : 'All games';
  });
  protected readonly binderLabel = computed(() => {
    const binder = this.params().binder;
    if (!binder) {
      return 'All cards';
    }
    if (binder === UNFILED) {
      return 'Unfiled';
    }
    return this.binders().find((candidate) => candidate.id === binder)?.name ?? 'All cards';
  });
  protected readonly sortLabel = computed(
    () => INVENTORY_SORTS.find((sort) => sort.value === this.params().sort)?.label ?? '',
  );
  protected readonly directionLabel = computed(() => {
    const { sort, dir } = this.params();
    if (sort === 'name') {
      return dir === 'asc' ? 'A to Z. Switch to Z to A' : 'Z to A. Switch to A to Z';
    }
    if (sort === 'price') {
      return dir === 'desc'
        ? 'Highest price first. Switch to lowest first'
        : 'Lowest price first. Switch to highest first';
    }
    return dir === 'desc'
      ? 'Newest first. Switch to oldest first'
      : 'Oldest first. Switch to newest first';
  });

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
        map((value) => value.trim()),
        debounceTime(300),
        distinctUntilChanged(),
        takeUntilDestroyed(),
      )
      .subscribe((q) => {
        if (q !== this.params().q) {
          this.emit({ q: q || null });
        }
      });
  }

  protected nameOf(game: GameResponse): string {
    return game.name ?? gameInfo(game.slug ?? '').label;
  }

  protected emit(change: InventoryParamChange): void {
    this.paramsChange.emit(change);
  }

  protected chooseSort(sort: InventorySort): void {
    this.emit({ sort: sort === 'created' ? null : sort, dir: null });
  }

  protected flipDirection(): void {
    const { sort, dir } = this.params();
    const next = dir === 'asc' ? 'desc' : 'asc';
    this.emit({ dir: next === DEFAULT_DIRECTION[sort] ? null : next });
  }

  protected clearQuery(event: Event): void {
    if (this.query.value) {
      event.stopPropagation();
      this.query.setValue('');
    }
  }

  protected clear(): void {
    this.query.setValue('', { emitEvent: false });
    this.emit({ ...CLEARED_FILTERS });
    this.cleared.emit();
  }
}
