import { LatLng } from '../map/map-adapter';

export interface CityPreset {
  id: string;
  label: string;
  /** Public city centre (never a personal address). */
  center: LatLng;
  /** Suggested trading radius in km. */
  radiusKm: number;
}

/** Quick picks for the trading-area picker; centres match the API's static region table. */
export const CITY_PRESETS: readonly CityPreset[] = [
  { id: 'montreal', label: 'Montréal', center: { lat: 45.502, lng: -73.567 }, radiusKm: 10 },
  { id: 'laval', label: 'Laval', center: { lat: 45.606, lng: -73.712 }, radiusKm: 10 },
  { id: 'longueuil', label: 'Longueuil', center: { lat: 45.531, lng: -73.518 }, radiusKm: 8 },
  { id: 'quebec', label: 'Québec', center: { lat: 46.813, lng: -71.208 }, radiusKm: 15 },
  { id: 'ottawa', label: 'Ottawa', center: { lat: 45.421, lng: -75.697 }, radiusKm: 15 },
  { id: 'toronto', label: 'Toronto', center: { lat: 43.653, lng: -79.383 }, radiusKm: 20 },
  { id: 'calgary', label: 'Calgary', center: { lat: 51.045, lng: -114.057 }, radiusKm: 20 },
  { id: 'vancouver', label: 'Vancouver', center: { lat: 49.283, lng: -123.121 }, radiusKm: 20 },
];

/** Default centre when the collector has no trading area yet (Montréal, the launch city). */
export const DEFAULT_TRADING_CENTER: LatLng = CITY_PRESETS[0].center;
export const DEFAULT_RADIUS_KM = 5;
export const MIN_RADIUS_KM = 1;
export const MAX_RADIUS_KM = 50;

/** Zoom that roughly fits a radius on a ~400px map. */
export function zoomForRadius(radiusKm: number): number {
  if (radiusKm <= 2) return 13;
  if (radiusKm <= 5) return 12;
  if (radiusKm <= 10) return 11;
  if (radiusKm <= 25) return 10;
  return 9;
}
