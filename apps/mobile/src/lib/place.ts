/**
 * Public places (ADR 0017, mirror of the web's `shared/regions`): collectors declare a country, a
 * state or province and an optional city; others only ever see the state or province and the
 * country ("Quebec, Canada"). There is no coordinate, GPS fix, map position or distance anywhere.
 */

/** The default platform region of signed-out visitors and collectors without a location. */
export const DEFAULT_REGION = 'americas-north';

/** Names of the platform regions, shown until `GET /regions` answers (regions are fixed). */
export const PLATFORM_REGION_NAMES: Readonly<Record<string, string>> = {
  'americas-north': 'Americas (North)',
  'americas-south': 'Americas (South)',
  europe: 'Europe',
};

/** A platform region code as the API writes it (`americas-north`, `europe`). */
const REGION_CODE = /^[a-z]+(-[a-z]+)*$/;

/** True for a well-formed region code; whether the region exists is the server's call. */
export function isRegionCode(value: string | null | undefined): value is string {
  return !!value && value.length <= 32 && REGION_CODE.test(value);
}

/** Shown when a collector has no public place (not discoverable, or no location). */
export const GENERIC_PLACE_LABEL = 'Location not shared';

/** Longest city the API accepts (after trimming). */
export const CITY_MAX_LENGTH = 80;

/** The label of a public place, or null without one. */
export function placeLabel(place: { label?: string | null } | null | undefined): string | null {
  const label = place?.label?.trim();
  return label ? label : null;
}

/** "Americas (North)" for a region code (falls back to the code). */
export function regionName(code: string | null | undefined): string {
  const key = code ?? DEFAULT_REGION;
  return PLATFORM_REGION_NAMES[key] ?? key;
}

/**
 * How copy names the region being browsed: "your region" in one's own region (Americas (North)
 * for a collector who has not said where they are), the region's name in another one, so nobody
 * reads "your region" over the binders of another continent.
 */
export function regionPhrase(region: string, home: string | null | undefined): string {
  return region === (home ?? DEFAULT_REGION) ? 'your region' : regionName(region);
}
