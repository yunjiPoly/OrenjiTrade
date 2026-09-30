import { CLUSTER_THRESHOLD, clusterItems, worldPixel } from './marker-clusters';

function points(count: number, lat = 45.5, lng = -73.6, step = 0.0005) {
  return Array.from({ length: count }, (_, i) => ({
    id: `c${i}`,
    publicPoint: { lat: lat + (i % 10) * step, lng: lng + Math.floor(i / 10) * step },
  }));
}

describe('marker clusters', () => {
  it('projects like Web Mercator', () => {
    expect(worldPixel({ lat: 0, lng: 0 }, 0)).toEqual({ x: 128, y: 128 });
    expect(worldPixel({ lat: 0, lng: 180 }, 1).x).toBe(512);
  });

  it('keeps every collector as a single marker up to the threshold', () => {
    const groups = clusterItems(points(CLUSTER_THRESHOLD), 11);
    expect(groups).toHaveLength(CLUSTER_THRESHOLD);
    expect(groups.every((group) => group.kind === 'single')).toBe(true);
  });

  it('groups close collectors above the threshold', () => {
    const items = points(CLUSTER_THRESHOLD + 5);
    const groups = clusterItems(items, 11);
    const clusters = groups.filter((group) => group.kind === 'cluster');
    expect(clusters.length).toBeGreaterThan(0);
    expect(groups.length).toBeLessThan(items.length);
    const total = groups.reduce(
      (sum, group) => sum + (group.kind === 'cluster' ? group.items.length : 1),
      0,
    );
    expect(total).toBe(items.length);
    const cluster = clusters[0];
    if (cluster.kind === 'cluster') {
      expect(cluster.id).toMatch(/^cluster:11:/);
      expect(cluster.bounds.north).toBeGreaterThanOrEqual(cluster.position.lat);
      expect(cluster.bounds.south).toBeLessThanOrEqual(cluster.position.lat);
    }
  });

  it('stops clustering from the maximum zoom', () => {
    const items = points(CLUSTER_THRESHOLD + 5);
    expect(clusterItems(items, 16).every((group) => group.kind === 'single')).toBe(true);
  });
});
