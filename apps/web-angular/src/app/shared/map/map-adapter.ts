/**
 * Provider-neutral map API (ADR 0010). Feature code talks to this interface only; the Leaflet /
 * OpenStreetMap adapter is the default (no key needed) and a Google Maps adapter is used only
 * when a browser key is configured. Adapters hold no business logic.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface MapViewport {
  center: LatLng;
  zoom: number;
  bounds: MapBounds;
}

export type MapMarkerVariant = 'collector' | 'centre' | 'self' | 'avatar' | 'cluster';

export interface MapMarker {
  id: string;
  position: LatLng;
  /** Accessible name / tooltip. */
  title?: string;
  variant?: MapMarkerVariant;
  draggable?: boolean;
  /** `avatar` markers: picture of the collector (initials in `label` otherwise). */
  imageUrl?: string | null;
  /** `avatar` markers: initials; `cluster` markers: the number of collectors. */
  label?: string;
  /** Background colour behind the initials (any CSS colour). */
  color?: string;
  /** Visual tone of an `avatar` marker's ring (freshness of the collector's listings). */
  tone?: 'fresh' | 'aging' | 'none';
  /** Highlighted marker (the collector whose preview is open). */
  selected?: boolean;
}

export interface MapCircle {
  id: string;
  center: LatLng;
  radiusMeters: number;
  /**
   * `area` (default): tinted area (a trading area, or the selected collector's approximate area);
   * `search`: faint dashed search radius; `approximate`: light disc showing that a collector's
   * position is only an approximate area.
   */
  variant?: 'area' | 'search' | 'approximate';
}

export interface MapAdapterOptions {
  center: LatLng;
  zoom: number;
  /** Accessible label of the map region. */
  ariaLabel?: string;
  /** Zoom with the mouse wheel (off for embedded pickers to avoid scroll traps). */
  scrollWheelZoom?: boolean;
  /** Corner of the zoom buttons (default top left). */
  zoomControlPosition?: 'topleft' | 'topright' | 'bottomleft' | 'bottomright';
  /**
   * Highest zoom the map ever shows (wheel, buttons, keyboard, gestures, `setView`, `fitBounds`);
   * requests above it are clamped. Unset: the provider's own maximum. Maps that show other
   * collectors pass `COLLECTOR_MAP_MAX_ZOOM` (ADR 0004, "Client rendering").
   */
  maxZoom?: number;
  /** Lowest zoom the map ever shows; requests below it are clamped. Unset: the provider's own. */
  minZoom?: number;
}

/** Zoom limits of a map (the `minZoom` / `maxZoom` of its {@link MapAdapterOptions}). */
export type ZoomLimits = Pick<MapAdapterOptions, 'minZoom' | 'maxZoom'>;

/** `zoom` brought inside the map's limits (unset limits do not constrain). */
export function clampZoom(zoom: number, limits: ZoomLimits): number {
  let value = zoom;
  if (limits.maxZoom !== undefined) {
    value = Math.min(value, limits.maxZoom);
  }
  if (limits.minZoom !== undefined) {
    value = Math.max(value, limits.minZoom);
  }
  return value;
}

export type Unsubscribe = () => void;

export type MapProvider = 'leaflet' | 'google';

export interface MapAdapter {
  readonly provider: MapProvider;
  setView(center: LatLng, zoom?: number): void;
  getViewport(): MapViewport;
  setMarkers(markers: readonly MapMarker[]): void;
  setCircles(circles: readonly MapCircle[]): void;
  fitBounds(bounds: MapBounds, paddingPx?: number): void;
  onMapClick(listener: (position: LatLng) => void): Unsubscribe;
  onMarkerClick(listener: (markerId: string) => void): Unsubscribe;
  onMarkerDragEnd(listener: (markerId: string, position: LatLng) => void): Unsubscribe;
  onViewportChange(listener: (viewport: MapViewport) => void): Unsubscribe;
  /** Call after the container changed size (tabs, dialogs, responsive layout). */
  invalidateSize(): void;
  destroy(): void;
}

