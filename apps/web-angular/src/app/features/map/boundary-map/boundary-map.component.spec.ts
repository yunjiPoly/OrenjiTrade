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

  it('draws the bundled boundaries without any tile, with the Natural Earth credit', () => {
    expect(load).toHaveBeenCalledWith('americas-north');
    expect(paths()).toHaveLength(3);
    expect(paths().map((path) => path.getAttribute('data-code'))).toEqual(['CA-QC', 'CA-ON', null]);
    expect(element.querySelectorAll('.leaflet-tile-pane img')).toHaveLength(0);
    expect(element.querySelector('.leaflet-control-attribution')?.textContent).toContain(
      'Made with Natural Earth',
    );
    expect(element.querySelector('[data-testid="boundary-map"]')?.getAttribute('aria-label')).toBe(
      'Map of states and provinces',
    );
  });

  it('shades states by binder count and emits the clicked state', () => {
    const [quebec, ontario] = paths();
    expect(Number(quebec.getAttribute('fill-opacity'))).toBeCloseTo(0.88);
    expect(ontario.getAttribute('fill-opacity')).toBe('1');
    quebec.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(selected).toEqual(['CA-QC']);
  });

  it('outlines the selected state and follows new counts', async () => {
    fixture.componentRef.setInput('selected', 'CA-ON');
    fixture.componentRef.setInput('counts', new Map([['CA-ON', 1]]));
    fixture.detectChanges();
    await settle();
    // The selected state is brought to the front (drawn last), with a stronger outline.
    const ontario = paths().at(-1)!;
    expect(ontario.getAttribute('stroke-width')).toBe('2.5');
    expect(Number(ontario.getAttribute('fill-opacity'))).toBeCloseTo(0.28);
    expect(paths()[0].getAttribute('fill-opacity')).toBe('1');
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
