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
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTableModule } from '@angular/material/table';
import { Router, RouterLink } from '@angular/router';
import {
  AdminReportsService,
  ListReportsRequestParams,
  PageResponseReportSummary,
} from '@orenji/api-client';
import { Subscription } from 'rxjs';
import { SessionService } from '../../../core/auth/session.service';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';
import {
  REPORT_REASONS,
  REPORT_STATUSES,
  contextSourceLabel,
  reportReasonLabel,
  reportStatusLabel,
  resolutionActionLabel,
} from '../../../shared/reports/report-labels';
import { AvatarComponent } from '../../../shared/ui/avatar/avatar.component';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { AdminChipComponent } from '../shared/admin-chip.component';
import { reportStatusTone, resolutionTone } from './report-tones';

const PAGE_SIZE = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toPage(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

/**
 * `/admin/reports` (moderators and admins): collector reports newest first, filtered by status,
 * reason, "assigned to me" and reported collector (all in the URL:
 * `?status=&reason=&mine=1&reportedUserId=&page=`). Each row opens the report detail.
 */
@Component({
  selector: 'app-admin-reports-page',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatPaginatorModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatTableModule,
    AdminChipComponent,
    AvatarComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    PageHeaderComponent,
    RelativeTimePipe,
    SkeletonComponent,
  ],
  template: `
    <div class="admin-page">
      <app-page-header
        title="Collector reports"
        subtitle="Reports members filed about other collectors. Review the context and history, then resolve with a proportionate action."
      />

      <div class="admin-filters" role="search" aria-label="Filter reports">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Status</mat-label>
          <mat-select
            [value]="params().status ?? null"
            (selectionChange)="set('status', $event.value)"
          >
            <mat-option [value]="null">Any status</mat-option>
            @for (status of statuses; track status) {
              <mat-option [value]="status">{{ statusLabel(status) }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Reason</mat-label>
          <mat-select
            [value]="params().reason ?? null"
            (selectionChange)="set('reason', $event.value)"
          >
            <mat-option [value]="null">Any reason</mat-option>
            @for (reason of reasons; track reason) {
              <mat-option [value]="reason">{{ reasonLabel(reason) }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-slide-toggle
          class="reports__mine"
          [checked]="mine() === '1'"
          (change)="set('mine', $event.checked ? '1' : null)"
        >
          Assigned to me
        </mat-slide-toggle>
        @if (params().reportedUserId) {
          <button
            matButton="tonal"
            type="button"
            class="reports__subject"
            (click)="set('reportedUserId', null)"
          >
            <mat-icon aria-hidden="true">close</mat-icon>
            One collector only
          </button>
        }
      </div>

      @if (error(); as error) {
        <app-error-state
          title="Reports could not load"
          [message]="errorMessage()"
          [requestId]="error.requestId"
          (retry)="reload()"
        />
      } @else if (loading() && !result()) {
        <div aria-busy="true">
          <span class="visually-hidden">Loading reports</span>
          <app-skeleton variant="list" lines="6" />
        </div>
      } @else if (result(); as page) {
        @if ((page.items ?? []).length === 0) {
          <app-empty-state
            icon="verified_user"
            title="No reports match"
            [description]="
              hasFilters()
                ? 'Try another status or reason, or clear the filters.'
                : 'Nobody has reported a collector yet.'
            "
          >
            @if (hasFilters()) {
              <button actions matButton="outlined" type="button" (click)="clear()">
                Clear filters
              </button>
            }
          </app-empty-state>
        } @else {
          <p class="admin-count" aria-live="polite">
            {{ page.totalItems }} {{ page.totalItems === 1 ? 'report' : 'reports' }}
            @if (loading()) {
              · updating…
            }
          </p>
          <div class="table-wrap" [class.admin-dim]="loading()">
            <table mat-table [dataSource]="page.items ?? []" aria-label="Collector reports">
              <ng-container matColumnDef="reported">
                <th mat-header-cell *matHeaderCellDef scope="col">Reported collector</th>
                <td mat-cell *matCellDef="let report">
                  <a
                    class="who"
                    [routerLink]="['/admin/reports', report.id]"
                    [attr.aria-label]="
                      'Report about ' +
                      report.reportedUser.displayName +
                      ', ' +
                      reasonLabel(report.reason) +
                      ', ' +
                      statusLabel(report.status)
                    "
                  >
                    <app-avatar
                      size="sm"
                      [src]="report.reportedUser.avatarUrl"
                      [name]="report.reportedUser.displayName"
                      [decorative]="true"
                    />
                    <span class="who__names">
                      <span class="who__name">{{ report.reportedUser.displayName }}</span>
                      <span class="who__handle">&#64;{{ report.reportedUser.handle }}</span>
                    </span>
                  </a>
                  @if (report.openReportsAgainstUser > 1) {
                    <span class="reports__open">{{ report.openReportsAgainstUser }} open</span>
                  }
                </td>
              </ng-container>
              <ng-container matColumnDef="reason">
                <th mat-header-cell *matHeaderCellDef scope="col">Reason</th>
                <td mat-cell *matCellDef="let report">
                  <span class="reports__reason">{{ reasonLabel(report.reason) }}</span>
                  <span class="reports__context">{{ contextLabel(report.contextSource) }}</span>
                </td>
              </ng-container>
              <ng-container matColumnDef="reporter">
                <th mat-header-cell *matHeaderCellDef scope="col" class="opt">Reported by</th>
                <td mat-cell *matCellDef="let report" class="opt">
                  &#64;{{ report.reporter.handle }}
                </td>
              </ng-container>
              <ng-container matColumnDef="status">
                <th mat-header-cell *matHeaderCellDef scope="col">Status</th>
                <td mat-cell *matCellDef="let report">
                  <app-admin-chip [tone]="statusTone(report.status)">
                    {{ statusLabel(report.status) }}
                  </app-admin-chip>
                  @if (report.resolutionAction && report.resolutionAction !== 'NONE') {
                    <app-admin-chip [tone]="actionTone(report.resolutionAction)">
                      {{ actionLabel(report.resolutionAction) }}
                    </app-admin-chip>
                  }
                </td>
              </ng-container>
              <ng-container matColumnDef="assignee">
                <th mat-header-cell *matHeaderCellDef scope="col" class="opt">Assignee</th>
                <td mat-cell *matCellDef="let report" class="opt">
                  {{ report.assignee ? '@' + report.assignee.handle : '—' }}
                </td>
              </ng-container>
              <ng-container matColumnDef="created">
                <th mat-header-cell *matHeaderCellDef scope="col" class="opt">Filed</th>
                <td mat-cell *matCellDef="let report" class="opt nowrap">
                  <time
                    [attr.datetime]="report.createdAt"
                    [title]="report.createdAt | date: 'medium'"
                    >{{ report.createdAt | relativeTime }}</time
                  >
                </td>
              </ng-container>
              <tr mat-header-row *matHeaderRowDef="columns"></tr>
              <tr mat-row *matRowDef="let row; columns: columns" [attr.data-report]="row.id"></tr>
            </table>
          </div>
          @if ((page.totalItems ?? 0) > pageSize) {
            <mat-paginator
              [length]="page.totalItems ?? 0"
              [pageIndex]="page.page ?? 0"
              [pageSize]="pageSize"
              [hidePageSize]="true"
              aria-label="Report pages"
              (page)="onPage($event)"
            />
          }
        }
      }
    </div>
  `,
  styleUrls: ['../shared/admin-page.scss'],
  styles: `
    .reports__mine {
      align-self: center;
    }
    .reports__subject {
      align-self: center;
    }
    .table-wrap {
      overflow-x: auto;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
    }
    table {
      width: 100%;
      --mat-table-background-color: transparent;
    }
    td app-admin-chip + app-admin-chip {
      margin-left: 4px;
    }
    .who {
      display: inline-flex;
      align-items: center;
      gap: var(--spacing-3);
      padding: var(--spacing-1) 0;
      color: inherit;
      text-decoration: none;
    }
    .who:hover .who__name {
      color: var(--color-primary);
      text-decoration: underline;
    }
    .who__names {
      display: flex;
      flex-direction: column;
    }
    .who__name {
      font-weight: var(--font-weight-semibold);
    }
    .who__handle,
    .reports__context {
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .reports__reason {
      display: block;
      font-weight: var(--font-weight-medium);
    }
    .reports__open {
      margin-left: var(--spacing-2);
      padding: 0 var(--spacing-2);
      border-radius: var(--radius-pill);
      background: color-mix(in srgb, var(--color-danger) 14%, var(--color-surface));
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
    }
    .nowrap {
      white-space: nowrap;
    }
    @media (max-width: 719px) {
      .opt {
        display: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminReportsPageComponent {
  private readonly api = inject(AdminReportsService);
  private readonly router = inject(Router);
  private readonly session = inject(SessionService);

  /** Query parameters (bound by the router). */
  readonly status = input<string | undefined>();
  readonly reason = input<string | undefined>();
  readonly mine = input<string | undefined>();
  readonly reportedUserId = input<string | undefined>();
  readonly page = input<string | undefined>();

  protected readonly statuses = REPORT_STATUSES;
  protected readonly reasons = REPORT_REASONS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly columns = ['reported', 'reason', 'reporter', 'status', 'assignee', 'created'];
  protected readonly statusLabel = reportStatusLabel;
  protected readonly reasonLabel = reportReasonLabel;
  protected readonly contextLabel = contextSourceLabel;
  protected readonly actionLabel = resolutionActionLabel;
  protected readonly statusTone = reportStatusTone;
  protected readonly actionTone = resolutionTone;

  protected readonly result = signal<PageResponseReportSummary | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly errorMessage = computed(() => {
    const error = this.error();
    return error ? friendlyMessage(error) : '';
  });
  protected readonly params = computed<ListReportsRequestParams>(() => {
    const status = this.status();
    const reason = this.reason();
    const subject = this.reportedUserId();
    const me = this.session.me()?.id;
    return {
      status: (REPORT_STATUSES as readonly string[]).includes(status ?? '')
        ? (status as ListReportsRequestParams['status'])
        : undefined,
      reason: (REPORT_REASONS as readonly string[]).includes(reason ?? '')
        ? (reason as ListReportsRequestParams['reason'])
        : undefined,
      reportedUserId: subject && UUID.test(subject) ? subject : undefined,
      assignedTo: this.mine() === '1' && me ? me : undefined,
      page: toPage(this.page()),
      size: PAGE_SIZE,
    };
  });
  protected readonly hasFilters = computed(() => {
    const params = this.params();
    return !!(params.status || params.reason || params.reportedUserId || params.assignedTo);
  });

  private subscription: Subscription | null = null;

  constructor() {
    effect(() => {
      const params = this.params();
      untracked(() => this.load(params));
    });
    inject(DestroyRef).onDestroy(() => this.subscription?.unsubscribe());
  }

  protected set(key: string, value: string | null): void {
    void this.router.navigate([], {
      queryParams: { [key]: value, page: null },
      queryParamsHandling: 'merge',
    });
  }

  protected clear(): void {
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

  private load(params: ListReportsRequestParams): void {
    this.subscription?.unsubscribe();
    this.loading.set(true);
    this.error.set(null);
    this.subscription = this.api
      .listReports(params, 'body', false, { context: silentErrors() })
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
