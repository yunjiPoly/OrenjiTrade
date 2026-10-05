import type { TradingAreaInput } from '@/src/api/hooks/location';
import type { MyLocationResponse } from '@/src/api/types';
import {
  DEFAULT_RADIUS_KM,
  DEFAULT_TRADING_CENTER,
  coarseCentre,
  placeLabel,
  presetAt,
  roundCoordinate,
  type CityPreset,
  type LatLng,
} from '@/src/lib/location';

/**
 * What the trading-area picker edits (web: `TradingAreaValue`), plus a radius of 1–50 km:
 * - `point`: a centre the collector chose by hand (a tap on the map, a dragged pin, "Use map
 *   centre" or a city), rounded to 3 decimals and saved with source MANUAL;
 * - `saved`: keep the centre the API already holds because it came from the device (snapped by
 *   the server). The app never draws that centre as a point (ADR 0004).
 */
export type AreaDraft =
  | { kind: 'point'; lat: number; lng: number; radiusKm: number }
  | { kind: 'saved'; radiusKm: number };

/** A hand-picked centre, rounded to 3 decimals (~110 m) like the web's `roundCoordinate`. */
export function pointDraft(point: LatLng, radiusKm: number): AreaDraft {
  return {
    kind: 'point',
    lat: roundCoordinate(point.lat),
    lng: roundCoordinate(point.lng),
    radiusKm,
  };
}

/** A city quick pick: its public centre and suggested radius (web: `choosePreset`). */
export function presetDraft(preset: CityPreset): AreaDraft {
  return pointDraft(preset, preset.radiusKm);
}

/** The draft matching what is saved (or the launch city, 5 km, by default like the web). */
export function draftFromLocation(location: MyLocationResponse | undefined): AreaDraft {
  const area = location?.tradingArea;
  if (!area) {
    return pointDraft(DEFAULT_TRADING_CENTER, DEFAULT_RADIUS_KM);
  }
  if (area.source === 'DEVICE') {
    return { kind: 'saved', radiusKm: area.radiusKm };
  }
  return pointDraft(area, area.radiusKm);
}

/** The pin to draw: a hand-picked centre only, never a device-derived one. */
export function draftPin(draft: AreaDraft): LatLng | null {
  return draft.kind === 'point' ? { lat: draft.lat, lng: draft.lng } : null;
}

/**
 * Where the map looks for a draft: the chosen centre, or, for a device-derived area, the saved
 * centre coarsened to 2 decimals (the neighbourhood, not the device position).
 */
export function draftViewport(draft: AreaDraft, location: MyLocationResponse | undefined): LatLng {
  if (draft.kind === 'point') {
    return { lat: draft.lat, lng: draft.lng };
  }
  const saved = location?.tradingArea;
  return saved ? coarseCentre(saved) : DEFAULT_TRADING_CENTER;
}

/** The request for a draft, or null when it cannot be resolved (no saved area to keep). */
export function areaInput(
  draft: AreaDraft,
  location: MyLocationResponse | undefined
): TradingAreaInput | null {
  if (draft.kind === 'point') {
    return { lat: draft.lat, lng: draft.lng, radiusKm: draft.radiusKm, source: 'MANUAL' };
  }
  const saved = location?.tradingArea;
  return saved
    ? { lat: saved.lat, lng: saved.lng, radiusKm: draft.radiusKm, source: saved.source }
    : null;
}

/** True when saving the draft would change what the API holds. */
export function isAreaDirty(draft: AreaDraft, location: MyLocationResponse | undefined): boolean {
  const saved = location?.tradingArea;
  if (!saved) {
    return true;
  }
  if (draft.radiusKm !== saved.radiusKm) {
    return true;
  }
  if (draft.kind === 'saved') {
    return false;
  }
  return (
    saved.source !== 'MANUAL' ||
    roundCoordinate(saved.lat) !== draft.lat ||
    roundCoordinate(saved.lng) !== draft.lng
  );
}

/** One sentence about the centre being edited, never with coordinates. */
export function describeCentre(draft: AreaDraft, location: MyLocationResponse | undefined): string {
  if (draft.kind === 'saved') {
    return 'Centre: your device location, snapped by OrenjiTrade. Tap the map or pick a city to choose it yourself.';
  }
  const preset = presetAt(draft.lat, draft.lng);
  if (preset) {
    return `Centre: ${preset.label} city centre.`;
  }
  const saved = location?.tradingArea;
  if (
    saved?.source === 'MANUAL' &&
    roundCoordinate(saved.lat) === draft.lat &&
    roundCoordinate(saved.lng) === draft.lng
  ) {
    const near = placeLabel(saved.label);
    return near ? `Centre: your saved point near ${near}.` : 'Centre: your saved point.';
  }
  return 'Centre: the point you chose on the map.';
}
