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

/** A point on the map (degrees). */
export interface LatLng {
  lat: number;
  lng: number;
}

/** Default centre when the collector has no trading area yet (Montréal, the launch city). */
export const DEFAULT_TRADING_CENTER: LatLng = { lat: 45.502, lng: -73.567 };
export const DEFAULT_RADIUS_KM = 5;
export const MIN_RADIUS_KM = 1;
export const MAX_RADIUS_KM = 50;

const KM_PER_DEGREE_LAT = 111.32;

/** A map viewport (react-native-maps `Region`): centre plus the spans in degrees. */
export interface AreaRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

/**
 * The viewport that shows a whole trading area (the circle plus a margin), the mobile equivalent
 * of the web's `fitBounds(circleBounds(area))`.
 */
export function regionForArea(centre: LatLng, radiusKm: number): AreaRegion {
  const latitudeDelta = (radiusKm * 2 * 1.3) / KM_PER_DEGREE_LAT;
  const cos = Math.max(Math.cos((centre.lat * Math.PI) / 180), 0.01);
  return {
    latitude: centre.lat,
    longitude: centre.lng,
    latitudeDelta,
    longitudeDelta: latitudeDelta / cos,
  };
}

/** Leaflet zoom that roughly fits a radius on a phone-sized map (web's `zoomForRadius`). */
export function zoomForRadius(radiusKm: number): number {
  if (radiusKm <= 2) return 13;
  if (radiusKm <= 5) return 12;
  if (radiusKm <= 10) return 11;
  if (radiusKm <= 25) return 10;
  return 9;
}

/**
 * Where the map looks when the saved centre came from the device (ADR 0004): 2 decimals (~1 km,
 * the server's grid), so the map shows the neighbourhood without pointing at the device position.
 */
export function coarseCentre(point: LatLng): LatLng {
  return { lat: Math.round(point.lat * 100) / 100, lng: Math.round(point.lng * 100) / 100 };
}

/** The API's generic label when no region matched (`StaticRegionGeocoder.FALLBACK_LABEL`). */
export const GENERIC_AREA_LABEL = 'Approximate area';

/**
 * The server's public label when it names a place, or null for a missing or generic label (so
 * sentences like "near Approximate area" never appear).
 */
export function placeLabel(label: string | null | undefined): string | null {
  const trimmed = label?.trim();
  if (!trimmed || trimmed.toLowerCase() === GENERIC_AREA_LABEL.toLowerCase()) {
    return null;
  }
  return trimmed;
}

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
