import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AppConfigService } from '../../core/config/app-config.service';
import { circleBounds } from './map-adapter';
import { GOOGLE_MAP_LOADER, LEAFLET_MAP_LOADER, MapAdapterFactory } from './map-adapter.factory';
import { FakeMapAdapter } from './testing/fake-map-adapter';

describe('MapAdapterFactory', () => {
  let leaflet: ReturnType<typeof vi.fn>;
  let google: ReturnType<typeof vi.fn>;

  function setup(googleMapsApiKey: string): MapAdapterFactory {
    leaflet = vi.fn(async () => new FakeMapAdapter('leaflet'));
    google = vi.fn(async () => new FakeMapAdapter('google'));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: LEAFLET_MAP_LOADER, useValue: leaflet },
        { provide: GOOGLE_MAP_LOADER, useValue: google },
      ],
    });
    TestBed.inject(AppConfigService).set({ googleMapsApiKey, googleMapsMapId: 'map-id' });
    return TestBed.inject(MapAdapterFactory);
  }

  const options = { center: { lat: 45.5, lng: -73.6 }, zoom: 12 };

  it('uses Leaflet / OpenStreetMap when no Google key is configured', async () => {
    const adapter = await setup('').create(document.createElement('div'), options);
    expect(adapter.provider).toBe('leaflet');
    expect(google).not.toHaveBeenCalled();
  });

  it('uses Google Maps only when a key is configured', async () => {
    const adapter = await setup('browser-key').create(document.createElement('div'), options);
    expect(adapter.provider).toBe('google');
    expect(google).toHaveBeenCalledWith(expect.any(HTMLElement), {
      ...options,
      apiKey: 'browser-key',
      mapId: 'map-id',
    });
  });

  it('falls back to Leaflet when Google Maps fails to load', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const factory = setup('bad-key');
    google.mockRejectedValueOnce(new Error('RefererNotAllowedMapError'));
    const adapter = await factory.create(document.createElement('div'), options);
    expect(adapter.provider).toBe('leaflet');
    warn.mockRestore();
  });
});

describe('circleBounds', () => {
  it('spans the radius in both directions', () => {
    const bounds = circleBounds({ lat: 45.5, lng: -73.6 }, 10_000);
    expect(bounds.north - 45.5).toBeCloseTo(0.0899, 3);
    expect(45.5 - bounds.south).toBeCloseTo(0.0899, 3);
    // Longitude degrees are shorter at 45°N, so the box is wider in degrees.
    expect(bounds.east - bounds.west).toBeGreaterThan(bounds.north - bounds.south);
  });
});
