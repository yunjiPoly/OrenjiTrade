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
import { MatDialog } from '@angular/material/dialog';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { Router, RouterLink } from '@angular/router';
import {
  AdminListingsService,
  ListAdminListingsRequestParams,
  ListStaleListingsRequestParams,
} from '@orenji/api-client';
import {
  Observable,
  Subject,
  Subscription,
  debounceTime,
  distinctUntilChanged,
  firstValueFrom,
} from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { GamesStore } from '../../../shared/catalog/games.store';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { ToastService } from '../../../core/feedback/toast.service';
import { AdminIconComponent } from '../console/admin-icon.component';
import { runConsoleAction } from '../console/console-actions';
import { askReason, confirmAdminAction } from '../shared/admin-actions';
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
    AdminIconComponent,
    RouterLink,
    MatPaginatorModule,
    AdminListingRowsComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    SkeletonComponent,
  ],
  template: `
    <div class="cp">
      <header class="cp__head">
        <div class="cp__heading">
          <p class="cp__eyebrow">Collectors</p>
          <h1 class="cp__title">Listings</h1>
          <p class="cp__sub">
            Public cards collectors can find. Review stale and hidden ones, restore them for their
            owner, or hide listings that break the rules.
          </p>
        </div>
      </header>
      <nav class="cp-tabs" aria-label="Listing views">
        <a
          class="cp-tab"
          [attr.aria-current]="view() === 'review' ? 'page' : null"
          [attr.aria-selected]="view() === 'review'"
          [routerLink]="[]"
          [queryParams]="{ tab: null, state: null, page: null }"
          queryParamsHandling="merge"
          >Needs review
          @if (counts(); as c) {
            <span class="cp-badge" [class.cp-badge--hot]="c.STALE + c.HIDDEN > 0">{{
              c.STALE + c.HIDDEN
            }}</span>
          }
        </a>
        <a
          class="cp-tab"
          [attr.aria-current]="view() === 'all' ? 'page' : null"
          [attr.aria-selected]="view() === 'all'"
          [routerLink]="[]"
          [queryParams]="{ tab: 'all', state: null, page: null }"
          queryParamsHandling="merge"
          >All listings</a
        >
      </nav>

      @if (view() === 'review') {
        <div class="cp-filters li__review">
          <div class="cp-seg" role="group" aria-label="Freshness">
            @for (state of states(); track state) {
              <button
                type="button"
                class="cp-seg__btn"
                [attr.aria-pressed]="stateFilter() === state"
                (click)="navigate({ state: state === 'STALE' ? null : state })"
              >
                {{ stateLabel(state) }}
                @if (counts(); as c) {
                  <span class="cp-badge">{{ state === 'HIDDEN' ? c.HIDDEN : c.STALE }}</span>
                }
              </button>
            }
          </div>
          <p class="li__note">
            <app-admin-icon name="info" [size]="16" />
            Restore confirms a listing for its owner. Hide makes the card private when it breaks the
            rules.
          </p>
        </div>
      } @else {
        <div class="cp-filterbar" role="search" aria-label="Filter listings">
          <label class="cp-field cp-field--grow">
            <span class="visually-hidden">Search card or printing code</span>
            <span class="cp-search">
              <app-admin-icon name="search" [size]="16" />
              <input
                class="cp-input"
                type="search"
                placeholder="Search card or printing code"
                [value]="query() ?? ''"
                (input)="onSearch($event)"
              />
            </span>
          </label>
          <label class="cp-field">
            <span class="cp-field__label">Game</span>
            <select
              class="cp-select"
              (change)="navigate({ game: $any($event.target).value || null })"
            >
              <option value="" [selected]="!game()">Any game</option>
              @for (option of games.games(); track option.slug) {
                <option [value]="option.slug" [selected]="game() === option.slug">
                  {{ option.name }}
                </option>
              }
            </select>
          </label>
          <label class="cp-field">
            <span class="cp-field__label">Freshness</span>
            <select
              class="cp-select"
              (change)="navigate({ state: $any($event.target).value || null })"
            >
              <option value="" [selected]="!stateFilter()">Any state</option>
              @for (state of states(); track state) {
                <option [value]="state" [selected]="stateFilter() === state">
                  {{ stateLabel(state) }}
                </option>
              }
            </select>
          </label>
          @if (params().ownerId) {
            <button
              type="button"
              class="cb cb--outline li__owner"
              (click)="navigate({ ownerId: null })"
            >
              <app-admin-icon name="close" [size]="16" />
              One collector only
            </button>
          }
        </div>
      }

      @if (error(); as error) {
        <app-error-state
          title="Listings could not load"
          [message]="message(error)"
          [requestId]="error.requestId"
          retryLabel="Try again"
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
          <p class="cp-count" aria-live="polite">
            {{ countLine(page.total) }}
            @if (loading()) {
              · updating…
            }
          </p>
          <app-admin-listing-rows
            [class.ct--dim]="loading()"
            [rows]="page.items"
            [busy]="busy()"
            [label]="view() === 'review' ? 'Listings to review' : 'Listings'"
            (restore)="restore($event)"
            (hide)="hide($event)"
          />
          <div class="ct-pager">
            <span>{{ range(page.total, page.items.length) }}</span>
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
          </div>
        }
      }
    </div>
  `,
  styleUrls: [
    '../console/console-page.scss',
    '../console/console-controls.scss',
    '../console/console-table.scss',
  ],
  styles: `
    .cp-tab {
      text-decoration: none;
    }
    .li__review {
      align-items: center;
      gap: 16px;
    }
    .li__note {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0;
      color: var(--color-text-secondary);
      font-size: var(--font-size-sm);
    }
    .li__owner {
      align-self: flex-end;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminListingsPageComponent {
  private readonly api = inject(AdminListingsService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly toasts = inject(ToastService);
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

  /** The review queue's counts (board A9: "Needs review 41", Stale 35, Hidden 6). */
  protected readonly counts = signal<Record<'STALE' | 'HIDDEN', number> | null>(null);
  protected readonly result = signal<ListingPage | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly busy = signal<string | null>(null);

  private readonly searches = new Subject<string>();
  private subscription: Subscription | null = null;

  constructor() {
    void this.games.load();
    void this.loadCounts();
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

  /** "35 stale listings · not confirmed for 30 days, so out of search until restored · oldest first". */
  protected countLine(total: number): string {
    const n = total.toLocaleString('en-US');
    const noun = total === 1 ? 'listing' : 'listings';
    if (this.view() === 'review') {
      return this.stateFilter() === 'HIDDEN'
        ? `${n} hidden ${noun} · off search and the map until restored · oldest first`
        : `${n} stale ${noun} · out of search until restored · oldest first`;
    }
    return `${n} ${noun}`;
  }

  protected range(total: number, shown: number): string {
    if (!total) {
      return '';
    }
    const start = this.params().page * PAGE_SIZE + 1;
    return `${start}–${start + shown - 1} of ${total.toLocaleString('en-US')}`;
  }

  private async loadCounts(): Promise<void> {
    try {
      const [stale, hidden] = await Promise.all(
        (['STALE', 'HIDDEN'] as const).map((state) =>
          firstValueFrom(
            this.api.listStaleListings({ state, page: 0, size: 1 }, 'body', false, {
              context: silentErrors(),
            }),
          ),
        ),
      );
      this.counts.set({ STALE: stale.totalItems ?? 0, HIDDEN: hidden.totalItems ?? 0 });
    } catch {
      this.counts.set(null);
    }
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
    const done = await runConsoleAction(this.toasts, request, success);
    this.busy.set(null);
    if (done) {
      this.reload();
      void this.loadCounts();
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
