import { Component, input, output, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AdsService, MapService, RegionsService } from '@orenji/api-client';
import { of } from 'rxjs';
import { provideApiClient } from '../../core/api/provide-api-client';
import { AuthService } from '../../core/auth/auth.service';
import { SessionService } from '../../core/auth/session.service';
import { FeatureFlagsService } from '../../core/feature-flags/feature-flags.service';
import { RegionContext } from '../../core/region/region-context.service';
import { REGIONS_FIXTURE } from '../../shared/regions/testing/regions-fixtures';
import { BoundaryMapComponent } from './boundary-map/boundary-map.component';
import { MapPageComponent } from './map-page.component';
import { MessagesPanelComponent } from './messages-panel.component';

@Component({ selector: 'app-boundary-map', template: '' })
class FakeBoundaryMapComponent {
  readonly region = input.required<string>();
  readonly counts = input<ReadonlyMap<string, number>>(new Map());
  readonly names = input<ReadonlyMap<string, string>>(new Map());
  readonly selected = input<string | null>(null);
  readonly label = input('');
  readonly subdivisionSelected = output<string>();
}

@Component({ selector: 'app-messages-panel', template: '' })
class FakeMessagesPanelComponent {
  readonly signedIn = input(false);
  readonly opened = input(false);
  readonly incoming = input<unknown>(null);
  readonly closeRequested = output<void>();
  readonly unreadChange = output<number>();
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

  async function mount(query: { region?: string; subdivision?: string } = {}): Promise<void> {
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
        { provide: AdsService, useValue: { listAds: vi.fn(() => of([])) } },
        {
          provide: AuthService,
          useValue: {
            isAuthenticated: signal(false),
            authState: signal('anonymous'),
            user: signal(null),
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
      remove: { imports: [BoundaryMapComponent, MessagesPanelComponent] },
      add: { imports: [FakeBoundaryMapComponent, FakeMessagesPanelComponent] },
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
    expect(navigate).toHaveBeenCalledWith(['/map'], {
      queryParams: { region: 'americas-north', subdivision: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    // The accessible list holds the same places.
    expect(element.querySelector('[data-code="CA-QC"]')).not.toBeNull();
  });

  it('opens the region and state of a shared link', async () => {
    await mount({ region: 'europe', subdivision: 'FR-IDF' });
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
    expect(navigate).toHaveBeenCalledWith(['/map'], {
      queryParams: { region: 'americas-north', subdivision: 'CA-QC' },
      queryParamsHandling: 'merge',
      replaceUrl: false,
    });
    element.querySelector<HTMLButtonElement>('[data-code="US-NY"]')!.click();
    expect(navigate).toHaveBeenLastCalledWith(['/map'], {
      queryParams: { region: 'americas-north', subdivision: 'US-NY' },
      queryParamsHandling: 'merge',
      replaceUrl: false,
    });
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
