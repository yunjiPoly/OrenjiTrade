import type { CollectorMarker } from '@orenji/api-client';
import { avatarColor, markerTone } from '../../../shared/discovery/discovery-labels';
import { initialsOf } from '../../../shared/domain/location-labels';
import type { MapBounds, MapMarker } from '../../../shared/map/map-adapter';
import { MarkerGroup, clusterItems } from './marker-clusters';

const COLLECTOR_PREFIX = 'collector:';

/** Marker id of a collector (handles are unique and URL-safe). */
export function collectorMarkerId(handle: string): string {
  return COLLECTOR_PREFIX + handle;
}

/** The handle behind a collector marker id; `null` for clusters and other markers. */
export function handleFromMarkerId(id: string): string | null {
  return id.startsWith(COLLECTOR_PREFIX) ? id.slice(COLLECTOR_PREFIX.length) : null;
}

/** Accessible name of a collector marker ("Maïka Tremblay, Plateau-Mont-Royal"). */
export function collectorMarkerTitle(collector: CollectorMarker, selfId: string | null): string {
  const name =
    selfId && collector.id === selfId ? `You (${collector.displayName})` : collector.displayName;
  return collector.publicLabel ? `${name}, ${collector.publicLabel}` : name;
}

export interface CollectorMarkers {
  markers: MapMarker[];
  /** Bounds of every cluster, to zoom into it when it is activated. */
  clusters: Map<string, MapBounds>;
}

/**
 * Map markers for the collectors of an answer: avatar markers at their public point (ring =
 * listing freshness), grouped into count bubbles when there are more than the clustering
 * threshold at this zoom. The selected collector is never hidden inside a cluster.
 */
export function buildCollectorMarkers(
  collectors: readonly CollectorMarker[],
  zoom: number,
  selectedHandle: string | null,
  selfId: string | null,
): CollectorMarkers {
  const clusters = new Map<string, MapBounds>();
  const selected = collectors.find((collector) => collector.handle === selectedHandle) ?? null;
  const rest = selected ? collectors.filter((collector) => collector !== selected) : collectors;
  const groups: MarkerGroup<CollectorMarker>[] = clusterItems(rest, zoom);
  if (selected) {
    groups.push({ kind: 'single', item: selected });
  }
  const markers = groups.map((group): MapMarker => {
    if (group.kind === 'cluster') {
      clusters.set(group.id, group.bounds);
      return {
        id: group.id,
        position: group.position,
        variant: 'cluster',
        label: String(group.items.length),
        title: `${group.items.length} collectors here. Zoom in`,
      };
    }
    const collector = group.item;
    return {
      id: collectorMarkerId(collector.handle),
      position: { lat: collector.publicPoint.lat, lng: collector.publicPoint.lng },
      variant: 'avatar',
      title: collectorMarkerTitle(collector, selfId),
      imageUrl: collector.avatarUrl ?? null,
      label: initialsOf(collector.displayName),
      color: avatarColor(collector.displayName),
      tone: markerTone(collector.binderFreshness),
      selected: collector.handle === selectedHandle,
    };
  });
  return { markers, clusters };
}
