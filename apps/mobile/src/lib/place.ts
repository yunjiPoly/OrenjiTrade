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
