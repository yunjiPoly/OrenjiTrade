import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSliderModule } from '@angular/material/slider';
import { RouterLink } from '@angular/router';
import {
  AVAILABILITY_FILTERS,
  AvailabilityFilter,
  FRESHNESS_FILTERS,
  FreshnessFilter,
} from '../../../shared/discovery/discovery-labels';
import { MAX_RADIUS_KM, MIN_RADIUS_KM, MapParams, activeFilterCount } from '../data/map-params';

export interface FilterOption {
  value: string;
  label: string;
}

export type MapFilterChange = Partial<
  Pick<MapParams, 'game' | 'availability' | 'freshness' | 'tags' | 'radiusKm'>
>;

/**
 * Bottom filter bar of the map: game, distance (slider bounded by the plan), availability,
 * listing freshness and tags. Emits changes; the page keeps them in the URL.
 */
@Component({
  selector: 'app-map-filters-bar',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    MatSliderModule,
  ],
  template: `
    <form class="bar" role="toolbar" aria-label="Map filters" [formGroup]="form">
      <mat-form-field class="bar__field" appearance="outline" subscriptSizing="dynamic">
        <mat-label>Game</mat-label>
        <mat-select formControlName="game">
          <mat-option [value]="null">All games</mat-option>
          @for (game of games(); track game.value) {
            <mat-option [value]="game.value">{{ game.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <div class="bar__radius">
        <label class="bar__radius-label" for="map-radius">
          Within <strong>{{ draftRadius() ?? radiusKm() }} km</strong>
        </label>
        <mat-slider
          class="bar__slider"
          [min]="minRadius"
          [max]="radiusMax()"
          [step]="1"
          [disabled]="radiusMax() <= minRadius"
        >
          <input
            matSliderThumb
            id="map-radius"
            aria-label="Distance radius in kilometres"
            [attr.aria-valuetext]="(draftRadius() ?? radiusKm()) + ' kilometres'"
            [value]="radiusKm()"
            (valueChange)="draftRadius.set($event)"
            (change)="commitRadius()"
          />
        </mat-slider>
        @if (radiusMax() < maxRadius) {
          <a class="bar__premium" routerLink="/premium">
            Up to {{ radiusMax() }} km on your plan
          </a>
        }
      </div>

      <mat-form-field class="bar__field" appearance="outline" subscriptSizing="dynamic">
        <mat-label>Availability</mat-label>
        <mat-select formControlName="availability">
          <mat-option [value]="null">Any availability</mat-option>
          @for (option of availabilities; track option.value) {
            <mat-option [value]="option.value">{{ option.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <mat-form-field class="bar__field" appearance="outline" subscriptSizing="dynamic">
        <mat-label>Freshness</mat-label>
        <mat-select formControlName="freshness">
          <mat-option [value]="null">Any freshness</mat-option>
          @for (option of freshnesses; track option.value) {
            <mat-option [value]="option.value">{{ option.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <mat-form-field
        class="bar__field bar__field--tags"
        appearance="outline"
        subscriptSizing="dynamic"
      >
        <mat-label>Tags</mat-label>
        <mat-select formControlName="tags" multiple (openedChange)="$event && tagsRequested.emit()">
          @for (tag of tagChoices(); track tag.value) {
            <mat-option [value]="tag.value">{{ tag.label }}</mat-option>
          } @empty {
            <mat-option disabled>No tags around here yet</mat-option>
          }
        </mat-select>
      </mat-form-field>

      @if (activeCount() > 0) {
        <button matButton type="button" class="bar__clear" (click)="clear()">
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
    .bar {
      display: flex;
      align-items: center;
      gap: var(--spacing-3);
      padding: var(--spacing-2) var(--spacing-4);
      overflow-x: auto;
      scrollbar-width: thin;
      --mat-form-field-container-height: 44px;
      --mat-form-field-container-vertical-padding: 10px;
      --mat-form-field-outlined-label-text-populated-size: var(--font-size-sm);
    }
    .bar__field {
      flex: 0 0 auto;
      width: 168px;
      font-size: var(--font-size-sm);
    }
    .bar__field--tags {
      width: 196px;
    }
    .bar__radius {
      display: grid;
      grid-template-columns: auto;
      flex: 0 0 auto;
      min-width: 196px;
      font-size: var(--font-size-sm);
    }
    .bar__radius-label {
      color: var(--color-text-muted);
    }
    .bar__radius-label strong {
      color: var(--color-ink);
    }
    .bar__slider {
      width: 188px;
      margin: -6px 0;
    }
    .bar__premium {
      font-size: var(--font-size-xs);
    }
    .bar__clear {
      flex: 0 0 auto;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapFiltersBarComponent {
  readonly params = input.required<MapParams>();
  /** Effective radius (the chosen one, bounded by the plan). */
  readonly radiusKm = input.required<number>();
  /** The plan's largest radius. */
  readonly radiusMax = input.required<number>();
  readonly games = input<readonly FilterOption[]>([]);
  readonly tags = input<readonly FilterOption[]>([]);
  readonly changed = output<MapFilterChange>();
  /** The tag list was opened (tags are loaded on demand). */
  readonly tagsRequested = output<void>();

  protected readonly minRadius = MIN_RADIUS_KM;
  protected readonly maxRadius = MAX_RADIUS_KM;
  protected readonly availabilities = AVAILABILITY_FILTERS;
  protected readonly freshnesses = FRESHNESS_FILTERS;
  protected readonly draftRadius = signal<number | null>(null);
  protected readonly activeCount = computed(() => activeFilterCount(this.params()));
  /** Known tags plus the selected ones (so a selection never disappears from the list). */
  protected readonly tagChoices = computed<FilterOption[]>(() => {
    const options = [...this.tags()];
    for (const slug of this.params().tags) {
      if (!options.some((option) => option.value === slug)) {
        options.push({ value: slug, label: slug });
      }
    }
    return options;
  });

  protected readonly form = new FormGroup({
    game: new FormControl<string | null>(null),
    availability: new FormControl<AvailabilityFilter | null>(null),
    freshness: new FormControl<FreshnessFilter | null>(null),
    tags: new FormControl<string[]>([], { nonNullable: true }),
  });

  constructor() {
    effect(() => {
      const params = this.params();
      untracked(() =>
        this.form.setValue(
          {
            game: params.game,
            availability: params.availability,
            freshness: params.freshness,
            tags: [...params.tags],
          },
          { emitEvent: false },
        ),
      );
    });
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      const value = this.form.getRawValue();
      this.changed.emit({
        game: value.game,
        availability: value.availability,
        freshness: value.freshness,
        tags: value.tags,
      });
    });
  }

  protected commitRadius(): void {
    const value = this.draftRadius();
    this.draftRadius.set(null);
    if (value !== null && value !== this.radiusKm()) {
      this.changed.emit({ radiusKm: value });
    }
  }

  protected clear(): void {
    this.changed.emit({ game: null, availability: null, freshness: null, tags: [] });
  }
}
