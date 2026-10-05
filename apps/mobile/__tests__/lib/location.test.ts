import { tradingAreaBody } from '@/src/api/hooks/location';
import {
  areaInput,
  describeCentre,
  draftFromLocation,
  draftPin,
  draftViewport,
  isAreaDirty,
  pointDraft,
  presetDraft,
} from '@/src/features/location/tradingArea';
import {
  CITY_PRESETS,
  DEFAULT_TRADING_CENTER,
  coarseCentre,
  nextRadius,
  placeLabel,
  presetAt,
  regionForArea,
  roundCoordinate,
  zoomForRadius,
} from '@/src/lib/location';

import { locationFixture } from '../support/fixtures';

describe('trading area (ADR 0004)', () => {
  it('rounds every coordinate to 3 decimals before it leaves the device', () => {
    expect(roundCoordinate(45.501689)).toBe(45.502);
    expect(roundCoordinate(-73.567256)).toBe(-73.567);
    expect(
      tradingAreaBody({ lat: 45.5016891, lng: -73.5672561, radiusKm: 7.4, source: 'DEVICE' })
    ).toEqual({
      lat: 45.502,
      lng: -73.567,
      radiusKm: 7,
      source: 'DEVICE',
    });
    expect(tradingAreaBody({ lat: 0, lng: 0, radiusKm: 400, source: 'MANUAL' }).radiusKm).toBe(50);
    expect(tradingAreaBody({ lat: 0, lng: 0, radiusKm: 0, source: 'MANUAL' }).radiusKm).toBe(1);
  });

  it('steps the radius finely near home and coarsely further out, within 1–50 km', () => {
    expect(nextRadius(1, -1)).toBe(1);
    expect(nextRadius(5, 1)).toBe(6);
    expect(nextRadius(10, 1)).toBe(15);
    expect(nextRadius(10, -1)).toBe(9);
    expect(nextRadius(50, 1)).toBe(50);
  });

  it('uses the same public city centres as the web', () => {
    expect(CITY_PRESETS.map((preset) => preset.id)).toEqual([
      'montreal',
      'laval',
      'longueuil',
      'quebec',
      'ottawa',
      'toronto',
      'calgary',
      'vancouver',
    ]);
    expect(presetAt(45.502, -73.567)?.id).toBe('montreal');
    expect(presetAt(45.6, -73.6)).toBeNull();
    expect(presetAt(undefined, undefined)).toBeNull();
  });

  it('turns the saved area into a draft (a hand-picked point, or the device-derived area)', () => {
    expect(draftFromLocation(undefined)).toEqual({
      kind: 'point',
      lat: 45.502,
      lng: -73.567,
      radiusKm: 5,
    });
    expect(draftFromLocation(locationFixture())).toEqual({
      kind: 'point',
      lat: 45.502,
      lng: -73.567,
      radiusKm: 10,
    });
    const device = locationFixture({
      tradingArea: {
        lat: 45.53,
        lng: -73.6,
        radiusKm: 3,
        source: 'DEVICE',
        label: 'Plateau, Montréal',
      },
    });
    expect(draftFromLocation(device)).toEqual({ kind: 'saved', radiusKm: 3 });
    // A device-derived centre is never drawn as a point; the map only looks at the neighbourhood.
    expect(draftPin(draftFromLocation(device))).toBeNull();
    expect(draftViewport(draftFromLocation(device), device)).toEqual({ lat: 45.53, lng: -73.6 });
    const precise = locationFixture({
      tradingArea: { lat: 45.537, lng: -73.618, radiusKm: 3, source: 'DEVICE', label: null },
    });
    expect(draftViewport({ kind: 'saved', radiusKm: 3 }, precise)).toEqual({
      lat: 45.54,
      lng: -73.62,
    });
  });

  it('rounds a map tap or a dragged pin to 3 decimals and saves it as MANUAL', () => {
    const tapped = pointDraft({ lat: 45.5612345, lng: -73.6409876 }, 7);
    expect(tapped).toEqual({ kind: 'point', lat: 45.561, lng: -73.641, radiusKm: 7 });
    expect(draftPin(tapped)).toEqual({ lat: 45.561, lng: -73.641 });
    expect(areaInput(tapped, locationFixture())).toEqual({
      lat: 45.561,
      lng: -73.641,
      radiusKm: 7,
      source: 'MANUAL',
    });
    expect(describeCentre(tapped, locationFixture())).toBe(
      'Centre: the point you chose on the map.'
    );
  });

  it('turns a city into its public centre and suggested radius, like the web', () => {
    const quebec = CITY_PRESETS.find((preset) => preset.id === 'quebec');
    expect(quebec).toBeDefined();
    const draft = presetDraft(quebec!);
    expect(draft).toEqual({ kind: 'point', lat: 46.813, lng: -71.208, radiusKm: 15 });
    expect(describeCentre(draft, undefined)).toBe('Centre: Québec city centre.');
  });

  it('resolves a draft into the request only when saving, and knows when it changed', () => {
    const saved = locationFixture();
    expect(areaInput({ kind: 'point', lat: 46.813, lng: -71.208, radiusKm: 6 }, saved)).toEqual({
      lat: 46.813,
      lng: -71.208,
      radiusKm: 6,
      source: 'MANUAL',
    });
    expect(areaInput({ kind: 'saved', radiusKm: 4 }, saved)).toEqual({
      lat: 45.502,
      lng: -73.567,
      radiusKm: 4,
      source: 'MANUAL',
    });
    expect(areaInput({ kind: 'saved', radiusKm: 4 }, { discoverable: false })).toBeNull();

    const montreal = { kind: 'point', lat: 45.502, lng: -73.567 } as const;
    expect(isAreaDirty({ ...montreal, radiusKm: 10 }, saved)).toBe(false);
    expect(isAreaDirty({ ...montreal, radiusKm: 11 }, saved)).toBe(true);
    expect(isAreaDirty({ kind: 'point', lat: 45.606, lng: -73.712, radiusKm: 10 }, saved)).toBe(
      true
    );
    expect(isAreaDirty({ ...montreal, radiusKm: 5 }, { discoverable: false })).toBe(true);
    const device = locationFixture({
      tradingArea: { lat: 45.53, lng: -73.6, radiusKm: 3, source: 'DEVICE', label: null },
    });
    expect(isAreaDirty({ kind: 'saved', radiusKm: 3 }, device)).toBe(false);
    expect(isAreaDirty({ kind: 'saved', radiusKm: 4 }, device)).toBe(true);
    // The same point picked by hand replaces the device source.
    expect(isAreaDirty({ kind: 'point', lat: 45.53, lng: -73.6, radiusKm: 3 }, device)).toBe(true);
  });

  it('describes the centre in words, never with coordinates', () => {
    const saved = locationFixture({
      tradingArea: {
        lat: 45.561,
        lng: -73.641,
        radiusKm: 5,
        source: 'MANUAL',
        label: 'Ahuntsic, Montréal',
      },
    });
    expect(describeCentre(draftFromLocation(saved), saved)).toBe(
      'Centre: your saved point near Ahuntsic, Montréal.'
    );
    const generic = locationFixture({
      tradingArea: {
        lat: 45.561,
        lng: -73.641,
        radiusKm: 5,
        source: 'MANUAL',
        label: 'Approximate area',
      },
    });
    expect(describeCentre(draftFromLocation(generic), generic)).toBe('Centre: your saved point.');
    expect(describeCentre({ kind: 'saved', radiusKm: 5 }, saved)).toMatch(/^Centre: your device/);
    for (const text of [
      describeCentre(draftFromLocation(saved), saved),
      describeCentre(pointDraft({ lat: 45.5612, lng: -73.6411 }, 5), saved),
    ]) {
      expect(text).not.toMatch(/\d+\.\d+/);
    }
  });

  it('fits the map to the area and keeps generic labels out of sentences', () => {
    const region = regionForArea({ lat: 45.5, lng: -73.6 }, 10);
    expect(region.latitude).toBe(45.5);
    expect(region.longitude).toBe(-73.6);
    expect(region.latitudeDelta).toBeCloseTo(0.2336, 3);
    expect(region.longitudeDelta).toBeGreaterThan(region.latitudeDelta);
    expect(zoomForRadius(2)).toBe(13);
    expect(zoomForRadius(50)).toBe(9);
    expect(coarseCentre({ lat: 45.5371, lng: -73.6189 })).toEqual({ lat: 45.54, lng: -73.62 });
    expect(placeLabel('Approximate area')).toBeNull();
    expect(placeLabel(' approximate AREA ')).toBeNull();
    expect(placeLabel(null)).toBeNull();
    expect(placeLabel('')).toBeNull();
    expect(placeLabel('Vieux-Québec, Québec')).toBe('Vieux-Québec, Québec');
    expect(DEFAULT_TRADING_CENTER).toEqual({ lat: 45.502, lng: -73.567 });
  });
});
