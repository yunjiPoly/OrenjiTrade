import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import type { SearchSuggestion } from '@orenji/api-client';
import { holdersParams, suggestionPage } from '../../shared/search/suggestions';
import { UnifiedSearchBoxComponent } from '../../shared/search/unified-search-box/unified-search-box.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { CardHoldersComponent } from './card-holders/card-holders.component';
import {
  HolderFilters,
  SearchTab,
  holderFiltersToQuery,
  parseSearchParams,
} from './data/search-params';
import { UnifiedResultsComponent } from './results/unified-results.component';
import { MapPageComponent } from '../map/map-page.component';
import { WishlistPageComponent } from '../wishlist/wishlist-page.component';
import {
  UnderlineTab,
  UnderlineTabsComponent,
} from '../../shared/ui/underline-tabs/underline-tabs.component';

/** The view of Search (web WA): the card search, the binders' map, or the wishlist. */
export type SearchView = 'cards' | 'binders' | 'wishlist';

/**
 * Which top tab a URL shows (spec 4.11, web WA): `tab=wishlist` the wishlist; `tab=binders` the
 * binders, as a map of the region's states without a text and as binder results with `q`;
 * anything else the cards (and the collectors of today's results).
 */
export function searchViewOf(tab: string | undefined): SearchView {
  const value = (tab ?? '').trim().toLowerCase();
  return value === 'wishlist' ? 'wishlist' : value === 'binders' ? 'binders' : 'cards';
}

/**
 * `/search` (the phone's Search tab), with the tabs Cards | Binders | Wishlist of the web redesign
 * (spec 6; stage WD rebuilds the views beside the map). All driven by the URL:
 * - `?q=` unified results in tabs (cards, collectors, public binders; a resolved card shows its
 *   holders in the browsed region);
 * - `?card=` / `?printing=` "who in my region has this card" with every filter and sort;
 * - `?tab=binders` without a text: the binders of the region on its map (`&state=` a state's);
 * - `?tab=wishlist`: the wishlist;
 * - no query: an invitation to search.
 */
