import type { PlatformRegion, RegionsResponse } from '@/src/api/types';

/**
 * The states and provinces of a platform region as the map's list shows them (the web's
 * `app-subdivision-list`): grouped by country, each with its number of public binders, filtered
 * by a text and by "only places with binders". Pure: the list and its tests share it.
 */

export interface ListedPlace {
  /** ISO 3166-2 code, or the country's code for a whole-country entry. */
  code: string;
  /** "Quebec" (the country's name for a whole-country entry). */
  name: string;
  /** "Quebec, Canada" (the country alone for a whole-country entry). */
  label: string;
  count: number;
}

export interface ListedCountry {
  code: string;
  name: string;
  /** Public binders of the listed places of this country. */
  count: number;
  places: ListedPlace[];
}

/** An ISO 3166-2 first-level code, or an alpha-2 country code (a whole-country entry). */
export const SUBDIVISION_CODE = /^[A-Z]{2}(-[A-Z0-9]{1,3})?$/;

/** A well-formed place code from a link, upper-cased; null otherwise. */
export function placeCodeFrom(value: string | null | undefined): string | null {
  const code = value?.trim().toUpperCase() ?? '';
  return SUBDIVISION_CODE.test(code) ? code : null;
}

/** Lower-cased, accent-free text: "Québec" is found by "quebec". */
export function foldText(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** One region of `GET /regions`. */
export function regionOf(
  regions: RegionsResponse | null | undefined,
  code: string
): PlatformRegion | null {
  return regions?.regions.find((region) => region.code === code) ?? null;
}

export interface PlaceFilter {
  text?: string;
  onlyWithBinders?: boolean;
}

/**
 * The countries of a region with their states and provinces, in the server's order. A text
 * matches a place by its name, or every place of a country by the country's name.
 */
export function listPlaces(
  region: PlatformRegion | null,
  counts: ReadonlyMap<string, number>,
  filter: PlaceFilter = {}
): ListedCountry[] {
  const needle = foldText(filter.text?.trim() ?? '');
  const countries: ListedCountry[] = [];
  for (const country of region?.countries ?? []) {
    if (!country.active) {
      continue;
    }
    const countryMatches = needle !== '' && foldText(country.name).includes(needle);
    const places = country.subdivisions
      .map((subdivision) => ({
        code: subdivision.code,
        name: subdivision.wholeCountry ? country.name : subdivision.name,
        label: subdivision.wholeCountry ? country.name : `${subdivision.name}, ${country.name}`,
        count: counts.get(subdivision.code) ?? 0,
      }))
      .filter(
        (place) =>
          (!filter.onlyWithBinders || place.count > 0) &&
          (needle === '' || countryMatches || foldText(place.name).includes(needle))
      );
    if (places.length > 0) {
      countries.push({
        code: country.code,
        name: country.name,
        count: places.reduce((sum, place) => sum + place.count, 0),
        places,
      });
    }
  }
  return countries;
}

/** "Quebec, Canada" for a place code of a region; null when the region does not list it. */
export function placeLabelOf(region: PlatformRegion | null, code: string): string | null {
  for (const country of region?.countries ?? []) {
    for (const subdivision of country.subdivisions) {
      if (subdivision.code === code) {
        return subdivision.wholeCountry ? country.name : `${subdivision.name}, ${country.name}`;
      }
    }
  }
  return null;
}

/**
 * The name of a place and of its country ("Quebec" and "Canada"; a whole-country entry gives the
 * country twice), for the state card of Search's map; null when the region does not list it.
 */
export function placeParts(
  region: PlatformRegion | null,
  code: string
): { name: string; country: string; countryCode: string } | null {
  for (const country of region?.countries ?? []) {
    for (const subdivision of country.subdivisions) {
      if (subdivision.code === code) {
        return {
          name: subdivision.wholeCountry ? country.name : subdivision.name,
          country: country.name,
          countryCode: country.code,
        };
      }
    }
  }
  return null;
}
