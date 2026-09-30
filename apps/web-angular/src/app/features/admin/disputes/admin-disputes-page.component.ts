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
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { Router, RouterLink } from '@angular/router';
import {
  AdminPaymentsService,
  ListAdminDisputesRequestParams,
  PageResponseAdminDisputeSummary,
} from '@orenji/api-client';
import { Subscription } from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import {
  DISPUTE_STATUSES,
  disputeReasonLabel,
  money,
} from '../../../shared/payments/payment-labels';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { disputeLabel, disputeTone } from '../payments/admin-payment-labels';
import { AdminChipComponent } from '../shared/admin-chip.component';

const PAGE_SIZE = 20;

function toPage(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

/**
 * `/admin/disputes` (ADMIN): the dispute queue, newest first, filtered by status
 * (`?status=&page=`); a row opens the dispute with both parties' histories.
 */
@Component({
  selector: 'app-admin-disputes-page',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatPaginatorModule,
    MatSelectModule,
    MatTableModule,
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
        title="Disputes"
        subtitle="Buyers who reported a problem with a protected trade. The payout stays on hold until you decide."
      />
      <div class="admin-filters" role="search" aria-label="Filter disputes">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Status</mat-label>
          <mat-select [value]="statusFilter() ?? null" (selectionChange)="setStatus($event.value)">
            <mat-option [value]="null">Any status</mat-option>
            @for (status of statuses; track status) {
              <mat-option [value]="status">{{ label(status) }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </div>
      @if (error(); as error) {
        <app-error-state
          title="Disputes could not load"
          [message]="errorMessage()"
          [requestId]="error.requestId"
          (retry)="reload()"
        />
      } @else if (loading() && !result()) {
        <div aria-busy="true">
          <span class="visually-hidden">Loading disputes</span>
          <app-skeleton variant="list" lines="6" />
        </div>
      } @else if (result(); as page) {
        @if ((page.items ?? []).length === 0) {
          <app-empty-state
            icon="gavel"
            title="No disputes match"
            [description]="statusFilter() ? 'Try another status.' : 'Nobody opened a dispute yet.'"
          />
        } @else {
          <p class="admin-count" aria-live="polite">
            {{ page.totalItems }} {{ page.totalItems === 1 ? 'dispute' : 'disputes' }}
          </p>
          <div class="table-wrap" [class.admin-dim]="loading()">
            <table mat-table [dataSource]="page.items ?? []" aria-label="Disputes">
              <ng-container matColumnDef="reason">
                <th mat-header-cell *matHeaderCellDef scope="col">Dispute</th>
                <td mat-cell *matCellDef="let row">
                  <a
                    class="strong"
                    [routerLink]="['/admin/disputes', row.id]"
                    [attr.aria-label]="
                      'Dispute: ' +
                      reason(row.reason) +
                      ', ' +
                      label(row.status) +
                      ', buyer @' +
                      (row.buyer?.handle ?? '')
                    "
                    >{{ reason(row.reason) }}</a
                  >
                  <span class="muted">
                    &#64;{{ row.buyer?.handle ?? '—' }} → &#64;{{ row.seller?.handle ?? '—' }}
                  </span>
                </td>
              </ng-container>
              <ng-container matColumnDef="amount">
                <th mat-header-cell *matHeaderCellDef scope="col">Amount</th>
                <td mat-cell *matCellDef="let row">{{ money(row.amount, row.currency) }}</td>
              </ng-container>
              <ng-container matColumnDef="status">
                <th mat-header-cell *matHeaderCellDef scope="col">Status</th>
                <td mat-cell *matCellDef="let row">
                  <app-admin-chip [tone]="tone(row.status)">{{ label(row.status) }}</app-admin-chip>
                </td>
              </ng-container>
              <ng-container matColumnDef="opened">
                <th mat-header-cell *matHeaderCellDef scope="col" class="opt">Opened</th>
                <td mat-cell *matCellDef="let row" class="opt nowrap">
                  <time [attr.datetime]="row.openedAt" [title]="row.openedAt | date: 'medium'">{{
                    row.openedAt | relativeTime
                  }}</time>
                </td>
              </ng-container>
              <tr mat-header-row *matHeaderRowDef="columns"></tr>
              <tr mat-row *matRowDef="let row; columns: columns" data-testid="dispute-row"></tr>
            </table>
          </div>
          @if ((page.totalItems ?? 0) > pageSize) {
            <mat-paginator
              [length]="page.totalItems ?? 0"
              [pageIndex]="page.page ?? 0"
              [pageSize]="pageSize"
              [hidePageSize]="true"
              aria-label="Dispute pages"
              (page)="onPage($event)"
            />
          }
        }
      }
    </div>
  `,
  styleUrls: ['../shared/admin-page.scss'],
  styles: `
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
    .strong {
      display: block;
      font-weight: var(--font-weight-semibold);
    }
    .muted {
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
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
export class AdminDisputesPageComponent {
  private readonly api = inject(AdminPaymentsService);
  private readonly router = inject(Router);

  readonly status = input<string | undefined>();
  readonly page = input<string | undefined>();

  protected readonly statuses = DISPUTE_STATUSES;
  protected readonly label = disputeLabel;
  protected readonly tone = disputeTone;
  protected readonly reason = disputeReasonLabel;
  protected readonly money = money;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly columns = ['reason', 'amount', 'status', 'opened'];
  protected readonly statusFilter = computed(() => {
    const status = this.status();
    return (DISPUTE_STATUSES as readonly string[]).includes(status ?? '')
      ? (status as ListAdminDisputesRequestParams['status'])
      : undefined;
  });
  protected readonly result = signal<PageResponseAdminDisputeSummary | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly errorMessage = computed(() => {
    const error = this.error();
    return error ? friendlyMessage(error) : '';
  });

  private subscription: Subscription | null = null;

  constructor() {
    effect(() => {
      const params: ListAdminDisputesRequestParams = {
        status: this.statusFilter(),
        page: toPage(this.page()),
        size: PAGE_SIZE,
      };
      untracked(() => this.load(params));
    });
    inject(DestroyRef).onDestroy(() => this.subscription?.unsubscribe());
  }

  protected setStatus(value: string | null): void {
    void this.router.navigate([], {
      queryParams: { status: value, page: null },
      queryParamsHandling: 'merge',
    });
  }

  protected onPage(event: PageEvent): void {
    void this.router.navigate([], {
      queryParams: { page: event.pageIndex || null },
      queryParamsHandling: 'merge',
    });
  }

  protected reload(): void {
    this.load({ status: this.statusFilter(), page: toPage(this.page()), size: PAGE_SIZE });
  }

  private load(params: ListAdminDisputesRequestParams): void {
    this.subscription?.unsubscribe();
    this.loading.set(true);
    this.error.set(null);
    this.subscription = this.api
      .listAdminDisputes(params, 'body', false, { context: silentErrors() })
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
