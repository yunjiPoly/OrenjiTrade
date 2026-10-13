import { Injectable, computed, inject, signal } from '@angular/core';
import {
  PlatformRegion,
  RegionCountry,
  RegionSubdivision,
  RegionsService,
} from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../../core/http/api-error';
import { silentErrors } from '../../core/http/http-context';

/** The default platform region of signed-out visitors (ADR 0017). */
export const DEFAULT_REGION = 'americas-north';

/** Names of the platform regions, shown until `GET /regions` answers (regions are fixed). */
export const PLATFORM_REGION_NAMES: Readonly<Record<string, string>> = {
  'americas-north': 'Americas (North)',
  'americas-south': 'Americas (South)',
  europe: 'Europe',
};

/** A platform region code (`americas-north`, ...). */
export const REGION_CODE = /^[a-z]+(-[a-z]+)*$/;

/** One subdivision with its country, as pickers and the map list them. */
export interface SubdivisionEntry {
  subdivision: RegionSubdivision;
  country: RegionCountry;
}

/**
 * The platform regions, their countries and their subdivisions (`GET /regions`, public, cached
 * server side). Loaded once per app session on first use; `load()` can be retried after an error.
 * Feeds the region switcher, the location pickers and the region map.
 */
@Injectable({ providedIn: 'root' })
export class RegionsStore {
  private readonly api = inject(RegionsService);

  private readonly state = signal<PlatformRegion[] | null>(null);
  private readonly loadingState = signal(false);
  private readonly errorState = signal<ApiError | null>(null);
  private pending: Promise<boolean> | null = null;

  readonly regions = computed(() => this.state() ?? []);
  readonly loaded = computed(() => this.state() !== null);
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();

  private readonly countries = computed(() => {
    const byCode = new Map<string, RegionCountry>();
    for (const region of this.regions()) {
      for (const country of region.countries) {
        byCode.set(country.code, country);
      }
    }
    return byCode;
  });

  private readonly subdivisions = computed(() => {
    const byCode = new Map<string, SubdivisionEntry>();
    for (const country of this.countries().values()) {
      for (const subdivision of country.subdivisions) {
        byCode.set(subdivision.code, { subdivision, country });
      }
    }
    return byCode;
  });

  /** Loads the catalog once; resolves false (and sets `error`) when it failed. */
  load(): Promise<boolean> {
    if (this.state() !== null) {
      return Promise.resolve(true);
    }
    if (!this.pending) {
      this.loadingState.set(true);
      this.errorState.set(null);
      this.pending = firstValueFrom(
        this.api.listRegions('body', false, { context: silentErrors() }),
      )
        .then((response) => {
          this.state.set(response.regions);
          return true;
        })
        .catch((error: unknown) => {
          this.errorState.set(toApiError(error));
          return false;
        })
        .finally(() => {
          this.loadingState.set(false);
          this.pending = null;
        });
    }
    return this.pending;
  }

  region(code: string | null | undefined): PlatformRegion | null {
    return this.regions().find((region) => region.code === code) ?? null;
  }

  /** Display name of a region, known even before the catalog is loaded. */
  regionName(code: string | null | undefined): string {
    if (!code) {
      return PLATFORM_REGION_NAMES[DEFAULT_REGION];
    }
    return this.region(code)?.name ?? PLATFORM_REGION_NAMES[code] ?? code;
  }

  country(code: string | null | undefined): RegionCountry | null {
    return code ? (this.countries().get(code) ?? null) : null;
  }

  subdivision(code: string | null | undefined): SubdivisionEntry | null {
    return code ? (this.subdivisions().get(code) ?? null) : null;
  }

  /** Every subdivision of a region, by country then name. */
  subdivisionsOf(regionCode: string): SubdivisionEntry[] {
    const region = this.region(regionCode);
    if (!region) {
      return [];
    }
    return region.countries.flatMap((country) =>
      country.subdivisions.map((subdivision) => ({ subdivision, country })),
    );
  }
}

/** "Quebec, Canada", or the country alone for a whole-country pseudo-subdivision. */
export function subdivisionLabel(entry: SubdivisionEntry): string {
  return entry.subdivision.wholeCountry
    ? entry.country.name
    : `${entry.subdivision.name}, ${entry.country.name}`;
}
