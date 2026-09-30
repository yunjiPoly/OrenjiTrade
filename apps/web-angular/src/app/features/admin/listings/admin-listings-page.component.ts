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
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { Router, RouterLink } from '@angular/router';
import {
  AdminListingsService,
  ListAdminListingsRequestParams,
  ListStaleListingsRequestParams,
} from '@orenji/api-client';
import { Observable, Subject, Subscription, debounceTime, distinctUntilChanged } from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { GamesStore } from '../../../shared/catalog/games.store';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { askReason, confirmAdminAction, runAdminAction } from '../shared/admin-actions';
import {
  AdminListingRowsComponent,
  ListingRow,
  listingStateLabel,
} from './admin-listing-rows.component';

const PAGE_SIZE = 20;
const STATES = ['ACTIVE', 'AGING', 'STALE', 'HIDDEN'] as const;
type ListingState = (typeof STATES)[number];
type Tab = 'review' | 'all';

interface ListingParams {
  tab: Tab;
  state: ListingState | null;
  query: string | undefined;
  game: string | undefined;
  ownerId: string | undefined;
  page: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ListingPage {
  items: ListingRow[];
  total: number;
}

function toPage(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

/**
 * `/admin/listings` (administrators): the review queue of stale and hidden public listings
 * (`GET /admin/listings/stale`, oldest confirmation first) and a search over every published
 * listing (`GET /admin/listings?query=&state=&game=`). Restore confirms a listing on the owner's
 * behalf; Hide makes it private with a reason. State lives in the URL
 * (`?tab=all&state=&query=&game=&page=`).
 */
@Component({
  selector: 'app-admin-listings-page',
  imports: [
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatSelectModule,
    MatTabsModule,
    AdminListingRowsComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    PageHeaderComponent,
    SkeletonComponent,
  ],
  template: `
    <div class="admin-page">
      <app-page-header
        title="Listings"
        subtitle="Public cards collectors can find. Review stale and hidden ones, restore them for their owner, or hide listings that break the rules."
      />
      <nav mat-tab-nav-bar [tabPanel]="panel" aria-label="Listing views">
        <a
          mat-tab-link
          [active]="view() === 'review'"
          [routerLink]="[]"
          [queryParams]="{ tab: null, state: null, page: null }"
          queryParamsHandling="merge"
          >Needs review</a
        >
        <a
          mat-tab-link
          [active]="view() === 'all'"
          [routerLink]="[]"
          [queryParams]="{ tab: 'all', state: null, page: null }"
          queryParamsHandling="merge"
          >All listings</a
        >
      </nav>
      <mat-tab-nav-panel #panel>
        <div class="admin-filters listings__filters" role="search" aria-label="Filter listings">
          @if (view() === 'all') {
            <mat-form-field
              appearance="outline"
              class="admin-filters__search"
              subscriptSizing="dynamic"
            >
              <mat-label>Search card or printing code</mat-label>
              <mat-icon matPrefix aria-hidden="true">search</mat-icon>
              <input matInput type="search" [value]="query() ?? ''" (input)="onSearch($event)" />
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Game</mat-label>
              <mat-select
                [value]="game() ?? null"
                (selectionChange)="navigate({ game: $event.value })"
              >
                <mat-option [value]="null">Any game</mat-option>
                @for (option of games.games(); track option.slug) {
                  <mat-option [value]="option.slug">{{ option.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          }
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Freshness</mat-label>
            <mat-select
              [value]="stateFilter()"
              (selectionChange)="navigate({ state: $event.value })"
            >
              @if (view() === 'all') {
                <mat-option [value]="null">Any state</mat-option>
              }
              @for (state of states(); track state) {
                <mat-option [value]="state">{{ stateLabel(state) }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          @if (params().ownerId) {
            <button
              matButton="tonal"
              type="button"
              class="listings__owner"
              (click)="navigate({ ownerId: null })"
            >
              <mat-icon aria-hidden="true">close</mat-icon>
              One collector only
            </button>
          }
        </div>

        @if (error(); as error) {
          <app-error-state
            title="Listings could not load"
            [message]="message(error)"
            [requestId]="error.requestId"
            (retry)="reload()"
          />
        } @else if (loading() && !result()) {
          <div aria-busy="true">
            <span class="visually-hidden">Loading listings</span>
            <app-skeleton variant="list" lines="6" />
          </div>
        } @else if (result(); as page) {
          @if (page.items.length === 0) {
            <app-empty-state
              [icon]="view() === 'review' ? 'task_alt' : 'style'"
              [title]="view() === 'review' ? 'Nothing to review' : 'No listings match'"
              [description]="
                view() === 'review'
                  ? 'No public listing is ' +
                    stateLabel(stateFilter() ?? 'STALE').toLowerCase() +
                    ' right now.'
                  : 'Try another search or clear the filters.'
              "
            />
          } @else {
            <p class="admin-count" aria-live="polite">
              {{ page.total }} {{ page.total === 1 ? 'listing' : 'listings' }}
              @if (loading()) {
                · updating…
              }
            </p>
            <app-admin-listing-rows
              [class.admin-dim]="loading()"
              [rows]="page.items"
              [busy]="busy()"
              [label]="view() === 'review' ? 'Listings to review' : 'Listings'"
              (restore)="restore($event)"
              (hide)="hide($event)"
            />
            @if (page.total > pageSize) {
              <mat-paginator
                [length]="page.total"
                [pageIndex]="params().page"
                [pageSize]="pageSize"
                [hidePageSize]="true"
                aria-label="Listing pages"
                (page)="onPage($event)"
              />
            }
          }
        }
      </mat-tab-nav-panel>
    </div>
  `,
  styleUrls: ['../shared/admin-page.scss'],
  styles: `
    .listings__filters {
      margin-top: var(--spacing-4);
    }
    .listings__owner {
      align-self: center;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminListingsPageComponent {
  private readonly api = inject(AdminListingsService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly games = inject(GamesStore);

  /** Query parameters (bound by the router). */
  readonly tab = input<string | undefined>();
  readonly state = input<string | undefined>();
  readonly query = input<string | undefined>();
  readonly game = input<string | undefined>();
  readonly ownerId = input<string | undefined>();
  readonly page = input<string | undefined>();

  protected readonly pageSize = PAGE_SIZE;
  protected readonly stateLabel = listingStateLabel;
  protected readonly view = computed<Tab>(() => (this.tab() === 'all' ? 'all' : 'review'));
  protected readonly states = computed<readonly ListingState[]>(() =>
    this.view() === 'review' ? ['STALE', 'HIDDEN'] : STATES,
  );
  protected readonly stateFilter = computed<ListingState | null>(() => {
    const state = this.state() as ListingState | undefined;
    if (state && this.states().includes(state)) {
      return state;
    }
    return this.view() === 'review' ? 'STALE' : null;
  });
  protected readonly params = computed<ListingParams>(() => ({
    tab: this.view(),
    state: this.stateFilter(),
    query: this.view() === 'all' ? this.query()?.trim() || undefined : undefined,
    game: this.view() === 'all' ? this.game() || undefined : undefined,
    ownerId: this.view() === 'all' && UUID.test(this.ownerId() ?? '') ? this.ownerId() : undefined,
    page: toPage(this.page()),
  }));

  protected readonly result = signal<ListingPage | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly busy = signal<string | null>(null);

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
      .subscribe((query) => this.navigate({ query: query.trim() || null }));
    inject(DestroyRef).onDestroy(() => this.subscription?.unsubscribe());
  }

  protected navigate(changes: Record<string, string | null>): void {
    void this.router.navigate([], {
      queryParams: { ...changes, page: null },
      queryParamsHandling: 'merge',
    });
  }

  protected onSearch(event: Event): void {
    this.searches.next((event.target as HTMLInputElement).value);
  }

  protected onPage(event: PageEvent): void {
    void this.router.navigate([], {
      queryParams: { page: event.pageIndex || null },
      queryParamsHandling: 'merge',
    });
  }

  protected message(error: ApiError): string {
    return friendlyMessage(error);
  }

  protected reload(): void {
    this.load(this.params());
  }

  protected async restore(row: ListingRow): Promise<void> {
    const confirmed = await confirmAdminAction(this.dialog, {
      title: `Restore ${row.item.cardName}?`,
      message:
        `The listing of @${row.owner.handle} is confirmed on their behalf: it becomes fresh ` +
        'and visible again wherever its visibility allows.',
      confirmLabel: 'Restore listing',
    });
    if (!confirmed) {
      return;
    }
    await this.act(
      row,
      this.api.restoreListing({ itemId: row.item.id }, 'body', false, {
        context: silentErrors(),
      }),
      `${row.item.cardName} is restored.`,
    );
  }

  protected async hide(row: ListingRow): Promise<void> {
    const answer = await askReason(this.dialog, {
      title: `Hide ${row.item.cardName}?`,
      message:
        `The card becomes private in @${row.owner.handle}'s inventory. They can publish it again ` +
        'once it follows the rules.',
      confirmLabel: 'Hide listing',
      tone: 'danger',
    });
    if (!answer) {
      return;
    }
    await this.act(
      row,
      this.api.hideListing(
        { itemId: row.item.id, hideListingRequest: { reason: answer.reason } },
        'body',
        false,
        { context: silentErrors() },
      ),
      `${row.item.cardName} is hidden.`,
    );
  }

