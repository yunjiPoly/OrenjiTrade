import { COLLECTOR_MAP_MAX_ZOOM } from '../../../shared/map/approximate-area';
import type { LatLng, MapBounds } from '../../../shared/map/map-adapter';

/** Clustering starts when more collectors than this are on the map (contract: "above 60"). */
export const CLUSTER_THRESHOLD = 60;
/** Grid cell in screen pixels: markers closer than about this are grouped. */
export const CLUSTER_CELL_PX = 72;
/**
 * From this zoom on every collector gets its own marker again: the collector map's zoom cap, so
 * the closest view always shows every collector on their own (a cluster above the cap could never
 * be opened by zooming in).
 */
export const CLUSTER_MAX_ZOOM = COLLECTOR_MAP_MAX_ZOOM;

export interface Positioned {
  publicPoint: LatLng;
}

export type MarkerGroup<T> =
  | { kind: 'single'; item: T }
  | { kind: 'cluster'; id: string; items: T[]; position: LatLng; bounds: MapBounds };

const TILE_SIZE = 256;

/** Web Mercator world pixel of a point at `zoom` (the projection Leaflet and Google use). */
export function worldPixel(point: LatLng, zoom: number): { x: number; y: number } {
  const scale = TILE_SIZE * 2 ** zoom;
  const lat = Math.max(-85.0511, Math.min(85.0511, point.lat));
  const sin = Math.sin((lat * Math.PI) / 180);
  return {
    x: ((point.lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

/**
 * Groups items that fall in the same screen-space grid cell at `zoom`. Below the threshold (or
 * from {@link CLUSTER_MAX_ZOOM}) every item stays a single marker. Positions are the public points
 * the API returned; cluster centres are their average (display only, never sent anywhere).
 */
export function clusterItems<T extends Positioned>(
  items: readonly T[],
  zoom: number,
  options: { threshold?: number; cellPx?: number; maxZoom?: number } = {},
): MarkerGroup<T>[] {
  const threshold = options.threshold ?? CLUSTER_THRESHOLD;
  const cellPx = options.cellPx ?? CLUSTER_CELL_PX;
  const maxZoom = options.maxZoom ?? CLUSTER_MAX_ZOOM;
  const z = Math.round(zoom);
  if (items.length <= threshold || z >= maxZoom) {
    return items.map((item) => ({ kind: 'single', item }));
  }
  const cells = new Map<string, T[]>();
  for (const item of items) {
    const pixel = worldPixel(item.publicPoint, z);
    const key = `${Math.floor(pixel.x / cellPx)}:${Math.floor(pixel.y / cellPx)}`;
    const cell = cells.get(key);
    if (cell) {
      cell.push(item);
    } else {
      cells.set(key, [item]);
    }
  }
  const groups: MarkerGroup<T>[] = [];
  for (const [key, members] of cells) {
    if (members.length === 1) {
      groups.push({ kind: 'single', item: members[0] });
      continue;
    }
    let lat = 0;
    let lng = 0;
    const bounds: MapBounds = { north: -90, south: 90, east: -180, west: 180 };
    for (const member of members) {
      const point = member.publicPoint;
      lat += point.lat;
      lng += point.lng;
      bounds.north = Math.max(bounds.north, point.lat);
      bounds.south = Math.min(bounds.south, point.lat);
      bounds.east = Math.max(bounds.east, point.lng);
      bounds.west = Math.min(bounds.west, point.lng);
    }
    groups.push({
      kind: 'cluster',
      id: `cluster:${z}:${key}`,
      items: members,
      position: { lat: lat / members.length, lng: lng / members.length },
      bounds,
    });
  }
  return groups;
}
