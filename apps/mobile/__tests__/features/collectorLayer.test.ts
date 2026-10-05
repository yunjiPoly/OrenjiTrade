import {
  CLUSTER_MAX_ZOOM,
  CLUSTER_THRESHOLD,
  buildCollectorLayer,
  clusterCamera,
  clusterItems,
} from '@/src/features/map/collectorLayer';
import { zoomOfRegion, regionForTarget } from '@/src/lib/mapGeometry';

import { SELF_ID, markerFixture, selfMarkerFixture } from '../support/fixtures';

/** `count` fictional collectors spread over a few km around Montréal (3-decimal points). */
function crowd(count: number) {
  return Array.from({ length: count }, (_, index) =>
    markerFixture({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      handle: `c${index}`,
      displayName: `Collector ${index}`,
      publicPoint: {
        lat: Math.round((45.48 + (index % 10) * 0.007) * 1000) / 1000,
        lng: Math.round((-73.6 + Math.floor(index / 10) * 0.009) * 1000) / 1000,
      },
    })
  );
}

const decimals = (value: number) => (String(value).split('.')[1] ?? '').length;

describe('collector layer', () => {
  it('draws every collector as a 1500 m zone around the public point, never a pin', () => {
    const layer = buildCollectorLayer([selfMarkerFixture(), markerFixture()], 12, null, SELF_ID);
    expect(layer.clusters).toEqual([]);
    expect(layer.zones).toHaveLength(2);
    for (const zone of layer.zones) {
      expect(zone.radiusMeters).toBe(1500);
    }
    expect(layer.zones[0]).toMatchObject({
      id: 'maika',
      center: { lat: 45.503, lng: -73.569 },
      self: true,
      label: 'You (Maïka Test), Ville-Marie, Montréal',
    });
    expect(layer.zones[1]).toMatchObject({ id: 'collector2', self: false, selected: false });
  });

  it('clusters above the threshold below the cap, and never the selected collector', () => {
    const many = crowd(CLUSTER_THRESHOLD + 20);
    const layer = buildCollectorLayer(many, 9, 'c5', SELF_ID);
    expect(layer.clusters.length).toBeGreaterThan(0);
    expect(layer.zones.find((zone) => zone.id === 'c5')).toMatchObject({ selected: true });
    const counted =
      layer.zones.length + layer.clusters.reduce((sum, cluster) => sum + cluster.count, 0);
    expect(counted).toBe(many.length);
    for (const cluster of layer.clusters) {
      expect(cluster.count).toBeGreaterThan(1);
      expect(decimals(cluster.center.lat)).toBeLessThanOrEqual(3);
      expect(decimals(cluster.center.lng)).toBeLessThanOrEqual(3);
      expect(cluster.label).toBe(`${cluster.count} collectors here. Zoom in`);
    }
  });

  it('stops clustering at the zoom cap (every collector on their own at 14)', () => {
    const many = crowd(CLUSTER_THRESHOLD + 20);
    expect(CLUSTER_MAX_ZOOM).toBe(14);
    expect(clusterItems(many, 14).every((group) => group.kind === 'single')).toBe(true);
    expect(
      clusterItems(crowd(CLUSTER_THRESHOLD), 5).every((group) => group.kind === 'single')
    ).toBe(true);
  });

  it('expands a cluster without ever passing the cap', () => {
    const phone = { width: 412, height: 780 };
    // Collectors sharing (almost) one point: straight to the cap.
    const point = { north: 45.501, south: 45.5, east: -73.569, west: -73.57 };
    expect(clusterCamera(point, 9)).toEqual({
      kind: 'center',
      center: { lat: 45.501, lng: -73.569 },
      zoom: 14,
    });
    // Near the cap already: the cap.
    const spread = { north: 45.55, south: 45.45, east: -73.5, west: -73.65 };
    expect(clusterCamera(spread, 12.6)).toMatchObject({ kind: 'center', zoom: 14 });
    // Far out: the cluster's bounds, fitted at most at the cap by every engine.
    const target = clusterCamera(spread, 9);
    expect(target).toEqual({ kind: 'bounds', bounds: spread });
    expect(zoomOfRegion(regionForTarget(target, phone), phone.width)).toBeLessThanOrEqual(14);
  });
});
