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
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import {
  AdminRating,
  AdminRatingsService,
  ListAdminRatingsRequestParams,
  PageResponseAdminRating,
} from '@orenji/api-client';
import { Observable, Subscription } from 'rxjs';
import { SessionService } from '../../../core/auth/session.service';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';
import { breakdownEntries, interactionKindLabel } from '../../../shared/ratings/rating-labels';
import { StarRatingComponent } from '../../../shared/ratings/star-rating.component';
import { AvatarComponent } from '../../../shared/ui/avatar/avatar.component';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { AdminChipComponent } from '../shared/admin-chip.component';
import { askReason, confirmAdminAction, runAdminAction } from '../shared/admin-actions';

const PAGE_SIZE = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATES = [
  { value: null, label: 'All' },
  { value: 'OK', label: 'Visible' },
  { value: 'HIDDEN', label: 'Hidden' },
] as const;

function toPage(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

/**
 * `/admin/ratings` (moderators and admins): ratings newest first, filtered by state and by rated
 * collector (`?state=&rateeId=&page=`). Hiding needs a reason and removes the rating from the
 * profile and its summary; restoring shows it again. Both are audited.
 */
@Component({
  selector: 'app-admin-ratings-page',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatPaginatorModule,
    AdminChipComponent,
    AvatarComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    PageHeaderComponent,
    RelativeTimePipe,
    SkeletonComponent,
    StarRatingComponent,
  ],
  template: `
    <div class="admin-page">
      <app-page-header
        title="Ratings"
        subtitle="Ratings collectors leave after trades, accepted offers and real conversations. Hide the ones that break the Community Guidelines."
      />
      <div class="admin-filters ratings__filters">
        <div class="pills" role="group" aria-label="Rating state">
          @for (option of states; track option.label) {
            <button
              type="button"
              class="pill"
              [class.pill--on]="params().state === (option.value ?? undefined)"
              [attr.aria-pressed]="params().state === (option.value ?? undefined)"
              (click)="navigate({ state: option.value })"
            >
              {{ option.label }}
            </button>
          }
        </div>
        @if (params().rateeId) {
          <button matButton="tonal" type="button" (click)="navigate({ rateeId: null })">
            <mat-icon aria-hidden="true">close</mat-icon>
            One collector only
          </button>
        }
      </div>

      @if (error(); as error) {
        <app-error-state
          title="Ratings could not load"
          [message]="message(error)"
          [requestId]="error.requestId"
          (retry)="reload()"
        />
      } @else if (loading() && !result()) {
        <div aria-busy="true">
          <span class="visually-hidden">Loading ratings</span>
          <app-skeleton variant="list" lines="6" />
        </div>
      } @else if (result(); as page) {
        @if ((page.items ?? []).length === 0) {
          <app-empty-state
            icon="star_outline"
            title="No ratings match"
            description="Change the filter to see other ratings."
          />
        } @else {
          <p class="admin-count" aria-live="polite">
            {{ page.totalItems }} {{ page.totalItems === 1 ? 'rating' : 'ratings' }}
          </p>
          <ul class="ratings" aria-label="Ratings" [class.admin-dim]="loading()">
            @for (entry of page.items ?? []; track entry.rating.id) {
              @let r = entry.rating;
              <li
                class="rating"
                [class.rating--hidden]="entry.moderationState === 'HIDDEN'"
                [attr.data-rating]="r.id"
              >
                <app-avatar
                  size="sm"
                  [src]="r.rater.avatarUrl"
                  [name]="r.rater.displayName"
                  [decorative]="true"
                />
                <div class="rating__text">
                  <p class="rating__head">
                    <app-star-rating [value]="r.overall" size="sm" />
                    <strong>{{ r.rater.displayName }}</strong>
                    <span class="admin-muted">&#64;{{ r.rater.handle }}</span>
                    <span class="admin-muted">rated</span>
                    <a
                      [routerLink]="[]"
                      [queryParams]="{ rateeId: entry.rateeId, page: null }"
                      queryParamsHandling="merge"
                    >
                      collector {{ entry.rateeId.slice(0, 8) }}
                    </a>
                    @if (session.isAdmin()) {
                      <a [routerLink]="['/admin/users', entry.rateeId]" class="admin-muted"
                        >account</a
                      >
                    }
                    <span class="admin-muted">· {{ kind(r.interactionKind) }}</span>
                    <span class="admin-muted" [title]="r.createdAt | date: 'medium'">
                      · {{ r.createdAt | relativeTime }}
                    </span>
                  </p>
                  @if (r.comment) {
                    <p class="rating__comment">{{ r.comment }}</p>
                  }
                  @if (criteria(entry); as list) {
                    @if (list.length) {
                      <p class="admin-muted">
                        @for (item of list; track item.label; let last = $last) {
                          {{ item.label }} {{ item.value }}/5{{ last ? '' : ' · ' }}
                        }
                      </p>
                    }
                  }
                  @if (entry.moderationState === 'HIDDEN') {
                    <p class="rating__hidden">
                      <app-admin-chip tone="neutral">Hidden</app-admin-chip>
                      @if (entry.hiddenReason) {
                        “{{ entry.hiddenReason }}”
                      }
                      @if (entry.hiddenAt) {
                        · {{ entry.hiddenAt | relativeTime }}
                      }
                    </p>
                  }
                </div>
                @if (entry.moderationState === 'HIDDEN') {
                  <button
                    matButton="outlined"
                    type="button"
                    [disabled]="busy() === r.id"
                    [attr.aria-label]="'Restore the rating by ' + r.rater.displayName"
                    (click)="unhide(entry)"
                  >
                    <mat-icon aria-hidden="true">visibility</mat-icon>
                    Restore
                  </button>
                } @else {
                  <button
                    matButton
                    type="button"
                    class="rating__hide"
                    [disabled]="busy() === r.id"
                    [attr.aria-label]="'Hide the rating by ' + r.rater.displayName"
                    (click)="hide(entry)"
                  >
                    <mat-icon aria-hidden="true">visibility_off</mat-icon>
                    Hide
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
              aria-label="Rating pages"
              (page)="onPage($event)"
            />
          }
        }
      }
    </div>
  `,
  styleUrls: ['../shared/admin-page.scss'],
  styles: `
    .ratings__filters {
      align-items: center;
    }
    .pills {
      display: flex;
      gap: var(--spacing-1);
    }
    .pill {
      padding: 4px var(--spacing-3);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-pill);
      background: var(--color-surface);
      color: var(--color-text-muted);
      font: inherit;
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
      cursor: pointer;
    }
    .pill--on {
      border-color: var(--color-primary);
      background: var(--color-primary-container);
      color: var(--color-on-primary-container);
    }
    .ratings {
      margin: 0;
      padding: 0;
      list-style: none;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
    }
    .rating {
      display: flex;
      align-items: flex-start;
      gap: var(--spacing-3);
      padding: var(--spacing-3) var(--spacing-4);
      border-bottom: 1px solid var(--color-border);
    }
    .rating:last-child {
      border-bottom: 0;
    }
    .rating--hidden {
      background: var(--color-surface-variant);
    }
    .rating__text {
      flex: 1 1 auto;
      min-width: 0;
    }
    .rating__text p {
      margin: 0;
    }
    .rating__head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px var(--spacing-2);
      font-size: var(--font-size-sm);
    }
    .rating__comment {
      margin-top: var(--spacing-1) !important;
      overflow-wrap: anywhere;
    }
    .rating__hidden {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--spacing-2);
      margin-top: var(--spacing-1) !important;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .rating__hide {
      color: var(--color-danger);
    }
    @media (max-width: 599px) {
      .rating {
        flex-wrap: wrap;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminRatingsPageComponent {
  private readonly api = inject(AdminRatingsService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly session = inject(SessionService);

  readonly state = input<string | undefined>();
  readonly rateeId = input<string | undefined>();
  readonly page = input<string | undefined>();

  protected readonly states = STATES;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly kind = interactionKindLabel;
  protected readonly params = computed<ListAdminRatingsRequestParams>(() => ({
    state:
      this.state() === 'OK' || this.state() === 'HIDDEN'
        ? (this.state() as ListAdminRatingsRequestParams['state'])
        : undefined,
    rateeId: this.rateeId() && UUID.test(this.rateeId() as string) ? this.rateeId() : undefined,
    page: toPage(this.page()),
    size: PAGE_SIZE,
  }));
  protected readonly result = signal<PageResponseAdminRating | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly busy = signal<string | null>(null);

  private subscription: Subscription | null = null;

  constructor() {
    effect(() => {
      const params = this.params();
      untracked(() => this.load(params));
    });
    inject(DestroyRef).onDestroy(() => this.subscription?.unsubscribe());
  }

  protected criteria(entry: AdminRating): { label: string; value: number }[] {
    return breakdownEntries(entry.rating.breakdown);
  }

  protected navigate(changes: Record<string, string | null>): void {
    void this.router.navigate([], {
      queryParams: { ...changes, page: null },
      queryParamsHandling: 'merge',
    });
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

  protected async hide(entry: AdminRating): Promise<void> {
    const answer = await askReason(this.dialog, {
      title: `Hide the rating by ${entry.rating.rater.displayName}?`,
      message:
        'The rating disappears from the collector’s profile and no longer counts in their ' +
        'average. You can restore it later.',
      confirmLabel: 'Hide rating',
      tone: 'danger',
    });
    if (!answer) {
      return;
    }
    await this.act(
      entry,
      'Rating hidden.',
      this.api.hideRating(
        { id: entry.rating.id, hideRatingRequest: { reason: answer.reason } },
        'body',
        false,
        { context: silentErrors() },
      ),
    );
  }

  protected async unhide(entry: AdminRating): Promise<void> {
    const confirmed = await confirmAdminAction(this.dialog, {
      title: `Restore the rating by ${entry.rating.rater.displayName}?`,
      message: 'It shows on the collector’s profile again and counts in their average.',
      confirmLabel: 'Restore rating',
    });
    if (!confirmed) {
      return;
    }
    await this.act(
      entry,
      'Rating restored.',
      this.api.unhideRating({ id: entry.rating.id }, 'body', false, { context: silentErrors() }),
    );
  }

  private async act(
    entry: AdminRating,
    success: string,
    request: Observable<AdminRating>,
  ): Promise<void> {
    this.busy.set(entry.rating.id);
    const updated = await runAdminAction(
      this.snackBar,
      request,
      success,
      'Someone already changed this rating.',
    );
    this.busy.set(null);
    if (updated) {
      this.result.update((page) =>
        page
          ? {
              ...page,
              items: (page.items ?? []).map((item) =>
                item.rating.id === updated.rating.id ? updated : item,
              ),
            }
          : page,
      );
    } else {
      this.reload();
    }
  }

  private load(params: ListAdminRatingsRequestParams): void {
    this.subscription?.unsubscribe();
    this.loading.set(true);
    this.error.set(null);
    this.subscription = this.api
      .listAdminRatings(params, 'body', false, { context: silentErrors() })
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
