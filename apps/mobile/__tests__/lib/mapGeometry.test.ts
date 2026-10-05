import {
  APPROXIMATE_AREA_RADIUS_M,
  COLLECTOR_MAP_MAX_ZOOM,
  MAP_PRIVACY_NOTE,
  approximateAreaSentence,
  clampZoom,
  round3,
} from '@/src/lib/approximateArea';
import {
  boundsOfRegion,
  distanceKm,
  metresPerPixel,
  regionBeyondCap,
  regionForCamera,
  regionForTarget,
  visibleRadiusKm,
  viewportOfRegion,
  zoneAt,
  zoomForBounds,
  zoomOfRegion,
} from '@/src/lib/mapGeometry';

const PHONE = { width: 412, height: 780 };
const MONTREAL = { lat: 45.5, lng: -73.57 };

describe('approximate area rules (ADR 0004, owner rule 2026-10-04)', () => {
  it('draws zones 3 km wide and caps collector maps at zoom 14', () => {
    expect(APPROXIMATE_AREA_RADIUS_M).toBe(1500);
    expect(COLLECTOR_MAP_MAX_ZOOM).toBe(14);
    expect(MAP_PRIVACY_NOTE).toBe('Locations are approximate (about 3 km) to protect privacy');
    expect(approximateAreaSentence('Verdun, Montréal')).toBe(
      'Approximate area (about 3 km) around Verdun, Montréal. Exact locations are never shown.'
    );
    expect(approximateAreaSentence(null)).toContain('about 3 km');
  });

  it('clamps every requested zoom to the cap', () => {
    expect(clampZoom(17)).toBe(14);
    expect(clampZoom(14)).toBe(14);
    expect(clampZoom(11.4)).toBe(11.4);
    expect(clampZoom(0)).toBe(3);
    expect(clampZoom(Number.NaN)).toBeLessThanOrEqual(14);
    expect(clampZoom(Number.POSITIVE_INFINITY)).toBeLessThanOrEqual(14);
  });

  it('rounds coordinates to 3 decimals', () => {
    expect(round3(45.501_234_5)).toBe(45.501);
    expect(round3(-73.567_89)).toBe(-73.568);
  });
});

describe('map geometry', () => {
  it('converts between zoom and react-native-maps regions', () => {
    const region = regionForCamera(MONTREAL, 12, PHONE);
    expect(zoomOfRegion(region, PHONE.width)).toBeCloseTo(12, 5);
    expect(region.latitude).toBe(45.5);
    expect(region.longitude).toBe(-73.57);
    const viewport = viewportOfRegion(region, PHONE.width);
    expect(viewport.zoom).toBeCloseTo(12, 5);
    expect(viewport.bounds).toEqual(boundsOfRegion(region));
    expect(visibleRadiusKm(viewport)).toBeGreaterThan(5);
  });

  it('never builds a region past the cap, whatever is asked', () => {
    for (const zoom of [14, 15, 17, 20, 30]) {
      const region = regionForCamera(MONTREAL, zoom, PHONE);
      expect(zoomOfRegion(region, PHONE.width)).toBeLessThanOrEqual(14 + 1e-9);
    }
    // Bounds of a single point (a cluster of collectors sharing a cell) stop at the cap too.
    const tiny = { north: 45.501, south: 45.5, east: -73.569, west: -73.57 };
    expect(zoomForBounds(tiny, PHONE)).toBe(14);
    const region = regionForTarget({ kind: 'bounds', bounds: tiny }, PHONE);
    expect(zoomOfRegion(region, PHONE.width)).toBeLessThanOrEqual(14 + 1e-9);
  });

  it('fits wide bounds below the cap', () => {
    const wide = { north: 45.7, south: 45.3, east: -73.3, west: -73.9 };
    expect(zoomForBounds(wide, PHONE)).toBeLessThan(12);
  });

  it('pulls a region that went past the cap back to 14 (the guard)', () => {
    const tooClose = regionForCamera(MONTREAL, 17, PHONE, 20);
    const back = regionBeyondCap(tooClose, PHONE);
    expect(back).not.toBeNull();
    expect(zoomOfRegion(back!, PHONE.width)).toBeCloseTo(14, 5);
    expect(regionBeyondCap(regionForCamera(MONTREAL, 13, PHONE), PHONE)).toBeNull();
    expect(regionBeyondCap(regionForCamera(MONTREAL, 14, PHONE), PHONE)).toBeNull();
  });

  it('measures distances and ground resolution', () => {
    expect(distanceKm({ lat: 45.5, lng: -73.57 }, { lat: 45.5, lng: -73.57 })).toBe(0);
    expect(distanceKm({ lat: 45.5, lng: -73.57 }, { lat: 45.6, lng: -73.57 })).toBeCloseTo(11.1, 1);
    // About 6.7 m per point at Montréal at zoom 14: the 3 km zone is about 450 points wide.
    expect(3000 / metresPerPixel(45.5, 14)).toBeGreaterThan(400);
    expect(3000 / metresPerPixel(45.5, 14)).toBeLessThan(500);
  });

  it('finds the zone under a tap: the nearest centre within 1500 m', () => {
    const zones = [
      { id: 'plateau', center: { lat: 45.522, lng: -73.581 } },
      { id: 'mile-end', center: { lat: 45.524, lng: -73.6 } },
    ];
    expect(zoneAt(zones, { lat: 45.522, lng: -73.583 }, 13)?.id).toBe('plateau');
    expect(zoneAt(zones, { lat: 45.524, lng: -73.597 }, 13)?.id).toBe('mile-end');
    // 3 km away from both: outside every zone.
    expect(zoneAt(zones, { lat: 45.55, lng: -73.581 }, 13)).toBeNull();
    // Zoomed far out, a tiny zone keeps a finger-sized target.
    expect(zoneAt(zones, { lat: 45.54, lng: -73.581 }, 8)?.id).toBe('plateau');
  });
});
