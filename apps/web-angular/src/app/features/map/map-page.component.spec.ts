import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, provideRouter } from '@angular/router';
import { NearbyCollectorsResponse, ProfileService, SearchSuggestion } from '@orenji/api-client';
import { of } from 'rxjs';
import { AppConfigService } from '../../core/config/app-config.service';
import { GamesStore } from '../../shared/catalog/games.store';
import { CITY_PRESETS } from '../../shared/location/city-presets';
import {
  APPROXIMATE_AREA_RADIUS_M,
  APPROXIMATE_LOCATION_NOTE,
  COLLECTOR_MAP_MAX_ZOOM,
} from '../../shared/map/approximate-area';
import { MapAdapterOptions } from '../../shared/map/map-adapter';
import { LEAFLET_MAP_LOADER } from '../../shared/map/map-adapter.factory';
import { FakeMapAdapter } from '../../shared/map/testing/fake-map-adapter';
import { MapDiscoveryStore, MapViewRequest, PreviewState } from './data/map-discovery.store';
import { DEFAULT_MAP_PARAMS, MapParams, holdersTarget } from './data/map-params';
import { collector } from './data/testing/collector-fixtures';
import { MapPageComponent } from './map-page.component';

/** The store's public surface with plain signals (the real store is tested on its own). */
class FakeStore {
  readonly params = signal<MapParams>(DEFAULT_MAP_PARAMS);
  readonly origin = signal<'own-area' | 'city' | null>('own-area');
  readonly city = signal(CITY_PRESETS[0]);
  readonly signedIn = signal(true);
  readonly radiusCap = signal(25);
  readonly radiusKm = signal(10);
  readonly result = signal<NearbyCollectorsResponse | null>({
    center: { lat: 45.52, lng: -73.58 },
    radiusKm: 10,
    collectors: [collector('maika'), collector('noah', { publicPoint: { lat: 45.5, lng: -73.6 } })],
    total: 2,
    truncated: false,
  });
  readonly collectors = computed(() => this.result()?.collectors ?? []);
  readonly loading = signal(false);
  readonly error = signal(null);
  readonly zoom = signal(12);
  readonly holders = computed(() => holdersTarget(this.params()));
  readonly holdersTitle = signal<string | null>(null);
  readonly holdersCard = signal(null);
  readonly selectedHandle = signal<string | null>(null);
  readonly preview = signal<PreviewState>({ kind: 'idle' });
  readonly previewBinderId = signal<string | null | undefined>(undefined);
  readonly viewRequest = signal<MapViewRequest | null>({
    seq: 1,
    centre: { lat: 45.52, lng: -73.58 },
    zoom: 11,
  });
  readonly selfId = signal<string | null>(null);
  readonly init = vi.fn(async () => undefined);
  readonly setParams = vi.fn((params: MapParams) => this.params.set(params));
  readonly viewportChanged = vi.fn();
  readonly retry = vi.fn();
  readonly chooseCity = vi.fn();
  readonly select = vi.fn((handle: string | null) => this.selectedHandle.set(handle));
  readonly retryPreview = vi.fn();
  readonly zoomTo = vi.fn();
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('MapPageComponent', () => {
  let fixture: ComponentFixture<MapPageComponent>;
  let store: FakeStore;
  let adapter: FakeMapAdapter;
  let loader: ReturnType<typeof vi.fn>;
  let router: Router;

  beforeEach(async () => {
    store = new FakeStore();
    adapter = new FakeMapAdapter();
    loader = vi.fn(async (_container: HTMLElement, options: MapAdapterOptions) =>
      adapter.created(options),
    );
    TestBed.configureTestingModule({
      imports: [MapPageComponent],
      providers: [
        provideRouter([]),
        { provide: LEAFLET_MAP_LOADER, useValue: loader },
        { provide: GamesStore, useValue: { load: vi.fn(), games: signal([]) } },
        { provide: ProfileService, useValue: { searchTags: vi.fn(() => of([])) } },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
      ],
    });
    TestBed.overrideComponent(MapPageComponent, {
      set: { providers: [{ provide: MapDiscoveryStore, useValue: store }] },
    });
    TestBed.inject(AppConfigService).set({ googleMapsApiKey: '' });
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(MapPageComponent);
    fixture.componentRef.setInput('game', 'yugioh');
    fixture.componentRef.setInput('tags', 'trader');
    await fixture.whenStable();
    await wait(10);
    await fixture.whenStable();
  });

  it('hands the URL filters to the store and loads the map', () => {
    expect(store.init).toHaveBeenCalled();
    expect(store.setParams).toHaveBeenLastCalledWith(
      expect.objectContaining({ game: 'yugioh', tags: ['trader'], view: 'map' }),
    );
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[data-testid=map-status]')?.textContent).toContain(
      '2 collectors within 10 km',
    );
    expect(element.textContent).toContain(
      'Locations are approximate (about 3 km) to protect privacy',
    );
  });

  it('draws the collectors as avatar markers over approximate areas and a dashed search radius', () => {
    expect(adapter.markers.map((marker) => marker.id)).toEqual([
      'collector:maika',
      'collector:noah',
    ]);
    expect(adapter.markers.every((marker) => marker.variant === 'avatar')).toBe(true);
    expect(adapter.circles).toEqual([
      expect.objectContaining({ radiusMeters: 10_000, variant: 'search' }),
      {
        id: 'area:maika',
        center: { lat: 45.523, lng: -73.583 },
        radiusMeters: APPROXIMATE_AREA_RADIUS_M,
        variant: 'approximate',
      },
      {
        id: 'area:noah',
        center: { lat: 45.5, lng: -73.6 },
        radiusMeters: APPROXIMATE_AREA_RADIUS_M,
        variant: 'approximate',
      },
    ]);
  });

  it('renders the approximate-area cue: legend note, emphasised disc and zoom cap', async () => {
    const element = fixture.nativeElement as HTMLElement;
    const note = element.querySelector('[data-testid=map-approximate-note]');
    expect(note?.textContent).toContain(APPROXIMATE_LOCATION_NOTE);
    expect(note?.textContent).toContain('Locations are approximate (about 3 km)');
    // The map is created with the collector zoom cap and announces the approximation.
    const options = loader.mock.calls[0][1] as MapAdapterOptions;
    expect(options.maxZoom).toBe(COLLECTOR_MAP_MAX_ZOOM);
    expect(options.ariaLabel).toContain(APPROXIMATE_LOCATION_NOTE);

    // Selecting a collector emphasises their disc.
    adapter.activate('collector:noah');
    await fixture.whenStable();
    expect(adapter.circles.find((circle) => circle.id === 'area:noah')?.variant).toBe('area');
    expect(adapter.circles.find((circle) => circle.id === 'area:maika')?.variant).toBe(
      'approximate',
    );

    // A view request above the cap (e.g. a stale deep link) is clamped.
    store.viewRequest.set({ seq: 2, centre: { lat: 45.5, lng: -73.6 }, zoom: 18 });
    await fixture.whenStable();
    expect(adapter.getViewport().zoom).toBe(COLLECTOR_MAP_MAX_ZOOM);

    // The legend explains the discs.
    const legendToggle = [...element.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Legend',
    )!;
    legendToggle.click();
    await fixture.whenStable();
    expect(element.querySelector('#map-legend-keys')?.textContent).toContain(
      'Approximate area of a collector',
    );
  });

  it('opens a preview from a marker and reports viewport changes', () => {
    adapter.activate('collector:noah');
    expect(store.select).toHaveBeenCalledWith('noah');
    const viewport = {
      center: { lat: 45.6, lng: -73.5 },
      zoom: 13,
      bounds: { north: 45.62, south: 45.58, east: -73.45, west: -73.55 },
    };
    adapter.move(viewport);
    expect(store.viewportChanged).toHaveBeenCalledWith(viewport);
  });

  it('switches to holders of a card chosen in the search box', () => {
    const page = fixture.componentInstance as unknown as {
      onPicked(suggestion: SearchSuggestion): void;
    };
    page.onPicked({ type: 'CARD' as never, id: 'card-1', label: 'Lantern Fox Spirit' });
    expect(router.navigate).toHaveBeenLastCalledWith(['/map'], {
      queryParams: expect.objectContaining({
        card: 'card-1',
        view: 'list',
        game: 'yugioh',
        tags: 'trader',
      }),
      replaceUrl: false,
    });
    page.onPicked({ type: 'COLLECTOR' as never, id: 'u1', label: 'Maïka', slug: 'maika' });
    expect(store.select).toHaveBeenLastCalledWith('maika');
    page.onPicked({ type: 'SET' as never, id: 'set-1', label: 'Azure Dawn' });
    expect(router.navigate).toHaveBeenLastCalledWith(['/sets', 'set-1']);
  });

  it('toggles the accessible list from the List button', async () => {
    const element = fixture.nativeElement as HTMLElement;
    const toggle = [...element.querySelectorAll('button')].find((button) =>
      button.textContent?.trim().endsWith('List'),
    )!;
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    toggle.click();
    expect(router.navigate).toHaveBeenLastCalledWith(['/map'], {
      queryParams: expect.objectContaining({ view: 'list' }),
      replaceUrl: true,
    });

    fixture.componentRef.setInput('view', 'list');
    await fixture.whenStable();
    const list = element.querySelector('[aria-label="Collectors on the map"]');
    expect(list?.querySelectorAll('li').length).toBe(2);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
  });
});
