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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { Router } from '@angular/router';
import { CatalogService, PageResponseCardSummary, SetSummary } from '@orenji/api-client';
import { Subscription, debounceTime, distinctUntilChanged, map } from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyError } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { CardGridComponent } from '../../../shared/catalog/card-grid/card-grid.component';
import { QUERY_MAX_LENGTH } from '../../../shared/catalog/catalog-constants';
import { GamesStore } from '../../../shared/catalog/games.store';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { CardFilterChange, CardFiltersComponent } from './card-filters.component';
import {
  CARD_PAGE_SIZES,
  CardSearchParams,
  DEFAULT_CARD_PAGE_SIZE,
  activeFilterCount,
  parseCardSearchParams,
  toSearchRequest,
  withFilter,
} from './card-search-params';

/** Looks like a printing code (`AZR-EN001`, `SV4-123`). */
const PRINTING_CODE = /^[a-z0-9]{2,6}-[a-z]{0,3}\d{1,4}[a-z]?$/i;

/**
 * `/cards`: catalog search (full text, typo tolerant, printing codes) with game, set, rarity,
 * language and edition filters, paginated. Every piece of state lives in the URL so results can
 * be shared and the back button works.
 */
@Component({
  selector: 'app-card-search-page',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    CardFiltersComponent,
    CardGridComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    PageHeaderComponent,
  ],
  template: `
    <div class="page catalog">
      <app-page-header
        title="Card catalog"
        subtitle="Search every card and printing, then find who has it near you."
      >
        <form
          class="catalog__search"
          role="search"
          aria-label="Catalog"
          (submit)="submitQuery($event)"
        >
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="catalog__query">
            <mat-label>Card name, text or printing code</mat-label>
            <mat-icon matPrefix aria-hidden="true">search</mat-icon>
            <input
              matInput
              type="search"
              [formControl]="queryControl"
              [attr.maxlength]="maxLength"
              autocomplete="off"
              enterkeyhint="search"
            />
          </mat-form-field>
        </form>
        <app-card-filters
          [params]="params()"
          [games]="games.games() ?? []"
          [sets]="sets()"
          (filterChange)="onFilter($event)"
          (clearAll)="clearFilters()"
        />
      </app-page-header>

      @if (error(); as error) {
        <app-error-state
          [title]="errorTitle()"
          [message]="errorMessage()"
          [requestId]="error.requestId"
          (retry)="reload()"
        />
      } @else if (result(); as page) {
        @if ((page.items ?? []).length === 0) {
          <app-empty-state
            icon="search_off"
            title="No cards match"
            [description]="emptyDescription()"
          >
            @if (hasCriteria()) {
              <button actions matButton="outlined" type="button" (click)="clearAll()">
                <mat-icon aria-hidden="true">restart_alt</mat-icon>
                Clear search and filters
              </button>
            }
          </app-empty-state>
        } @else {
          <div class="catalog__summary">
            <p class="catalog__count" aria-live="polite" data-testid="catalog-count">
              {{ page.totalItems }} {{ page.totalItems === 1 ? 'card' : 'cards' }}
              @if (params().q) {
                for “{{ params().q }}”
              }
              @if (loading()) {
                <span class="catalog__updating">· updating…</span>
              }
            </p>
            @if (printingCodeMatch()) {
              <span class="catalog__badge">
                <mat-icon aria-hidden="true">qr_code_2</mat-icon>
                Printing code match
              </span>
            }
          </div>
          <app-card-grid [cards]="page.items ?? []" [loading]="loading()" label="Search results" />
          @if ((page.totalPages ?? 0) > 1 || (page.size ?? 0) !== defaultSize) {
            <mat-paginator
              class="catalog__paginator"
              [length]="page.totalItems ?? 0"
              [pageIndex]="page.page ?? 0"
              [pageSize]="page.size ?? defaultSize"
              [pageSizeOptions]="pageSizes"
              (page)="onPage($event)"
              aria-label="Result pages"
            />
          }
        }
      } @else {
        <app-card-grid [cards]="[]" [loading]="true" />
      }
    </div>
  `,
  styles: `
    .catalog__search {
      max-width: 640px;
      margin-bottom: var(--spacing-4);
    }
    .catalog__query {
      width: 100%;
    }
    .catalog__summary {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--spacing-2) var(--spacing-3);
      margin-bottom: var(--spacing-3);
    }
    .catalog__count {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .catalog__updating {
      color: var(--color-text-muted);
    }
    .catalog__badge {
      display: inline-flex;
      align-items: center;
      gap: var(--spacing-1);
      padding: 2px var(--spacing-3);
      border-radius: var(--radius-pill);
      background: var(--color-accent-container);
      color: var(--color-on-accent-container);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
    }
    .catalog__badge mat-icon {
      width: 16px;
      height: 16px;
      font-size: 16px;
    }
    .catalog__paginator {
      margin-top: var(--spacing-5);
      background: transparent;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardSearchPageComponent {
  private readonly api = inject(CatalogService);
  private readonly router = inject(Router);
  protected readonly games = inject(GamesStore);

  /** Query parameters (bound by the router). */
  readonly q = input<string | undefined>();
  readonly game = input<string | undefined>();
  readonly set = input<string | undefined>();
  readonly rarity = input<string | undefined>();
  readonly language = input<string | undefined>();
  readonly edition = input<string | undefined>();
  readonly page = input<string | undefined>();
  readonly size = input<string | undefined>();

  protected readonly maxLength = QUERY_MAX_LENGTH;
  protected readonly pageSizes = CARD_PAGE_SIZES;
  protected readonly defaultSize = DEFAULT_CARD_PAGE_SIZE;
  protected readonly params = computed<CardSearchParams>(() =>
    parseCardSearchParams({
      q: this.q(),
      game: this.game(),
      set: this.set(),
      rarity: this.rarity(),
      language: this.language(),
      edition: this.edition(),
      page: this.page(),
      size: this.size(),
    }),
  );
  protected readonly result = signal<PageResponseCardSummary | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly sets = signal<SetSummary[] | null>(null);
  protected readonly queryControl = new FormControl('', { nonNullable: true });

  protected readonly hasCriteria = computed(
    () => !!this.params().q || activeFilterCount(this.params()) > 0,
  );
  protected readonly printingCodeMatch = computed(
    () => PRINTING_CODE.test(this.params().q) && this.result()?.totalItems === 1,
  );
  protected readonly emptyDescription = computed(() =>
    this.params().q
      ? `Nothing matches “${this.params().q}”. Check the spelling, try fewer words or a printing code like AZR-EN001.`
      : 'No card matches these filters. Try another set or rarity.',
  );
  protected readonly errorTitle = computed(() => {
    const error = this.error();
    return error?.errorCode === 'VALIDATION_FAILED'
      ? 'This search is not valid'
      : 'Cards could not load';
  });
  protected readonly errorMessage = computed(() => {
    const error = this.error();
    return error ? friendlyError(error).message : '';
  });

  private searchSubscription: Subscription | null = null;
  private setsSubscription: Subscription | null = null;

  constructor() {
    void this.games.load();

    effect(() => {
      const params = this.params();
      untracked(() => this.search(params));
    });
    effect(() => {
      const game = this.params().game;
      untracked(() => this.loadSets(game));
    });
    // Keep the field in step with the URL (back/forward, links) without fighting the typist.
    effect(() => {
      const q = this.params().q;
      untracked(() => {
        if (this.queryControl.value.trim() !== q) {
          this.queryControl.setValue(q, { emitEvent: false });
        }
      });
    });
    this.queryControl.valueChanges
      .pipe(
        map((value) => value.trim().slice(0, QUERY_MAX_LENGTH)),
        debounceTime(350),
        distinctUntilChanged(),
        takeUntilDestroyed(),
      )
      .subscribe((q) => {
        if (q !== this.params().q) {
          this.navigate({ q: q || null, page: null }, true);
        }
      });
    inject(DestroyRef).onDestroy(() => {
      this.searchSubscription?.unsubscribe();
      this.setsSubscription?.unsubscribe();
    });
  }

  protected reload(): void {
    this.search(this.params());
  }

  protected submitQuery(event: Event): void {
    event.preventDefault();
    const q = this.queryControl.value.trim().slice(0, QUERY_MAX_LENGTH);
    if (q !== this.params().q) {
      this.navigate({ q: q || null, page: null });
    }
  }

  protected onFilter(change: CardFilterChange): void {
    this.navigate(withFilter(this.params(), change.key, change.value, this.games.games() ?? []));
  }

  protected clearFilters(): void {
    this.navigate({
      game: null,
      set: null,
      rarity: null,
      language: null,
      edition: null,
      page: null,
    });
  }

  protected clearAll(): void {
    this.queryControl.setValue('', { emitEvent: false });
    void this.router.navigate([], { queryParams: {} });
  }

  protected onPage(event: PageEvent): void {
    this.navigate({
      page: event.pageIndex ? String(event.pageIndex) : null,
      size: event.pageSize === DEFAULT_CARD_PAGE_SIZE ? null : String(event.pageSize),
    });
    globalThis.scrollTo?.({ top: 0, behavior: 'smooth' });
  }

  private navigate(queryParams: Record<string, string | null>, replaceUrl = false): void {
    void this.router.navigate([], { queryParams, queryParamsHandling: 'merge', replaceUrl });
  }

  private search(params: CardSearchParams): void {
    this.searchSubscription?.unsubscribe();
    this.loading.set(true);
    this.error.set(null);
    this.searchSubscription = this.api
      .searchCards(toSearchRequest(params), 'body', false, { context: silentErrors() })
      .subscribe({
        next: (page) => {
          this.result.set(page);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.error.set(toApiError(error));
          this.loading.set(false);
        },
      });
  }

  private loadSets(game: string | null): void {
    this.setsSubscription?.unsubscribe();
    this.sets.set(null);
    if (!game) {
      return;
    }
    this.setsSubscription = this.api
      .listSets({ game, size: 100 }, 'body', false, { context: silentErrors() })
      .subscribe({
        next: (page) => this.sets.set(page.items ?? []),
        error: () => this.sets.set([]),
      });
  }
}
