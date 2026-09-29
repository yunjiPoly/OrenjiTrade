import {
  LatLng,
  ListenerSet,
  MapAdapter,
  MapBounds,
  MapCircle,
  MapMarker,
  MapProvider,
  MapViewport,
  Unsubscribe,
} from '../map-adapter';

/** Recording {@link MapAdapter} for unit tests; `click`/`drag` simulate user input. */
export class FakeMapAdapter implements MapAdapter {
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

  setView(center: LatLng, zoom?: number): void {
    this.view = { ...this.view, center, zoom: zoom ?? this.view.zoom };
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
}
