import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BoundaryAssets, BoundaryCollection } from '../data/boundaries';
import { BoundaryMapComponent } from './boundary-map.component';

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
