import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { RouterLink } from '@angular/router';
import { CatalogService, PageResponseCardHolderResult, SearchService } from '@orenji/api-client';
import { Observable, Subscription, map } from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { CardImageComponent } from '../../../shared/catalog/card-image/card-image.component';
import { GamesStore } from '../../../shared/catalog/games.store';
import {
  DiscoveryCentre,
  DiscoveryCentreService,
} from '../../../shared/discovery/discovery-centre';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { GameChipComponent } from '../../../shared/ui/game-chip/game-chip.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import {
  DEFAULT_HOLDER_FILTERS,
  HOLDERS_PAGE_SIZE,
  HolderFilters,
  activeHolderFilterCount,
  cardHoldersRequest,
} from '../data/search-params';
import { HolderFiltersComponent } from './holder-filters.component';
import { HolderRowComponent } from './holder-row.component';

interface CardInfo {
  id: string;
  name: string;
  game: string;
  imageUrl: string | null;
  printingCode: string | null;
}

/**
 * "Who near me has this card" (`GET /search/card-holders`): the card, every spec filter and
 * sort, and the matching listings with their holders, paginated. Signed-in collectors search
 * around their own trading area (server side); everyone else around a public city centre.
 */
@Component({
  selector: 'app-card-holders',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatPaginatorModule,
    CardImageComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    GameChipComponent,
    HolderFiltersComponent,
    HolderRowComponent,
    SkeletonComponent,
  ],
  template: `
    <header class="ch__head">
      <app-card-image
        class="ch__img"
        [src]="card()?.imageUrl"
        [alt]="card()?.name ?? ''"
        [game]="card()?.game ?? ''"
        [eager]="true"
      />
      <div class="ch__titles">
        @if (card(); as card) {
          <app-game-chip [slug]="card.game" />
        }
        <h1 class="ch__title">{{ heading() }}</h1>
        <p class="ch__subtitle">
          @if (centre()?.city; as city) {
            Around {{ city.label }}.
            @if (centre()?.signedIn) {
              <a routerLink="/settings/trading-area">Set your trading area</a> to search near you.
            } @else {
              <a routerLink="/auth/sign-in" [queryParams]="{ returnUrl: returnUrl() }">Sign in</a>
              to search around your own area.
            }
          } @else {
            Collectors around your trading area. Places and distances are approximate.
          }
        </p>
        <div class="ch__actions">
          <a matButton="filled" routerLink="/map" [queryParams]="mapQuery()">
            <mat-icon aria-hidden="true">map</mat-icon>
            Show on the map
          </a>
          @if (card(); as card) {
            <a matButton="outlined" [routerLink]="['/cards', card.id]">
              <mat-icon aria-hidden="true">style</mat-icon>
              Card details
            </a>
          }
        </div>
      </div>
    </header>

    <app-holder-filters
      class="ch__filters"
      [filters]="filters()"
      [conditions]="conditions()"
      [editions]="editions()"
      [languages]="languages()"
      (changed)="filtersChange.emit($event)"
    />

    <section
      class="ch__results"
      aria-labelledby="holders-results-title"
      [attr.aria-busy]="loading()"
    >
      <h2 class="ch__count" id="holders-results-title" aria-live="polite">{{ countLabel() }}</h2>
      @if (error(); as error) {
        <app-error-state
          title="Holders could not load"
          [message]="errorMessage()"
          [requestId]="error.requestId"
          (retry)="load()"
        />
      } @else if (page(); as page) {
        @if (page.items?.length) {
          <ul class="ch__list" aria-label="Card holders near you">
            @for (result of page.items; track result.item.id) {
              <li><app-holder-row [result]="result" [signedIn]="centre()?.signedIn ?? false" /></li>
            }
          </ul>
          @if ((page.totalPages ?? 0) > 1) {
            <mat-paginator
              [length]="page.totalItems ?? 0"
              [pageIndex]="page.page ?? 0"
              [pageSize]="pageSize"
              [hidePageSize]="true"
              aria-label="Holder result pages"
              (page)="onPage($event)"
            />
          }
        } @else {
          <app-empty-state
            icon="search_off"
            title="Nobody nearby lists this card with these filters"
            description="Widen the filters, or look again later: collectors publish new cards every day."
          >
            @if (hasFilters()) {
              <button actions matButton="filled" type="button" (click)="clearFilters()">
                Clear filters
              </button>
            }
          </app-empty-state>
        }
      } @else {
        <span class="visually-hidden">Loading holders</span>
        <app-skeleton variant="list" lines="4" />
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .ch__head {
      display: flex;
      gap: var(--spacing-5);
      align-items: flex-start;
      margin-bottom: var(--spacing-5);
    }
    .ch__img {
      flex: 0 0 auto;
      width: 112px;
    }
    .ch__titles {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: var(--spacing-2);
    }
    .ch__title {
      font-size: var(--font-size-3xl);
    }
    .ch__subtitle {
      margin: 0;
      color: var(--color-text-muted);
    }
    .ch__actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-2);
    }
    .ch__filters {
      padding: var(--spacing-4);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
    }
    .ch__count {
      margin: var(--spacing-5) 0 var(--spacing-3);
      font-size: var(--font-size-lg);
    }
    .ch__list {
      display: grid;
      gap: var(--spacing-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    @media (max-width: 599px) {
      .ch__img {
        width: 72px;
      }
      .ch__title {
        font-size: var(--font-size-2xl);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardHoldersComponent {
  private readonly searchApi = inject(SearchService);
  private readonly catalog = inject(CatalogService);
  private readonly games = inject(GamesStore);
  private readonly centres = inject(DiscoveryCentreService);

  readonly target = input.required<{ kind: 'card' | 'printing'; id: string }>();
  readonly filters = input<HolderFilters>(DEFAULT_HOLDER_FILTERS);
  readonly returnUrl = input('/search');
  readonly filtersChange = output<HolderFilters>();

  protected readonly pageSize = HOLDERS_PAGE_SIZE;
  protected readonly card = signal<CardInfo | null>(null);
  protected readonly centre = signal<DiscoveryCentre | null>(null);
  protected readonly page = signal<PageResponseCardHolderResult | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<ApiError | null>(null);

  protected readonly heading = computed(() => {
    const card = this.card();
    if (!card) {
      return 'Who has this card near you';
    }
    return `Who has ${card.name}${card.printingCode ? ` (${card.printingCode})` : ''} near you`;
  });
  protected readonly mapQuery = computed(() => ({
    [this.target().kind]: this.target().id,
    view: 'list',
  }));
  protected readonly countLabel = computed(() => {
    const page = this.page();
    if (!page) {
      return 'Looking for holders…';
    }
    const total = page.totalItems ?? 0;
    return `${total} ${total === 1 ? 'listing' : 'listings'} near you`;
  });
  protected readonly errorMessage = computed(() => {
    const error = this.error();
    return error ? friendlyMessage(error) : '';
  });
  protected readonly hasFilters = computed(() => activeHolderFilterCount(this.filters()) > 0);
  private readonly schema = computed(() => this.games.schema(this.card()?.game));
  protected readonly conditions = computed(
    () =>
      this.schema()?.conditions ?? [
        'MINT',
        'NEAR_MINT',
        'LIGHTLY_PLAYED',
        'MODERATELY_PLAYED',
        'HEAVILY_PLAYED',
        'DAMAGED',
      ],
  );
  protected readonly editions = computed(() => this.schema()?.editions ?? []);
  protected readonly languages = computed(() => this.schema()?.languages ?? []);

  private cardSubscription: Subscription | null = null;
  private pageSubscription: Subscription | null = null;

  constructor() {
    void this.games.load();
    effect(() => {
      const target = this.target();
      untracked(() => this.loadCard(target));
    });
    effect(() => {
      this.target();
      this.filters();
      untracked(() => void this.load());
    });
    inject(DestroyRef).onDestroy(() => {
      this.cardSubscription?.unsubscribe();
      this.pageSubscription?.unsubscribe();
    });
  }

  protected async load(): Promise<void> {
    this.pageSubscription?.unsubscribe();
    this.loading.set(true);
    this.error.set(null);
    this.page.set(null);
    const centre = this.centre() ?? (await this.centres.resolve());
    this.centre.set(centre);
    const target = this.target();
    const filters = this.filters();
    this.pageSubscription = this.searchApi
      .searchCardHolders(
        cardHoldersRequest(target, filters, centre.city?.center ?? null),
        'body',
        false,
        { context: silentErrors() },
      )
      .subscribe({
        next: (page) => {
          this.loading.set(false);
          this.page.set(page);
        },
        error: (error: unknown) => {
          this.loading.set(false);
          this.error.set(toApiError(error));
        },
      });
  }

  protected onPage(event: PageEvent): void {
    this.filtersChange.emit({ ...this.filters(), page: event.pageIndex });
  }

  protected clearFilters(): void {
    this.filtersChange.emit({ ...DEFAULT_HOLDER_FILTERS, sort: this.filters().sort });
  }

  private loadCard(target: { kind: 'card' | 'printing'; id: string }): void {
    this.cardSubscription?.unsubscribe();
    this.card.set(null);
    const request: Observable<CardInfo> =
      target.kind === 'card'
        ? this.catalog.getCard({ id: target.id }, 'body', false, { context: silentErrors() }).pipe(
            map((card) => ({
              id: card.id ?? target.id,
              name: card.name ?? 'this card',
              game: card.game ?? '',
              imageUrl: card.primaryImageUrl ?? null,
              printingCode: null,
            })),
          )
        : this.catalog
            .getPrinting({ id: target.id }, 'body', false, { context: silentErrors() })
            .pipe(
              map((detail) => ({
                id: detail.card?.id ?? '',
                name: detail.card?.name ?? 'this card',
                game: detail.card?.game ?? '',
                imageUrl:
                  detail.printing?.images?.find((image) => image.kind === 'FRONT')?.url ??
                  detail.card?.primaryImageUrl ??
                  null,
                printingCode: detail.printing?.printingCode ?? null,
              })),
            );
    this.cardSubscription = request.subscribe({
      next: (card) => this.card.set(card),
      error: () => this.card.set(null),
    });
  }
}
