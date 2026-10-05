import type { LatLng } from '@/src/lib/location';
import type { CameraRequest, MapBounds, MapViewport } from '@/src/lib/mapGeometry';

/**
 * Props of the collector map, implemented by three engines behind one component (ADR 0010):
 * react-native-maps on iOS and on Android builds with the project's Google key
 * (`CollectorMapNative`), Leaflet + OpenStreetMap in a WebView on Android without that key and in
 * Expo Go (`CollectorMapLeaflet`), and Leaflet directly in the web build (`CollectorMap.web.tsx`).
 *
 * Privacy (ADR 0004, owner rule 2026-10-04): other collectors are only ever drawn as soft zones of
 * radius 1500 m around their public point (no pin, no marker at the point), every engine stops at
 * zoom 14 for gestures and for every camera change it is asked for, and no coordinate handed to
 * an engine has more than 3 decimals.
 */

/** A collector's approximate area. `id` is their handle. */
export interface CollectorZone {
  id: string;
  /** The public point (3 decimals), never anything more precise. */
  center: LatLng;
  /** Always `APPROXIMATE_AREA_RADIUS_M` (1500). */
  radiusMeters: number;
  selected: boolean;
  /** The viewer's own zone. */
  self: boolean;
  /** Accessible name ("Maïka Tremblay, Plateau-Mont-Royal"). */
  label: string;
}

/** Several collectors close together at this zoom: a count bubble that zooms in when pressed. */
export interface CollectorCluster {
  id: string;
  /** Average of the members' public points, rounded to 3 decimals (display only). */
  center: LatLng;
  count: number;
  bounds: MapBounds;
  label: string;
}

/** Where a map starts. */
export interface InitialCamera {
  center: LatLng;
  zoom: number;
}

export interface CollectorMapProps {
  zones: readonly CollectorZone[];
  clusters: readonly CollectorCluster[];
  initialCamera: InitialCamera;
  /** A camera move requested by the screen (a new `seq` moves the map once). */
  camera: CameraRequest | null;
  /** The camera settled (pan, zoom, resize). */
  onViewportChange: (viewport: MapViewport) => void;
  /** A tap inside a zone (the nearest zone wins). */
  onZonePress: (id: string) => void;
  onClusterPress: (id: string) => void;
  /** A tap outside every zone and bubble. */
  onEmptyPress?: () => void;
  accessibilityLabel: string;
  testID?: string;
}

/** Props of the `CollectorMap` component (every platform). */
export interface CollectorMapComponentProps extends CollectorMapProps {
  /** Error copy of the frame (the Map tab points to its List view). */
  errorMessage?: string;
  /** False for a map that only shows (the profile's approximate area). */
  interactive?: boolean;
}

/** Look of the zones (shared by the engines). */
export const ZONE_STYLE = {
  strokeWidth: 1.5,
  selectedStrokeWidth: 3,
  fillOpacity: 0.12,
  selectedFillOpacity: 0.22,
  strokeOpacity: 0.85,
} as const;
