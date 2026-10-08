import { TestBed } from '@angular/core/testing';
import { AppConfigService } from '../../../core/config/app-config.service';
import { APPROXIMATE_AREA_RADIUS_M, COLLECTOR_MAP_MAX_ZOOM } from '../approximate-area';
import { MapAdapterOptions, circleBounds } from '../map-adapter';
import { LEAFLET_MAP_LOADER } from '../map-adapter.factory';
import { FakeMapAdapter } from '../testing/fake-map-adapter';
import { ApproximateAreaMapComponent } from './approximate-area-map.component';

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('ApproximateAreaMapComponent', () => {
  const point = { lat: 45.523, lng: -73.583 };
  let adapter: FakeMapAdapter;
  let loader: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    adapter = new FakeMapAdapter();
    loader = vi.fn(async (_container: HTMLElement, options: MapAdapterOptions) =>
      adapter.created(options),
    );
    TestBed.configureTestingModule({
      providers: [{ provide: LEAFLET_MAP_LOADER, useValue: loader }],
    });
    TestBed.inject(AppConfigService).set({ googleMapsApiKey: '' });
    const fixture = TestBed.createComponent(ApproximateAreaMapComponent);
    fixture.componentRef.setInput('point', point);
    fixture.componentRef.setInput('label', 'Plateau-Mont-Royal, Montréal');
    await fixture.whenStable();
    await wait(10);
    await fixture.whenStable();
  });

  it('draws the public point as the shared 3 km approximate area (1500 m radius), never a pin', () => {
    expect(adapter.markers).toEqual([]);
    expect(adapter.circles).toEqual([
      { id: 'approx', center: point, radiusMeters: APPROXIMATE_AREA_RADIUS_M, variant: 'area' },
    ]);
    expect(adapter.fitted).toEqual([circleBounds(point, APPROXIMATE_AREA_RADIUS_M * 2.5)]);
    expect(adapter.circles[0].radiusMeters).toBe(1500);
  });

  it('never zooms closer than the collector map cap', () => {
    const options = loader.mock.calls[0][1] as MapAdapterOptions;
    expect(options.maxZoom).toBe(COLLECTOR_MAP_MAX_ZOOM);
    expect(options.scrollWheelZoom).toBe(false);
    adapter.setView(point, 18);
    expect(adapter.getViewport().zoom).toBe(COLLECTOR_MAP_MAX_ZOOM);
  });
});
