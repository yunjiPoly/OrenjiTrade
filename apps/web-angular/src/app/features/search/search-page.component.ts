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
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { CatalogService, PageResponseCardSummary } from '@orenji/api-client';
import { Subscription } from 'rxjs';
import { ApiError, toApiError } from '../../core/http/api-error';
import { friendlyMessage } from '../../core/http/api-error-messages';
import { silentErrors } from '../../core/http/http-context';
import { CardGridComponent } from '../../shared/catalog/card-grid/card-grid.component';
import { CardSearchBoxComponent } from '../../shared/catalog/card-search-box/card-search-box.component';
import { QUERY_MAX_LENGTH } from '../../shared/catalog/catalog-constants';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../shared/ui/error-state/error-state.component';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';

const PREVIEW_SIZE = 8;

/**
 * `/search?q=...` (the mobile Search tab): card search with autocomplete and the first matching
 * cards from the catalog. Collectors and public binders join the results in Phase 4.
 */
@Component({
  selector: 'app-search-page',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    PageHeaderComponent,
    CardSearchBoxComponent,
    CardGridComponent,
    EmptyStateComponent,
    ErrorStateComponent,
  ],
  template: `
    <div class="page">
      <app-page-header
        title="Search"
        subtitle="Cards and printings today; collectors near you soon."
      >
        <app-card-search-box class="search__field" label="Search cards" />
      </app-page-header>

      @if (query()) {
        <section aria-labelledby="search-cards-title">
          <div class="search__head">
            <h2 id="search-cards-title" class="search__title">Cards for “{{ query() }}”</h2>
            @if ((result()?.totalItems ?? 0) > 0) {
              <a routerLink="/cards" [queryParams]="{ q: query() }">
                See all {{ result()?.totalItems }} cards
              </a>
            }
          </div>
          @if (error(); as error) {
            <app-error-state
              title="Cards could not load"
              [message]="errorMessage()"
              [requestId]="error.requestId"
              (retry)="load(query())"
            />
          } @else if (result(); as page) {
            @if ((page.items ?? []).length) {
              <app-card-grid [cards]="page.items ?? []" label="Matching cards" />
            } @else {
              <app-empty-state
                icon="search_off"
                title="No cards match"
                description="Try another spelling or a printing code like AZR-EN001."
              />
            }
          } @else {
            <app-card-grid [cards]="[]" [loading]="true" skeletonCount="4" />
          }
        </section>
        <p class="search__soon">
          <mat-icon aria-hidden="true">near_me</mat-icon>
          Collectors and public binders near you join these results soon.
        </p>
      } @else {
        <app-empty-state
          icon="search"
          title="Search for a card"
          description="Type a card name or a printing code above, or browse the whole catalog."
        >
          <a actions matButton="filled" routerLink="/cards">
            <mat-icon aria-hidden="true">playing_cards</mat-icon>
            Browse the catalog
          </a>
        </app-empty-state>
      }
    </div>
  `,
  styles: `
    .search__field {
      max-width: 640px;
    }
    .search__head {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--spacing-2);
      margin-bottom: var(--spacing-3);
    }
    .search__title {
      font-size: var(--font-size-xl);
    }
    .search__soon {
      display: flex;
      align-items: center;
      gap: var(--spacing-2);
      margin-top: var(--spacing-6);
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchPageComponent {
  private readonly api = inject(CatalogService);

  /** Bound from the `q` query parameter (withComponentInputBinding). */
  readonly q = input<string | undefined>();
  protected readonly query = computed(() => (this.q() ?? '').trim().slice(0, QUERY_MAX_LENGTH));
  protected readonly result = signal<PageResponseCardSummary | null>(null);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly errorMessage = computed(() => {
    const error = this.error();
    return error ? friendlyMessage(error) : '';
  });

  private subscription: Subscription | null = null;

  constructor() {
    effect(() => {
      const query = this.query();
      untracked(() => this.load(query));
    });
    inject(DestroyRef).onDestroy(() => this.subscription?.unsubscribe());
  }

  protected load(query: string): void {
    this.subscription?.unsubscribe();
    this.result.set(null);
    this.error.set(null);
    if (!query) {
      return;
    }
    this.subscription = this.api
      .searchCards({ query, size: PREVIEW_SIZE }, 'body', false, { context: silentErrors() })
      .subscribe({
        next: (page) => this.result.set(page),
        error: (error: unknown) => this.error.set(toApiError(error)),
      });
  }
}
