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
  ZoomLimits,
  circleStyle,
  clampZoom,
  markerIconHtml,
  markerIconSize,
  tokenColor,
} from './map-adapter';

/** OpenStreetMap standard tiles (usage policy: attribution, no bulk downloads). */
export const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Highest zoom of the OpenStreetMap standard tiles. */
const OSM_MAX_ZOOM = 19;
/** `fitBounds` never zooms closer than this (small boxes would otherwise fill the screen). */
const FIT_BOUNDS_MAX_ZOOM = 15;

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
  /** Last rendered icon of each marker: the icon is rebuilt only when it changes. */
  private readonly iconKeys = new Map<string, string>();
  private readonly circles = new Map<string, Leaflet.Circle>();
  /** Last drawn variant of each circle: the style is reapplied only when it changes. */
  private readonly circleVariants = new Map<string, MapCircle['variant']>();
  private readonly clicks = new ListenerSet<[LatLng]>();
  private readonly markerClicks = new ListenerSet<[string]>();
  private readonly markerDrags = new ListenerSet<[string, LatLng]>();
  private readonly viewports = new ListenerSet<[MapViewport]>();

  constructor(
    private readonly L: LeafletModule,
    private readonly map: Leaflet.Map,
    private readonly doc: Document,
    private readonly limits: ZoomLimits,
  ) {
    map.on('click', (event: Leaflet.LeafletMouseEvent) => this.clicks.emit(toLatLng(event.latlng)));
    map.on('moveend', () => this.viewports.emit(this.getViewport()));
  }

  setView(center: LatLng, zoom?: number): void {
    // Leaflet clamps to the map's min/max zoom as well; clamping here keeps the request explicit.
    this.map.setView([center.lat, center.lng], clampZoom(zoom ?? this.map.getZoom(), this.limits));
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
        this.iconKeys.delete(id);
      }
    }
    for (const spec of markers) {
      const iconKey = markerIconHtml(spec) + (spec.title ?? '');
      const existing = this.markers.get(spec.id);
      if (existing) {
        existing.setLatLng([spec.position.lat, spec.position.lng]);
        if (this.iconKeys.get(spec.id) !== iconKey) {
          existing.setIcon(this.icon(spec));
          existing.options.title = spec.title ?? '';
          this.iconKeys.set(spec.id, iconKey);
        }
        this.decorate(existing, spec);
        continue;
      }
      const marker = this.L.marker([spec.position.lat, spec.position.lng], {
        draggable: !!spec.draggable,
        keyboard: true,
        title: spec.title ?? '',
        alt: spec.title ?? '',
        riseOnHover: spec.variant === 'avatar' || spec.variant === 'cluster',
        icon: this.icon(spec),
      });
      marker.on('click', () => this.markerClicks.emit(spec.id));
      // Keyboard: focused markers are buttons; Enter and Space activate them like a click.
      marker.on('keydown', (event: Leaflet.LeafletEvent) => {
        const original = (event as Leaflet.LeafletKeyboardEvent).originalEvent;
        if (original.key === 'Enter' || original.key === ' ') {
          original.preventDefault();
          this.markerClicks.emit(spec.id);
        }
      });
      marker.on('dragend', () => this.markerDrags.emit(spec.id, toLatLng(marker.getLatLng())));
      marker.addTo(this.map);
      this.markers.set(spec.id, marker);
      this.iconKeys.set(spec.id, iconKey);
      this.decorate(marker, spec);
    }
  }

  private icon(spec: MapMarker): Leaflet.DivIcon {
    const size = markerIconSize(spec.variant);
    const round = spec.variant === 'avatar' || spec.variant === 'cluster';
    return this.L.divIcon({
      className: `orenji-map-pin orenji-map-pin--${spec.variant ?? 'collector'}`,
      html: markerIconHtml(spec),
      iconSize: [size, size],
      // Pins point at their position; round markers are centred on it.
      iconAnchor: round ? [size / 2, size / 2] : [size / 2, size - 2],
    });
  }

  /** Accessible name and selection state on the marker element (kept across icon updates). */
  private decorate(marker: Leaflet.Marker, spec: MapMarker): void {
    const element = marker.getElement();
    if (!element) {
      return;
    }
    if (spec.title) {
      element.setAttribute('aria-label', spec.title);
    }
    element.classList.toggle('orenji-map-pin--selected', !!spec.selected);
    if (spec.selected) {
      element.setAttribute('aria-current', 'true');
    } else {
      element.removeAttribute('aria-current');
    }
    marker.setZIndexOffset(spec.selected ? 1000 : 0);
  }

  setCircles(circles: readonly MapCircle[]): void {
    const wanted = new Set(circles.map((circle) => circle.id));
    for (const [id, circle] of this.circles) {
      if (!wanted.has(id)) {
        circle.remove();
        this.circles.delete(id);
        this.circleVariants.delete(id);
      }
    }
    const color = tokenColor(this.doc, '--color-primary', '#F4761A');
    for (const spec of circles) {
      const existing = this.circles.get(spec.id);
      if (existing) {
        // Collector maps redraw up to a few hundred discs on every zoom: skip unchanged ones.
        if (!existing.getLatLng().equals([spec.center.lat, spec.center.lng])) {
          existing.setLatLng([spec.center.lat, spec.center.lng]);
        }
        if (existing.getRadius() !== spec.radiusMeters) {
          existing.setRadius(spec.radiusMeters);
        }
        if (this.circleVariants.get(spec.id) !== spec.variant) {
          existing.setStyle(this.circlePath(spec, color));
          this.circleVariants.set(spec.id, spec.variant);
        }
        continue;
      }
      const circle = this.L.circle([spec.center.lat, spec.center.lng], {
        radius: spec.radiusMeters,
        interactive: false,
        ...this.circlePath(spec, color),
      }).addTo(this.map);
      this.circles.set(spec.id, circle);
      this.circleVariants.set(spec.id, spec.variant);
    }
  }

  /** Path options of a circle variant (radius in metres, so it scales with the map). */
  private circlePath(spec: MapCircle, color: string): Leaflet.PathOptions {
    const style = circleStyle(spec.variant);
    return {
      color,
      weight: style.strokeWeight,
      opacity: style.strokeOpacity,
      dashArray: style.dashed ? '6 6' : undefined,
      fillColor: color,
      fillOpacity: style.fillOpacity,
    };
  }

  fitBounds(bounds: MapBounds, paddingPx = 24): void {
    this.map.fitBounds(
      [
        [bounds.south, bounds.west],
        [bounds.north, bounds.east],
      ],
      {
        padding: [paddingPx, paddingPx],
        maxZoom: clampZoom(FIT_BOUNDS_MAX_ZOOM, { maxZoom: this.limits.maxZoom }),
      },
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
    this.iconKeys.clear();
    this.circles.clear();
    this.circleVariants.clear();
    this.map.remove();
  }
}