/** Creates an adapter inside `container`. */
export type MapAdapterLoader = (
  container: HTMLElement,
  options: MapAdapterOptions,
) => Promise<MapAdapter>;

const EARTH_RADIUS_KM = 6371;

/** Great-circle distance in kilometres (haversine). */
export function distanceKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Escapes text for the small HTML snippets adapters build for marker icons. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Only http(s) and same-origin picture URLs are drawn in marker icons. */
export function safeImageUrl(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }
  try {
    const parsed = new URL(url, 'http://relative.invalid');
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

/**
 * Inner HTML of a marker icon (shared by the adapters). Text is escaped; the visual state
 * (selection) is a class toggled on the element so focus survives re-renders.
 */
export function markerIconHtml(marker: MapMarker): string {
  switch (marker.variant) {
    case 'avatar': {
      const image = safeImageUrl(marker.imageUrl);
      const inner = image
        ? `<img class="orenji-map-avatar__img" src="${escapeHtml(image)}" alt="" draggable="false">`
        : `<span class="orenji-map-avatar__initials"${
            marker.color ? ` style="background:${escapeHtml(marker.color)}"` : ''
          }>${escapeHtml(marker.label ?? '')}</span>`;
      return `<span class="orenji-map-avatar orenji-map-avatar--${marker.tone ?? 'none'}" aria-hidden="true">${inner}</span>`;
    }
    case 'cluster':
      return `<span class="orenji-map-cluster" aria-hidden="true">${escapeHtml(marker.label ?? '')}</span>`;
    default:
      return '<span class="orenji-map-pin__dot"></span>';
  }
}

/** Icon box (px) of a marker variant. */
export function markerIconSize(variant: MapMarkerVariant | undefined): number {
  switch (variant) {
    case 'avatar':
      return 44;
    case 'cluster':
      return 48;
    default:
      return 32;
  }
}

/** Provider-neutral look of a circle variant (both adapters draw circles in the primary colour). */
export interface CircleStyle {
  strokeWeight: number;
  strokeOpacity: number;
  fillOpacity: number;
  /** Dashed outline (Leaflet; Google circles always have a solid outline). */
  dashed: boolean;
}

/** Look of a {@link MapCircle} variant, shared by the adapters. */
export function circleStyle(variant: MapCircle['variant']): CircleStyle {
  switch (variant) {
    case 'search':
      return { strokeWeight: 1.5, strokeOpacity: 1, fillOpacity: 0.04, dashed: true };
    case 'approximate':
      return { strokeWeight: 1, strokeOpacity: 0.5, fillOpacity: 0.08, dashed: false };
    default:
      return { strokeWeight: 2, strokeOpacity: 1, fillOpacity: 0.12, dashed: false };
  }
}

/** Bounding box of a circle (for `fitBounds`). */
export function circleBounds(center: LatLng, radiusMeters: number): MapBounds {
  const radiusKm = radiusMeters / 1000;
  const dLat = (radiusKm / EARTH_RADIUS_KM) * (180 / Math.PI);
  const cos = Math.max(Math.cos((center.lat * Math.PI) / 180), 0.01);
  const dLng = dLat / cos;
  return {
    north: center.lat + dLat,
    south: center.lat - dLat,
    east: center.lng + dLng,
    west: center.lng - dLng,
  };
}

/** Tiny listener registry shared by the adapters. */
export class ListenerSet<T extends unknown[]> {
  private readonly listeners = new Set<(...args: T) => void>();

  add(listener: (...args: T) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(...args: T): void {
    for (const listener of this.listeners) {
      listener(...args);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}

/** Reads a design-token colour at runtime (maps draw on canvas/SVG outside Angular styles). */
export function tokenColor(doc: Document, name: string, fallback: string): string {
  const view = doc.defaultView;
  if (!view) {
    return fallback;
  }
  const value = view.getComputedStyle(doc.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}
