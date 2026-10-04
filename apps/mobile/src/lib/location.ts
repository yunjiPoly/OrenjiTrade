/**
 * Trading-area helpers shared by onboarding and Settings → Location (mirror of the web's
 * `shared/location/city-presets.ts` and `roundCoordinate`). Privacy (ADR 0004): coordinates are
 * rounded to 3 decimals (~110 m) before they leave the device, the server snaps them further, and
 * the app never displays coordinates, only the server's public label.
 */

/** Rounds a coordinate to 3 decimals, the most precision the app ever sends. */
export function roundCoordinate(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export interface CityPreset {
  id: string;
  label: string;
  /** Public city centre (never a personal address). */
  lat: number;
  lng: number;
  /** Suggested trading radius in km. */
  radiusKm: number;
}

/** Quick picks; centres match the API's static region table (same list as the web). */
export const CITY_PRESETS: readonly CityPreset[] = [
  { id: 'montreal', label: 'Montréal', lat: 45.502, lng: -73.567, radiusKm: 10 },
  { id: 'laval', label: 'Laval', lat: 45.606, lng: -73.712, radiusKm: 10 },
  { id: 'longueuil', label: 'Longueuil', lat: 45.531, lng: -73.518, radiusKm: 8 },
  { id: 'quebec', label: 'Québec', lat: 46.813, lng: -71.208, radiusKm: 15 },
  { id: 'ottawa', label: 'Ottawa', lat: 45.421, lng: -75.697, radiusKm: 15 },
  { id: 'toronto', label: 'Toronto', lat: 43.653, lng: -79.383, radiusKm: 20 },
  { id: 'calgary', label: 'Calgary', lat: 51.045, lng: -114.057, radiusKm: 20 },
  { id: 'vancouver', label: 'Vancouver', lat: 49.283, lng: -123.121, radiusKm: 20 },
];

export const DEFAULT_RADIUS_KM = 5;
export const MIN_RADIUS_KM = 1;
export const MAX_RADIUS_KM = 50;

/** Radius steps of the stepper (fine near home, coarse further out). */
export function nextRadius(current: number, direction: 1 | -1): number {
  const step = current < 10 || (current === 10 && direction === -1) ? 1 : 5;
  return Math.min(MAX_RADIUS_KM, Math.max(MIN_RADIUS_KM, current + direction * step));
}

/** The preset whose centre is the given point, if any (to highlight the chosen city). */
export function presetAt(lat: number | undefined, lng: number | undefined): CityPreset | null {
  if (lat === undefined || lng === undefined) {
    return null;
  }
  return (
    CITY_PRESETS.find(
      (preset) =>
        roundCoordinate(preset.lat) === roundCoordinate(lat) &&
        roundCoordinate(preset.lng) === roundCoordinate(lng)
    ) ?? null
  );
}
