import { APPROXIMATE_AREA_RADIUS_M, COLLECTOR_MAP_MAX_ZOOM } from './approximate-area';
import { createGoogleMapsAdapter } from './google-maps-adapter';
import { MapAdapter, MapAdapterOptions, circleBounds } from './map-adapter';

type Listener = () => void;

/** Just enough of `google.maps.Map` to watch the adapter: options, zoom and listeners. */
class FakeGoogleMap {
  static last: FakeGoogleMap | null = null;
  zoom: number;
  readonly fitted: unknown[] = [];
  private readonly listeners = new Map<string, Listener[]>();

  constructor(
    readonly container: HTMLElement,
    readonly options: Record<string, unknown>,
  ) {
    this.zoom = options['zoom'] as number;
    FakeGoogleMap.last = this;
  }

  addListener(event: string, listener: Listener) {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
    return { remove: () => undefined };
  }
  trigger(event: string): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener();
    }
  }
  setCenter(): void {
    // the view centre is not under test
  }
  setZoom(zoom: number): void {
    this.zoom = zoom;
    this.trigger('zoom_changed');
  }
  getZoom(): number {
    return this.zoom;
  }
  getCenter() {
    return { lat: () => 45.523, lng: () => -73.583 };
  }
  getBounds() {
    return undefined;
  }
  /** A small box: the closest zoom that fits it, as if the map ignored its own maxZoom. */
  fitBounds(bounds: unknown): void {
    this.fitted.push(bounds);
    this.zoom = 21;
    this.trigger('zoom_changed');
  }
}

/** Records the options of every circle (the adapter's restyling is what is under test). */
class FakeCircle {
  options: Record<string, unknown>;
  constructor(options: Record<string, unknown>) {
    this.options = { ...options };
  }
  readonly calls: string[] = [];
  getCenter() {
    const center = this.options['center'] as { lat: number; lng: number };
    return { lat: () => center.lat, lng: () => center.lng };
  }
  getRadius(): number {
    return this.options['radius'] as number;
  }
  setCenter(center: unknown): void {
    this.calls.push('setCenter');
    this.options['center'] = center;
  }
  setRadius(radius: number): void {
    this.calls.push('setRadius');
    this.options['radius'] = radius;
  }
  setOptions(options: Record<string, unknown>): void {
    Object.assign(this.options, options);
  }
  setMap(map: unknown): void {
    this.options['map'] = map;
  }
}

const circles: FakeCircle[] = [];

const fakeGoogle = {
  maps: {
    Map: FakeGoogleMap,
    Circle: class extends FakeCircle {
      constructor(options: Record<string, unknown>) {
        super(options);
        circles.push(this);
      }
    },
    Marker: class {},
    LatLng: class {},
    marker: { AdvancedMarkerElement: class {} },
    ControlPosition: { LEFT_TOP: 1, RIGHT_TOP: 2, LEFT_BOTTOM: 3, RIGHT_BOTTOM: 4 },
    event: { clearInstanceListeners: () => undefined },
  },
};

/**
 * The Google Maps adapter against a fake `google.maps` namespace (no key, no network): the zoom
 * cap of collector maps reaches the map options, and zoom requests above it are clamped.
 */
describe('Google Maps adapter', () => {
  const centre = { lat: 45.523, lng: -73.583 };
  const holder = globalThis as unknown as { google?: unknown };
  const view = document.defaultView as unknown as { google?: unknown };
  let adapter: MapAdapter | null = null;

  beforeEach(() => {
    holder.google = fakeGoogle;
    view.google = fakeGoogle;
    circles.length = 0;
    FakeGoogleMap.last = null;
  });

  afterEach(() => {
    adapter?.destroy();
    adapter = null;
    delete holder.google;
    delete view.google;
  });

  async function create(options: Partial<MapAdapterOptions> = {}): Promise<FakeGoogleMap> {
    adapter = await createGoogleMapsAdapter(
      document.createElement('div'),
      { center: centre, zoom: 12, apiKey: 'test-browser-key', ...options },
      document,
    );
    return FakeGoogleMap.last!;
  }

  it('hands the zoom cap to the map and starts no closer than it', async () => {
    const map = await create({ zoom: 18, maxZoom: COLLECTOR_MAP_MAX_ZOOM });
    expect(map.options['maxZoom']).toBe(COLLECTOR_MAP_MAX_ZOOM);
    expect(map.options['minZoom']).toBeNull();
    expect(map.options['zoom']).toBe(COLLECTOR_MAP_MAX_ZOOM);
  });

  it('clamps setView requests above the cap and keeps those below it', async () => {
    const map = await create({ maxZoom: COLLECTOR_MAP_MAX_ZOOM });
    adapter!.setView(centre, 19);
    expect(map.zoom).toBe(COLLECTOR_MAP_MAX_ZOOM);
    adapter!.setView(centre, 11);
    expect(map.zoom).toBe(11);
  });

  it('pulls fitBounds and gestures back to the cap', async () => {
    const map = await create({ maxZoom: COLLECTOR_MAP_MAX_ZOOM });
    adapter!.fitBounds(circleBounds(centre, 50));
    expect(map.fitted).toHaveLength(1);
    expect(map.zoom).toBe(COLLECTOR_MAP_MAX_ZOOM);
    // Any other zoom change (wheel, buttons, keyboard) that slipped past the map's maxZoom.
    map.zoom = 17;
    map.trigger('zoom_changed');
    expect(map.zoom).toBe(COLLECTOR_MAP_MAX_ZOOM);
    expect(adapter!.getViewport().zoom).toBe(COLLECTOR_MAP_MAX_ZOOM);
  });

  it('keeps the provider limits when no cap is given', async () => {
    const map = await create();
    expect(map.options['maxZoom']).toBeNull();
    adapter!.setView(centre, 18);
    expect(map.zoom).toBe(18);
  });

  it('draws approximate-area discs in metres and restyles a disc when it is selected', async () => {
    await create({ maxZoom: COLLECTOR_MAP_MAX_ZOOM });
    const disc = {
      id: 'area:maika',
      center: centre,
      radiusMeters: APPROXIMATE_AREA_RADIUS_M,
      variant: 'approximate' as const,
    };
    adapter!.setCircles([disc]);
    expect(circles).toHaveLength(1);
    expect(circles[0].options).toEqual(
      expect.objectContaining({ radius: 1000, fillOpacity: 0.08, strokeWeight: 1 }),
    );
    adapter!.setCircles([{ ...disc, variant: 'area' }]);
    expect(circles).toHaveLength(1);
    expect(circles[0].options).toEqual(
      expect.objectContaining({ radius: 1000, fillOpacity: 0.12, strokeWeight: 2 }),
    );
    // Unchanged discs are not moved again (collector maps redraw them on every zoom).
    expect(circles[0].calls).toEqual([]);
  });
});
