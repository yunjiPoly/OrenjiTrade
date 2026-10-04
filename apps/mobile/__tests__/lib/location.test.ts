import { tradingAreaBody } from '@/src/api/hooks/location';
import { areaInput, draftFromLocation, isAreaDirty } from '@/src/features/location/tradingArea';
import { CITY_PRESETS, nextRadius, presetAt, roundCoordinate } from '@/src/lib/location';

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

  it('turns the saved area into a draft (city preset or the saved, snapped area)', () => {
    expect(draftFromLocation(undefined)).toEqual({ center: 'montreal', radiusKm: 5 });
    expect(draftFromLocation(locationFixture())).toEqual({ center: 'montreal', radiusKm: 10 });
    const device = locationFixture({
      tradingArea: {
        lat: 45.53,
        lng: -73.6,
        radiusKm: 3,
        source: 'DEVICE',
        label: 'Plateau, Montréal',
      },
    });
    expect(draftFromLocation(device)).toEqual({ center: 'saved', radiusKm: 3 });
  });

  it('resolves a draft into the request only when saving, and knows when it changed', () => {
    const saved = locationFixture();
    expect(areaInput({ center: 'quebec', radiusKm: 6 }, saved)).toEqual({
      lat: 46.813,
      lng: -71.208,
      radiusKm: 6,
      source: 'MANUAL',
    });
    expect(areaInput({ center: 'saved', radiusKm: 4 }, saved)).toEqual({
      lat: 45.502,
      lng: -73.567,
      radiusKm: 4,
      source: 'MANUAL',
    });
    expect(areaInput({ center: 'saved', radiusKm: 4 }, { discoverable: false })).toBeNull();
    expect(areaInput({ center: 'atlantis', radiusKm: 4 }, saved)).toBeNull();

    expect(isAreaDirty({ center: 'montreal', radiusKm: 10 }, saved)).toBe(false);
    expect(isAreaDirty({ center: 'montreal', radiusKm: 11 }, saved)).toBe(true);
    expect(isAreaDirty({ center: 'laval', radiusKm: 10 }, saved)).toBe(true);
    expect(isAreaDirty({ center: 'montreal', radiusKm: 5 }, { discoverable: false })).toBe(true);
  });
});
