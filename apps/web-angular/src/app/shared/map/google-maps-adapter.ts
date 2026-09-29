/// <reference types="google.maps" />
import {
  LatLng,
  ListenerSet,
  MapAdapter,
  MapAdapterOptions,
  MapBounds,
  MapCircle,
  MapMarker,
  MapViewport,
  Unsubscribe,
  tokenColor,
} from './map-adapter';

export interface GoogleMapsAdapterOptions extends MapAdapterOptions {
  apiKey: string;
  /** Cloud-styled Map ID; enables Advanced Markers. */
  mapId?: string;
}

const SCRIPT_ID = 'orenji-google-maps';
const CALLBACK = '__orenjiGoogleMapsReady';
const LOAD_TIMEOUT_MS = 10_000;

type GoogleWindow = Window & { google?: typeof google; [CALLBACK]?: () => void };

/** Injects the Maps JavaScript API once (browser key restricted by referrer). */
function loadGoogleMaps(doc: Document, apiKey: string): Promise<void> {
  const win = doc.defaultView as GoogleWindow | null;
  if (!win) {
    return Promise.reject(new Error('No window to load Google Maps into.'));
  }
  if (win.google?.maps?.Map) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Google Maps timed out.')), LOAD_TIMEOUT_MS);
    win[CALLBACK] = () => {
      clearTimeout(timer);
      resolve();
    };
    if (doc.getElementById(SCRIPT_ID)) {
      return;
    }
    const script = doc.createElement('script');
    script.id = SCRIPT_ID;
    script.async = true;
    script.src =
      'https://maps.googleapis.com/maps/api/js?v=weekly&libraries=marker' +
      `&key=${encodeURIComponent(apiKey)}&callback=${CALLBACK}`;
    script.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error('Google Maps failed to load.'));
    });
    doc.head.appendChild(script);
  });
}

type AnyMarker = google.maps.Marker | google.maps.marker.AdvancedMarkerElement;

function positionOf(marker: AnyMarker): LatLng | null {
  const raw = marker instanceof google.maps.Marker ? marker.getPosition() : marker.position;
  if (!raw) {
    return null;
  }
  if (raw instanceof google.maps.LatLng) {
    return { lat: raw.lat(), lng: raw.lng() };
  }
  const literal = raw as google.maps.LatLngLiteral;
  return { lat: literal.lat, lng: literal.lng };
}

/** Google Maps implementation of {@link MapAdapter}; used only when a key is configured. */
class GoogleMapsAdapter implements MapAdapter {
  readonly provider = 'google' as const;

  private readonly markers = new Map<string, AnyMarker>();
  private readonly circles = new Map<string, google.maps.Circle>();
  private readonly clicks = new ListenerSet<[LatLng]>();
  private readonly markerClicks = new ListenerSet<[string]>();
  private readonly markerDrags = new ListenerSet<[string, LatLng]>();
  private readonly viewports = new ListenerSet<[MapViewport]>();

  constructor(
    private readonly map: google.maps.Map,
    private readonly advanced: boolean,
    private readonly doc: Document,
  ) {
    map.addListener('click', (event: google.maps.MapMouseEvent) => {
      if (event.latLng) {
        this.clicks.emit({ lat: event.latLng.lat(), lng: event.latLng.lng() });
      }
    });
    map.addListener('idle', () => this.viewports.emit(this.getViewport()));
  }

  setView(center: LatLng, zoom?: number): void {
    this.map.setCenter(center);
    if (zoom !== undefined) {
      this.map.setZoom(zoom);
    }
  }

  getViewport(): MapViewport {
    const center = this.map.getCenter();
    const bounds = this.map.getBounds();
    const ne = bounds?.getNorthEast();
    const sw = bounds?.getSouthWest();
    const c = center ? { lat: center.lat(), lng: center.lng() } : { lat: 0, lng: 0 };
    return {
      center: c,
      zoom: this.map.getZoom() ?? 0,
      bounds: {
        north: ne?.lat() ?? c.lat,
        east: ne?.lng() ?? c.lng,
        south: sw?.lat() ?? c.lat,
        west: sw?.lng() ?? c.lng,
      },
    };
  }

