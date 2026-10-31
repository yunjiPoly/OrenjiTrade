import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDialog } from '@angular/material/dialog';
import { AdminRegionsService, PlatformRegion, RegionCountry } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { ToastService } from '../../../core/feedback/toast.service';
import { AdminIconComponent } from '../console/admin-icon.component';
import { runConsoleAction } from '../console/console-actions';
import { confirmAdminAction } from '../shared/admin-actions';

const COLLAPSED = 6;

/** Board A19's line under each region. */
const REGION_LINES: Readonly<Record<string, string>> = {
  'americas-north': 'Canada, the United States, Mexico, Central America and the Caribbean.',
  'americas-south': 'South America, the Falkland Islands and French Guiana.',
  europe:
    'The countries and territories of Europe. Russia, Turkey and the Caucasus are not served.',
};

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** "13 provinces and territories", "50 states and DC", "32 states", "6 subdivisions". */
export function subdivisionWords(countryCode: string, count: number): string {
  switch (countryCode) {
    case 'CA':
      return `${count} provinces and territories`;
    case 'US':
      return count === 51 ? '50 states and DC' : `${count} states`;
    case 'MX':
      return `${count} states`;
    default:
      return `${count} ${count === 1 ? 'subdivision' : 'subdivisions'}`;
  }
}

/** A country row with its pending (unsaved) region and active flag. */
interface Draft {
  regionCode: string;
  active: boolean;
}

/**
 * `/admin/regions` (ADMIN, SUPER_ADMIN; ADR 0017): every platform region with its countries,
 * inactive ones included. An admin moves a country to another region or deactivates it (no new
 * location can choose it); each save is audited (`region.country.update`). Regions and
 * subdivisions themselves change only through a migration (they match the map's boundary files).
 */
