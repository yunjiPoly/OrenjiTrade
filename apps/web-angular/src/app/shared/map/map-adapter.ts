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

export type MapMarkerVariant = 'collector' | 'centre' | 'self';

export interface MapMarker {
  id: string;
  position: LatLng;
  /** Accessible name / tooltip. */
  title?: string;
  variant?: MapMarkerVariant;
  draggable?: boolean;
}

export interface MapCircle {
  id: string;
  center: LatLng;
  radiusMeters: number;
}

export interface MapAdapterOptions {
  center: LatLng;
  zoom: number;
  /** Accessible label of the map region. */
  ariaLabel?: string;
  /** Zoom with the mouse wheel (off for embedded pickers to avoid scroll traps). */
  scrollWheelZoom?: boolean;
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
