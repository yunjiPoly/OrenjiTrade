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
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import {
  CatalogService,
  PageResponseCardSummary,
  SearchCardsRequestParams,
} from '@orenji/api-client';
import { Subject, Subscription, debounceTime, distinctUntilChanged } from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { QUERY_MAX_LENGTH } from '../../../shared/catalog/catalog-constants';
import { GamesStore } from '../../../shared/catalog/games.store';
import { gameInfo } from '../../../shared/domain/games';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { CatalogSyncPanelComponent } from './catalog-sync-panel.component';

const PAGE_SIZE_OPTIONS = [20, 50, 100];

function toInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/**
 * `/admin/cards`: find catalog cards (`?query=&game=&page=&size=`) to correct them, and run or
 * follow catalog syncs.
 */
@Component({
  selector: 'app-admin-cards-page',
  imports: [
    RouterLink,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatSelectModule,
    EmptyStateComponent,
    ErrorStateComponent,
    PageHeaderComponent,
    SkeletonComponent,
    CatalogSyncPanelComponent,
  ],
  template: `
    <div class="admin-page">
      <app-page-header
        title="Cards"
        subtitle="Find a card to correct its data or printings, and import catalogs from providers."
      />

      <div class="admin-filters" role="search" aria-label="Find cards">
        <mat-form-field
          appearance="outline"
          class="admin-filters__search"
          subscriptSizing="dynamic"
        >
          <mat-label>Name, text or printing code</mat-label>
          <mat-icon matPrefix aria-hidden="true">search</mat-icon>
          <input
            matInput
            type="search"
            [value]="params().query ?? ''"
            [attr.maxlength]="maxLength"
            (input)="onSearch($event)"
          />
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Game</mat-label>
          <mat-select [value]="params().game ?? null" (selectionChange)="setGame($event.value)">
            <mat-option [value]="null">All games</mat-option>
            @for (game of games.games() ?? []; track game.slug) {
              <mat-option [value]="game.slug">{{ game.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </div>

      @if (error(); as error) {
        <app-error-state
          title="Cards could not load"
          [message]="errorMessage()"
          [requestId]="error.requestId"
          (retry)="reload()"
        />
      } @else if (loading() && !result()) {
        <div aria-busy="true">
          <span class="visually-hidden">Loading cards</span>
          <app-skeleton variant="list" lines="6" />
        </div>
      } @else if (result(); as page) {
        @if ((page.items ?? []).length === 0) {
          <app-empty-state
            icon="search_off"
            title="No cards match"
            description="Try another name, a printing code, or another game."
          />
        } @else {
          <p class="admin-count" aria-live="polite">
            {{ page.totalItems }} {{ page.totalItems === 1 ? 'card' : 'cards' }}
            @if (loading()) {
              · updating…
            }
          </p>
          <div class="cards__wrap" [class.admin-dim]="loading()">
            <table class="cards" aria-label="Catalog cards">
              <thead>
                <tr>
                  <th scope="col"><span class="visually-hidden">Picture</span></th>
                  <th scope="col">Card</th>
                  <th scope="col">Game</th>
                  <th scope="col" class="cards__opt">Type</th>
                  <th scope="col">Printings</th>
                  <th scope="col"><span class="visually-hidden">Public page</span></th>
                </tr>
              </thead>
              <tbody>
                @for (card of page.items ?? []; track card.id) {
                  <tr>
                    <td class="cards__thumb">
                      <img
                        [src]="card.primaryImageUrl"
                        alt=""
                        width="36"
                        height="50"
                        loading="lazy"
                      />
                    </td>
                    <td>
                      <a class="cards__name" [routerLink]="['/admin/cards', card.id]">
                        {{ card.name }}
                      </a>
                      <span class="cards__slug mono">{{ card.slug }}</span>
                    </td>
                    <td>{{ gameLabel(card.game) }}</td>
                    <td class="cards__opt">
                      {{ card.cardType }}
                      @if (card.subtype) {
                        · {{ card.subtype }}
                      }
                    </td>
                    <td>{{ card.printingCount }}</td>
                    <td>
                      <a
                        class="cards__public"
                        [routerLink]="['/cards', card.id]"
                        [attr.aria-label]="'Public page of ' + card.name"
                      >
                        <mat-icon aria-hidden="true">open_in_new</mat-icon>
                      </a>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <mat-paginator
            [length]="page.totalItems ?? 0"
            [pageIndex]="page.page ?? 0"
            [pageSize]="page.size ?? 20"
            [pageSizeOptions]="pageSizes"
            (page)="onPage($event)"
            aria-label="Card pages"
          />
        }
      }

      <app-catalog-sync-panel class="cards__sync" />
    </div>
  `,
  styleUrls: ['../shared/admin-page.scss'],
  styles: `
    .cards__wrap {
      overflow-x: auto;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
    }
    .cards {
      width: 100%;
      border-collapse: collapse;
      font-size: var(--font-size-sm);
    }
    .cards th,
    .cards td {
      padding: var(--spacing-2) var(--spacing-3);
      border-bottom: 1px solid var(--color-border);
      text-align: left;
    }
    .cards th {
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .cards tbody tr:last-child td {
      border-bottom: 0;
    }
    .cards__thumb img {
      display: block;
      width: 36px;
      height: 50px;
      border-radius: 3px;
      object-fit: cover;
      background: var(--color-surface-variant);
    }
    .cards__name {
      display: block;
      color: var(--color-ink);
      font-weight: var(--font-weight-semibold);
    }
    .cards__slug {
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .cards__public {
      display: inline-grid;
      place-items: center;
      color: var(--color-text-muted);
    }
    .cards__sync {
      margin-top: var(--spacing-8);
    }
    @media (max-width: 719px) {
      .cards__opt {
        display: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminCardsPageComponent {
  private readonly api = inject(CatalogService);
  private readonly router = inject(Router);
  protected readonly games = inject(GamesStore);

  readonly query = input<string | undefined>();
  readonly game = input<string | undefined>();
  readonly page = input<string | undefined>();
  readonly size = input<string | undefined>();

  protected readonly maxLength = QUERY_MAX_LENGTH;
  protected readonly pageSizes = PAGE_SIZE_OPTIONS;
  protected readonly result = signal<PageResponseCardSummary | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly errorMessage = computed(() => {
    const error = this.error();
    return error ? friendlyMessage(error) : '';
  });
  protected readonly params = computed<SearchCardsRequestParams>(() => {
    const size = toInt(this.size(), 20);
    return {
      query: this.query()?.trim().slice(0, QUERY_MAX_LENGTH) || undefined,
      game: this.game()?.trim() || undefined,
      page: toInt(this.page(), 0),
      size: PAGE_SIZE_OPTIONS.includes(size) ? size : 20,
    };
  });

  private readonly searches = new Subject<string>();
  private subscription: Subscription | null = null;

  constructor() {
    void this.games.load();
    effect(() => {
      const params = this.params();
      untracked(() => this.load(params));
    });
    this.searches
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((query) => this.navigate({ query: query.trim() || null, page: null }));
    inject(DestroyRef).onDestroy(() => this.subscription?.unsubscribe());
  }

  protected reload(): void {
    this.load(this.params());
  }

  protected gameLabel(slug: string | undefined): string {
    return gameInfo(slug ?? '').shortLabel;
  }

  protected onSearch(event: Event): void {
    this.searches.next((event.target as HTMLInputElement).value);
  }

  protected setGame(game: string | null): void {
    this.navigate({ game, page: null });
  }

  protected onPage(event: PageEvent): void {
    this.navigate({
      page: event.pageIndex || null,
      size: event.pageSize === 20 ? null : event.pageSize,
    });
  }

  private navigate(queryParams: Record<string, string | number | null>): void {
    void this.router.navigate([], { queryParams, queryParamsHandling: 'merge' });
  }

  private load(params: SearchCardsRequestParams): void {
    this.subscription?.unsubscribe();
    this.loading.set(true);
    this.error.set(null);
    this.subscription = this.api
      .searchCards(params, 'body', false, { context: silentErrors() })
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
}
