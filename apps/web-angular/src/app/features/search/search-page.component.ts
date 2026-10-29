import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CatalogService } from '@orenji/api-client';
import type { PublicBinderSummary, WishlistItemResponse } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { GameContext } from '../../core/game/game-context.service';
import { silentErrors } from '../../core/http/http-context';
import { ShellLayout } from '../../core/layout/shell-layout.service';
import { ShellTabTitleDirective } from '../../core/layout/shell-tab-title.directive';
import { RegionContext } from '../../core/region/region-context.service';
import { ViewerPlaceService } from '../../shared/discovery/viewer-place.service';
import { REGION_CODE, RegionsStore, subdivisionLabel } from '../../shared/regions/regions.store';
import { SegmentOption, SegmentedComponent } from '../../shared/ui/segmented/segmented.component';
import {
  UnderlineTab,
  UnderlineTabsComponent,
} from '../../shared/ui/underline-tabs/underline-tabs.component';
import { WishlistActions } from '../../shared/wishlist/wishlist-actions.service';
import { RegionMapStore } from '../map/data/region-map.store';
import { WishlistStore } from '../wishlist/data/wishlist.store';
import { BinderListStore } from './data/binder-list.store';
import {
  BinderKind,
  SearchTab,
  WHOLE_REGION,
  parseSearchUrl,
  switchPatch,
} from './data/search-url';
import { BinderDrillInComponent } from './drill-in/binder-drill-in.component';
import { SearchMapComponent } from './map/search-map.component';
import { BindersPaneComponent } from './panes/binders-pane.component';
import { CardsPaneComponent } from './panes/cards-pane.component';
import { WishHoldersComponent } from './panes/wish-holders.component';
import { WishlistPaneComponent } from './panes/wishlist-pane.component';

/** The list pane's id: "Skip the map" jumps there (spec 4.1 and 6.4). */
export const SEARCH_LIST_ID = 'search-list';
/** xl, where a binder opens in a middle pane (spec 3 and 6.5). */
export const XL_QUERY = '(min-width: 1920px)';

type NarrowView = 'map' | 'list';

/**
 * Search (`/search`, spec 6, boards W4, W5 and W6; web stage WD): the list pane beside the map,
 * one region and one game at a time (`?region=&game=`, every call sends them; decision 7).
 *
 * - Cards: the card search (the top bar hides its own field here).
 * - Binders: the state list or the rows of a state (`?state=`), of the whole region
 *   (`state=all`) or of a text (`?q=`), binders or deck cores (`?kind=`). Clicking a state on the
 *   map lands in its binders (decision 15). Opening a row (`?open=`) shows the binder or deck core
 *   beside the list at lg (the list pane widens to 520), in a middle pane at xl, and its full page
 *   at md and below; that open is the only thing that spends a binder view (decision 14).
 * - Wishlist (`?wish=`): the wishes, and who has the chosen one in the map's pane.
 *
 * Below 960 the phone's Search: a full-width map with the state card ("See binders") and the
 * list one tap away. Old `?card=` / `?printing=` links open the card page.
 */
