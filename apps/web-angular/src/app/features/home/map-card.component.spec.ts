import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BoundaryAssets } from '../map/data/boundaries';
import { MapCardComponent } from './map-card.component';

describe('MapCardComponent (spec 5.3: a static SVG, no Leaflet)', () => {
  let fixture: ComponentFixture<MapCardComponent>;
  let element: HTMLElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [MapCardComponent],
      providers: [
        provideRouter([]),
        {
          provide: BoundaryAssets,
          useValue: {
            load: async () => ({
              type: 'FeatureCollection',
              features: [
                {
                  type: 'Feature',
                  properties: { kind: 'subdivision', code: 'CA-QC', country: 'CA' },
                  geometry: {
                    type: 'Polygon',
                    coordinates: [
                      [
                        [-75, 46],
                        [-71, 46],
                        [-71, 50],
                        [-75, 46],
                      ],
                    ],
                  },
                },
              ],
            }),
          },
        },
      ],
    });
    fixture = TestBed.createComponent(MapCardComponent);
    fixture.componentRef.setInput('region', 'americas-north');
    fixture.componentRef.setInput('regionName', 'Americas (North)');
    fixture.componentRef.setInput('gameName', 'Yu-Gi-Oh!');
    fixture.componentRef.setInput('homeCode', 'CA-QC');
    fixture.componentRef.setInput('homeName', 'Quebec');
    fixture.componentRef.setInput('counts', new Map([['CA-QC', 12]]));
    fixture.componentRef.setInput('deckCores', new Map([['CA-QC', 5]]));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  });

  it('names your province with its binders and deck cores (map counts are allowed)', () => {
    expect(element.querySelector('h2')?.textContent?.trim()).toBe('Quebec · your province');
    expect(element.querySelector('.mc__line')?.textContent).toBe('7 binders · 5 deck cores');
    expect(element.querySelector('.mc__caption')?.textContent).toBe(
      'Public Yu-Gi-Oh! binders in Americas (North)',
    );
  });

  it('draws the shaded shape and the teal dashed outline, no tile and no Leaflet', () => {
    const svg = element.querySelector('svg')!;
    expect(svg.getAttribute('aria-label')).toBe('Public Yu-Gi-Oh! binders in Americas (North)');
    expect(svg.querySelector('.mc__shape')?.getAttribute('data-level')).toBe('4');
    expect(svg.querySelector('.mc__home')).not.toBeNull();
    expect(element.querySelector('.leaflet-container, img')).toBeNull();
  });

  it('reads the shading Fewer to More as board W26 (decorative)', () => {
    const legend = element.querySelector('[data-testid="home-map-legend"]')!;
    expect(legend.getAttribute('aria-hidden')).toBe('true');
    expect(legend.textContent?.replace(/\s+/g, '')).toBe('FewerMore');
    expect(legend.querySelectorAll('.mc__step')).toHaveLength(5);
  });

  it('Explore the map opens Search on your province', () => {
    expect(element.querySelector('.mc__explore')?.getAttribute('href')).toBe(
      '/search?tab=binders&state=CA-QC',
    );
  });

  it('a failed counts read says "Couldn\'t load the map." with Try again, never the empty line (F5)', async () => {
    const retry = vi.fn();
    fixture.componentInstance.retryCounts.subscribe(retry);
    fixture.componentRef.setInput('counts', new Map());
    fixture.componentRef.setInput('countsFailed', true);
    fixture.detectChanges();
    const error = element.querySelector('[data-testid="home-map-card-error"]')!;
    expect(error.textContent).toContain("Couldn't load the map.");
    expect(element.textContent).not.toContain('No public binders');
    error.querySelector('button')!.click();
    expect(retry).toHaveBeenCalled();
  });

  it('while the counts load, a skeleton line instead of "No public binders here yet"', () => {
    fixture.componentRef.setInput('counts', new Map());
    fixture.componentRef.setInput('countsLoading', true);
    fixture.detectChanges();
    expect(element.querySelector('.mc__line-bone')).not.toBeNull();
    expect(element.textContent).not.toContain('No public binders');
  });
});
