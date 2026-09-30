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
import { Router } from '@angular/router';
import {
  AdminPaymentsService,
  ListAdminPaymentsRequestParams,
  PageResponseAdminTransaction,
} from '@orenji/api-client';
import { Subscription } from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { PAYMENT_STATUSES, paymentLabel } from './admin-payment-labels';
import { AdminTransactionTableComponent } from './admin-transaction-table.component';
import { PaymentsSubnavComponent } from './payments-subnav.component';

const PAGE_SIZE = 20;

function toPage(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

/**
 * `/admin/payments` (ADMIN): protected payments, most recent activity first, filtered by status
 * (`?status=&page=`). A row opens the payment detail (events, refunds, webhooks, refund).
 */
@Component({
  selector: 'app-admin-payments-page',
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatPaginatorModule,
    MatSelectModule,
    AdminTransactionTableComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    PageHeaderComponent,
    PaymentsSubnavComponent,
    SkeletonComponent,
  ],
  template: `
    <div class="admin-page">
      <app-page-header
        title="Payments"
        subtitle="Payments held by the payment provider for protected trades, their refunds and payouts."
      />
      <app-payments-subnav>
        <div class="admin-filters" role="search" aria-label="Filter payments">
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Status</mat-label>
            <mat-select
              [value]="statusFilter() ?? null"
              (selectionChange)="setStatus($event.value)"
            >
              <mat-option [value]="null">Any status</mat-option>
              @for (status of statuses; track status) {
                <mat-option [value]="status">{{ label(status) }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>
        @if (error(); as error) {
          <app-error-state
            title="Payments could not load"
            [message]="errorMessage()"
            [requestId]="error.requestId"
            (retry)="reload()"
          />
        } @else if (loading() && !result()) {
          <div aria-busy="true">
            <span class="visually-hidden">Loading payments</span>
            <app-skeleton variant="list" lines="6" />
          </div>
        } @else if (result(); as page) {
          @if ((page.items ?? []).length === 0) {
            <app-empty-state
              icon="payments"
              title="No payments match"
              [description]="
                statusFilter() ? 'Try another status.' : 'No protected payment was made yet.'
              "
            />
          } @else {
            <p class="admin-count" aria-live="polite">
              {{ page.totalItems }} {{ page.totalItems === 1 ? 'payment' : 'payments' }}
              @if (loading()) {
                · updating…
              }
            </p>
            <app-admin-transaction-table
              [class.admin-dim]="loading()"
              [rows]="page.items ?? []"
              label="Payments"
            />
            @if ((page.totalItems ?? 0) > pageSize) {
              <mat-paginator
                [length]="page.totalItems ?? 0"
                [pageIndex]="page.page ?? 0"
                [pageSize]="pageSize"
                [hidePageSize]="true"
                aria-label="Payment pages"
                (page)="onPage($event)"
              />
            }
          }
        }
      </app-payments-subnav>
    </div>
  `,
  styleUrls: ['../shared/admin-page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminPaymentsPageComponent {
  private readonly api = inject(AdminPaymentsService);
  private readonly router = inject(Router);

  readonly status = input<string | undefined>();
  readonly page = input<string | undefined>();

  protected readonly statuses = PAYMENT_STATUSES;
  protected readonly label = paymentLabel;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly statusFilter = computed(() => {
    const status = this.status();
    return (PAYMENT_STATUSES as readonly string[]).includes(status ?? '')
      ? (status as ListAdminPaymentsRequestParams['status'])
      : undefined;
  });
  protected readonly result = signal<PageResponseAdminTransaction | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly errorMessage = computed(() => {
    const error = this.error();
    return error ? friendlyMessage(error) : '';
  });

  private subscription: Subscription | null = null;

  constructor() {
    effect(() => {
      const params: ListAdminPaymentsRequestParams = {
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

  private load(params: ListAdminPaymentsRequestParams): void {
    this.subscription?.unsubscribe();
    this.loading.set(true);
    this.error.set(null);
    this.subscription = this.api
      .listAdminPayments(params, 'body', false, { context: silentErrors() })
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
