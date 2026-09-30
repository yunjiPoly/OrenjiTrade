import { HttpContext } from '@angular/common/http';
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
import { MatSelectChange, MatSelectModule } from '@angular/material/select';
import { Title } from '@angular/platform-browser';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import {
  PageResponsePublicInventoryItem,
  PublicBinderResponse,
  PublicBindersService,
} from '@orenji/api-client';
import { Subscription, debounceTime, distinctUntilChanged, filter, map } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { SessionService } from '../../core/auth/session.service';
import { ApiError, toApiError } from '../../core/http/api-error';
import { friendlyMessage } from '../../core/http/api-error-messages';
import { ATTACH_ID_TOKEN, SKIP_ERROR_TOAST } from '../../core/http/http-context';
import { APP_NAME } from '../../core/routing/orenji-title.strategy';
import { QUERY_MAX_LENGTH } from '../../shared/catalog/catalog-constants';
import { gameInfo } from '../../shared/domain/games';
import {
  INVENTORY_AVAILABILITIES,
  isInventoryAvailability,
} from '../../shared/inventory/inventory-labels';
import { PublicItemCardComponent } from '../../shared/inventory/public-item-card/public-item-card.component';
import { AVAILABILITIES } from '../../shared/ui/availability-chip/availability';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../shared/ui/error-state/error-state.component';
import { SkeletonComponent } from '../../shared/ui/skeleton/skeleton.component';
import { PublicBinderHeaderComponent } from './public-binder-header.component';

const PAGE_SIZE = 24;
const ALL = 'ALL';

/**
 * Public reads carry the collector's token when signed in: the API counts
 * `binder.views.per_day`, adds the distance bucket and keys rate limits by account.
 */
function publicContext(): HttpContext {
  return new HttpContext().set(ATTACH_ID_TOKEN, true).set(SKIP_ERROR_TOAST, true);
}

type BinderState =
  | { kind: 'loading' }
  | { kind: 'ready'; binder: PublicBinderResponse }
  | { kind: 'not-found' }
  | { kind: 'limit' }
  | { kind: 'error'; error: ApiError };

/**
 * `/binders/:id`: a public binder (`GET /public/binders/{id}` + its public items), open to
 * everyone. Game and availability filters and the search live in the URL. Only what the owner
 * made public is shown: never private notes, never coordinates (the owner block carries a region
 * label and a distance bucket).
 */
