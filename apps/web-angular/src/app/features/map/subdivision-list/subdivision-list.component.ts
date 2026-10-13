import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import type { PlatformRegion } from '@orenji/api-client';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { binderCountLabel } from '../data/boundaries';

interface ListedSubdivision {
  code: string;
  name: string;
  count: number;
}

interface ListedCountry {
  code: string;
  name: string;
  count: number;
  subdivisions: ListedSubdivision[];
}

/** Lower-cased, accent-free text for the filter. */
function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('en');
}

/**
 * The accessible alternative to the region map: every state/province of the region, grouped by
 * country, with its number of public binders; a filter field and "only with binders". Each entry
 * is a button (keyboard, screen readers) that opens the same panel as a click on the map.
 */
@Component({
  selector: 'app-subdivision-list',
  imports: [
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    SkeletonComponent,
  ],
  template: `
    <section class="sdl" aria-labelledby="sdl-title">
      <header class="sdl__header">
        <h2 id="sdl-title" class="sdl__title">States and provinces</h2>
        <mat-form-field appearance="outline" class="sdl__filter" subscriptSizing="dynamic">
          <mat-label>Find a state or province</mat-label>
          <mat-icon matPrefix aria-hidden="true">search</mat-icon>
          <input
            matInput
            type="search"
            data-testid="subdivision-filter"
            [value]="filter()"
            (input)="filter.set($any($event.target).value)"
          />
        </mat-form-field>
        <mat-checkbox [checked]="onlyWithBinders()" (change)="onlyWithBinders.set($event.checked)">
          Only places with binders
        </mat-checkbox>
      </header>

      @if (loading()) {
        <div aria-busy="true">
          <span class="visually-hidden">Loading the list</span>
          <app-skeleton variant="list" lines="6" />
        </div>
      } @else if (groups().length === 0) {
        <p class="sdl__empty" role="status">
          {{
            onlyWithBinders() || filter()
              ? 'No state or province matches.'
              : 'No state or province in this region.'
          }}
        </p>
      } @else {
        <div class="sdl__groups" data-testid="subdivision-list">
          @for (country of groups(); track country.code) {
            <section class="sdl__country" [attr.aria-labelledby]="'sdl-' + country.code">
              <h3 class="sdl__country-name" [id]="'sdl-' + country.code">
                {{ country.name }}
                <span class="sdl__country-count">{{ country.count }}</span>
              </h3>
              <ul class="sdl__items">
                @for (subdivision of country.subdivisions; track subdivision.code) {
                  <li>
                    <button
                      type="button"
                      class="sdl__item"
                      [class.sdl__item--selected]="subdivision.code === selected()"
                      [class.sdl__item--empty]="subdivision.count === 0"
                      [attr.aria-current]="subdivision.code === selected() ? 'true' : null"
                      [attr.data-code]="subdivision.code"
                      (click)="picked.emit(subdivision.code)"
                    >
                      <span class="sdl__item-name">{{ subdivision.name }}</span>
                      <span
                        class="sdl__item-count"
                        [attr.aria-label]="countLabel(subdivision.count)"
                        >{{ subdivision.count }}</span
                      >
                    </button>
                  </li>
                }
              </ul>
            </section>
          }
        </div>
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
      min-height: 0;
    }
    .sdl {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-2);
      height: 100%;
      min-height: 0;
    }
    .sdl__header {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-1);
    }
    .sdl__title {
      margin: 0;
      font-size: var(--font-size-lg);
    }
    .sdl__filter {
      width: 100%;
    }
    .sdl__groups {
      overflow-y: auto;
      min-height: 0;
      flex: 1 1 auto;
      padding-right: var(--spacing-1);
    }
    .sdl__country + .sdl__country {
      margin-top: var(--spacing-3);
    }
    .sdl__country-name {
      position: sticky;
      top: 0;
      z-index: 1;
      display: flex;
      justify-content: space-between;
      margin: 0;
      padding: var(--spacing-1) 0;
      background: var(--color-surface);
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }
    .sdl__items {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .sdl__item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-2);
      width: 100%;
      min-height: 40px;
      padding: var(--spacing-1) var(--spacing-2);
      border: 0;
      border-radius: var(--radius-md, 8px);
      background: transparent;
      color: var(--color-ink);
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    .sdl__item:hover {
      background: var(--color-surface-variant);
    }
    .sdl__item:focus-visible {
      outline: var(--focus-width) solid var(--color-focus-ring);
      outline-offset: calc(var(--focus-width) * -1);
    }
    .sdl__item--selected {
      background: var(--color-primary-container);
      color: var(--color-on-primary-container);
      font-weight: var(--font-weight-semibold);
    }
    .sdl__item--empty .sdl__item-count {
      color: var(--color-text-muted);
      background: transparent;
    }
    .sdl__item-count {
      min-width: 2em;
      padding: 0 var(--spacing-2);
      border-radius: var(--radius-pill);
      background: var(--color-primary-container);
      color: var(--color-on-primary-container);
      font-size: var(--font-size-sm);
      text-align: center;
    }
    .sdl__empty {
      margin: 0;
      color: var(--color-text-muted);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubdivisionListComponent {
  readonly region = input<PlatformRegion | null>(null);
  readonly counts = input<ReadonlyMap<string, number>>(new Map());
  readonly selected = input<string | null>(null);
  readonly loading = input(false);
  readonly picked = output<string>();

  protected readonly filter = signal('');
  protected readonly onlyWithBinders = signal(false);

  protected readonly groups = computed<ListedCountry[]>(() => {
    const counts = this.counts();
    const needle = fold(this.filter().trim());
    const onlyWithBinders = this.onlyWithBinders();
    const groups: ListedCountry[] = [];
    for (const country of this.region()?.countries ?? []) {
      if (!country.active) {
        continue;
      }
      const countryMatches = needle !== '' && fold(country.name).includes(needle);
      const subdivisions = country.subdivisions
        .map((subdivision) => ({
          code: subdivision.code,
          name: subdivision.wholeCountry ? country.name : subdivision.name,
          count: counts.get(subdivision.code) ?? 0,
        }))
        .filter(
          (entry) =>
            (!onlyWithBinders || entry.count > 0) &&
            (needle === '' || countryMatches || fold(entry.name).includes(needle)),
        );
      if (subdivisions.length > 0) {
        groups.push({
          code: country.code,
          name: country.name,
          count: subdivisions.reduce((sum, entry) => sum + entry.count, 0),
          subdivisions,
        });
      }
    }
    return groups;
  });

  protected countLabel(count: number): string {
    return binderCountLabel(count);
  }
}
