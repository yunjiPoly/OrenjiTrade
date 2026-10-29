import { Component, input, output, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { MapService, RegionsService } from '@orenji/api-client';
import { of, Subject } from 'rxjs';
import { provideApiClient } from '../../core/api/provide-api-client';
import { AuthService } from '../../core/auth/auth.service';
import { SessionService } from '../../core/auth/session.service';
import { FeatureFlagsService } from '../../core/feature-flags/feature-flags.service';
import { ShellLayout } from '../../core/layout/shell-layout.service';
import { RegionContext } from '../../core/region/region-context.service';
import { REGIONS_FIXTURE } from '../../shared/regions/testing/regions-fixtures';
import { BoundaryMapComponent } from './boundary-map/boundary-map.component';
import { MapPageComponent } from './map-page.component';

@Component({ selector: 'app-boundary-map', template: '' })
class FakeBoundaryMapComponent {
  readonly region = input.required<string>();
  readonly counts = input<ReadonlyMap<string, number>>(new Map());
  readonly names = input<ReadonlyMap<string, string>>(new Map());
  readonly selected = input<string | null>(null);
  readonly label = input('');
  readonly subdivisionSelected = output<string>();
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe('MapPageComponent', () => {
  let fixture: ComponentFixture<MapPageComponent>;
  let element: HTMLElement;
  let mapApi: Record<string, ReturnType<typeof vi.fn>>;
  let navigate: ReturnType<typeof vi.spyOn>;
  const status = signal('anonymous');
  const me = signal<unknown>(null);

  async function mount(
    query: { region?: string; state?: string; embedded?: boolean } = {},
  ): Promise<void> {
    fixture = TestBed.createComponent(MapPageComponent);
    for (const [key, value] of Object.entries(query)) {
      fixture.componentRef.setInput(key, value);
    }
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();
  }

  function map(): FakeBoundaryMapComponent {
    return fixture.debugElement.query((debug) => debug.name === 'app-boundary-map')
      .componentInstance as FakeBoundaryMapComponent;
  }

  beforeEach(() => {
    localStorage.clear();
    status.set('anonymous');
    me.set(null);
    mapApi = {
      getRegionBinderCounts: vi.fn(({ region }) =>
        of({ region, total: 3, subdivisions: [{ code: 'CA-QC', binderCount: 3 }] }),
      ),
      listSubdivisionBinders: vi.fn(() => of({ items: [], hasMore: false })),
    };
    TestBed.configureTestingModule({
      imports: [MapPageComponent],
      providers: [
        provideRouter([]),
        provideApiClient(),
        { provide: MapService, useValue: mapApi },
        { provide: RegionsService, useValue: { listRegions: vi.fn(() => of(REGIONS_FIXTURE)) } },
        {
          provide: AuthService,
          useValue: {
            isAuthenticated: signal(false),
            authState: signal('anonymous'),
            user: signal(null),
            changes$: new Subject(),
          },
        },
        { provide: SessionService, useValue: { status, me } },
        {
          provide: FeatureFlagsService,
          useValue: { enabled: () => signal(false), isEnabled: () => false },
        },
      ],
    });
    TestBed.overrideComponent(MapPageComponent, {
      remove: { imports: [BoundaryMapComponent] },
      add: { imports: [FakeBoundaryMapComponent] },
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  it('shows the browsed region with its binder counts and puts the region in the URL', async () => {
    await mount();
    expect(element.querySelector('h1')?.textContent).toContain('Binders in Americas (North)');
    expect(element.querySelector('[data-testid="map-status"]')?.textContent).toContain(
      '3 public binders in Americas (North)',
    );
    expect(map().region()).toBe('americas-north');
    expect(map().counts().get('CA-QC')).toBe(3);
    expect(map().names().get('CA-QC')).toBe('Quebec, Canada');
    expect(navigate).toHaveBeenCalledWith([], {
      relativeTo: expect.anything(),
      queryParams: { region: 'americas-north', state: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    // The accessible list holds the same places.
    expect(element.querySelector('[data-code="CA-QC"]')).not.toBeNull();
  });

  it('opens the region and state of a shared link', async () => {
    await mount({ region: 'europe', state: 'FR-IDF' });
    expect(TestBed.inject(RegionContext).current()).toBe('europe');
    expect(mapApi['getRegionBinderCounts']).toHaveBeenLastCalledWith(
      { region: 'europe' },
      'body',
      false,
      expect.anything(),
    );
    expect(mapApi['listSubdivisionBinders']).toHaveBeenCalledWith(
      expect.objectContaining({ region: 'europe', code: 'FR-IDF' }),
      'body',
      false,
      expect.anything(),
    );
    expect(element.querySelector('[data-testid="subdivision-panel"] h2')?.textContent).toContain(
      'Île-de-France, France',
    );
  });

  it('puts a state chosen on the map or in the list into the URL', async () => {
    await mount();
    navigate.mockClear();
    map().subdivisionSelected.emit('CA-QC');
    expect(navigate).toHaveBeenCalledWith([], {
      relativeTo: expect.anything(),
      queryParams: { region: 'americas-north', state: 'CA-QC' },
      queryParamsHandling: 'merge',
      replaceUrl: false,
    });
    element.querySelector<HTMLButtonElement>('[data-code="US-NY"]')!.click();
    expect(navigate).toHaveBeenLastCalledWith([], {
      relativeTo: expect.anything(),
      queryParams: { region: 'americas-north', state: 'US-NY' },
      queryParamsHandling: 'merge',
      replaceUrl: false,
    });
  });

  it('registers "Skip the map" while it is on screen, and titles itself h2 inside Search', async () => {
    await mount({ embedded: true });
    expect(element.querySelector('h1')).toBeNull();
    expect(element.querySelector('h2.bar__title')?.textContent).toContain('Binders in');
    expect(element.querySelector('#map-list')).not.toBeNull();
    const layout = TestBed.inject(ShellLayout);
    expect(layout.skipMapTarget()).toBe('map-list');
    fixture.destroy();
    expect(layout.skipMapTarget()).toBeNull();
  });

  it('has no side Messages panel any more (the rail has Messages, spec 2.7)', async () => {
    await mount();
    expect(element.querySelector('mat-sidenav, app-messages-panel')).toBeNull();
    expect(element.querySelector('[aria-controls="map-messages-panel"]')).toBeNull();
  });

  it('invites a signed-in collector without a location to choose one', async () => {
    status.set('ready');
    me.set({ id: 'u-1', onboarding: { locationSet: false }, homeRegion: null });
    await mount();
    const prompt = element.querySelector('[data-testid="location-prompt"]');
    expect(prompt?.querySelector('a')?.getAttribute('href')).toBe('/settings/location');
    prompt!.querySelector<HTMLButtonElement>('button[aria-label="Dismiss"]')!.click();
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="location-prompt"]')).toBeNull();
  });

  it('never shows a distance or a city', async () => {
    await mount();
    expect(element.textContent).not.toMatch(/\bkm\b|near you|nearby/i);
  });
});
