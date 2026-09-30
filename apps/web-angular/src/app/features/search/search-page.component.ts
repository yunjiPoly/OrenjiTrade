import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import type { SearchSuggestion } from '@orenji/api-client';
import { SponsoredSlotComponent } from '../../shared/ads/sponsored-slot.component';
import { holdersParams, suggestionPage } from '../../shared/search/suggestions';
import { UnifiedSearchBoxComponent } from '../../shared/search/unified-search-box/unified-search-box.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';
import { CardHoldersComponent } from './card-holders/card-holders.component';
import {
  HolderFilters,
  SearchTab,
  holderFiltersToQuery,
  parseSearchParams,
} from './data/search-params';
import { UnifiedResultsComponent } from './results/unified-results.component';

/**
 * `/search` (the mobile Search tab). Three views, all driven by the URL:
 * - `?q=` unified results in tabs (cards, collectors, public binders; a resolved card shows its
 *   nearby holders);
 * - `?card=` / `?printing=` "who near me has this card" with every filter and sort;
 * - no query: an invitation to search.
 * Results views carry the SEARCH_SPONSORED placement (labelled "Sponsored", hidden without ads).
 */
@Component({
  selector: 'app-search-page',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    CardHoldersComponent,
    EmptyStateComponent,
    PageHeaderComponent,
    SponsoredSlotComponent,
    UnifiedResultsComponent,
    UnifiedSearchBoxComponent,
  ],
  template: `
    <div class="page">
      @if (target(); as target) {
        <nav class="crumbs" aria-label="Breadcrumb">
          <a routerLink="/search">Search</a>
          <mat-icon aria-hidden="true">chevron_right</mat-icon>
          <span aria-current="page">Card holders</span>
        </nav>
        <app-sponsored-slot class="search__sponsored" placement="SEARCH_SPONSORED" layout="row" />
        <app-card-holders
          [target]="target"
          [filters]="params().filters"
          [returnUrl]="router.url"
          (filtersChange)="onHolderFilters($event)"
        />
      } @else {
        <app-page-header
          title="Search"
          subtitle="Cards, collectors near you, public binders and tags."
        >
          <app-unified-search-box
            class="search__field"
            label="Search cards, collectors and binders"
            [value]="params().q"
            [keepSelection]="true"
            (picked)="onPicked($event)"
            (submitted)="onSubmitted($event)"
          />
        </app-page-header>

        @if (params().q) {
          <app-sponsored-slot class="search__sponsored" placement="SEARCH_SPONSORED" layout="row" />
          <app-unified-results [q]="params().q" [tab]="params().tab" (tabChange)="onTab($event)" />
        } @else {
          <app-empty-state
            icon="travel_explore"
            title="Who near you has that card?"
            description="Search a card name or a printing code like AZR-EN001 to see collectors nearby who own, trade or sell it. You can also look for a collector, a binder or a tag."
          >
            <a actions matButton="filled" routerLink="/map">
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
    .search__field {
      max-width: 640px;
    }
    .search__sponsored {
      margin-bottom: var(--spacing-5);
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
      void this.router.navigate(['/map'], {
        queryParams: { tags: suggestion.slug ?? suggestion.id, view: 'list' },
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
      queryParams: { q: this.params().q, tab: tab === 'cards' ? null : tab },
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
