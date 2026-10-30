import { DOCUMENT, NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { InventoryService, WishlistService } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { SessionService } from '../../core/auth/session.service';
import { GameContext } from '../../core/game/game-context.service';
import { silentErrors } from '../../core/http/http-context';
import { ShellIconComponent } from '../../core/layout/shell-icon/shell-icon.component';
import { ShellLayout } from '../../core/layout/shell-layout.service';
import { RegionContext } from '../../core/region/region-context.service';
import { ViewerPlaceService } from '../../shared/discovery/viewer-place.service';
import { MyLocationStore } from '../../shared/location/my-location.store';
import { REGION_CODE, RegionsStore } from '../../shared/regions/regions.store';
import { RegionMapStore } from '../map/data/region-map.store';
import { FeedPostComponent } from './feed-post.component';
import { GetStartedComponent } from './get-started.component';
import { HomeFeedStore } from './home-feed.store';
import {
  FEED_FILTERS,
  FILTER_LABELS,
  FeedFilter,
  GET_STARTED_HIDDEN_PREFIX,
  chipDot,
  chipEmptyText,
  endText,
  feedSections,
  filterOfUrl,
  getStartedSteps,
  updatedLabel,
  urlOfFilter,
} from './home-rules';
import { MapCardComponent } from './map-card.component';

/** How often the page looks for newer posts while the tab is visible (spec 5.1). */
export const NEWER_CHECK_MS = 5 * 60_000;
/** How often the times and "Updated 5 min ago" move on. */
const CLOCK_MS = 30_000;

/**
 * Home (`/`, spec 5, boards W1 and W2): "What's new" in the browsed region and game, the feed of
 * `GET /feed` in sections by time with the chips All, New cards, Wanted and Deck cores, "Updated 5
 * min ago" with a refresh button, a "New posts · Show" pill without a number when newer posts
 * exist (looked for every 5 minutes while the tab is visible; posts never slide in on their own),
 * the end ("You're all caught up") and the empty states; the rail holds Get started (or the guest
 * card) and the map card, nothing else (decision 16: no "Your desk", no wishlist availability).
 * The region, game and chip live in the URL (`?region&game&kind`, spec 4.11).
 */
@Component({
  selector: 'app-home-page',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    FeedPostComponent,
    GetStartedComponent,
    MapCardComponent,
    ShellIconComponent,
  ],
  providers: [HomeFeedStore, RegionMapStore],
  templateUrl: './home-page.component.html',
  styleUrl: './home-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePageComponent {
  protected readonly store = inject(HomeFeedStore);
  protected readonly mapStore = inject(RegionMapStore);
  protected readonly layout = inject(ShellLayout);
  private readonly regions = inject(RegionsStore);
  private readonly regionContext = inject(RegionContext);
  private readonly gameContext = inject(GameContext);
  private readonly auth = inject(AuthService);
  private readonly session = inject(SessionService);
  private readonly locations = inject(MyLocationStore);
  private readonly viewer = inject(ViewerPlaceService);
  private readonly inventoryApi = inject(InventoryService);
  private readonly wishlistApi = inject(WishlistService);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly sentinel = viewChild<ElementRef<HTMLElement>>('sentinel');
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');
  private readonly injector = inject(Injector);

  // Query parameters (component input binding): `?region&game&kind`.
  readonly region = input<string | undefined>();
  readonly game = input<string | undefined>();
  readonly kind = input<string | undefined>();

  protected readonly filters = FEED_FILTERS;
  protected readonly labels = FILTER_LABELS;
  protected readonly dot = chipDot;

  protected readonly regionCode = this.regionContext.current;
  protected readonly gameCode = this.gameContext.current;
  protected readonly gameName = computed(() => this.gameContext.info().label);
  protected readonly regionName = computed(() => this.regions.regionName(this.regionCode()));
  protected readonly filter = computed<FeedFilter>(() => filterOfUrl(this.kind()));
  protected readonly signedIn = computed(() => this.auth.isAuthenticated());

  /** "now", moved on every 30 seconds (the times and "Updated 5 min ago"). */
  protected readonly now = signal(new Date());
  protected readonly sections = computed(() => feedSections(this.store.posts(), this.now()));
  protected readonly updated = computed(() =>
    updatedLabel(this.store.loadedAt(), this.now().getTime()),
  );
  protected readonly endLine = computed(() =>
    endText(this.filter(), this.gameName(), this.regionName(), this.store.windowDays()),
  );
  protected readonly chipEmpty = computed(() =>
    chipEmptyText(this.filter(), this.regionName(), this.store.windowDays()),
  );

  /** The rail's map card (lg and up; hidden at md and below 960, spec 3). */
  protected readonly showMap = computed(() => !this.layout.narrow() && !this.layout.medium());
  /** The viewer's state or province when it lies in the browsed region. */
  protected readonly home = computed(() => {
    const code = this.viewer.place().subdivisionCode;
    const entry = code
      ? this.regions
          .subdivisionsOf(this.regionCode())
          .find((candidate) => candidate.subdivision.code === code)
      : null;
    if (!code || !entry) {
      return null;
    }
    return {
      code,
      name: entry.subdivision.wholeCountry ? entry.country.name : entry.subdivision.name,
    };
  });

  // Get started (spec 5.3): signed in, until the three are done or hidden.
  private readonly publicCards = signal<number | null>(null);
  private readonly wishes = signal<number | null>(null);
  private readonly hiddenFor = signal<string | null>(null);
  protected readonly steps = computed(() =>
    this.signedIn()
      ? getStartedSteps({
          location: this.locations.location(),
          publicCards: this.publicCards(),
          wishes: this.wishes(),
        })
      : null,
  );
  protected readonly showSteps = computed(() => {
    const steps = this.steps();
    const uid = this.auth.user()?.uid ?? null;
    return !!steps && steps.done < 3 && !!uid && this.hiddenFor() !== uid;
  });

  /** Last `?region=` / `?game=` applied (a stale URL never overrides the pills). */
  private appliedRegion: string | null = null;
  private appliedGame: string | null = null;
  private lastCheck = Date.now();
  private observer: IntersectionObserver | null = null;

  constructor() {
    void this.regions.load();
    const destroyRef = inject(DestroyRef);

    // The URL's region and game (a shared link, Back) select them once; the pills' choice is
    // then mirrored back into the URL with the chip.
    effect(() => {
      const requestedRegion = this.region() ?? null;
      const requestedGame = this.game()?.toLowerCase() ?? null;
      const region = this.regionCode();
      const game = this.gameCode();
      const filter = this.filter();
      const browsable = this.gameContext.browsable();
      untracked(() => {
        if (
          requestedRegion &&
          requestedRegion !== this.appliedRegion &&
          REGION_CODE.test(requestedRegion)
        ) {
          this.appliedRegion = requestedRegion;
          if (requestedRegion !== region) {
            this.regionContext.select(requestedRegion);
            return;
          }
        }
        if (requestedGame && requestedGame !== this.appliedGame && browsable !== null) {
          this.appliedGame = requestedGame;
          if (requestedGame !== game && this.gameContext.select(requestedGame)) {
            return;
          }
        }
        this.appliedRegion = region;
        this.appliedGame = game;
        if (requestedRegion !== region || requestedGame !== game) {
          this.navigate({ region, game, kind: urlOfFilter(filter) });
        }
      });
    });

    // The feed of the browsed region, game and chip.
    effect(() => {
      const query = { region: this.regionCode(), game: this.gameCode(), kind: this.filter() };
      untracked(() => {
        this.lastCheck = Date.now();
        void this.store.load(query);
      });
    });
    // The map card's counts (only while it shows).
    effect(() => {
      const region = this.regionCode();
      const game = this.gameCode();
      const show = this.showMap();
      untracked(() => {
        if (show && (this.mapStore.region() !== region || this.mapStore.game() !== game)) {
          this.mapStore.setRegion(region, game);
        }
      });
    });
    // Get started's answers, once per signed-in account.
    effect(() => {
      const ready = this.session.status() === 'ready';
      const uid = this.auth.user()?.uid ?? null;
      untracked(() => {
        this.publicCards.set(null);
        this.wishes.set(null);
        this.hiddenFor.set(uid && this.readHidden(uid) ? uid : null);
        if (ready && uid) {
          void this.loadSteps(uid);
        }
      });
    });
    // All three done: Get started goes away for good (as on the phone).
    effect(() => {
      const steps = this.steps();
      const uid = this.auth.user()?.uid ?? null;
      if (steps?.done === 3 && uid) {
        untracked(() => this.writeHidden(uid));
      }
    });

    // The clock and the quiet check for newer posts while the tab is visible.
    const clock = setInterval(() => {
      this.now.set(new Date());
      if (this.visible() && Date.now() - this.lastCheck >= NEWER_CHECK_MS) {
        this.check();
      }
    }, CLOCK_MS);
    const onVisible = () => {
      if (this.visible()) {
        this.now.set(new Date());
        if (Date.now() - this.lastCheck >= NEWER_CHECK_MS) {
          this.check();
        }
      }
    };
    this.document.addEventListener('visibilitychange', onVisible);
    destroyRef.onDestroy(() => {
      clearInterval(clock);
      this.document.removeEventListener('visibilitychange', onVisible);
      this.observer?.disconnect();
    });

    // The next page when the end of the list comes into view.
    effect(() => {
      const element = this.sentinel()?.nativeElement ?? null;
      untracked(() => this.observe(element));
    });
  }

  protected setFilter(filter: FeedFilter): void {
    if (filter !== this.filter()) {
      this.navigate({ kind: urlOfFilter(filter) });
    }
  }

  /** The refresh button: reads the first page again, keeping the list until it answers. */
  protected refresh(): void {
    this.lastCheck = Date.now();
    void this.store.load(
      { region: this.regionCode(), game: this.gameCode(), kind: this.filter() },
      true,
    );
  }

  /** "New posts · Show": the newer posts at the top, the focus on the heading. */
  protected showNewer(): void {
    this.refresh();
    this.document.defaultView?.scrollTo?.({ top: 0 });
    afterNextRender(() => this.heading()?.nativeElement.focus({ preventScroll: true }), {
      injector: this.injector,
    });
  }

  protected retry(): void {
    void this.store.load({ region: this.regionCode(), game: this.gameCode(), kind: this.filter() });
  }

  /** "Switch game": opens the game pill's popover. */
  protected switchGame(): void {
    this.document.querySelector<HTMLButtonElement>('app-game-pill button')?.click();
  }

  /** "Hide these steps": for good, for this account in this browser. */
  protected hideSteps(): void {
    const uid = this.auth.user()?.uid ?? null;
    if (uid) {
      this.writeHidden(uid);
    }
  }

  private check(): void {
    this.lastCheck = Date.now();
    void this.store.checkNewer();
  }

  private visible(): boolean {
    return this.document.visibilityState !== 'hidden';
  }

  private observe(element: HTMLElement | null): void {
    this.observer?.disconnect();
    this.observer = null;
    const View = this.document.defaultView?.IntersectionObserver;
    if (!element || !View) {
      return;
    }
    this.observer = new View(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && this.store.more() === 'idle') {
          void this.store.loadMore();
        }
      },
      { rootMargin: '600px 0px' },
    );
    this.observer.observe(element);
  }

  private navigate(params: Record<string, string | null>): void {
    void this.router.navigate([], {
      queryParams: params,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private async loadSteps(uid: string): Promise<void> {
    try {
      const [cards, wishes] = await Promise.all([
        firstValueFrom(
          this.inventoryApi.listInventoryItems({ markedPublic: true, page: 0, size: 1 }, 'body', false, {
            context: silentErrors(),
          }),
        ),
        firstValueFrom(this.wishlistApi.listWishlist('body', false, { context: silentErrors() })),
      ]);
      if (uid === (this.auth.user()?.uid ?? null)) {
        this.publicCards.set(cards.totalItems ?? 0);
        this.wishes.set((wishes ?? []).length);
      }
    } catch {
      // Get started waits for its answers; the feed shows without it.
    }
  }

  private readHidden(uid: string): boolean {
    try {
      return this.document.defaultView?.localStorage.getItem(GET_STARTED_HIDDEN_PREFIX + uid) === 'hidden';
    } catch {
      return false;
    }
  }

  private writeHidden(uid: string): void {
    this.hiddenFor.set(uid);
    try {
      this.document.defaultView?.localStorage.setItem(GET_STARTED_HIDDEN_PREFIX + uid, 'hidden');
    } catch {
      // Hidden for this visit at least.
    }
  }
}