@Component({
  selector: 'app-admin-regions-page',
  imports: [MatSlideToggleModule, AdminIconComponent, ErrorStateComponent, SkeletonComponent],
  template: `
    <div class="cp">
      <header class="cp__head">
        <div class="cp__heading">
          <p class="cp__eyebrow">Rules</p>
          <h1 class="cp__title">Regions</h1>
          <p class="cp__sub">
            Which platform region each country belongs to. Collectors browse, search and get
            wishlist alerts within one region; cards ship within it.
          </p>
        </div>
      </header>
      @if (error(); as error) {
        <app-error-state
          title="Regions could not load"
          [message]="message(error)"
          [requestId]="error.requestId"
          retryLabel="Try again"
          (retry)="load()"
        />
      } @else if (regions(); as list) {
        <div class="cp-filterbar rg__filters" role="search" aria-label="Find a country">
          <label class="cp-field cp-field--grow">
            <span class="visually-hidden">Find a country</span>
            <span class="cp-search">
              <app-admin-icon name="search" [size]="16" />
              <input
                class="cp-input"
                type="search"
                placeholder="Find a country"
                [value]="query()"
                (input)="query.set($any($event.target).value)"
              />
            </span>
          </label>
          <p class="cp-count rg__count" aria-live="polite">
            {{ total() }} countries in {{ list.length }} regions
          </p>
        </div>
        @for (region of list; track region.code) {
          @let rows = shown(region);
          <section class="cp-card rg__region" [attr.aria-labelledby]="'region-' + region.code">
            <div class="rg__head">
              <h2 class="cp-card__title" [id]="'region-' + region.code">
                {{ region.name }}
                @if (region.isDefault) {
                  <span class="cp-chip cp-chip--accent rg__default">Default</span>
                }
              </h2>
              <p class="rg__desc">{{ description(region.code) }}</p>
              <p class="rg__count-line">{{ countLabel(region) }}</p>
            </div>
            @if (rows.length === 0) {
              <p class="rg__none">No country of this region matches.</p>
            } @else {
              <div class="ct">
                <table class="rg__table" [attr.aria-label]="region.name + ' countries'">
                  <thead>
                    <tr>
                      <th scope="col">Country</th>
                      <th scope="col">Subdivisions</th>
                      <th scope="col">Region</th>
                      <th scope="col">Active</th>
                      <th scope="col"><span class="visually-hidden">Save</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (country of rows; track country.code) {
                      @let draft = draftOf(country);
                      <tr [attr.data-country]="country.code">
                        <th scope="row">
                          <span class="rg__name">{{ country.name }}</span>
                          <span class="ct__sub cp-mono">{{ country.code }}</span>
                        </th>
                        <td>{{ subdivisionLabel(country) }}</td>
                        <td>
                          <select
                            class="cp-select"
                            [attr.aria-label]="'Region of ' + country.name"
                            (change)="edit(country, { regionCode: $any($event.target).value })"
                          >
                            @for (option of list; track option.code) {
                              <option
                                [value]="option.code"
                                [selected]="draft.regionCode === option.code"
                              >
                                {{ option.name }}
                              </option>
                            }
                          </select>
                        </td>
                        <td>
                          <mat-slide-toggle
                            [checked]="draft.active"
                            (change)="edit(country, { active: $event.checked })"
                          >
                            <span class="visually-hidden">{{ country.name }} active</span>
                          </mat-slide-toggle>
                        </td>
                        <td class="rg__save">
                          <button
                            type="button"
                            class="cb cb--primary cb--small"
                            [disabled]="!dirty(country) || saving() === country.code"
                            (click)="save(country)"
                          >
                            Save
                          </button>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              @if (hiddenCount(region) > 0) {
                <button type="button" class="cp-link rg__more" (click)="expand(region.code)">
                  Show all {{ matching(region).length }} countries
                </button>
              }
            }
          </section>
        }
      } @else {
        <div aria-busy="true">
          <span class="visually-hidden">Loading regions</span>
          <app-skeleton variant="list" lines="6" />
        </div>
      }
    </div>
  `,
  styleUrls: [
    '../console/console-page.scss',
    '../console/console-controls.scss',
    '../console/console-table.scss',
  ],
  styles: `
    .rg__filters {
      align-items: center;
    }
    .rg__count {
      margin: 0;
    }
    .rg__region {
      margin-bottom: 20px;
      padding: 18px 20px 20px;
    }
    .rg__head {
      margin-bottom: 12px;
    }
    .rg__default {
      margin-left: 8px;
      vertical-align: middle;
    }
    .rg__desc {
      margin: 4px 0 0;
      color: var(--color-ink);
      font-size: var(--font-size-sm);
    }
    .rg__count-line,
    .rg__none {
      margin: 4px 0 0;
      color: var(--color-text-secondary);
      font-size: var(--font-size-sm);
    }
    .rg__table {
      min-width: 640px;
    }
    .rg__name {
      display: block;
      color: var(--color-ink);
      font-weight: var(--font-weight-semibold);
    }
    .rg__save {
      text-align: right;
    }
    .rg__more {
      margin-top: 10px;
      min-height: 32px;
      padding: 0;
      border: 0;
      background: none;
      cursor: pointer;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminRegionsPageComponent {
  private readonly api = inject(AdminRegionsService);
  private readonly toasts = inject(ToastService);
  private readonly dialog = inject(MatDialog);

  protected readonly regions = signal<PlatformRegion[] | null>(null);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly saving = signal<string | null>(null);
  private readonly drafts = signal<ReadonlyMap<string, Draft>>(new Map());
  protected readonly query = signal('');
  private readonly expanded = signal<ReadonlySet<string>>(new Set());
  protected readonly total = computed(() =>
    (this.regions() ?? []).reduce((sum, region) => sum + region.countries.length, 0),
  );

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.error.set(null);
    try {
      const response = await firstValueFrom(
        this.api.listAdminRegions('body', false, { context: silentErrors() }),
      );
      this.regions.set(response.regions);
      this.drafts.set(new Map());
    } catch (error) {
      this.error.set(toApiError(error));
    }
  }

  protected draftOf(country: RegionCountry): Draft {
    return (
      this.drafts().get(country.code) ?? { regionCode: country.regionCode, active: country.active }
    );
  }

  protected dirty(country: RegionCountry): boolean {
    const draft = this.drafts().get(country.code);
    return !!draft && (draft.regionCode !== country.regionCode || draft.active !== country.active);
  }

  protected edit(country: RegionCountry, patch: Partial<Draft>): void {
    const next = new Map(this.drafts());
    next.set(country.code, { ...this.draftOf(country), ...patch });
    this.drafts.set(next);
  }

  protected async save(country: RegionCountry): Promise<void> {
    const draft = this.draftOf(country);
    if (draft.regionCode !== country.regionCode) {
      // Moving a country confirms first (spec 15.7): its collectors browse another region.
      const to = this.regions()?.find((region) => region.code === draft.regionCode)?.name ?? '';
      const confirmed = await confirmAdminAction(this.dialog, {
        title: `Move ${country.name} to ${to}?`,
        message:
          `Collectors in ${country.name} browse, search and get wishlist alerts in ${to} from ` +
          'now on. Their places stay as they declared them.',
        confirmLabel: 'Move country',
      });
      if (!confirmed) {
        return;
      }
    }
    this.saving.set(country.code);
    const saved = await runConsoleAction(
      this.toasts,
      this.api.updateAdminRegionCountry(
        { code: country.code, countryRegionRequest: draft },
        'body',
        false,
        { context: silentErrors() },
      ),
      `${country.name} saved.`,
    );
    this.saving.set(null);
    if (saved) {
      await this.load();
    }
  }

  /** The region's countries matching the search, all of them once expanded or searched. */
  protected matching(region: PlatformRegion): RegionCountry[] {
    const query = normalize(this.query());
    return query
      ? region.countries.filter(
          (country) =>
            normalize(country.name).includes(query) || country.code.toLowerCase() === query,
        )
      : region.countries;
  }

  /** Long lists collapse to their first six (spec 15.7, board A19). */
  protected shown(region: PlatformRegion): RegionCountry[] {
    const rows = this.matching(region);
    return this.query().trim() || this.expanded().has(region.code)
      ? rows
      : rows.slice(0, COLLAPSED);
  }

  protected hiddenCount(region: PlatformRegion): number {
    return this.matching(region).length - this.shown(region).length;
  }

  protected expand(code: string): void {
    this.expanded.update((set) => new Set([...set, code]));
  }

  protected description(code: string): string {
    return REGION_LINES[code] ?? '';
  }

  protected subdivisionLabel(country: RegionCountry): string {
    return subdivisionWords(country.code, country.subdivisions?.length ?? 0);
  }

  protected countLabel(region: PlatformRegion): string {
    const active = region.countries.filter((country) => country.active).length;
    const n = region.countries.length;
    const noun = n === 1 ? 'country' : 'countries';
    return active === n ? `${n} ${noun} · all active` : `${n} ${noun} · ${active} active`;
  }

  protected message(error: ApiError): string {
    return friendlyMessage(error);
  }
}
