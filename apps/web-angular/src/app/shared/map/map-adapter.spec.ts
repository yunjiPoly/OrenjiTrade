import {
  APPROXIMATE_AREA_RADIUS_M,
  APPROXIMATE_LOCATION_NOTE,
  COLLECTOR_MAP_MAX_ZOOM,
  approximateAreaCircle,
} from './approximate-area';
import {
  circleBounds,
  circleStyle,
  clampZoom,
  distanceKm,
  escapeHtml,
  markerIconHtml,
  markerIconSize,
  safeImageUrl,
} from './map-adapter';

describe('map adapter helpers', () => {
  it('measures great-circle distances', () => {
    // Montréal to Laval city centres: about 16 km.
    const km = distanceKm({ lat: 45.502, lng: -73.567 }, { lat: 45.606, lng: -73.712 });
    expect(km).toBeGreaterThan(15);
    expect(km).toBeLessThan(17);
    expect(distanceKm({ lat: 1, lng: 1 }, { lat: 1, lng: 1 })).toBe(0);
  });

  it('escapes marker text and refuses script URLs', () => {
    expect(escapeHtml('<b>"A&B"</b>')).toBe('&lt;b&gt;&quot;A&amp;B&quot;&lt;/b&gt;');
    expect(safeImageUrl('javascript:alert(1)')).toBeNull();
    expect(safeImageUrl('https://cdn.example.test/a.png')).toBe('https://cdn.example.test/a.png');
    expect(safeImageUrl('/api/v1/public/media/avatars/x.jpg')).toBe(
      '/api/v1/public/media/avatars/x.jpg',
    );
    expect(safeImageUrl(null)).toBeNull();
  });

  it('builds avatar, cluster and pin icons', () => {
    const initials = markerIconHtml({
      id: 'a',
      position: { lat: 0, lng: 0 },
      variant: 'avatar',
      label: '<MT>',
      color: '#0F766E',
      tone: 'fresh',
    });
    expect(initials).toContain('orenji-map-avatar--fresh');
    expect(initials).toContain('&lt;MT&gt;');
    expect(initials).toContain('background:#0F766E');
    const picture = markerIconHtml({
      id: 'b',
      position: { lat: 0, lng: 0 },
      variant: 'avatar',
      imageUrl: 'javascript:alert(1)',
      label: 'AB',
    });
    expect(picture).not.toContain('javascript');
    expect(picture).toContain('AB');
    expect(
      markerIconHtml({ id: 'c', position: { lat: 0, lng: 0 }, variant: 'cluster', label: '12' }),
    ).toContain('>12<');
    expect(markerIconHtml({ id: 'd', position: { lat: 0, lng: 0 } })).toContain(
      'orenji-map-pin__dot',
    );
    expect(markerIconSize('avatar')).toBe(44);
    expect(markerIconSize(undefined)).toBe(32);
  });
});

describe('zoom limits', () => {
  it('clamps zoom requests to the limits that are set', () => {
    expect(clampZoom(18, { maxZoom: 14 })).toBe(14);
    expect(clampZoom(14, { maxZoom: 14 })).toBe(14);
    expect(clampZoom(11, { maxZoom: 14 })).toBe(11);
    expect(clampZoom(2, { minZoom: 3, maxZoom: 14 })).toBe(3);
    expect(clampZoom(19, {})).toBe(19);
  });
});

describe('approximate areas of collectors', () => {
  it('caps collector maps at zoom 14 and draws 3 km wide zones (radius 1500 m)', () => {
    expect(COLLECTOR_MAP_MAX_ZOOM).toBe(14);
    expect(APPROXIMATE_AREA_RADIUS_M).toBe(1500);
    expect(APPROXIMATE_LOCATION_NOTE).toBe('Locations are approximate (about 3 km)');
  });

  it('clamps every zoom request above 14 for collector maps', () => {
    for (const requested of [14.5, 15, 16, 18, 21]) {
      expect(clampZoom(requested, { maxZoom: COLLECTOR_MAP_MAX_ZOOM })).toBe(14);
    }
    expect(clampZoom(13, { maxZoom: COLLECTOR_MAP_MAX_ZOOM })).toBe(13);
  });

  it('a zone spans about 3 km of ground (bounding box of the 1500 m radius)', () => {
    const point = { lat: 45.523, lng: -73.583 };
    const box = circleBounds(point, APPROXIMATE_AREA_RADIUS_M);
    expect(
      distanceKm({ lat: box.south, lng: point.lng }, { lat: box.north, lng: point.lng }),
    ).toBeCloseTo(3, 1);
    expect(
      distanceKm({ lat: point.lat, lng: box.west }, { lat: point.lat, lng: box.east }),
    ).toBeCloseTo(3, 1);
  });

  it('builds the disc of a public point, emphasised for the selected collector', () => {
    const point = { lat: 45.523, lng: -73.583 };
    expect(approximateAreaCircle('area:maika', point)).toEqual({
      id: 'area:maika',
      center: point,
      radiusMeters: 1500,
      variant: 'approximate',
    });
    expect(approximateAreaCircle('area:maika', point, true).variant).toBe('area');
  });

  it('styles approximate discs lighter than areas and solid unlike the search radius', () => {
    const approximate = circleStyle('approximate');
    const area = circleStyle('area');
    expect(circleStyle(undefined)).toEqual(area);
    expect(approximate.fillOpacity).toBeGreaterThan(0);
    expect(approximate.fillOpacity).toBeLessThan(area.fillOpacity);
    expect(approximate.dashed).toBe(false);
    expect(circleStyle('search').dashed).toBe(true);
  });
});
