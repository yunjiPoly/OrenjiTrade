import {
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
