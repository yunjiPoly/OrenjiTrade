import type { TradingAreaInput } from '@/src/api/hooks/location';
import type { MyLocationResponse } from '@/src/api/types';
import { CITY_PRESETS, DEFAULT_RADIUS_KM, presetAt } from '@/src/lib/location';

/**
 * What the trading-area picker edits: a city preset (public centre) or the area the API already
 * holds (`saved`, e.g. a snapped device position), plus a radius. The picker never holds raw
 * coordinates; they are resolved only when saving.
 */
export interface AreaDraft {
  center: 'saved' | string;
  radiusKm: number;
}

/** The draft matching what is saved (or the launch city by default). */
export function draftFromLocation(location: MyLocationResponse | undefined): AreaDraft {
  const area = location?.tradingArea;
  if (!area) {
    return { center: CITY_PRESETS[0]?.id ?? 'montreal', radiusKm: DEFAULT_RADIUS_KM };
  }
  const preset = area.source === 'MANUAL' ? presetAt(area.lat, area.lng) : null;
  return { center: preset?.id ?? 'saved', radiusKm: area.radiusKm };
}

/** The request for a draft, or null when it cannot be resolved (no saved area). */
export function areaInput(
  draft: AreaDraft,
  location: MyLocationResponse | undefined
): TradingAreaInput | null {
  if (draft.center === 'saved') {
    const saved = location?.tradingArea;
    return saved
      ? { lat: saved.lat, lng: saved.lng, radiusKm: draft.radiusKm, source: saved.source }
      : null;
  }
  const preset = CITY_PRESETS.find((entry) => entry.id === draft.center);
  return preset
    ? { lat: preset.lat, lng: preset.lng, radiusKm: draft.radiusKm, source: 'MANUAL' }
    : null;
}

/** True when saving the draft would change what the API holds. */
export function isAreaDirty(draft: AreaDraft, location: MyLocationResponse | undefined): boolean {
  const saved = location?.tradingArea;
  if (!saved) {
    return true;
  }
  const current = draftFromLocation(location);
  return current.center !== draft.center || saved.radiusKm !== draft.radiusKm;
}
