import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BoundaryAssets, BoundaryCollection } from '../data/boundaries';
import { BoundaryMapComponent, TOOLTIP_EDGE, tooltipPlacement } from './boundary-map.component';

const square = (x: number, y: number) => [
  [
    [x, y],
    [x + 2, y],
    [x + 2, y + 2],
    [x, y + 2],
    [x, y],
  ],
];

const COLLECTION: BoundaryCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: square(-74, 45) },
      properties: { code: 'CA-QC', country: 'CA', kind: 'subdivision' },
    },
    {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: square(-80, 44) },
      properties: { code: 'CA-ON', country: 'CA', kind: 'subdivision' },
    },
    {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: square(-80, 44) },
      properties: { country: 'CA', kind: 'country' },
    },
  ],
};

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/**
 * Waits until the map drew `count` paths: Leaflet is a lazy `import()`, which can take longer than
 * a few ticks while the whole suite runs in parallel.
 */
async function drawn(fixture: ComponentFixture<BoundaryMapComponent>, count: number) {
  await vi.waitFor(
    () => {
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      expect(element.querySelectorAll('.leaflet-overlay-pane path')).toHaveLength(count);
    },
    { timeout: 10_000, interval: 20 },
  );
}

/** The real Leaflet in the test DOM, drawing a fake region file: no tiles, no provider. */
describe('BoundaryMapComponent', () => {
  let fixture: ComponentFixture<BoundaryMapComponent>;
  let element: HTMLElement;
  let load: ReturnType<typeof vi.fn>;
  let selected: string[];

  beforeEach(async () => {
    // The stylesheet is irrelevant here; marking it as loaded skips the 1.5 s grace period.
    const css = document.createElement('link');
    css.setAttribute('data-orenji-leaflet-css', '');
    document.head.appendChild(css);
    load = vi.fn(async () => COLLECTION);
    TestBed.configureTestingModule({
      imports: [BoundaryMapComponent],
      providers: [{ provide: BoundaryAssets, useValue: { load } }],
    });
    fixture = TestBed.createComponent(BoundaryMapComponent);
    fixture.componentRef.setInput('region', 'americas-north');
    fixture.componentRef.setInput('counts', new Map([['CA-QC', 12]]));
    fixture.componentRef.setInput(
      'names',
      new Map([
        ['CA-QC', 'Quebec, Canada'],
        ['CA-ON', 'Ontario, Canada'],
      ]),
    );
    selected = [];
    fixture.componentInstance.subdivisionSelected.subscribe((code) => selected.push(code));
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await drawn(fixture, 3);
  });

  afterEach(() => {
    fixture.destroy();
    document.head.querySelector('link[data-orenji-leaflet-css]')?.remove();
  });

  function paths(): SVGPathElement[] {
    return [...element.querySelectorAll<SVGPathElement>('.leaflet-overlay-pane path')];
  }

  /** The outlines drawn over the shapes, in their own non-interactive pane. */
  function traces(): SVGPathElement[] {
    return [...element.querySelectorAll<SVGPathElement>('.leaflet-trace-pane path')];
  }

  it('draws the bundled boundaries without any tile, with the Natural Earth credit', () => {
    expect(load).toHaveBeenCalledWith('americas-north');
    expect(paths()).toHaveLength(3);
    expect(paths().map((path) => path.getAttribute('data-code'))).toEqual(['CA-QC', 'CA-ON', null]);
    expect(element.querySelectorAll('.leaflet-tile-pane img')).toHaveLength(0);
    expect(element.querySelector('.leaflet-control-attribution')?.textContent).toContain(
      'Made with Natural Earth',
    );
    const canvas = element.querySelector('[data-testid="boundary-map"]');
    expect(canvas?.getAttribute('aria-label')).toBe('Map of states and provinces');
    // A role that allows the name (a role-less div may not carry aria-label).
    expect(canvas?.getAttribute('role')).toBe('region');
    expect(canvas?.getAttribute('aria-roledescription')).toBe('map');
  });

  it('keeps the shapes out of the Tab order: the state list is the keyboard path', () => {
    for (const path of paths().filter((p) => p.getAttribute('data-code'))) {
      expect(path.getAttribute('tabindex')).toBe('-1');
    }
    expect(element.querySelector('.leaflet-overlay-pane')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
  });

  it('never moves a shape in the DOM on hover, so a real click under the mouse still lands', async () => {
    fixture.componentRef.setInput('home', 'CA-QC');
    fixture.componentRef.setInput('selected', 'CA-QC');
    fixture.detectChanges();
    await settle();
    const group = paths()[0].parentElement!;
    const moved: MutationRecord[] = [];
    const observer = new MutationObserver((records) => moved.push(...records));
    observer.observe(group, { childList: true });
    const ontario = paths().find((path) => path.getAttribute('data-code') === 'CA-ON')!;
    ontario.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    ontario.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    ontario.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await settle();
    observer.disconnect();
    expect(moved).toHaveLength(0);
    expect(paths().map((path) => path.getAttribute('data-code'))).toEqual(['CA-QC', 'CA-ON', null]);
    // The hover outline is drawn over it, in the trace pane that takes no pointer events.
    const pane = element.querySelector<HTMLElement>('.leaflet-trace-pane')!;
    expect(pane.style.pointerEvents).toBe('none');
    expect(traces().map((path) => path.getAttribute('stroke'))).toEqual([
      '#2dd4bf',
      '#111111',
      '#f4761a',
    ]);
    ontario.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(selected).toEqual(['CA-ON']);
    ontario.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    await settle();
    expect(traces().map((path) => path.getAttribute('stroke'))).toEqual(['#2dd4bf', '#f4761a']);
  });

  it('shades states with the map steps by binder count and emits the clicked state', () => {
    const [quebec, ontario] = paths();
    // 12 binders: step 4; none: step 0 (spec 6.4's tokens; the test DOM has no tokens, the
    // fallbacks are the dark values).
    expect(quebec.getAttribute('fill')).toBe('#ff8f3d');
    expect(ontario.getAttribute('fill')).toBe('#2c2724');
    expect(quebec.getAttribute('stroke-width')).toBe('0.8');
    quebec.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(selected).toEqual(['CA-QC']);
  });

  it('outlines the selected state in orange, a highlighted one in ink, and follows new counts', async () => {
    fixture.componentRef.setInput('selected', 'CA-ON');
    fixture.componentRef.setInput('counts', new Map([['CA-ON', 1]]));
    fixture.detectChanges();
    await settle();
    // The selected state gets a 2 px orange outline over the shapes; its shape keeps its place.
    const ontario = paths().find((path) => path.getAttribute('data-code') === 'CA-ON')!;
    expect(ontario.getAttribute('fill')).toBe('#5c3418');
    expect(ontario.getAttribute('stroke-width')).toBe('0.8');
    expect(traces()).toHaveLength(1);
    expect(traces()[0].getAttribute('stroke-width')).toBe('2');
    expect(traces()[0].getAttribute('stroke')).toBe('#f4761a');
    fixture.componentRef.setInput('highlight', 'CA-QC');
    fixture.detectChanges();
    await settle();
    // The highlighted one in a 1.5 ink outline, under the selected one.
    expect(traces().map((path) => path.getAttribute('stroke-width'))).toEqual(['1.5', '2']);
  });

  it("Esc on the map hides a hovered state's tooltip (SC 1.4.13)", async () => {
    const quebec = paths()[0];
    quebec.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await settle();
    expect(element.querySelectorAll('.leaflet-tooltip')).toHaveLength(1);
    element
      .querySelector('[data-testid="boundary-map"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle();
    expect(element.querySelectorAll('.leaflet-tooltip')).toHaveLength(0);
  });

  it("Esc anywhere hides a hovered state's tooltip, the focus off the map (WD review R1-4)", async () => {
    const quebec = paths()[0];
    (document.activeElement as HTMLElement | null)?.blur();
    quebec.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await settle();
    expect(element.querySelectorAll('.leaflet-tooltip')).toHaveLength(1);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle();
    expect(element.querySelectorAll('.leaflet-tooltip')).toHaveLength(0);
  });

  it('a touch tap picks the state and leaves no tooltip over the map (WD review R1-5)', async () => {
    const ontario = paths()[1];
    ontario.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }));
    ontario.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    ontario.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();
    expect(selected).toEqual(['CA-ON']);
    expect(element.querySelectorAll('.leaflet-tooltip')).toHaveLength(0);
    // A mouse click keeps the tooltip of the state under the pointer.
    ontario.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
    ontario.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();
    expect(element.querySelectorAll('.leaflet-tooltip')).toHaveLength(1);
  });

  it('keeps a tooltip inside the map at its edges (WD review R1-5)', () => {
    // Mid-map: above the pointer, centred on it, as Leaflet draws it.
    expect(tooltipPlacement(500, 300, 1000, 220, 50)).toEqual({ direction: 'top', offset: [0, 0] });
    // 30 px from the left edge: slid right, its left side 8 px inside the map.
    const left = tooltipPlacement(30, 300, 1000, 220, 50);
    expect(left.direction).toBe('top');
    expect(30 + left.offset[0] - 110).toBe(TOOLTIP_EDGE);
    // By the right edge: slid left.
    const right = tooltipPlacement(990, 300, 1000, 220, 50);
    expect(990 + right.offset[0] + 110).toBe(1000 - TOOLTIP_EDGE);
    // By the top edge: below the pointer, clear of the cursor.
    expect(tooltipPlacement(500, 20, 1000, 220, 50).direction).toBe('bottom');
    expect(tooltipPlacement(500, 20, 1000, 220, 50).offset[1]).toBeGreaterThan(0);
    // An unmeasured map keeps Leaflet's own placement.
    expect(tooltipPlacement(0, 0, 0, 220, 50)).toEqual({ direction: 'top', offset: [0, 0] });
  });

  it('brings a state chosen off the view into it, and leaves a visible one (WD review F17)', async () => {
    const map = (
      fixture.componentInstance as unknown as {
        map: { fitBounds: (...args: unknown[]) => unknown; getBounds: () => unknown };
      }
    ).map;
    const fit = vi.spyOn(map, 'fitBounds');
    const view = vi.spyOn(map, 'getBounds').mockReturnValue({ contains: () => false });
    fixture.componentRef.setInput('selected', 'CA-ON');
    fixture.detectChanges();
    await settle();
    expect(fit).toHaveBeenCalledTimes(1);
    view.mockReturnValue({ contains: () => true });
    fixture.componentRef.setInput('selected', 'CA-QC');
    fixture.detectChanges();
    await settle();
    expect(fit).toHaveBeenCalledTimes(1);
  });

  it('never puts a tooltip under the zoom buttons at the top right (WD review R2-2)', () => {
    const zone = { left: 900, bottom: 120 };
    // By the right edge under the buttons: slid left of them, its right side 8 px clear.
    const slid = tooltipPlacement(960, 140, 1000, 220, 50, zone);
    expect(slid.direction).toBe('top');
    expect(960 + slid.offset[0] + 110).toBe(900 - TOOLTIP_EDGE);
    // Far below the buttons: as before.
    expect(tooltipPlacement(960, 400, 1000, 220, 50, zone)).toEqual(
      tooltipPlacement(960, 400, 1000, 220, 50),
    );
    // A narrow map with no room on their left: below them.
    const narrow = tooltipPlacement(200, 60, 300, 220, 50, { left: 200, bottom: 100 });
    expect(narrow.direction).toBe('bottom');
    expect(60 + narrow.offset[1]).toBeGreaterThanOrEqual(100 + TOOLTIP_EDGE);
  });

  it("draws the viewer's province with a teal dashed outline that takes no click", async () => {
    fixture.componentRef.setInput('home', 'CA-QC');
    fixture.detectChanges();
    await settle();
    const dashed = traces().filter((path) => path.getAttribute('stroke-dasharray') === '4 3');
    expect(dashed).toHaveLength(1);
    expect(dashed[0].getAttribute('stroke')).toBe('#2dd4bf');
    expect(dashed[0].getAttribute('fill')).toBe('none');
  });

  it('loads another region when the region changes and shows a retry when a file fails', async () => {
    load.mockRejectedValueOnce(new Error('offline'));
    fixture.componentRef.setInput('region', 'europe');
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();
    expect(load).toHaveBeenLastCalledWith('europe');
    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'The map could not be drawn',
    );
    element.querySelector<HTMLButtonElement>('[role="alert"] button')!.click();
    await drawn(fixture, 3);
    expect(element.querySelector('[role="alert"]')).toBeNull();
  });
});
