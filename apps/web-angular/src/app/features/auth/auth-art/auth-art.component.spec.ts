import { TestBed } from '@angular/core/testing';
import { BoundaryAssets, BoundaryCollection, shadeLevel } from '../../map/data/boundaries';
import { AUTH_ART_PATTERN, AuthArtComponent } from './auth-art.component';

function square(code: string, west: number): BoundaryCollection['features'][number] {
  return {
    type: 'Feature',
    properties: { kind: 'subdivision', code },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [west, 45],
          [west + 5, 45],
          [west + 5, 50],
          [west, 50],
          [west, 45],
        ],
      ],
    },
  } as BoundaryCollection['features'][number];
}

describe("AuthArtComponent: the sign-in pages' right panel (spec 14, board W27)", () => {
  it('draws a fixed pattern of the five steps from the bundled boundaries, hidden from readers', async () => {
    const load = vi.fn(async () => ({
      type: 'FeatureCollection',
      features: [square('CA-QC', -75), square('US-NV', -118)],
    }));
    TestBed.configureTestingModule({
      imports: [AuthArtComponent],
      providers: [{ provide: BoundaryAssets, useValue: { load } }],
    });
    const fixture = TestBed.createComponent(AuthArtComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    // Only the bundled file of Americas (North): no live data, nothing about anyone.
    expect(load).toHaveBeenCalledExactlyOnceWith('americas-north');
    expect(element.querySelector('h2')?.textContent).toBe('Who in my region has this card?');
    expect(element.querySelectorAll('.art__point')).toHaveLength(3);
    expect(element.querySelector('.art__map')?.getAttribute('aria-hidden')).toBe('true');
    expect(element.querySelector('.art__legend')?.getAttribute('aria-hidden')).toBe('true');
    const levels = [...element.querySelectorAll('.art__shape')].map((path) =>
      path.getAttribute('data-level'),
    );
    expect(levels).toEqual([String(shadeLevel(AUTH_ART_PATTERN.get('CA-QC'))), '0']);
    expect(levels[0]).toBe('4');
  });
});