  setMarkers(markers: readonly MapMarker[]): void {
    const wanted = new Set(markers.map((marker) => marker.id));
    for (const [id, marker] of this.markers) {
      if (!wanted.has(id)) {
        this.detach(marker);
        this.markers.delete(id);
      }
    }
    for (const spec of markers) {
      const existing = this.markers.get(spec.id);
      if (existing) {
        if (existing instanceof google.maps.Marker) {
          existing.setPosition(spec.position);
        } else {
          existing.position = spec.position;
        }
        continue;
      }
      const marker: AnyMarker = this.advanced
        ? new google.maps.marker.AdvancedMarkerElement({
            map: this.map,
            position: spec.position,
            title: spec.title ?? '',
            gmpDraggable: !!spec.draggable,
          })
        : new google.maps.Marker({
            map: this.map,
            position: spec.position,
            title: spec.title ?? '',
            draggable: !!spec.draggable,
          });
      marker.addListener('click', () => this.markerClicks.emit(spec.id));
      marker.addListener('dragend', () => {
        const position = positionOf(marker);
        if (position) {
          this.markerDrags.emit(spec.id, position);
        }
      });
      this.markers.set(spec.id, marker);
    }
  }

  setCircles(circles: readonly MapCircle[]): void {
    const wanted = new Set(circles.map((circle) => circle.id));
    for (const [id, circle] of this.circles) {
      if (!wanted.has(id)) {
        circle.setMap(null);
        this.circles.delete(id);
      }
    }
    const color = tokenColor(this.doc, '--color-primary', '#F4761A');
    for (const spec of circles) {
      const existing = this.circles.get(spec.id);
      if (existing) {
        existing.setCenter(spec.center);
        existing.setRadius(spec.radiusMeters);
        continue;
      }
      this.circles.set(
        spec.id,
        new google.maps.Circle({
          map: this.map,
          center: spec.center,
          radius: spec.radiusMeters,
          strokeColor: color,
          strokeWeight: 2,
          fillColor: color,
          fillOpacity: 0.12,
          clickable: false,
        }),
      );
    }
  }

  fitBounds(bounds: MapBounds, paddingPx = 24): void {
    this.map.fitBounds(bounds, paddingPx);
  }

  onMapClick(listener: (position: LatLng) => void): Unsubscribe {
    return this.clicks.add(listener);
  }

  onMarkerClick(listener: (markerId: string) => void): Unsubscribe {
    return this.markerClicks.add(listener);
  }

  onMarkerDragEnd(listener: (markerId: string, position: LatLng) => void): Unsubscribe {
    return this.markerDrags.add(listener);
  }

  onViewportChange(listener: (viewport: MapViewport) => void): Unsubscribe {
    return this.viewports.add(listener);
  }

  invalidateSize(): void {
    // Google Maps observes its container size itself.
  }

  destroy(): void {
    for (const marker of this.markers.values()) {
      this.detach(marker);
    }
    for (const circle of this.circles.values()) {
      circle.setMap(null);
    }
    this.markers.clear();
    this.circles.clear();
    this.clicks.clear();
    this.markerClicks.clear();
    this.markerDrags.clear();
    this.viewports.clear();
    google.maps.event.clearInstanceListeners(this.map);
  }

  private detach(marker: AnyMarker): void {
    if (marker instanceof google.maps.Marker) {
      marker.setMap(null);
    } else {
      marker.map = null;
    }
  }
}

/** Loads the Maps JavaScript API and renders a Google map into `container`. */
export async function createGoogleMapsAdapter(
  container: HTMLElement,
  options: GoogleMapsAdapterOptions,
  doc: Document = container.ownerDocument,
): Promise<MapAdapter> {
  await loadGoogleMaps(doc, options.apiKey);
  const map = new google.maps.Map(container, {
    center: options.center,
    zoom: options.zoom,
    mapId: options.mapId || undefined,
    gestureHandling: options.scrollWheelZoom === false ? 'cooperative' : 'auto',
    streetViewControl: false,
    mapTypeControl: false,
    fullscreenControl: false,
  });
  if (options.ariaLabel) {
    container.setAttribute('aria-label', options.ariaLabel);
  }
  return new GoogleMapsAdapter(map, !!options.mapId, doc);
}