  private async act(row: ListingRow, request: Observable<unknown>, success: string): Promise<void> {
    this.busy.set(row.item.id);
    const done = await runAdminAction(this.snackBar, request, success);
    this.busy.set(null);
    if (done) {
      this.reload();
    }
  }

  private load(params: ListingParams): void {
    this.subscription?.unsubscribe();
    this.loading.set(true);
    this.error.set(null);
    const common = { page: params.page, size: PAGE_SIZE };
    const request: Observable<{ items?: ListingRow[]; totalItems?: number }> =
      params.tab === 'review'
        ? this.api.listStaleListings(
            {
              ...common,
              state: (params.state ?? 'STALE') as ListStaleListingsRequestParams['state'],
            },
            'body',
            false,
            { context: silentErrors() },
          )
        : this.api.listAdminListings(
            {
              ...common,
              ...(params.state
                ? { state: params.state as ListAdminListingsRequestParams['state'] }
                : {}),
              ...(params.query ? { query: params.query } : {}),
              ...(params.game ? { game: params.game } : {}),
              ...(params.ownerId ? { ownerId: params.ownerId } : {}),
            },
            'body',
            false,
            { context: silentErrors() },
          );
    this.subscription = request.subscribe({
      next: (page) => {
        this.result.set({ items: page.items ?? [], total: page.totalItems ?? 0 });
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(toApiError(error));
        this.loading.set(false);
      },
    });
  }
}
