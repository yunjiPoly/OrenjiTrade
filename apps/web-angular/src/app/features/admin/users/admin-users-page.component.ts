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
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { Router } from '@angular/router';
import {
  AdminUsersService,
  ListUsersRequestParams,
  PageResponseAdminUserSummary,
} from '@orenji/api-client';
import { Subject, Subscription, debounceTime, distinctUntilChanged } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ALL_ROLES, ROLE_LABELS, Role } from '../../../core/auth/roles';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { ACCOUNT_STATUSES, AccountStatus, STATUS_LABELS } from '../shared/admin-labels';
import { AdminIconComponent } from '../console/admin-icon.component';
import { AdminUsersTableComponent } from './admin-users-table.component';

const PAGE_SIZE_OPTIONS = [20, 50, 100];

function toInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/**
 * `/admin/users`: search (handle, name, email), status and role filters, pagination. Filters
 * live in the URL (`?query=&status=&role=&page=&size=`) so views can be shared and navigated.
 */
@Component({
  selector: 'app-admin-users-page',
  imports: [
    MatPaginatorModule,
    AdminIconComponent,
    AdminUsersTableComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    SkeletonComponent,
  ],
  templateUrl: './admin-users-page.component.html',
  styleUrls: [
    '../console/console-page.scss',
    '../console/console-controls.scss',
    '../console/console-table.scss',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminUsersPageComponent {
  private readonly usersApi = inject(AdminUsersService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /** Query parameters (bound by the router). */
  readonly query = input<string | undefined>();
  readonly status = input<string | undefined>();
  readonly role = input<string | undefined>();
  readonly page = input<string | undefined>();
  readonly size = input<string | undefined>();

  protected readonly statuses = ACCOUNT_STATUSES;
  protected readonly statusLabels = STATUS_LABELS;
  protected readonly roles = ALL_ROLES;
  protected readonly roleLabels = ROLE_LABELS;
  protected readonly pageSizes = PAGE_SIZE_OPTIONS;
  protected readonly result = signal<PageResponseAdminUserSummary | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly errorMessage = computed(() => {
    const error = this.error();
    return error ? friendlyMessage(error) : '';
  });
  protected readonly params = computed<ListUsersRequestParams>(() => ({
    query: this.query()?.trim() || undefined,
    status: (ACCOUNT_STATUSES as readonly string[]).includes(this.status() ?? '')
      ? (this.status() as ListUsersRequestParams['status'])
      : undefined,
    role: (ALL_ROLES as readonly string[]).includes(this.role() ?? '')
      ? (this.role() as ListUsersRequestParams['role'])
      : undefined,
    page: toInt(this.page(), 0),
    size: PAGE_SIZE_OPTIONS.includes(toInt(this.size(), 20)) ? toInt(this.size(), 20) : 20,
  }));
  /** "1–20 of 64" (board A7). */
  protected readonly range = computed(() => {
    const page = this.result();
    const total = page?.totalItems ?? 0;
    if (!page || !total) {
      return '';
    }
    const start = (page.page ?? 0) * (page.size ?? 20) + 1;
    const end = Math.min(total, start + (page.items ?? []).length - 1);
    return `${start}–${end} of ${total.toLocaleString('en-US')}`;
  });
  protected readonly hasFilters = computed(() => {
    const p = this.params();
    return !!(p.query || p.status || p.role);
  });

  private readonly searches = new Subject<string>();
  private subscription: Subscription | null = null;

  constructor() {
    effect(() => {
      const params = this.params();
      untracked(() => this.load(params));
    });
    this.searches
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((query) => this.navigate({ query: query.trim() || null, page: null }));
    this.destroyRef.onDestroy(() => this.subscription?.unsubscribe());
  }

  protected reload(): void {
    this.load(this.params());
  }

  protected onSearch(event: Event): void {
    this.searches.next((event.target as HTMLInputElement).value);
  }

  protected setStatus(status: AccountStatus | null): void {
    this.navigate({ status, page: null });
  }

  protected setRole(role: Role | null): void {
    this.navigate({ role, page: null });
  }

  protected onPage(event: PageEvent): void {
    this.navigate({ page: event.pageIndex || null });
  }

  protected setSize(size: number): void {
    this.navigate({ size: size === 20 ? null : size, page: null });
  }

  protected clearFilters(): void {
    void this.router.navigate([], { queryParams: {} });
  }

  private navigate(queryParams: Record<string, string | number | null>): void {
    void this.router.navigate([], { queryParams, queryParamsHandling: 'merge' });
  }

  private load(params: ListUsersRequestParams): void {
    this.subscription?.unsubscribe();
    this.loading.set(true);
    this.error.set(null);
    this.subscription = this.usersApi
      .listUsers(params, 'body', false, { context: silentErrors() })
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
