import type { LatLng } from '@/src/lib/location';

/** Where the map camera should look; a new `seq` moves the camera (city chosen, area reset). */
export interface MapFocus extends LatLng {
  radiusKm: number;
  seq: number;
}

/**
 * Props of the trading-area map, implemented with react-native-maps on iOS/Android
 * (`TradingAreaMap.tsx`) and Leaflet + OpenStreetMap on web (`TradingAreaMap.web.tsx`, the web
 * app's fallback adapter). Same mechanism as the web picker: tap the map or drag the pin to move
 * the centre; the radius is drawn as a circle.
 */
export interface TradingAreaMapProps {
  /**
   * The centre the collector chose (pin + radius circle), already rounded to 3 decimals; null
   * draws nothing (a centre derived from the device position is never drawn as a point).
   */
  centre: LatLng | null;
  radiusKm: number;
  focus: MapFocus;
  /** A tap on the map or the end of a pin drag (raw position; the picker rounds it). */
  onPick: (point: LatLng) => void;
  /** The camera settled on a new centre (for "Use map centre"). */
  onViewportChange: (centre: LatLng) => void;
  disabled?: boolean;
  testID?: string;
}

/** Height of the map in the picker (dp). */
export const TRADING_AREA_MAP_HEIGHT = 240;

export const TRADING_AREA_MAP_LABEL =
  'Trading area map. Tap the map or drag the pin to move the centre of your trading area.';

export const PIN_TITLE = 'Centre of your trading area (drag to move)';

/** A `#RRGGBB` colour with an alpha channel (`#RRGGBBAA`). */
export function withAlpha(hex: string, alpha: number): string {
  const channel = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return /^#[0-9a-f]{6}$/i.test(hex) ? `${hex}${channel}` : hex;
}
