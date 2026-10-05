import { APPROXIMATE_AREA_RADIUS_M, COLLECTOR_MAP_MAX_ZOOM } from './approximate-area';
import { createLeafletMapAdapter } from './leaflet-map-adapter';
import { MapAdapter, MapAdapterOptions, circleBounds } from './map-adapter';

/**
 * The real Leaflet adapter in the test DOM: the zoom cap of collector maps (ADR 0004, "Client
 * rendering") holds for every zoom path, and approximate-area discs are sized in metres.
 */
describe('Leaflet map adapter', () => {
  const centre = { lat: 45.523, lng: -73.583 };
  let container: HTMLElement;
  let adapter: MapAdapter | null = null;

  beforeEach(() => {
    // The stylesheet is irrelevant here; marking it as loaded skips the 1.5 s load grace period.
    const css = document.createElement('link');
    css.setAttribute('data-orenji-leaflet-css', '');
    document.head.appendChild(css);
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    adapter?.destroy();
    adapter = null;
    container.remove();
    document.head.querySelector('link[data-orenji-leaflet-css]')?.remove();
  });

  async function create(options: Partial<MapAdapterOptions> = {}): Promise<MapAdapter> {
    adapter = await createLeafletMapAdapter(
      container,
      { center: centre, zoom: 12, ...options },
      document,
    );
    return adapter;
  }

  function zoomInButton(): HTMLElement {
    return container.querySelector<HTMLElement>('.leaflet-control-zoom-in')!;
  }

  function pressKey(keyCode: number, shiftKey = false): void {
    const event = new KeyboardEvent('keydown', { bubbles: true, shiftKey });
    Object.defineProperty(event, 'keyCode', { value: keyCode });
    document.dispatchEvent(event);
  }

  it('starts no closer than the max zoom and disables the zoom-in button there', async () => {
    const map = await create({ zoom: 18, maxZoom: COLLECTOR_MAP_MAX_ZOOM });
    expect(map.getViewport().zoom).toBe(COLLECTOR_MAP_MAX_ZOOM);
    expect(zoomInButton().getAttribute('aria-disabled')).toBe('true');
  });

  it('clamps setView requests above the cap and keeps those below it', async () => {
    const map = await create({ maxZoom: COLLECTOR_MAP_MAX_ZOOM });
    map.setView(centre, 19);
    expect(map.getViewport().zoom).toBe(COLLECTOR_MAP_MAX_ZOOM);
    map.setView(centre, 11);
    expect(map.getViewport().zoom).toBe(11);
    expect(zoomInButton().getAttribute('aria-disabled')).toBe('false');
  });

  it('never fits bounds closer than the cap', async () => {
    const map = await create({ maxZoom: COLLECTOR_MAP_MAX_ZOOM });
    // A 50 m box would otherwise zoom as far as fitBounds allows.
    map.fitBounds(circleBounds(centre, 50));
    expect(map.getViewport().zoom).toBe(COLLECTOR_MAP_MAX_ZOOM);
  });

  it('stops the zoom buttons and the keyboard at the cap', async () => {
    const map = await create({ zoom: 12, maxZoom: COLLECTOR_MAP_MAX_ZOOM });
    for (let i = 0; i < 5; i++) {
      zoomInButton().click();
    }
    expect(map.getViewport().zoom).toBe(COLLECTOR_MAP_MAX_ZOOM);
    expect(zoomInButton().getAttribute('aria-disabled')).toBe('true');

    map.setView(centre, 12);
    container.focus();
    pressKey(187); // "+"
    pressKey(107, true); // numpad "+" with Shift: three levels at once
    expect(map.getViewport().zoom).toBe(COLLECTOR_MAP_MAX_ZOOM);
  });

  it('stops the scroll wheel at the cap', async () => {
    const map = await create({ zoom: 12, maxZoom: COLLECTOR_MAP_MAX_ZOOM });
    for (let i = 0; i < 4; i++) {
      container.dispatchEvent(new WheelEvent('wheel', { deltaY: -1000, bubbles: true }));
      // Leaflet collects wheel deltas for 40 ms before it zooms.
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    expect(map.getViewport().zoom).toBe(COLLECTOR_MAP_MAX_ZOOM);
  });

  it('keeps the provider limits when no cap is given', async () => {
    const map = await create();
    map.setView(centre, 18);
    expect(map.getViewport().zoom).toBe(18);
    map.fitBounds(circleBounds(centre, 50));
    expect(map.getViewport().zoom).toBe(15);
  });

  it('draws the 3 km zone about 450 px wide at zoom 14 in Montréal, and keeps it there', async () => {
    const map = await create({ zoom: 18, maxZoom: COLLECTOR_MAP_MAX_ZOOM });
    map.setCircles([{ id: 'area:maika', center: centre, radiusMeters: APPROXIMATE_AREA_RADIUS_M }]);
    // Leaflet draws a circle as two arcs: "M x,y a r,r 0 1,0 2r,0 a r,r ..." (r in pixels).
    const radiusPx = () => {
      const d = container.querySelector('.leaflet-overlay-pane path')?.getAttribute('d') ?? '';
      return Number(/a(\d+(?:\.\d+)?),/.exec(d)?.[1] ?? Number.NaN);
    };
    // Web Mercator: metres per pixel at zoom 14 = 2 pi R cos(lat) / (256 * 2^14).
    const metresPerPixel =
      (2 * Math.PI * 6378137 * Math.cos((centre.lat * Math.PI) / 180)) / (256 * 2 ** 14);
    const expected = APPROXIMATE_AREA_RADIUS_M / metresPerPixel; // about 224 px
    expect(map.getViewport().zoom).toBe(COLLECTOR_MAP_MAX_ZOOM);
    expect(radiusPx()).toBeGreaterThan(expected * 0.98);
    expect(radiusPx()).toBeLessThan(expected * 1.02);
    // Asking for more never makes the zone (or anything) bigger.
    map.setView(centre, 17);
    zoomInButton().click();
    expect(map.getViewport().zoom).toBe(COLLECTOR_MAP_MAX_ZOOM);
    expect(radiusPx()).toBeLessThan(expected * 1.02);
  });

  it('draws approximate-area discs in metres and restyles a disc when it is selected', async () => {
    const map = await create({ maxZoom: COLLECTOR_MAP_MAX_ZOOM });
    map.setCircles([
      { id: 'area:maika', center: centre, radiusMeters: APPROXIMATE_AREA_RADIUS_M },
      {
        id: 'area:noah',
        center: { lat: 45.5, lng: -73.6 },
        radiusMeters: APPROXIMATE_AREA_RADIUS_M,
        variant: 'approximate',
      },
    ]);
    const paths = () => [
      ...container.querySelectorAll<SVGPathElement>('.leaflet-overlay-pane path'),
    ];
    expect(paths()).toHaveLength(2);
    const noah = paths()[1];
    expect(noah.getAttribute('fill-opacity')).toBe('0.08');

    map.setCircles([
      { id: 'area:maika', center: centre, radiusMeters: APPROXIMATE_AREA_RADIUS_M },
      {
        id: 'area:noah',
        center: { lat: 45.5, lng: -73.6 },
        radiusMeters: APPROXIMATE_AREA_RADIUS_M,
        variant: 'area',
      },
    ]);
    expect(paths()).toHaveLength(2);
    expect(paths()[1].getAttribute('fill-opacity')).toBe('0.12');
    expect(paths()[1].getAttribute('stroke-width')).toBe('2');
  });
});
