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
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
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
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { listingStateLabel } from '../listings/admin-listing-rows.component';
import { AdminChipComponent, ChipTone } from '../shared/admin-chip.component';
import { askReason, runAdminAction } from '../shared/admin-actions';

const PAGE_SIZE = 20;
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
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatSelectModule,
    AdminChipComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    PageHeaderComponent,
    RelativeTimePipe,
    SkeletonComponent,
  ],
  template: `
    <div class="admin-page">
      <app-page-header
        title="Binders"
        subtitle="Binders collectors publish. Unpublish one that breaks the rules; the owner keeps every card."
      />
      <div class="admin-filters" role="search" aria-label="Filter binders">
        <mat-form-field
          appearance="outline"
          class="admin-filters__search"
          subscriptSizing="dynamic"
        >
          <mat-label>Search binder or owner</mat-label>
          <mat-icon matPrefix aria-hidden="true">search</mat-icon>
          <input matInput type="search" [value]="query() ?? ''" (input)="onSearch($event)" />
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Visibility</mat-label>
          <mat-select
            [value]="params().visibility ?? null"
            (selectionChange)="navigate({ visibility: $event.value })"
          >
            <mat-option [value]="null">Any visibility</mat-option>
            @for (value of visibilities; track value) {
              <mat-option [value]="value">{{ visibilityLabel(value) }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </div>

      @if (error(); as error) {
        <app-error-state
          title="Binders could not load"
          [message]="message(error)"
          [requestId]="error.requestId"
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
            description="Try another search or visibility."
          />
        } @else {
          <p class="admin-count" aria-live="polite">
            {{ page.totalItems }} {{ page.totalItems === 1 ? 'binder' : 'binders' }}
          </p>
          <ul class="binders" aria-label="Binders" [class.admin-dim]="loading()">
            @for (binder of page.items ?? []; track binder.id) {
              <li class="binder" [attr.data-binder]="binder.id">
                <span class="binder__icon" aria-hidden="true"><mat-icon>menu_book</mat-icon></span>
                <div class="binder__text">
                  <p class="binder__name">
                    @if (binder.effectivePublic) {
                      <a [routerLink]="['/binders', binder.id]">{{ binder.name }}</a>
                    } @else {
                      {{ binder.name }}
                    }
                  </p>
                  <p class="binder__meta">
                    {{ kindLabel(binder.kind) }} · {{ binder.itemCount }}
                    {{ binder.itemCount === 1 ? 'card' : 'cards' }} ·
                    <a [routerLink]="['/admin/users', binder.ownerId]"
                      >&#64;{{ binder.ownerHandle ?? 'unknown' }}</a
                    >
                    ·
                    <span [title]="binder.confirmedAt | date: 'medium'"
                      >confirmed {{ binder.confirmedAt | relativeTime }}</span
                    >
                  </p>
                </div>
                <div class="binder__chips">
                  <app-admin-chip [tone]="visibilityTone(binder)">{{
                    visibilityLabel(binder.visibility)
                  }}</app-admin-chip>
                  <app-admin-chip [tone]="freshnessTone(binder.freshnessState)">{{
                    freshnessLabel(binder.freshnessState)
                  }}</app-admin-chip>
                </div>
                @if (binder.visibility !== 'PRIVATE') {
                  <button
                    matButton
                    type="button"
                    class="binder__action"
                    [disabled]="busy() === binder.id"
                    [attr.aria-label]="'Unpublish ' + binder.name"
                    (click)="unpublish(binder)"
                  >
                    <mat-icon aria-hidden="true">unpublished</mat-icon>
                    Unpublish
                  </button>
                }
              </li>
            }
          </ul>
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
        }
      }
    </div>
  `,
  styleUrls: ['../shared/admin-page.scss'],
  styles: `
    .binders {
      margin: 0;
      padding: 0;
      list-style: none;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
    }
    .binder {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--spacing-2) var(--spacing-4);
      padding: var(--spacing-3) var(--spacing-4);
      border-bottom: 1px solid var(--color-border);
    }
    .binder:last-child {
      border-bottom: 0;
    }
    .binder__icon {
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      border-radius: var(--radius-md);
      background: var(--color-primary-container);
      color: var(--color-on-primary-container);
    }
    .binder__text {
      flex: 1 1 260px;
      min-width: 0;
    }
    .binder__text p {
      margin: 0;
    }
    .binder__name {
      font-weight: var(--font-weight-semibold);
    }
    .binder__meta {
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .binder__chips {
      display: flex;
      gap: var(--spacing-1);
    }
    .binder__action {
      color: var(--color-danger);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminBindersPageComponent {
  private readonly api = inject(AdminBindersService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  readonly query = input<string | undefined>();
  readonly visibility = input<string | undefined>();
  readonly page = input<string | undefined>();

  protected readonly pageSize = PAGE_SIZE;
  protected readonly visibilities = VISIBILITIES;
  protected readonly freshnessLabel = listingStateLabel;
  protected readonly params = computed<ListAdminBindersRequestParams>(() => ({
    query: this.query()?.trim() || undefined,
    visibility: (VISIBILITIES as readonly string[]).includes(this.visibility() ?? '')
      ? (this.visibility() as ListAdminBindersRequestParams['visibility'])
      : undefined,
    page: toPage(this.page()),
    size: PAGE_SIZE,
  }));
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
    const done = await runAdminAction(
      this.snackBar,
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
        },
        error: (error: unknown) => {
          this.error.set(toApiError(error));
          this.loading.set(false);
        },
      });
  }
}
