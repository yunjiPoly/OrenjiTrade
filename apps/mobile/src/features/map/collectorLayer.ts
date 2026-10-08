import type { CollectorMarker } from '@/src/api/types';
import type { CollectorCluster, CollectorZone } from '@/src/components/map/CollectorMap.types';
import {
  APPROXIMATE_AREA_RADIUS_M,
  COLLECTOR_MAP_MAX_ZOOM,
  clampZoom,
  round3,
} from '@/src/lib/approximateArea';
import type { LatLng } from '@/src/lib/location';
import {
  boundsCenter,
  distanceKm,
  worldPixel,
  type CameraTarget,
  type MapBounds,
} from '@/src/lib/mapGeometry';

import { collectorZoneLabel } from './discovery';

/**
 * What a collector map draws (mirror of the web's `map-markers.ts` + `marker-clusters.ts`, with
 * the 2026-10-04 owner rule): every collector on their own is a soft zone 3 km wide (radius
 * 1500 m) around their public point, never a pin; when more than the threshold are on the map,
 * collectors close together on screen become one count bubble. Clustering stops at the zoom cap.
 */

/** Clustering starts when more collectors than this are on the map (contract: "above 60"). */
export const CLUSTER_THRESHOLD = 60;
/** Grid cell in screen points: collectors closer than about this are grouped. */
export const CLUSTER_CELL_PX = 72;
/** From the cap on, every collector is drawn on their own (a cluster above it could not open). */
export const CLUSTER_MAX_ZOOM = COLLECTOR_MAP_MAX_ZOOM;

export interface CollectorLayer {
  zones: CollectorZone[];
  clusters: CollectorCluster[];
}

export const EMPTY_LAYER: CollectorLayer = { zones: [], clusters: [] };

interface Positioned {
  publicPoint: LatLng;
}

export type Group<T> =
  | { kind: 'single'; item: T }
  | { kind: 'cluster'; id: string; items: T[]; center: LatLng; bounds: MapBounds };

/**
 * Groups items that fall in the same screen-space grid cell at `zoom`. Below the threshold (or
 * from {@link CLUSTER_MAX_ZOOM}) every item stays on its own.
 */
export function clusterItems<T extends Positioned>(
  items: readonly T[],
  zoom: number,
  options: { threshold?: number; cellPx?: number; maxZoom?: number } = {}
): Group<T>[] {
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
  const groups: Group<T>[] = [];
  for (const [key, members] of cells) {
    if (members.length === 1 && members[0]) {
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
      center: { lat: round3(lat / members.length), lng: round3(lng / members.length) },
      bounds,
    });
  }
  return groups;
}

/**
 * The zones and count bubbles of an answer at `zoom`. The selected collector is never hidden in a
 * cluster. Coordinates handed to the map never have more than 3 decimals.
 */
export function buildCollectorLayer(
  collectors: readonly CollectorMarker[],
  zoom: number,
  selectedHandle: string | null,
  selfId: string | null
): CollectorLayer {
  const selected = collectors.find((collector) => collector.handle === selectedHandle) ?? null;
  const rest = selected ? collectors.filter((collector) => collector !== selected) : collectors;
  const groups = clusterItems(rest, zoom);
  if (selected) {
    groups.push({ kind: 'single', item: selected });
  }
  const zones: CollectorZone[] = [];
  const clusters: CollectorCluster[] = [];
  for (const group of groups) {
    if (group.kind === 'cluster') {
      clusters.push({
        id: group.id,
        center: group.center,
        count: group.items.length,
        bounds: group.bounds,
        label: `${group.items.length} collectors here. Zoom in`,
      });
      continue;
    }
    const collector = group.item;
    zones.push({
      id: collector.handle,
      center: { lat: round3(collector.publicPoint.lat), lng: round3(collector.publicPoint.lng) },
      radiusMeters: APPROXIMATE_AREA_RADIUS_M,
      selected: collector.handle === selectedHandle,
      self: !!selfId && collector.id === selfId,
      label: collectorZoneLabel(collector, selfId),
    });
  }
  return { zones, clusters };
}

/**
 * Where pressing a cluster takes the map (the web store's `zoomTo`): to its bounds, or straight to
 * the cap (where every collector is drawn on their own) when its collectors share almost the same
 * public point or the map is already close to the cap. Never beyond the cap.
 */
export function clusterCamera(bounds: MapBounds, currentZoom: number): CameraTarget {
  const spanKm = distanceKm(
    { lat: bounds.north, lng: bounds.east },
    { lat: bounds.south, lng: bounds.west }
  );
  if (spanKm < 0.5 || currentZoom >= CLUSTER_MAX_ZOOM - 2) {
    return {
      kind: 'center',
      center: boundsCenter(bounds),
      zoom: clampZoom(Math.max(CLUSTER_MAX_ZOOM, Math.round(currentZoom) + 1)),
    };
  }
  return { kind: 'bounds', bounds };
}