@Component({
  selector: 'app-public-binder-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatSelectModule,
    EmptyStateComponent,
    ErrorStateComponent,
    PublicBinderHeaderComponent,
    PublicItemCardComponent,
    SkeletonComponent,
  ],
  template: `
    <div class="page pbp">
      @switch (state().kind) {
        @case ('loading') {
          <div class="pbp__skeleton" aria-busy="true">
            <span class="visually-hidden">Loading the binder</span>
            <app-skeleton height="220px" />
            <div class="pbp__grid">
              @for (slot of skeletons; track slot) {
                <app-skeleton variant="card" />
              }
            </div>
          </div>
        }
        @case ('not-found') {
          <app-empty-state
            icon="menu_book"
            title="This binder is not available"
            description="It does not exist, is private, its publication ended, or its owner has to confirm it is still up to date."
          >
            <a actions matButton="filled" routerLink="/map">Back to the map</a>
          </app-empty-state>
        }
        @case ('limit') {
          <app-empty-state
            icon="speed"
            title="You reached today's binder views"
            description="Your plan limits how many public binders you can open per day. It resets tomorrow."
          >
            <a actions matButton="filled" routerLink="/premium">See plans</a>
          </app-empty-state>
        }
        @case ('error') {
          <app-error-state
            title="This binder could not load"
            [message]="errorMessage()"
            [requestId]="errorRequestId()"
            (retry)="load()"
          />
        }
        @case ('ready') {
          @if (binder(); as binder) {
            <app-public-binder-header [binder]="binder" [isOwn]="isOwn()" />

            <section class="pbp__items" aria-labelledby="pbp-items-title">
              <div class="pbp__bar">
                <h2 id="pbp-items-title" class="pbp__title">Cards in this binder</h2>
                <div class="pbp__filters" role="toolbar" aria-label="Binder filters">
                  @if (binder.games.length > 1) {
                    <div class="pbp__pills" role="group" aria-label="Game">
                      <button
                        type="button"
                        class="pbp__pill"
                        [attr.aria-pressed]="!game()"
                        (click)="setFilter('game', null)"
                      >
                        All games
                      </button>
                      @for (slug of binder.games; track slug) {
                        <button
                          type="button"
                          class="pbp__pill"
                          [attr.aria-pressed]="game() === slug"
                          (click)="setFilter('game', slug)"
                        >
                          {{ gameLabel(slug) }}
                        </button>
                      }
                    </div>
                  }
                  <mat-form-field
                    appearance="outline"
                    subscriptSizing="dynamic"
                    class="pbp__search"
                  >
                    <mat-label>Search this binder</mat-label>
                    <mat-icon matPrefix aria-hidden="true">search</mat-icon>
                    <input
                      matInput
                      type="search"
                      [formControl]="query"
                      [attr.maxlength]="maxLength"
                    />
                  </mat-form-field>
                  <mat-form-field
                    appearance="outline"
                    subscriptSizing="dynamic"
                    class="pbp__select"
                  >
                    <mat-label>Availability</mat-label>
                    <mat-select
                      [value]="availability() ?? all"
                      (selectionChange)="onAvailability($event)"
                    >
                      <mat-option [value]="all">Any availability</mat-option>
                      @for (value of availabilities; track value) {
                        <mat-option [value]="value">{{ availabilityInfo[value].label }}</mat-option>
                      }
                    </mat-select>
                  </mat-form-field>
                </div>
              </div>

              @if (itemsError(); as error) {
                <app-error-state
                  compact
                  title="The cards could not load"
                  [message]="itemsErrorMessage()"
                  (retry)="loadItems()"
                />
              } @else if (items(); as page) {
                @if ((page.items ?? []).length === 0) {
                  <app-empty-state
                    icon="search_off"
                    title="No cards match"
                    description="Try another game, availability or search."
                  />
                } @else {
                  <p class="pbp__count" aria-live="polite" data-testid="public-item-count">
                    {{ page.totalItems }} {{ page.totalItems === 1 ? 'card' : 'cards' }}
                  </p>
                  <ul class="pbp__grid" [class.pbp__dim]="itemsLoading()" aria-label="Public cards">
                    @for (item of page.items; track item.id) {
                      <li class="pbp__cell"><app-public-item-card [item]="item" /></li>
                    }
                  </ul>
                  @if ((page.totalPages ?? 0) > 1) {
                    <mat-paginator
                      class="pbp__paginator"
                      [length]="page.totalItems ?? 0"
                      [pageIndex]="page.page ?? 0"
                      [pageSize]="pageSize"
                      [hidePageSize]="true"
                      (page)="onPage($event)"
                      aria-label="Binder pages"
                    />
                  }
                }
              } @else {
                <div class="pbp__grid" aria-busy="true">
                  @for (slot of skeletons; track slot) {
                    <app-skeleton variant="card" />
                  }
                </div>
              }
            </section>
          }
        }
      }
    </div>
  `,
  styles: `
    .pbp {
      max-width: 1280px;
    }
    .pbp__skeleton {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-5);
    }
    .pbp__items {
      margin-top: var(--spacing-6);
    }
    .pbp__bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-3);
      margin-bottom: var(--spacing-4);
    }
    .pbp__title {
      font-size: var(--font-size-xl);
    }
    .pbp__filters {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--spacing-2) var(--spacing-3);
    }
    .pbp__pills {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-1);
    }
    .pbp__pill {
      padding: 6px var(--spacing-3);
      border: 1px solid var(--color-border-strong);
      border-radius: var(--radius-pill);
      background: var(--color-surface);
      color: var(--color-ink);
      font: inherit;
      font-size: var(--font-size-sm);
      cursor: pointer;
    }
    .pbp__pill[aria-pressed='true'] {
      border-color: var(--color-primary);
      background: var(--color-primary-container);
      color: var(--color-on-primary-container);
      font-weight: var(--font-weight-semibold);
    }
    .pbp__search {
      width: 240px;
    }
    .pbp__select {
      width: 190px;
    }
    .pbp__count {
      margin: 0 0 var(--spacing-3);
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .pbp__grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: var(--spacing-4);
      margin: 0;
      padding: 0;
      list-style: none;
      transition: opacity var(--motion-duration-fast) var(--motion-easing-standard);
    }
    .pbp__cell {
      min-width: 0;
    }
    .pbp__dim {
      opacity: 0.6;
    }
    .pbp__paginator {
      margin-top: var(--spacing-4);
      background: transparent;
    }
    @media (max-width: 599px) {
      .pbp__search,
      .pbp__select {
        width: 100%;
      }
      .pbp__grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--spacing-3);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicBinderPageComponent {
  private readonly api = inject(PublicBindersService);
  private readonly auth = inject(AuthService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly title = inject(Title);

  /** Route parameter and query parameters (bound by the router). */
  readonly id = input.required<string>();
  readonly game = input<string | undefined>();
  readonly availability = input<string | undefined>();
  readonly q = input<string | undefined>();
  readonly page = input<string | undefined>();

  protected readonly all = ALL;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly maxLength = QUERY_MAX_LENGTH;
  protected readonly availabilities = INVENTORY_AVAILABILITIES;
  protected readonly availabilityInfo = AVAILABILITIES;
  protected readonly skeletons = [0, 1, 2, 3, 4, 5];
  protected readonly query = new FormControl('', { nonNullable: true });

  protected readonly state = signal<BinderState>({ kind: 'loading' });
  protected readonly items = signal<PageResponsePublicInventoryItem | null>(null);
  protected readonly itemsLoading = signal(false);
  protected readonly itemsError = signal<ApiError | null>(null);
  protected readonly binder = computed(() => {
    const state = this.state();
    return state.kind === 'ready' ? state.binder : null;
  });
  protected readonly isOwn = computed(() => {
    const me = this.session.me();
    return !!me && this.binder()?.owner.id === me.id;
  });
  protected readonly errorMessage = computed(() => {
    const state = this.state();
    return state.kind === 'error' ? friendlyMessage(state.error) : '';
  });
  protected readonly errorRequestId = computed(() => {
    const state = this.state();
    return state.kind === 'error' ? state.error.requestId : null;
  });
  protected readonly itemsErrorMessage = computed(() => {
    const error = this.itemsError();
    return error ? friendlyMessage(error) : '';
  });
  private readonly filters = computed(() => {
    const availability = this.availability();
    const page = Number.parseInt(this.page() ?? '', 10);
    return {
      id: this.id(),
      game: this.game()?.trim().toLowerCase() || undefined,
      availability: isInventoryAvailability(availability) ? availability : undefined,
      query: (this.q() ?? '').trim().slice(0, QUERY_MAX_LENGTH) || undefined,
      page: Number.isFinite(page) && page > 0 ? Math.min(page, 10_000) : 0,
    };
  });

  private binderSubscription: Subscription | null = null;
  private itemsSubscription: Subscription | null = null;

  constructor() {
    effect(() => {
      this.id();
      untracked(() => void this.load());
    });
    effect(() => {
      const filters = this.filters();
      untracked(() => {
        if (this.state().kind === 'ready' && this.binder()?.id === filters.id) {
          this.loadItems();
        }
      });
    });
    effect(() => {
      const q = this.q() ?? '';
      untracked(() => {
        if (this.query.value.trim() !== q.trim()) {
          this.query.setValue(q, { emitEvent: false });
        }
      });
    });
    this.query.valueChanges
      .pipe(
        map((value) => value.trim().slice(0, QUERY_MAX_LENGTH)),
        debounceTime(300),
        distinctUntilChanged(),
        takeUntilDestroyed(),
      )
      .subscribe((q) => {
        if (q !== (this.q() ?? '').trim()) {
          this.navigate({ q: q || null, page: null }, true);
        }
      });
    // The title strategy resets the title on every navigation (filters): re-apply the name.
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => setTimeout(() => this.applyTitle()));
    inject(DestroyRef).onDestroy(() => {
      this.binderSubscription?.unsubscribe();
      this.itemsSubscription?.unsubscribe();
    });
  }

  protected async load(): Promise<void> {
    this.binderSubscription?.unsubscribe();
    this.state.set({ kind: 'loading' });
    this.items.set(null);
    await this.auth.ready();
    this.binderSubscription = this.api
      .getPublicBinder({ id: this.id() }, 'body', false, { context: publicContext() })
      .subscribe({
        next: (binder) => {
          this.state.set({ kind: 'ready', binder });
          this.applyTitle();
          this.loadItems();
        },
        error: (error: unknown) => {
          const apiError = toApiError(error);
          if (apiError.status === 404 || apiError.errorCode === 'VALIDATION_FAILED') {
            this.state.set({ kind: 'not-found' });
          } else if (apiError.errorCode === 'LIMIT_REACHED') {
            this.state.set({ kind: 'limit' });
          } else {
            this.state.set({ kind: 'error', error: apiError });
          }
        },
      });
  }

  protected loadItems(): void {
    this.itemsSubscription?.unsubscribe();
    this.itemsLoading.set(true);
    this.itemsError.set(null);
    const { id, game, availability, query, page } = this.filters();
    this.itemsSubscription = this.api
      .listPublicBinderItems(
        {
          id,
          game,
          query,
          availability,
          page,
          size: PAGE_SIZE,
        },
        'body',
        false,
        { context: publicContext() },
      )
      .subscribe({
        next: (items) => {
          this.items.set(items);
          this.itemsLoading.set(false);
        },
        error: (error: unknown) => {
          this.itemsError.set(toApiError(error));
          this.itemsLoading.set(false);
        },
      });
  }

  protected gameLabel(slug: string): string {
    return gameInfo(slug).shortLabel;
  }

  protected setFilter(key: 'game' | 'availability', value: string | null): void {
    this.navigate({ [key]: value, page: null });
  }

  protected onAvailability(event: MatSelectChange): void {
    const value = event.value as string;
    this.setFilter('availability', value === ALL ? null : value);
  }

  protected onPage(event: PageEvent): void {
    this.navigate({ page: event.pageIndex ? String(event.pageIndex) : null });
    globalThis.scrollTo?.({ top: 0, behavior: 'smooth' });
  }

  private navigate(queryParams: Record<string, string | null>, replaceUrl = false): void {
    void this.router.navigate([], { queryParams, queryParamsHandling: 'merge', replaceUrl });
  }

  private applyTitle(): void {
    const name = this.binder()?.name;
    if (name) {
      this.title.setTitle(`${name} · ${APP_NAME}`);
    }
  }
}
