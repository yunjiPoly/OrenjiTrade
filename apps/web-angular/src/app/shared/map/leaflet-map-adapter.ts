import type * as Leaflet from 'leaflet';
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

/** OpenStreetMap standard tiles (usage policy: attribution, no bulk downloads). */
export const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Non-injected global style bundle emitted by angular.json (`bundleName: leaflet`). */
export const LEAFLET_CSS_HREF = 'leaflet.css';
const CSS_MARKER_ATTR = 'data-orenji-leaflet-css';

type LeafletModule = typeof Leaflet;

async function loadLeaflet(): Promise<LeafletModule> {
  const mod = (await import('leaflet')) as unknown as LeafletModule & { default?: LeafletModule };
  return mod.default ?? mod;
}

/** Adds Leaflet's stylesheet once; resolves when loaded (or after a short grace period). */
export function ensureLeafletCss(doc: Document): Promise<void> {
  if (doc.querySelector(`link[${CSS_MARKER_ATTR}]`)) {
    return Promise.resolve();
  }
  const link = doc.createElement('link');
  link.rel = 'stylesheet';
  link.href = LEAFLET_CSS_HREF;
  link.setAttribute(CSS_MARKER_ATTR, '');
  return new Promise((resolve) => {
    const done = () => resolve();
    link.addEventListener('load', done, { once: true });
    link.addEventListener('error', done, { once: true });
    setTimeout(done, 1500);
    doc.head.appendChild(link);
  });
}

function toLatLng(value: Leaflet.LatLng): LatLng {
  return { lat: value.lat, lng: value.lng };
}

/** Leaflet + OpenStreetMap implementation of {@link MapAdapter} (lazy chunk). */
class LeafletMapAdapter implements MapAdapter {
  readonly provider = 'leaflet' as const;

  private readonly markers = new Map<string, Leaflet.Marker>();
  private readonly circles = new Map<string, Leaflet.Circle>();
  private readonly clicks = new ListenerSet<[LatLng]>();
  private readonly markerClicks = new ListenerSet<[string]>();
  private readonly markerDrags = new ListenerSet<[string, LatLng]>();
  private readonly viewports = new ListenerSet<[MapViewport]>();

  constructor(
    private readonly L: LeafletModule,
    private readonly map: Leaflet.Map,
    private readonly doc: Document,
  ) {
    map.on('click', (event: Leaflet.LeafletMouseEvent) => this.clicks.emit(toLatLng(event.latlng)));
    map.on('moveend', () => this.viewports.emit(this.getViewport()));
  }

  setView(center: LatLng, zoom?: number): void {
    this.map.setView([center.lat, center.lng], zoom ?? this.map.getZoom());
  }

  getViewport(): MapViewport {
    const bounds = this.map.getBounds();
    return {
      center: toLatLng(this.map.getCenter()),
      zoom: this.map.getZoom(),
      bounds: {
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
      },
    };
  }

  setMarkers(markers: readonly MapMarker[]): void {
    const wanted = new Set(markers.map((marker) => marker.id));
    for (const [id, marker] of this.markers) {
      if (!wanted.has(id)) {
        marker.remove();
        this.markers.delete(id);
      }
    }
    for (const spec of markers) {
      const existing = this.markers.get(spec.id);
      if (existing) {
        existing.setLatLng([spec.position.lat, spec.position.lng]);
        continue;
      }
      const marker = this.L.marker([spec.position.lat, spec.position.lng], {
        draggable: !!spec.draggable,
        keyboard: true,
        title: spec.title ?? '',
        alt: spec.title ?? '',
        icon: this.L.divIcon({
          className: `orenji-map-pin orenji-map-pin--${spec.variant ?? 'collector'}`,
          html: '<span class="orenji-map-pin__dot"></span>',
          iconSize: [32, 32],
          iconAnchor: [16, 30],
        }),
      });
      marker.on('click', () => this.markerClicks.emit(spec.id));
      marker.on('dragend', () => this.markerDrags.emit(spec.id, toLatLng(marker.getLatLng())));
      marker.addTo(this.map);
      this.markers.set(spec.id, marker);
    }
  }

  setCircles(circles: readonly MapCircle[]): void {
    const wanted = new Set(circles.map((circle) => circle.id));
    for (const [id, circle] of this.circles) {
      if (!wanted.has(id)) {
        circle.remove();
        this.circles.delete(id);
      }
    }
    const color = tokenColor(this.doc, '--color-primary', '#F4761A');
    for (const spec of circles) {
      const existing = this.circles.get(spec.id);
      if (existing) {
        existing.setLatLng([spec.center.lat, spec.center.lng]);
        existing.setRadius(spec.radiusMeters);
        continue;
      }
      const circle = this.L.circle([spec.center.lat, spec.center.lng], {
        radius: spec.radiusMeters,
        color,
        weight: 2,
        fillColor: color,
        fillOpacity: 0.12,
        interactive: false,
      }).addTo(this.map);
      this.circles.set(spec.id, circle);
    }
  }

  fitBounds(bounds: MapBounds, paddingPx = 24): void {
    this.map.fitBounds(
      [
        [bounds.south, bounds.west],
        [bounds.north, bounds.east],
      ],
      { padding: [paddingPx, paddingPx], maxZoom: 15 },
    );
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
    this.map.invalidateSize();
  }

  destroy(): void {
    this.clicks.clear();
    this.markerClicks.clear();
    this.markerDrags.clear();
    this.viewports.clear();
    this.markers.clear();
    this.circles.clear();
    this.map.remove();
  }
}

/** Loads Leaflet and its stylesheet, then renders an OpenStreetMap map into `container`. */
export async function createLeafletMapAdapter(
  container: HTMLElement,
  options: MapAdapterOptions,
  doc: Document = container.ownerDocument,
): Promise<MapAdapter> {
  const [L] = await Promise.all([loadLeaflet(), ensureLeafletCss(doc)]);
  const map = L.map(container, {
    center: [options.center.lat, options.center.lng],
    zoom: options.zoom,
    zoomControl: true,
    attributionControl: true,
    scrollWheelZoom: options.scrollWheelZoom ?? true,
    keyboard: true,
  });
  L.tileLayer(OSM_TILE_URL, { maxZoom: 19, attribution: OSM_ATTRIBUTION }).addTo(map);
  if (options.ariaLabel) {
    container.setAttribute('aria-label', options.ariaLabel);
  }
  container.setAttribute('role', 'region');
  container.setAttribute('aria-roledescription', 'map');
  return new LeafletMapAdapter(L, map, doc);
}