@Component({
  selector: 'app-search-page',
  imports: [
    BinderDrillInComponent,
    BindersPaneComponent,
    CardsPaneComponent,
    SearchMapComponent,
    SegmentedComponent,
    ShellTabTitleDirective,
    UnderlineTabsComponent,
    WishHoldersComponent,
    WishlistPaneComponent,
  ],
  providers: [RegionMapStore, BinderListStore, WishlistStore],
  templateUrl: './search-page.component.html',
  styleUrl: './search-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchPageComponent {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly catalog = inject(CatalogService);
  private readonly document = inject(DOCUMENT);
  protected readonly auth = inject(AuthService);
  protected readonly layout = inject(ShellLayout);
  protected readonly regionContext = inject(RegionContext);
  protected readonly gameContext = inject(GameContext);
  protected readonly regions = inject(RegionsStore);
  protected readonly mapStore = inject(RegionMapStore);
  protected readonly wishlist = inject(WishlistStore);
  private readonly wishActions = inject(WishlistActions);
  protected readonly viewer = inject(ViewerPlaceService);

  // Query parameters (withComponentInputBinding).
  readonly tab = input<string | undefined>();
  readonly q = input<string | undefined>();
  readonly state = input<string | undefined>();
  readonly kind = input<string | undefined>();
  readonly open = input<string | undefined>();
  readonly wish = input<string | undefined>();
  readonly set = input<string | undefined>();
  readonly region = input<string | undefined>();
  readonly game = input<string | undefined>();
  /** Old links (before WD): the card page now. */
  readonly card = input<string | undefined>();
  readonly printing = input<string | undefined>();

  private readonly bindersPane = viewChild(BindersPaneComponent);
  private readonly cardsPane = viewChild(CardsPaneComponent);
  private readonly searchMap = viewChild(SearchMapComponent);

  protected readonly listId = SEARCH_LIST_ID;
  protected readonly url = computed(() =>
    parseSearchUrl({
      tab: this.tab(),
      q: this.q(),
      state: this.state(),
      kind: this.kind(),
      open: this.open(),
      wish: this.wish(),
      set: this.set(),
    }),
  );
  protected readonly regionCode = this.regionContext.current;
  protected readonly gameCode = this.gameContext.current;
  protected readonly gameName = computed(() => this.gameContext.info().shortLabel);
  protected readonly regionName = computed(() => this.regions.regionName(this.regionCode()));
  protected readonly platformRegion = computed(() => this.regions.region(this.regionCode()));
  protected readonly homeRegionName = computed(() =>
    this.regions.regionName(this.regionContext.home()),
  );
  /** "Quebec, Canada" per subdivision code (map tooltips, the state chip). */
  protected readonly names = computed(() => {
    const names = new Map<string, string>();
    for (const entry of this.regions.subdivisionsOf(this.regionCode())) {
      names.set(entry.subdivision.code, subdivisionLabel(entry));
    }
    return names;
  });
  protected readonly stateName = computed(() => {
    const state = this.url().state;
    if (!state || state === WHOLE_REGION) {
      return state === WHOLE_REGION ? 'Whole region' : '';
    }
    const entry = this.regions.subdivision(state);
    return entry ? entry.subdivision.name : state;
  });
  /** The viewer's province, when it is in the browsed region. */
  protected readonly home = computed(() => {
    const code = this.viewer.place().subdivisionCode;
    return code && this.names().has(code) ? code : null;
  });
  protected readonly highlight = signal<string | null>(null);
  protected readonly xl = signal(false);
  protected readonly narrowView = signal<NarrowView>('map');
  protected readonly narrowViews: readonly SegmentOption<NarrowView>[] = [
    { value: 'map', label: 'Map' },
    { value: 'list', label: 'List' },
  ];

  /** The wishes of the browsed game ("Wishlist 6": your own count is allowed, spec 6.1). */
  protected readonly wishCount = computed(() =>
    this.auth.isAuthenticated() && this.wishlist.status() === 'ready'
      ? this.wishlist.items().filter((item) => item.game === this.gameCode()).length
      : null,
  );
  protected readonly chosenWish = computed<WishlistItemResponse | null>(() => {
    const id = this.url().wish;
    const wish = id ? this.wishlist.find(id) : null;
    return wish && wish.game === this.gameCode() ? wish : null;
  });
  protected readonly tabs = computed<UnderlineTab[]>(() => {
    const u = this.url();
    const view = u.tab;
    const q = u.q || null;
    return [
      {
        id: 'cards',
        label: 'Cards',
        commands: ['/search'],
        queryParams: { tab: 'cards', q, open: null, wish: null },
        active: view === 'cards',
      },
      {
        id: 'binders',
        label: 'Binders',
        commands: ['/search'],
        queryParams: { tab: 'binders', q, open: null, wish: null, set: null },
        active: view === 'binders',
      },
      {
        id: 'wishlist',
        label: 'Wishlist',
        commands: ['/search'],
        queryParams: { tab: 'wishlist', q: null, open: null, wish: u.wish, set: null },
        active: view === 'wishlist',
        count: this.wishCount(),
      },
    ];
  });
  /** A binder open beside the list (lg) or in the middle pane (xl). */
  protected readonly openId = computed(() => {
    const url = this.url();
    return url.tab === 'binders' && !this.layout.narrow() && !this.layout.medium()
      ? url.open
      : null;
  });
  protected readonly openWhere = computed(() => {
    const url = this.url();
    const kind = url.kind === 'deckcores' ? 'Deck cores' : 'Binders';
    const place = url.state && url.state !== WHOLE_REGION ? this.stateName() : this.regionName();
    return url.q ? `${kind} · “${url.q}”` : `${kind} · ${place}`;
  });
  /** Where the map's pane shows the holder pane instead (Wishlist). */
  protected readonly holderPane = computed(() => this.url().tab === 'wishlist');

  private appliedRegion: string | null = null;
  private appliedGame: string | null = null;
  private returnFocus: { id: string; scroll: number } | null = null;

  constructor() {
    void this.regions.load();
    const destroyRef = inject(DestroyRef);
    this.layout.setSkipMapTarget(SEARCH_LIST_ID);
    destroyRef.onDestroy(() => this.layout.setSkipMapTarget(null));
    const view = this.document.defaultView;
    if (view && typeof view.matchMedia === 'function') {
      const list = view.matchMedia(XL_QUERY);
      this.xl.set(list.matches);
      const listener = (event: MediaQueryListEvent) => this.xl.set(event.matches);
      list.addEventListener('change', listener);
      destroyRef.onDestroy(() => list.removeEventListener('change', listener));
    }

    // Old `?card=` / `?printing=` links (before WD) open the card page.
    effect(() => {
      const card = this.card();
      const printing = this.printing();
      untracked(() => void this.redirectOldCardLink(card, printing));
    });
    // A link's region and game select them once; the pills' choices are mirrored into the URL in
    // one navigation (two would race and the second would drop the first's parameter).
    effect(() => {
      const requestedRegion = this.region();
      const requestedGame = this.game();
      const region = this.regionContext.current();
      const game = this.gameContext.current();
      const browsable = this.gameContext.browsable();
      const oldLink = !!this.card() || !!this.printing();
      untracked(() => {
        if (oldLink) {
          return;
        }
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
        const patch = switchPatch({
          requestedRegion,
          requestedGame,
          region,
          game,
          state: this.state(),
          regionHas: (code) => this.names().has(code),
        });
        if (requestedRegion !== region) {
          this.appliedRegion = region;
        }
        if (requestedGame !== game) {
          this.appliedGame = game;
        }
        if (Object.keys(patch).length > 0) {
          this.mergeUrl(patch, true);
        }
      });
    });
    // The map's counts: the browsed region and game.
    effect(() => {
      const region = this.regionCode();
      const game = this.gameCode();
      untracked(() => this.mapStore.setRegion(region, game));
    });
    // The wishes (the tab's count and the Wishlist tab).
    effect(() => {
      if (this.auth.isAuthenticated()) {
        untracked(() => this.wishlist.init());
      }
    });
    // Back from a binder: the list keeps its scroll, and the row its focus (spec 6.5).
    effect(() => {
      const open = this.openId();
      untracked(() => {
        if (!open && this.returnFocus) {
          const target = this.returnFocus;
          this.returnFocus = null;
          setTimeout(() => {
            const pane = this.document.getElementById(SEARCH_LIST_ID)?.closest('.sx__list');
            if (pane) {
              pane.scrollTop = target.scroll;
            }
            this.document
              .querySelector<HTMLElement>(`[data-binder="${target.id}"]`)
              ?.focus({ preventScroll: true });
          });
        }
      });
    });
  }

  private async redirectOldCardLink(card: string | undefined, printing: string | undefined) {
    if (!card && !printing) {
      return;
    }
    let cardId = card ?? null;
    if (!cardId && printing) {
      try {
        const detail = await firstValueFrom(
          this.catalog.getPrinting({ id: printing }, 'body', false, { context: silentErrors() }),
        );
        cardId = detail.card?.id ?? detail.printing?.cardId ?? null;
      } catch {
        cardId = null;
      }
    }
    if (cardId) {
      void this.router.navigate(['/cards', cardId], {
        queryParams: printing ? { printing } : {},
        replaceUrl: true,
      });
    } else {
      this.mergeUrl({ card: null, printing: null }, true);
    }
  }

  protected setQ(q: string): void {
    this.mergeUrl({ q: q || null, open: null }, true);
  }

  /** The set chip's ×: every card of the browsed game again. */
  protected clearSet(): void {
    this.mergeUrl({ set: null }, true);
  }

  protected setState(code: string | null): void {
    this.mergeUrl({ tab: 'binders', state: code, open: null });
    if (this.layout.narrow()) {
      this.narrowView.set('list');
    }
  }

  protected setKind(kind: BinderKind): void {
    this.mergeUrl({ kind: kind === 'deckcores' ? 'deckcores' : null, open: null }, true);
  }

  /** A state clicked on the map: its binders, the map stays (decision 15). */
  protected onMapPick(code: string): void {
    this.setState(code);
  }

  protected pickOnMap(): void {
    if (this.layout.narrow()) {
      this.narrowView.set('map');
    }
    setTimeout(() => this.searchMap()?.focus());
  }

  /** An explicit open of a row: beside the list at lg and xl, the full page at md and below. */
  protected openBinder(event: { binder: PublicBinderSummary; opener: EventTarget | null }): void {
    if (this.layout.narrow() || this.layout.medium()) {
      void this.router.navigate(['/binders', event.binder.id]);
      return;
    }
    const pane = this.document.getElementById(SEARCH_LIST_ID)?.closest('.sx__list');
    this.returnFocus = { id: event.binder.id, scroll: pane?.scrollTop ?? 0 };
    this.mergeUrl({ open: event.binder.id });
  }

  protected closeBinder(): void {
    this.mergeUrl({ open: null });
  }

  protected chooseWish(wish: WishlistItemResponse): void {
    if (this.layout.narrow()) {
      void this.router.navigate(['/cards', wish.card?.id], {
        queryParams: wish.printing?.id
          ? { printing: wish.printing.id }
          : wish.rarity
            ? { rarity: wish.rarity }
            : { printing: 'any' },
      });
      return;
    }
    this.mergeUrl({ wish: wish.id }, true);
  }

  protected async editWish(wish: WishlistItemResponse): Promise<void> {
    const updated = await this.wishActions.edit(wish);
    if (updated) {
      this.wishlist.upsert(updated);
    } else {
      await this.wishlist.refresh();
      if (!this.wishlist.find(wish.id)) {
        this.mergeUrl({ wish: null }, true);
      }
    }
  }

  protected backHome(): void {
    const home = this.regionContext.home();
    if (home) {
      this.regionContext.select(home);
    }
  }

  private mergeUrl(queryParams: Record<string, string | null>, replaceUrl = false): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
      replaceUrl,
    });
  }

  protected readonly searchTab = (tab: SearchTab) => tab;
}