@Component({
  selector: 'app-search-page',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    CardHoldersComponent,
    EmptyStateComponent,
    UnifiedResultsComponent,
    UnifiedSearchBoxComponent,
    UnderlineTabsComponent,
    MapPageComponent,
    WishlistPageComponent,
  ],
  template: `
    <div class="page search-page">
      <header class="search-page__head">
        @if (target()) {
          <!-- The card holders view has its own h1 ("Who has …"): one h1 per page. -->
          <p class="search-page__title">Search</p>
        } @else {
          <h1 class="search-page__title">Search</h1>
        }
        <app-underline-tabs label="Search" [tabs]="tabs()" />
      </header>
      @if (view() === 'wishlist') {
        <app-wishlist-page embedded />
      } @else if (view() === 'binders' && !params().q) {
        <app-map-page embedded [region]="region()" [state]="state()" />
      } @else if (target(); as target) {
        <nav class="crumbs" aria-label="Breadcrumb">
          <a routerLink="/search">Search</a>
          <mat-icon aria-hidden="true">chevron_right</mat-icon>
          <span aria-current="page">Card holders</span>
        </nav>
        <app-card-holders
          [target]="target"
          [filters]="params().filters"
          [returnUrl]="router.url"
          (filtersChange)="onHolderFilters($event)"
        />
      } @else {
        <p class="search-page__lead">
          Cards, collectors and public binders of your region, and tags.
        </p>
        <app-unified-search-box
          class="search__field"
          data-page-search
          label="Search cards, collectors and binders"
          [value]="params().q"
          [keepSelection]="true"
          (picked)="onPicked($event)"
          (submitted)="onSubmitted($event)"
        />

        @if (params().q) {
          <app-unified-results [q]="params().q" [tab]="params().tab" (tabChange)="onTab($event)" />
        } @else {
          <app-empty-state
            icon="travel_explore"
            title="Who in your region has that card?"
            description="Search a card name or a printing code like AZR-EN001 to see collectors of your region who own, trade or sell it. You can also look for a collector, a binder or a tag."
          >
            <a actions matButton="filled" routerLink="/search" [queryParams]="{ tab: 'binders' }">
              <mat-icon aria-hidden="true">map</mat-icon>
              Explore the map
            </a>
            <a actions matButton="outlined" routerLink="/cards">
              <mat-icon aria-hidden="true">playing_cards</mat-icon>
              Browse the catalog
            </a>
          </app-empty-state>
        }
      }
    </div>
  `,
  styles: `
    .search-page__head {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-3);
      margin-bottom: var(--spacing-5);
    }
    .search-page__title {
      margin: 0;
      font-family: var(--font-display);
      font-size: var(--font-size-title);
      font-weight: var(--font-weight-bold);
      letter-spacing: -0.4px;
      line-height: 36px;
    }
    .search-page__lead {
      margin: 0 0 var(--spacing-3);
      color: var(--color-text-muted);
    }
    .search__field {
      display: block;
      max-width: 640px;
      margin-bottom: var(--spacing-6);
    }
    .crumbs {
      display: flex;
      align-items: center;
      gap: var(--spacing-1);
      margin-bottom: var(--spacing-4);
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .crumbs mat-icon {
      width: 18px;
      height: 18px;
      font-size: 18px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchPageComponent {
  protected readonly router = inject(Router);

  // Query parameters (withComponentInputBinding).
  readonly q = input<string | undefined>();
  readonly tab = input<string | undefined>();
  readonly region = input<string | undefined>();
  readonly state = input<string | undefined>();
  readonly card = input<string | undefined>();
  readonly printing = input<string | undefined>();
  readonly availability = input<string | undefined>();
  readonly condition = input<string | undefined>();
  readonly minPrice = input<string | undefined>();
  readonly maxPrice = input<string | undefined>();
  readonly freshness = input<string | undefined>();
  readonly edition = input<string | undefined>();
  readonly language = input<string | undefined>();
  readonly offers = input<string | undefined>();
  readonly sort = input<string | undefined>();
  readonly page = input<string | undefined>();

  protected readonly params = computed(() =>
    parseSearchParams({
      q: this.q(),
      tab: this.tab(),
      card: this.card(),
      printing: this.printing(),
      availability: this.availability(),
      condition: this.condition(),
      minPrice: this.minPrice(),
      maxPrice: this.maxPrice(),
      freshness: this.freshness(),
      edition: this.edition(),
      language: this.language(),
      offers: this.offers(),
      sort: this.sort(),
      page: this.page(),
    }),
  );
  protected readonly view = computed(() => searchViewOf(this.tab()));
  protected readonly tabs = computed<UnderlineTab[]>(() => {
    const q = this.params().q || null;
    const view = this.view();
    return [
      {
        id: 'cards',
        label: 'Cards',
        commands: ['/search'],
        queryParams: { tab: 'cards', q },
        active: view === 'cards',
      },
      {
        id: 'binders',
        label: 'Binders',
        commands: ['/search'],
        queryParams: { tab: 'binders', q },
        active: view === 'binders',
      },
      {
        id: 'wishlist',
        label: 'Wishlist',
        commands: ['/search'],
        queryParams: { tab: 'wishlist', q: null },
        active: view === 'wishlist',
      },
    ];
  });

  /** Stable object per card/printing so the holders view does not reload for filter changes. */
  protected readonly target = computed(
    () => {
      const params = this.params();
      if (params.printing) {
        return { kind: 'printing' as const, id: params.printing };
      }
      return params.card ? { kind: 'card' as const, id: params.card } : null;
    },
    { equal: (a, b) => a?.kind === b?.kind && a?.id === b?.id },
  );

  protected onSubmitted(text: string): void {
    void this.router.navigate(['/search'], { queryParams: { q: text } });
  }

  protected onPicked(suggestion: SearchSuggestion): void {
    const holders = holdersParams(suggestion);
    if (holders) {
      void this.router.navigate(['/search'], { queryParams: holders });
      return;
    }
    if (suggestion.type === 'TAG') {
      void this.router.navigate(['/search'], {
        queryParams: { tab: 'binders', tags: suggestion.slug ?? suggestion.id, view: 'list' },
      });
      return;
    }
    const page = suggestionPage(suggestion);
    if (page) {
      void this.router.navigate(page);
    }
  }

  protected onTab(tab: SearchTab): void {
    void this.router.navigate(['/search'], {
      queryParams: { q: this.params().q, tab },
      replaceUrl: true,
    });
  }

  protected onHolderFilters(filters: HolderFilters): void {
    const target = this.target();
    if (!target) {
      return;
    }
    void this.router.navigate(['/search'], {
      queryParams: { [target.kind]: target.id, ...holderFiltersToQuery(filters) },
      replaceUrl: true,
    });
  }
}
