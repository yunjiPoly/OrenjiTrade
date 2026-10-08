import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FeatureFlagsService } from '../../../core/feature-flags/feature-flags.service';
import { DEFAULT_MAP_PARAMS, MAX_RADIUS_KM } from '../data/map-params';
import { MapFiltersBarComponent } from './map-filters-bar.component';

describe('MapFiltersBarComponent', () => {
  let fixture: ComponentFixture<MapFiltersBarComponent>;
  let element: HTMLElement;

  async function render(radiusMax: number, premiumPlans: boolean): Promise<void> {
    TestBed.inject(FeatureFlagsService).set({ premiumPlans });
    fixture.componentRef.setInput('params', { ...DEFAULT_MAP_PARAMS, radiusKm: 10 });
    fixture.componentRef.setInput('radiusKm', 10);
    fixture.componentRef.setInput('radiusMax', radiusMax);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MapFiltersBarComponent],
      providers: [provideRouter([{ path: 'premium', children: [] }])],
    }).compileComponents();
    fixture = TestBed.createComponent(MapFiltersBarComponent);
    element = fixture.nativeElement as HTMLElement;
  });

  it('links the plan radius cap to Premium while the premiumPlans flag is on', async () => {
    await render(25, true);
    const cap = element.querySelector<HTMLElement>('[data-testid="radius-cap"]');
    expect(cap?.tagName).toBe('A');
    expect(cap?.getAttribute('href')).toBe('/premium');
    expect(cap?.textContent).toContain('Up to 25 km on your plan');
  });

  it('names the plan radius cap without any Premium link while the flag is off', async () => {
    await render(25, false);
    const cap = element.querySelector<HTMLElement>('[data-testid="radius-cap"]');
    expect(cap?.tagName).toBe('SPAN');
    expect(cap?.textContent).toContain('Up to 25 km on your plan');
    expect(element.querySelector('a[href="/premium"]')).toBeNull();
  });

  it('says nothing about the plan when the radius already reaches the maximum', async () => {
    await render(MAX_RADIUS_KM, true);
    expect(element.querySelector('[data-testid="radius-cap"]')).toBeNull();
  });
});
