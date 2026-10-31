import { DatePipe } from '@angular/common';
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
  AdminBinder,
  AdminBindersService,
  ListAdminBindersRequestParams,
  PageResponseAdminBinder,
} from '@orenji/api-client';
import { Subject, Subscription, debounceTime, distinctUntilChanged } from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { listingStateLabel } from '../listings/admin-listing-rows.component';
import { AdminChipComponent, ChipTone } from '../shared/admin-chip.component';
import { askReason } from '../shared/admin-actions';
import { ToastService } from '../../../core/feedback/toast.service';
import { AdminIconComponent } from '../console/admin-icon.component';
import { runConsoleAction } from '../console/console-actions';
import { gameName } from '../console/console-labels';
import { GameBadgeComponent } from '../console/game-badge.component';

const PAGE_SIZE = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VISIBILITIES = ['PUBLIC', 'TEMPORARILY_PUBLIC', 'PRIVATE'] as const;
const VISIBILITY_LABELS: Record<string, string> = {
  PUBLIC: 'Public',
  TEMPORARILY_PUBLIC: 'Temporarily public',
  PRIVATE: 'Private',
};
const KIND_LABELS: Record<string, string> = {
  COLLECTION: 'Collection',
  TRADE: 'Trade',
  SALE: 'Sale',
  DECK: 'Deck',
  CUSTOM: 'Custom',
};

