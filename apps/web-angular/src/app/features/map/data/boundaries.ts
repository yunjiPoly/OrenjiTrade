import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/**
 * Boundary assets of the region map (ADR 0017): `public/boundaries/<region>.json`, built from
 * Natural Earth admin-1 (public domain) by `scripts/regions/build.mjs`. Static files of this web
 * build, fetched lazily for the region on screen: no map provider, no tiles, no key.
 */
export interface BoundaryProperties {
  /** ISO 3166-2 subdivision code (absent on country outlines). */
  code?: string;
  /** ISO 3166-1 alpha-2 country code. */
  country: string;
  kind: 'subdivision' | 'country';
}

export interface BoundaryFeature {
  type: 'Feature';
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown };
  properties: BoundaryProperties;
}

export interface BoundaryCollection {
  type: 'FeatureCollection';
  features: BoundaryFeature[];
}

/** URL of a region's boundary file, relative to the app's base href. */
export function boundaryUrl(region: string): string {
  return `boundaries/${encodeURIComponent(region)}.json`;
}

/** Loads (once per region and visit) the boundary file of a region. */
@Injectable({ providedIn: 'root' })
export class BoundaryAssets {
  private readonly http = inject(HttpClient);
  private readonly cache = new Map<string, Promise<BoundaryCollection>>();

  load(region: string): Promise<BoundaryCollection> {
    let pending = this.cache.get(region);
    if (!pending) {
      pending = firstValueFrom(this.http.get<BoundaryCollection>(boundaryUrl(region)));
      this.cache.set(region, pending);
      // A failed download can be retried.
      pending.catch(() => this.cache.delete(region));
    }
    return pending;
  }
}

/** Shading level of a state/province by its public binder count (0 = none). */
export type ShadeLevel = 0 | 1 | 2 | 3 | 4;

export function shadeLevel(count: number | undefined): ShadeLevel {
  if (!count || count <= 0) {
    return 0;
  }
  if (count === 1) {
    return 1;
  }
  if (count <= 4) {
    return 2;
  }
  return count <= 9 ? 3 : 4;
}

/** Legend of the shading levels, lightest first. */
export const SHADE_LEGEND: readonly { level: ShadeLevel; label: string }[] = [
  { level: 0, label: 'None' },
  { level: 1, label: '1' },
  { level: 2, label: '2–4' },
  { level: 3, label: '5–9' },
  { level: 4, label: '10+' },
];

/** Fill opacity of the primary colour per shading level (level 0 uses the surface colour). */
export const SHADE_OPACITY: Readonly<Record<ShadeLevel, number>> = {
  0: 0,
  1: 0.28,
  2: 0.48,
  3: 0.68,
  4: 0.88,
};

/** Initial view of each region (south-west, north-east corners in degrees). */
export const REGION_VIEW: Readonly<Record<string, [[number, number], [number, number]]>> = {
  'americas-north': [
    [8, -168],
    [72, -52],
  ],
  'americas-south': [
    [-56, -92],
    [13, -34],
  ],
  europe: [
    [34, -25],
    [71, 42],
  ],
};

/** "1 public binder" / "3 public binders" / "No public binders". */
export function binderCountLabel(count: number | undefined): string {
  if (!count) {
    return 'No public binders';
  }
  return `${count} public ${count === 1 ? 'binder' : 'binders'}`;
}
