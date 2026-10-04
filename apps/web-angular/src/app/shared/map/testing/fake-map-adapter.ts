import {
  LatLng,
  ListenerSet,
  MapAdapter,
  MapAdapterOptions,
  MapBounds,
  MapCircle,
  MapMarker,
  MapProvider,
  MapViewport,
  Unsubscribe,
  clampZoom,
} from '../map-adapter';

/**
 * Recording {@link MapAdapter} for unit tests; `click`/`drag` simulate user input. Like the real
 * adapters it clamps zoom requests to the `minZoom` / `maxZoom` it was created with (see
 * {@link FakeMapAdapter.created}).
 */
export class FakeMapAdapter implements MapAdapter {
  /** Options the map was created with (`null` until a test loader calls `created`). */
  options: MapAdapterOptions | null = null;
  markers: readonly MapMarker[] = [];
  circles: readonly MapCircle[] = [];
  fitted: MapBounds[] = [];
  destroyed = false;
  view: MapViewport = {
    center: { lat: 45.5, lng: -73.6 },
    zoom: 12,
    bounds: { north: 45.6, south: 45.4, east: -73.5, west: -73.7 },
  };
  private readonly clicks = new ListenerSet<[LatLng]>();
  private readonly markerClicks = new ListenerSet<[string]>();
  private readonly drags = new ListenerSet<[string, LatLng]>();
  private readonly viewports = new ListenerSet<[MapViewport]>();

  constructor(readonly provider: MapProvider = 'leaflet') {}

  /** What a loader does: records the creation options and starts at their (clamped) view. */
  created(options: MapAdapterOptions): this {
    this.options = options;
    this.view = { ...this.view, center: options.center, zoom: clampZoom(options.zoom, options) };
    return this;
  }

  setView(center: LatLng, zoom?: number): void {
    this.view = {
      ...this.view,
      center,
      zoom: clampZoom(zoom ?? this.view.zoom, this.options ?? {}),
    };
  }
  getViewport(): MapViewport {
    return this.view;
  }
  setMarkers(markers: readonly MapMarker[]): void {
    this.markers = markers;
  }
  setCircles(circles: readonly MapCircle[]): void {
    this.circles = circles;
  }
  fitBounds(bounds: MapBounds): void {
    this.fitted.push(bounds);
  }
  onMapClick(listener: (position: LatLng) => void): Unsubscribe {
    return this.clicks.add(listener);
  }
  onMarkerClick(listener: (markerId: string) => void): Unsubscribe {
    return this.markerClicks.add(listener);
  }
  onMarkerDragEnd(listener: (markerId: string, position: LatLng) => void): Unsubscribe {
    return this.drags.add(listener);
  }
  onViewportChange(listener: (viewport: MapViewport) => void): Unsubscribe {
    return this.viewports.add(listener);
  }
  invalidateSize(): void {
    // nothing to measure in tests
  }
  destroy(): void {
    this.destroyed = true;
  }

  click(position: LatLng): void {
    this.clicks.emit(position);
  }
  drag(markerId: string, position: LatLng): void {
    this.drags.emit(markerId, position);
  }
  /** Simulates a click (or Enter) on a marker. */
  activate(markerId: string): void {
    this.markerClicks.emit(markerId);
  }
  /** Simulates the user panning / zooming the map. */
  move(viewport: MapViewport): void {
    this.view = viewport;
    this.viewports.emit(viewport);
  }
}