function toPage(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

/**
 * `/admin/binders` (administrators): every binder with its owner, visibility and freshness,
 * searchable by name or owner and filtered by visibility (`?query=&visibility=&page=`). Unpublish
 * makes a binder private with a reason for the audit log.
 */
@Component({
  selector: 'app-admin-binders-page',
  imports: [
    DatePipe,
    RouterLink,
    MatPaginatorModule,
    RelativeTimePipe,
    AdminChipComponent,
    AdminIconComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    GameBadgeComponent,
    SkeletonComponent,
  ],
  template: `
    <div class="cp">
      <header class="cp__head">
        <div class="cp__heading">
          <p class="cp__eyebrow">Collectors</p>
          <h1 class="cp__title">Binders</h1>
          <p class="cp__sub">
            Binders and deck cores collectors publish. Unpublish one that breaks the rules; the
            owner keeps every card.
          </p>
        </div>
      </header>
      <div class="cp-filterbar" role="search" aria-label="Filter binders">
        <label class="cp-field cp-field--grow">
          <span class="cp-field__label">Search</span>
          <span class="cp-search">
            <app-admin-icon name="search" [size]="16" />
            <input
              class="cp-input"
              type="search"
              placeholder="Binder name"
              [value]="query() ?? ''"
              (input)="onSearch($event)"
            />
          </span>
        </label>
        <label class="cp-field">
          <span class="cp-field__label">Visibility</span>
          <select
            class="cp-select"
            (change)="navigate({ visibility: $any($event.target).value || null })"
          >
            <option value="" [selected]="!params().visibility">Any visibility</option>
            @for (value of visibilities; track value) {
              <option [value]="value" [selected]="params().visibility === value">
                {{ visibilityLabel(value) }}
              </option>
            }
          </select>
        </label>
        <label class="cp-field">
          <span class="cp-field__label">Kind</span>
          <select
            class="cp-select"
            (change)="navigate({ kind: $any($event.target).value || null })"
          >
            <option value="" [selected]="!kindFilter()">Any kind</option>
            <option value="binder" [selected]="kindFilter() === 'binder'">Binder</option>
            <option value="deck" [selected]="kindFilter() === 'deck'">Deck core</option>
          </select>
        </label>
        <label class="cp-field">
          <span class="cp-field__label">Owner</span>
          <select
            class="cp-select"
            (change)="navigate({ ownerId: $any($event.target).value || null })"
          >
            <option value="" [selected]="!params().ownerId">Anyone</option>
            @for (owner of owners(); track owner.id) {
              <option [value]="owner.id" [selected]="params().ownerId === owner.id">
                &#64;{{ owner.handle }}
              </option>
            }
          </select>
        </label>
      </div>

      @if (error(); as error) {
        <app-error-state
          title="Binders could not load"
          [message]="message(error)"
          [requestId]="error.requestId"
          retryLabel="Try again"
          (retry)="reload()"
        />
      } @else if (loading() && !result()) {
        <div aria-busy="true">
          <span class="visually-hidden">Loading binders</span>
          <app-skeleton variant="list" lines="6" />
        </div>
      } @else if (result(); as page) {
        @if ((page.items ?? []).length === 0) {
          <app-empty-state
            icon="menu_book"
            title="No binders match"
            description="Try another search, visibility, kind or owner."
          />
        } @else {
          <p class="cp-count" aria-live="polite">
            {{ (page.totalItems ?? 0).toLocaleString('en-US') }}
            {{ page.totalItems === 1 ? 'binder' : 'binders' }} · recently changed first
            @if (loading()) {
              · updating…
            }
          </p>
          <div class="ct ct--actions" [class.ct--dim]="loading()">
            <table class="bt" aria-label="Binders">
              <thead>
                <tr>
                  <th scope="col">Binder</th>
                  <th scope="col">Kind</th>
                  <th scope="col">Owner</th>
                  <th scope="col">Last confirmed</th>
                  <th scope="col">Visibility</th>
                  <th scope="col">Freshness</th>
                  <th scope="col"><span class="visually-hidden">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                @for (binder of page.items ?? []; track binder.id) {
                  <tr [attr.data-binder]="binder.id">
                    <td>
                      <span class="bt__name">
                        <app-game-badge [game]="binder.game" size="sm" />
                        <span>
                          @if (binder.effectivePublic) {
                            <a class="ct__name" [routerLink]="['/binders', binder.id]">{{
                              binder.name
                            }}</a>
                          } @else {
                            <span class="ct__name">{{ binder.name }}</span>
                          }
                          <span class="ct__sub"
                            >{{ gameLabel(binder.game) }} · {{ binder.itemCount }}
                            {{ binder.itemCount === 1 ? 'card' : 'cards' }}</span
                          >
                        </span>
                      </span>
                    </td>
                    <td>
                      @if (binder.kind === 'DECK') {
                        <span class="cp-chip bt__deck">Deck core</span>
                      } @else {
                        Binder
                        <span class="ct__sub">{{ kindLabel(binder.kind) }}</span>
                      }
                    </td>
                    <td>
                      <a class="bt__owner" [routerLink]="['/admin/users', binder.ownerId]"
                        >&#64;{{ binder.ownerHandle ?? 'unknown' }}</a
                      >
                    </td>
                    <td>
                      @if (binder.visibility === 'PRIVATE') {
                        <span class="cp-muted">—</span>
                      } @else {
                        <span [title]="binder.confirmedAt | date: 'medium'"
                          >Confirmed {{ binder.confirmedAt | relativeTime }}</span
                        >
                        @if (binder.freshnessState === 'STALE') {
                          <span class="ct__sub">Out of search</span>
                        } @else if (binder.freshnessState === 'HIDDEN') {
                          <span class="ct__sub">Off search and the map</span>
                        }
                      }
                    </td>
                    <td>
                      <app-admin-chip [tone]="visibilityTone(binder)">{{
                        visibilityLabel(binder.visibility)
                      }}</app-admin-chip>
                    </td>
                    <td>
                      @if (binder.visibility === 'PRIVATE') {
                        <span class="cp-muted">Not listed</span>
                      } @else {
                        <app-admin-chip [tone]="freshnessTone(binder.freshnessState)">{{
                          freshnessLabel(binder.freshnessState)
                        }}</app-admin-chip>
                      }
                    </td>
                    <td class="bt__actions">
                      @if (binder.visibility !== 'PRIVATE') {
                        <button
                          type="button"
                          class="cb cb--quiet cb--small bt__unpublish"
                          [attr.aria-disabled]="busy() === binder.id ? 'true' : null"
                          [attr.aria-label]="'Unpublish ' + binder.name"
                          (click)="busy() === binder.id || unpublish(binder)"
                        >
                          Unpublish
                        </button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div class="ct-pager">
            <span>{{ range() }}</span>
            @if ((page.totalItems ?? 0) > pageSize) {
              <mat-paginator
                [length]="page.totalItems ?? 0"
                [pageIndex]="page.page ?? 0"
                [pageSize]="pageSize"
                [hidePageSize]="true"
                aria-label="Binder pages"
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
    .bt {
      min-width: 980px;
    }
    .bt__name {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .bt__deck {
      background: color-mix(in srgb, var(--color-deck-core, #a78bfa) 18%, transparent);
      color: light-dark(#6d28d9, #c4b5fd);
    }
    .bt__owner {
      color: var(--color-accent);
      font-weight: var(--font-weight-semibold);
      text-decoration: none;
    }
    .bt__owner:hover {
      text-decoration: underline;
    }
    .bt__actions {
      text-align: right;
    }
    .bt__unpublish {
      color: var(--app-danger-text);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminBindersPageComponent {
  private readonly api = inject(AdminBindersService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly toasts = inject(ToastService);

  readonly query = input<string | undefined>();
  readonly visibility = input<string | undefined>();
  readonly kind = input<string | undefined>();
  readonly ownerId = input<string | undefined>();
  readonly page = input<string | undefined>();

  protected readonly pageSize = PAGE_SIZE;
  protected readonly visibilities = VISIBILITIES;
  protected readonly freshnessLabel = listingStateLabel;
  /** Kind: a binder (every kind but DECK) or a deck core (the API's `deckCore`). */
  protected readonly kindFilter = computed<'binder' | 'deck' | null>(() =>
    this.kind() === 'deck' ? 'deck' : this.kind() === 'binder' ? 'binder' : null,
  );
  protected readonly params = computed<ListAdminBindersRequestParams>(() => ({
    query: this.query()?.trim() || undefined,
    visibility: (VISIBILITIES as readonly string[]).includes(this.visibility() ?? '')
      ? (this.visibility() as ListAdminBindersRequestParams['visibility'])
      : undefined,
    deckCore: this.kindFilter() === null ? undefined : this.kindFilter() === 'deck',
    ownerId: UUID.test(this.ownerId() ?? '') ? this.ownerId() : undefined,
    page: toPage(this.page()),
    size: PAGE_SIZE,
  }));
  /** "1–20 of 59" (board A10). */
  protected readonly range = computed(() => {
    const page = this.result();
    const total = page?.totalItems ?? 0;
    if (!page || !total) {
      return '';
    }
    const start = (page.page ?? 0) * PAGE_SIZE + 1;
    return `${start}–${start + (page.items ?? []).length - 1} of ${total.toLocaleString('en-US')}`;
  });
  /**
   * The Owner filter's people (the API's `ownerId`): the owners on the pages read, by @handle
   * (never an id), the filtered one kept.
   */
  protected readonly owners = signal<{ id: string; handle: string }[]>([]);
  protected readonly result = signal<PageResponseAdminBinder | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly busy = signal<string | null>(null);

  private readonly searches = new Subject<string>();
  private subscription: Subscription | null = null;

  constructor() {
    effect(() => {
      const params = this.params();
      untracked(() => this.load(params));
    });
    this.searches
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((query) => this.navigate({ query: query.trim() || null }));
    inject(DestroyRef).onDestroy(() => this.subscription?.unsubscribe());
  }

  protected visibilityLabel(value: string): string {
    return VISIBILITY_LABELS[value] ?? value;
  }

  protected gameLabel(slug: string): string {
    return gameName(slug) ?? slug;
  }

  protected kindLabel(value: string): string {
    return KIND_LABELS[value] ?? value;
  }

  protected visibilityTone(binder: AdminBinder): ChipTone {
    if (binder.visibility === 'PRIVATE') {
      return 'neutral';
    }
    return binder.effectivePublic ? 'success' : 'warning';
  }

  protected freshnessTone(state: string): ChipTone {
    return state === 'ACTIVE'
      ? 'success'
      : state === 'AGING'
        ? 'warning'
        : state === 'STALE'
          ? 'danger'
          : 'neutral';
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

  protected async unpublish(binder: AdminBinder): Promise<void> {
    const answer = await askReason(this.dialog, {
      title: `Unpublish “${binder.name}”?`,
      message:
        `The binder of @${binder.ownerHandle ?? 'this collector'} becomes private. Its cards stay ` +
        'in the owner’s inventory; they can publish it again once it follows the rules.',
      confirmLabel: 'Unpublish binder',
      tone: 'danger',
    });
    if (!answer) {
      return;
    }
    this.busy.set(binder.id);
    const done = await runConsoleAction(
      this.toasts,
      this.api.unpublishBinderAsAdmin(
        { id: binder.id, unpublishBinderRequest: { reason: answer.reason } },
        'body',
        false,
        { context: silentErrors() },
      ),
      `“${binder.name}” is unpublished.`,
      'This binder is already private.',
    );
    this.busy.set(null);
    if (done) {
      this.reload();
    }
  }

  private rememberOwners(binders: AdminBinder[]): void {
    const known = new Map(this.owners().map((owner) => [owner.id, owner]));
    for (const binder of binders) {
      if (binder.ownerHandle && !known.has(binder.ownerId)) {
        known.set(binder.ownerId, { id: binder.ownerId, handle: binder.ownerHandle });
      }
    }
    this.owners.set([...known.values()].sort((a, b) => a.handle.localeCompare(b.handle)));
  }

  private load(params: ListAdminBindersRequestParams): void {
    this.subscription?.unsubscribe();
    this.loading.set(true);
    this.error.set(null);
    this.subscription = this.api
      .listAdminBinders(params, 'body', false, { context: silentErrors() })
      .subscribe({
        next: (result) => {
          this.result.set(result);
          this.loading.set(false);
          this.rememberOwners(result.items ?? []);
        },
        error: (error: unknown) => {
          this.error.set(toApiError(error));
          this.loading.set(false);
        },
      });
  }
}
