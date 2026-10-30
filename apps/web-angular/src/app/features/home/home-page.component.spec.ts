import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { InventoryService, WishlistService } from '@orenji/api-client';
import { of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { SessionService } from '../../core/auth/session.service';
import { GameContext } from '../../core/game/game-context.service';
import { ShellLayout } from '../../core/layout/shell-layout.service';
import { RegionContext } from '../../core/region/region-context.service';
import { ViewerPlaceService } from '../../shared/discovery/viewer-place.service';
import { MyLocationStore } from '../../shared/location/my-location.store';
import { RegionsStore } from '../../shared/regions/regions.store';
import { BoundaryAssets } from '../map/data/boundaries';
import { RegionMapStore } from '../map/data/region-map.store';
import { HomeFeedStore } from './home-feed.store';
import { HomePageComponent } from './home-page.component';

describe('HomePageComponent (spec 5, boards W1 and W2)', () => {
  let fixture: ComponentFixture<HomePageComponent>;
  let element: HTMLElement;
  let store: Record<string, unknown>;
  const status = signal<'loading' | 'ready' | 'error'>('ready');
  const newer = signal(false);
  const signedIn = signal(true);
  const browsable = signal<ReadonlySet<string> | null>(new Set(['yugioh']));
  const select = vi.fn(() => true);

  async function render(): Promise<void> {
    store = {
      posts: signal([]),
      status,
      more: signal('idle'),
      loadedAt: signal(Date.now()),
      newer,
      hasMore: signal(false),
      windowDays: signal(30),
      empty: signal('region'),
      atEnd: signal(false),
      load: vi.fn(async () => undefined),
      loadMore: vi.fn(async () => undefined),
      checkNewer: vi.fn(async () => undefined),
    };
    TestBed.configureTestingModule({
      imports: [HomePageComponent],
      providers: [
        provideRouter([]),
        { provide: ShellLayout, useValue: { narrow: signal(false), medium: signal(false) } },
        {
          provide: RegionsStore,
          useValue: {
            load: vi.fn(),
            regionName: () => 'Americas (North)',
            subdivisionsOf: () => [],
          },
        },
        {
          provide: RegionContext,
          useValue: { current: signal('americas-north'), select: vi.fn() },
        },
        {
          provide: GameContext,
          useValue: {
            current: signal('yugioh'),
            info: signal({ label: 'Yu-Gi-Oh!' }),
            browsable,
            select,
            account: signal('fb-1'),
          },
        },
        {
          provide: AuthService,
          useValue: { isAuthenticated: signedIn, user: signal({ uid: 'fb-1' }) },
        },
        { provide: SessionService, useValue: { status: signal('ready') } },
        { provide: MyLocationStore, useValue: { location: signal({ discoverable: false }) } },
        {
          provide: ViewerPlaceService,
          useValue: { place: signal({ subdivisionCode: null, countryCode: null }) },
        },
        {
          provide: InventoryService,
          useValue: { listInventoryItems: () => of({ totalItems: 0 }) },
        },
        { provide: WishlistService, useValue: { listWishlist: () => of([]) } },
        { provide: BoundaryAssets, useValue: { load: async () => ({ features: [] }) } },
      ],
    });
    TestBed.overrideComponent(HomePageComponent, {
      set: {
        providers: [
          { provide: HomeFeedStore, useValue: store },
          {
            provide: RegionMapStore,
            useValue: {
              region: signal(null),
              game: signal(null),
              setRegion: vi.fn(),
              countByCode: signal(new Map()),
              deckCoreByCode: signal(new Map()),
            },
          },
        ],
      },
    });
    fixture = TestBed.createComponent(HomePageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    browsable.set(new Set(['yugioh']));
    select.mockClear();
    status.set('ready');
    newer.set(false);
    signedIn.set(true);
  });

  it('reads the feed of the region and game, the chips in a "Show" group', async () => {
    await render();
    expect(store['load']).toHaveBeenCalledWith({
      region: 'americas-north',
      game: 'yugioh',
      kind: 'ALL',
    });
    expect(element.querySelector('h1')?.textContent).toContain('What’s new');
    expect(element.querySelector('.home__scope')?.textContent).toContain(
      'Yu-Gi-Oh! · Americas (North) · last 30 days',
    );
    const group = element.querySelector('[role="group"]')!;
    expect(group.getAttribute('aria-label')).toBe('Show');
    const chips = [...group.querySelectorAll('button')];
    expect(chips.map((c) => c.textContent?.trim())).toEqual([
      'All',
      'New cards',
      'Wanted',
      'Deck cores',
    ]);
    expect(chips[0].getAttribute('aria-pressed')).toBe('true');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    chips[2].click();
    expect(navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ queryParams: { kind: 'wanted' } }),
    );
  });

  it("a link's game waits for the games list, then is browsed (the URL keeps it meanwhile)", async () => {
    browsable.set(null);
    await render();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture.componentRef.setInput('game', 'pokemon');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(select).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    browsable.set(new Set(['yugioh', 'pokemon']));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(select).toHaveBeenCalledWith('pokemon');
  });

  it('day one: "Nothing new in Americas (North) yet", and Get started in the rail', async () => {
    await render();
    expect(element.querySelector('[data-testid="home-empty-region"]')?.textContent).toContain(
      'Nothing new in Americas (North) yet',
    );
    expect(element.querySelector('[data-testid="get-started"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="home-map-card"]')).not.toBeNull();
    // No "Your desk" and no wishlist module (decision 16).
    expect(element.textContent).not.toMatch(/Your desk|Available/);
  });

  it('a guest gets the guest card instead of Get started', async () => {
    signedIn.set(false);
    await render();
    expect(element.querySelector('[data-testid="home-guest-card"]')?.textContent).toContain(
      'You’re browsing as a guest',
    );
    expect(element.querySelector('[data-testid="get-started"]')).toBeNull();
  });

  it('an error says "Couldn\'t load what\'s new." with Try again', async () => {
    status.set('error');
    await render();
    const error = element.querySelector('[data-testid="home-error"]')!;
    expect(error.textContent).toContain("Couldn't load what's new.");
    (store['load'] as ReturnType<typeof vi.fn>).mockClear();
    error.querySelector('button')!.click();
    expect(store['load']).toHaveBeenCalled();
  });

  it('"New posts · Show" has no number and shows them on request', async () => {
    newer.set(true);
    await render();
    const pill = element.querySelector<HTMLButtonElement>('[data-testid="home-new-posts"]')!;
    expect(pill.textContent?.trim()).toBe('New posts · Show');
    expect(pill.textContent).not.toMatch(/\d/);
    pill.click();
    expect(store['load']).toHaveBeenLastCalledWith(
      { region: 'americas-north', game: 'yugioh', kind: 'ALL' },
      true,
    );
  });
});