/**
 * Loads Leaflet and its stylesheet, then renders an OpenStreetMap map into `container`. The map's
 * `minZoom` / `maxZoom` options bound every zoom path (wheel, buttons, keyboard, touch, box zoom,
 * `setView`, `fitBounds`); the zoom-in button is disabled at the maximum.
 */
export async function createLeafletMapAdapter(
  container: HTMLElement,
  options: MapAdapterOptions,
  doc: Document = container.ownerDocument,
): Promise<MapAdapter> {
  const [L] = await Promise.all([loadLeaflet(), ensureLeafletCss(doc)]);
  const limits: ZoomLimits = { minZoom: options.minZoom, maxZoom: options.maxZoom };
  const map = L.map(container, {
    center: [options.center.lat, options.center.lng],
    zoom: clampZoom(options.zoom, limits),
    ...(limits.minZoom !== undefined ? { minZoom: limits.minZoom } : {}),
    ...(limits.maxZoom !== undefined ? { maxZoom: limits.maxZoom } : {}),
    zoomControl: false,
    attributionControl: true,
    scrollWheelZoom: options.scrollWheelZoom ?? true,
    keyboard: true,
  });
  L.control.zoom({ position: options.zoomControlPosition ?? 'topleft' }).addTo(map);
  L.tileLayer(OSM_TILE_URL, { maxZoom: OSM_MAX_ZOOM, attribution: OSM_ATTRIBUTION }).addTo(map);
  if (options.ariaLabel) {
    container.setAttribute('aria-label', options.ariaLabel);
  }
  container.setAttribute('role', 'region');
  container.setAttribute('aria-roledescription', 'map');
  return new LeafletMapAdapter(L, map, doc, limits);
}
