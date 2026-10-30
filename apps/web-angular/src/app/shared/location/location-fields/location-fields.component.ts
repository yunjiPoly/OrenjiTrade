import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  inject,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { RegionContext } from '../../../core/region/region-context.service';
import { RegionsStore } from '../../regions/regions.store';
import { ErrorStateComponent } from '../../ui/error-state/error-state.component';
import { SkeletonComponent } from '../../ui/skeleton/skeleton.component';
import { CITY_MAX_LENGTH, LocationDraft } from '../my-location.store';

const EMPTY_DRAFT: LocationDraft = {
  countryCode: '',
  subdivisionCode: '',
  city: '',
  showCity: true,
};

/**
 * "Where are you?" fields (ADR 0017): platform region → country → state/province from `GET
 * /regions`, an optional city and the "show my city on my profile" switch. Simple pickers only:
 * no map, no GPS, no geocoding. Used by onboarding and Settings → Location.
 */
@Component({
  selector: 'app-location-fields',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    ErrorStateComponent,
    SkeletonComponent,
  ],
  template: `
    @if (!regions.loaded() && regions.error(); as error) {
      <app-error-state
        compact
        title="We could not load the list of places"
        [message]="error.message"
        (retry)="regions.load()"
      />
    } @else if (!regions.loaded()) {
      <div class="location-fields__loading" aria-busy="true">
        <span class="visually-hidden">Loading countries and states</span>
        <app-skeleton height="56px" />
        <app-skeleton height="56px" />
      </div>
    } @else {
      <div
        class="location-fields"
        [class.location-fields--settings]="settingsLayout()"
        role="group"
        aria-label="Your location"
      >
        <mat-form-field
          appearance="outline"
          class="location-fields__region"
          [subscriptSizing]="settingsLayout() ? 'dynamic' : 'fixed'"
        >
          <mat-label>Region</mat-label>
          <mat-select
            data-testid="location-region"
            [value]="region()"
            (selectionChange)="onRegion($event.value)"
          >
            @for (option of regions.regions(); track option.code) {
              <mat-option [value]="option.code">{{ option.name }}</mat-option>
            }
          </mat-select>
          @if (settingsLayout()) {
            <mat-hint>Cards ship within a region. Home, Search and the map open on it.</mat-hint>
          }
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Country</mat-label>
          <mat-select
            data-testid="location-country"
            required
            [value]="draft().countryCode || null"
            (selectionChange)="onCountry($event.value)"
          >
            @for (country of countries(); track country.code) {
              <mat-option [value]="country.code">{{ country.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        @if (!wholeCountry()) {
          <mat-form-field appearance="outline">
            <mat-label>State or province</mat-label>
            <mat-select
              data-testid="location-subdivision"
              required
              [disabled]="!draft().countryCode"
              [value]="draft().subdivisionCode || null"
              (selectionChange)="onSubdivision($event.value)"
            >
              @for (subdivision of subdivisions(); track subdivision.code) {
                <mat-option [value]="subdivision.code">{{ subdivision.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        }

        <mat-form-field
          appearance="outline"
          class="location-fields__city"
          [subscriptSizing]="settingsLayout() ? 'dynamic' : 'fixed'"
        >
          <mat-label>City (optional)</mat-label>
          <input
            matInput
            data-testid="location-city"
            autocomplete="address-level2"
            [maxLength]="cityMax"
            [value]="draft().city"
            (input)="onCity($event)"
          />
          @if (settingsLayout()) {
            <mat-hint
              >Only on your profile, and only if you show it. Never used to locate you.</mat-hint
            >
          } @else {
            <mat-hint>Only shown on your profile, never used to locate you.</mat-hint>
          }
          <mat-hint align="end">{{ draft().city.length }} / {{ cityMax }}</mat-hint>
        </mat-form-field>

        <div class="location-fields__show-city">
          <mat-slide-toggle
            data-testid="location-show-city"
            [checked]="draft().showCity"
            [aria-describedby]="cityLine() ? 'location-show-city-line' : ''"
            (change)="onShowCity($event.checked)"
          >
            Show my city on my profile
          </mat-slide-toggle>
          @if (cityLine(); as line) {
            <p
              class="location-fields__show-city-line"
              id="location-show-city-line"
              data-testid="location-show-city-line"
            >
              {{ line }}
            </p>
          }
        </div>

        @if (showErrors() && missing(); as message) {
          <p class="location-fields__error" role="alert">{{ message }}</p>
        }
      </div>
    }
  `,
  styles: `
    .location-fields {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
      gap: var(--spacing-2) var(--spacing-3);
      align-items: start;
    }
    .location-fields__city {
      grid-column: 1 / -1;
    }
    .location-fields__show-city {
      grid-column: 1 / -1;
      margin-top: var(--spacing-2);
    }
    .location-fields__show-city-line {
      margin: 4px 0 0 52px;
      color: var(--color-text-secondary);
      font-size: 13px;
    }
    /* Settings › Location (board W25): Region on its own row, then Country | State. */
    .location-fields--settings {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .location-fields--settings .location-fields__region {
      grid-column: 1 / -1;
      margin-bottom: var(--spacing-2);
    }
    @media (max-width: 599.98px) {
      .location-fields--settings {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    .location-fields__loading {
      display: grid;
      gap: var(--spacing-3);
    }
    .location-fields__error {
      grid-column: 1 / -1;
      margin: 0;
      color: var(--color-danger);
      font-size: var(--font-size-sm);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LocationFieldsComponent {
  protected readonly regions = inject(RegionsStore);
  private readonly context = inject(RegionContext);

  readonly value = input<LocationDraft | null>(null);
  /** Show "choose a country / state" messages (after a save attempt). */
  readonly showErrors = input(false, { transform: booleanAttribute });
  /**
   * Settings › Location's layout and words (board W25): Region on its own row with its hint, then
   * Country | State, the city's "only if you show it" and the line under the city switch.
   */
  readonly settingsLayout = input(false, { transform: booleanAttribute });
  /** Whether the collector shows on the map (hidden: the profile shows no place at all, P3). */
  readonly onMap = input(true);
  readonly valueChange = output<LocationDraft>();

  protected readonly cityMax = CITY_MAX_LENGTH;
  protected readonly draft = linkedSignal(() => this.value() ?? EMPTY_DRAFT);
  /**
   * Region whose countries are listed: the chosen country's; without a country, the region picked
   * last (a region change clears the country), else the browsed one.
   */
  protected readonly region = linkedSignal<string, string>({
    source: () => this.regions.country(this.draft().countryCode)?.regionCode ?? '',
    computation: (fromCountry, previous) =>
      fromCountry || previous?.value || this.context.current(),
  });
  protected readonly countries = computed(
    () => this.regions.region(this.region())?.countries.filter((country) => country.active) ?? [],
  );
  protected readonly subdivisions = computed(
    () => this.regions.country(this.draft().countryCode)?.subdivisions ?? [],
  );
  /** A territory or micro-state: its single pseudo-subdivision is chosen with the country. */
  protected readonly wholeCountry = computed(() => {
    const subdivisions = this.subdivisions();
    return subdivisions.length === 1 && subdivisions[0].wholeCountry;
  });
  protected readonly missing = computed(() => {
    const draft = this.draft();
    if (!draft.countryCode) {
      return 'Choose your country.';
    }
    if (!draft.subdivisionCode) {
      return 'Choose your state or province.';
    }
    return null;
  });

  /** The draft's state or province as places show it (a whole country by its own name). */
  private readonly placeName = computed(() => {
    const entry = this.regions.subdivision(this.draft().subdivisionCode);
    if (!entry) {
      return null;
    }
    return entry.subdivision.wholeCountry ? entry.country.name : entry.subdivision.name;
  });
  /** The line under "Show my city on my profile" (Settings only; board W25). */
  protected readonly cityLine = computed(() => {
    if (!this.settingsLayout()) {
      return null;
    }
    const place = this.placeName();
    if (!place) {
      return null;
    }
    if (!this.onMap()) {
      return 'While you are hidden from the map, your profile shows no place.';
    }
    const city = this.draft().city.trim();
    if (!city) {
      return `Without a city, every place shows ${place} only.`;
    }
    return this.draft().showCity
      ? `Your profile shows ${city}, ${place}. Everywhere else shows ${place} only.`
      : `Your profile shows ${place} only, as everywhere else.`;
  });

  constructor() {
    void this.regions.load();
  }

  protected onRegion(code: string): void {
    this.region.set(code);
    if (this.regions.country(this.draft().countryCode)?.regionCode !== code) {
      this.emit({ ...this.draft(), countryCode: '', subdivisionCode: '' });
    }
  }

  protected onCountry(code: string): void {
    const subdivisions = this.regions.country(code)?.subdivisions ?? [];
    const only = subdivisions.length === 1 && subdivisions[0].wholeCountry ? subdivisions[0] : null;
    this.emit({ ...this.draft(), countryCode: code, subdivisionCode: only?.code ?? '' });
  }

  protected onSubdivision(code: string): void {
    this.emit({ ...this.draft(), subdivisionCode: code });
  }

  protected onCity(event: Event): void {
    const city = (event.target as HTMLInputElement).value.slice(0, CITY_MAX_LENGTH);
    this.emit({ ...this.draft(), city });
  }

  protected onShowCity(showCity: boolean): void {
    this.emit({ ...this.draft(), showCity });
  }

  private emit(next: LocationDraft): void {
    this.draft.set(next);
    this.valueChange.emit(next);
  }
}
