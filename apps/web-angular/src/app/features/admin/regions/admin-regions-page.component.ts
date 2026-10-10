import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminRegionsService, PlatformRegion, RegionCountry } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';

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
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    MatSlideToggleModule,
    ErrorStateComponent,
    PageHeaderComponent,
    SkeletonComponent,
  ],
  template: `
    <div class="admin-page">
      <app-page-header
        title="Regions"
        subtitle="Which platform region each country belongs to. Collectors browse, search and match within one region."
      />

      @if (error(); as error) {
        <app-error-state
          title="Regions could not load"
          [message]="message(error)"
          [requestId]="error.requestId"
          (retry)="load()"
        />
      } @else if (regions(); as list) {
        @for (region of list; track region.code) {
          <section
            class="admin-card regions__region"
            [attr.aria-labelledby]="'region-' + region.code"
          >
            <h2 [id]="'region-' + region.code">
              {{ region.name }}
              <span class="mono regions__code">{{ region.code }}</span>
              @if (region.isDefault) {
                <span class="regions__default">Default</span>
              }
            </h2>
            <p class="admin-count">{{ countLabel(region) }}</p>
            <ul class="regions__countries">
              @for (country of region.countries; track country.code) {
                @let draft = draftOf(country);
                <li class="regions__country" [attr.data-country]="country.code">
                  <span class="regions__name">
                    {{ country.name }}
                    <span class="mono regions__code">{{ country.code }}</span>
                  </span>
                  <mat-form-field appearance="outline" subscriptSizing="dynamic">
                    <mat-label>Region</mat-label>
                    <mat-select
                      [value]="draft.regionCode"
                      (selectionChange)="edit(country, { regionCode: $event.value })"
                    >
                      @for (option of list; track option.code) {
                        <mat-option [value]="option.code">{{ option.name }}</mat-option>
                      }
                    </mat-select>
                  </mat-form-field>
                  <mat-slide-toggle
                    [checked]="draft.active"
                    (change)="edit(country, { active: $event.checked })"
                  >
                    Active
                  </mat-slide-toggle>
                  <button
                    matButton="filled"
                    type="button"
                    [disabled]="!dirty(country) || saving() === country.code"
                    (click)="save(country)"
                  >
                    Save
                  </button>
                </li>
              }
            </ul>
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
  styleUrls: ['../shared/admin-page.scss'],
  styles: `
    .regions__region + .regions__region {
      margin-top: var(--spacing-5);
    }
    .regions__code {
      margin-left: var(--spacing-2);
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .regions__default {
      margin-left: var(--spacing-2);
      padding: 2px var(--spacing-2);
      border-radius: var(--radius-pill);
      background: var(--color-primary-container);
      color: var(--color-on-primary-container);
      font-size: var(--font-size-xs);
    }
    .regions__countries {
      display: grid;
      gap: var(--spacing-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .regions__country {
      display: grid;
      grid-template-columns: minmax(10rem, 1fr) minmax(12rem, 16rem) auto auto;
      gap: var(--spacing-3);
      align-items: center;
    }
    @media (max-width: 719px) {
      .regions__country {
        grid-template-columns: 1fr;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminRegionsPageComponent {
  private readonly api = inject(AdminRegionsService);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly regions = signal<PlatformRegion[] | null>(null);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly saving = signal<string | null>(null);
  private readonly drafts = signal<ReadonlyMap<string, Draft>>(new Map());
  private readonly total = computed(() =>
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
    this.saving.set(country.code);
    try {
      await firstValueFrom(
        this.api.updateAdminRegionCountry(
          { code: country.code, countryRegionRequest: draft },
          'body',
          false,
          { context: silentErrors() },
        ),
      );
      this.snackBar.open(`${country.name} saved.`, 'OK', { duration: 3000 });
      await this.load();
    } catch (error) {
      this.snackBar.open(friendlyMessage(toApiError(error)), 'OK', { duration: 5000 });
    } finally {
      this.saving.set(null);
    }
  }

  protected countLabel(region: PlatformRegion): string {
    const active = region.countries.filter((country) => country.active).length;
    return `${region.countries.length} countries (${active} active) of ${this.total()}`;
  }

  protected message(error: ApiError): string {
    return friendlyMessage(error);
  }
}
