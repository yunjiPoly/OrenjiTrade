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
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { Router, RouterLink } from '@angular/router';
import {
  AdminAuditService,
  AuditLogEntry,
  ListAuditLogsRequestParams,
  PageResponseAuditLogEntry,
} from '@orenji/api-client';
import { Subscription } from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { AUDIT_ACTION_LABELS, auditActionLabel, summarizeDetails } from '../shared/admin-labels';

const PAGE_SIZE = 25;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Start of a local day (yyyy-mm-dd) as ISO, or undefined. */
function dayStart(value: string | undefined): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return undefined;
  }
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d).toISOString();
}

/** Start of the day after (the API's `to` is exclusive), or undefined. */
function dayAfter(value: string | undefined): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return undefined;
  }
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d + 1).toISOString();
}

/**
 * `/admin/audit-logs`: every admin and account action, newest first, filterable by action,
 * target, actor and date range (all mirrored in the URL).
 */
@Component({
  selector: 'app-admin-audit-logs-page',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatSelectModule,
    MatTableModule,
    EmptyStateComponent,
    ErrorStateComponent,
    PageHeaderComponent,
    SkeletonComponent,
  ],
  templateUrl: './admin-audit-logs-page.component.html',
  styleUrls: ['../shared/admin-page.scss', './admin-audit-logs-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminAuditLogsPageComponent {
  private readonly auditApi = inject(AdminAuditService);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly action = input<string | undefined>();
  readonly targetType = input<string | undefined>();
  readonly targetId = input<string | undefined>();
  readonly actorId = input<string | undefined>();
  readonly from = input<string | undefined>();
  readonly to = input<string | undefined>();
  readonly page = input<string | undefined>();

  protected readonly actions = Object.keys(AUDIT_ACTION_LABELS);
  protected readonly auditActionLabel = auditActionLabel;
  protected readonly summarizeDetails = summarizeDetails;
  protected readonly columns = ['when', 'actor', 'action', 'target', 'details'];
  protected readonly form = this.fb.group({
    action: [''],
    targetType: [''],
    targetId: [''],
    actorId: [''],
    from: [''],
    to: [''],
  });
  protected readonly result = signal<PageResponseAuditLogEntry | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly errorMessage = computed(() => {
    const error = this.error();
    return error ? friendlyMessage(error) : '';
  });
  protected readonly expanded = signal<string | null>(null);
  protected readonly params = computed<ListAuditLogsRequestParams>(() => ({
    action: this.action() || undefined,
    targetType: this.targetType() || undefined,
    targetId: this.targetId() || undefined,
    actorId: UUID.test(this.actorId() ?? '') ? this.actorId() : undefined,
    from: dayStart(this.from()),
    to: dayAfter(this.to()),
    page: Math.max(0, Number.parseInt(this.page() ?? '0', 10) || 0),
    size: PAGE_SIZE,
  }));
  protected readonly hasFilters = computed(() =>
    [
      this.action(),
      this.targetType(),
      this.targetId(),
      this.actorId(),
      this.from(),
      this.to(),
    ].some(Boolean),
  );

  private subscription: Subscription | null = null;

  constructor() {
    effect(() => {
      const params = this.params();
      untracked(() => {
        this.form.reset({
          action: this.action() ?? '',
          targetType: this.targetType() ?? '',
          targetId: this.targetId() ?? '',
          actorId: this.actorId() ?? '',
          from: this.from() ?? '',
          to: this.to() ?? '',
        });
        this.load(params);
      });
    });
    inject(DestroyRef).onDestroy(() => this.subscription?.unsubscribe());
  }

  protected applyFilters(): void {
    const value = this.form.getRawValue();
    const queryParams: Record<string, string | null> = { page: null };
    for (const [key, raw] of Object.entries(value)) {
      queryParams[key] = raw.trim() || null;
    }
    void this.router.navigate([], { queryParams });
  }

  protected clearFilters(): void {
    void this.router.navigate([], { queryParams: {} });
  }

  protected onPage(event: PageEvent): void {
    void this.router.navigate([], {
      queryParams: { page: event.pageIndex || null },
      queryParamsHandling: 'merge',
    });
  }

  protected reload(): void {
    this.load(this.params());
  }

  protected toggle(entry: AuditLogEntry): void {
    this.expanded.update((id) => (id === entry.id ? null : entry.id));
  }

  protected json(details: object): string {
    return JSON.stringify(details, null, 2);
  }

  private load(params: ListAuditLogsRequestParams): void {
    this.subscription?.unsubscribe();
    this.loading.set(true);
    this.error.set(null);
    this.subscription = this.auditApi
      .listAuditLogs(params, 'body', false, { context: silentErrors() })
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
