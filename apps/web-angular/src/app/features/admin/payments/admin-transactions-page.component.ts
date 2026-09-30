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
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { Router } from '@angular/router';
import {
  AdminPaymentsService,
  ListAdminTransactionsRequestParams,
  PageResponseAdminTransaction,
} from '@orenji/api-client';
import { Observable, Subscription } from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import {
  PAYMENT_STATUSES,
  TransactionView,
  paymentLabel,
  parseTransactionView,
} from './admin-payment-labels';
import { AdminTransactionTableComponent } from './admin-transaction-table.component';

const PAGE_SIZE = 20;

function toPage(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

const VIEW_TEXT: Record<TransactionView, { empty: string; hint: string }> = {
  all: {
    empty: 'No protected trades yet.',
    hint: 'Every trade paid with payment protection, most recent activity first.',
  },
  'pending-shipment': {
    empty: 'Nothing waits for a shipment.',
    hint: 'Secured payments whose seller has not shipped yet, oldest payment first.',
  },
  'pending-confirmation': {
    empty: 'Nothing waits for a buyer’s confirmation.',
    hint: 'Shipped trades waiting for the buyer, the dispute window ending first (released automatically after it).',
  },
};

/**
 * `/admin/transactions` (ADMIN): trades paid with payment protection
 * (`GET /admin/transactions?status=`), and the two work queues pending shipment and pending
 * confirmation. View, status and page live in the URL (`?view=&status=&page=`).
 */
@Component({
  selector: 'app-admin-transactions-page',
  imports: [
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatPaginatorModule,
    MatSelectModule,
    AdminTransactionTableComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    PageHeaderComponent,
    SkeletonComponent,
  ],
  template: `
    <div class="admin-page">
      <app-page-header
        title="Transactions"
        subtitle="Protected trades from payment to payout. The payment provider holds the money; OrenjiTrade only follows the steps."
      />
      <div class="admin-filters" role="search" aria-label="Filter transactions">
        <mat-button-toggle-group
          [value]="activeView()"
          (change)="set('view', $event.value === 'all' ? null : $event.value)"
          aria-label="Transaction view"
          hideSingleSelectionIndicator
        >
          <mat-button-toggle value="all">All</mat-button-toggle>
          <mat-button-toggle value="pending-shipment">Pending shipment</mat-button-toggle>
          <mat-button-toggle value="pending-confirmation">Pending confirmation</mat-button-toggle>
        </mat-button-toggle-group>
        @if (activeView() === 'all') {
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Status</mat-label>
            <mat-select
              [value]="statusFilter() ?? null"
              (selectionChange)="set('status', $event.value)"
            >
              <mat-option [value]="null">Any status</mat-option>
              @for (status of statuses; track status) {
                <mat-option [value]="status">{{ label(status) }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        }
      </div>
      <p class="admin-muted tx__hint">{{ text().hint }}</p>

      @if (error(); as error) {
        <app-error-state
          title="Transactions could not load"
          [message]="errorMessage()"
          [requestId]="error.requestId"
          (retry)="reload()"
        />
      } @else if (loading() && !result()) {
        <div aria-busy="true">
          <span class="visually-hidden">Loading transactions</span>
          <app-skeleton variant="list" lines="6" />
        </div>
      } @else if (result(); as page) {
        @if ((page.items ?? []).length === 0) {
          <app-empty-state icon="receipt_long" [title]="text().empty" />
        } @else {
          <p class="admin-count" aria-live="polite">
            {{ page.totalItems }} {{ page.totalItems === 1 ? 'transaction' : 'transactions' }}
            @if (loading()) {
              · updating…
            }
          </p>
          <app-admin-transaction-table
            [class.admin-dim]="loading()"
            [rows]="page.items ?? []"
            label="Transactions"
          />
          @if ((page.totalItems ?? 0) > pageSize) {
            <mat-paginator
              [length]="page.totalItems ?? 0"
              [pageIndex]="page.page ?? 0"
              [pageSize]="pageSize"
              [hidePageSize]="true"
              aria-label="Transaction pages"
              (page)="onPage($event)"
            />
          }
        }
      }
    </div>
  `,
  styleUrls: ['../shared/admin-page.scss'],
  styles: `
    .admin-filters {
      align-items: center;
    }
    .tx__hint {
      margin-bottom: var(--spacing-4);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminTransactionsPageComponent {
  private readonly api = inject(AdminPaymentsService);
  private readonly router = inject(Router);

  /** Query parameters (bound by the router). */
  readonly view = input<string | undefined>();
  readonly status = input<string | undefined>();
  readonly page = input<string | undefined>();

  protected readonly statuses = PAYMENT_STATUSES;
  protected readonly label = paymentLabel;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly activeView = computed(() => parseTransactionView(this.view()));
  protected readonly text = computed(() => VIEW_TEXT[this.activeView()]);
  protected readonly statusFilter = computed(() => {
    const status = this.status();
    return (PAYMENT_STATUSES as readonly string[]).includes(status ?? '')
      ? (status as ListAdminTransactionsRequestParams['status'])
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
      const view = this.activeView();
      const status = this.statusFilter();
      const page = toPage(this.page());
      untracked(() => this.load(view, status, page));
    });
    inject(DestroyRef).onDestroy(() => this.subscription?.unsubscribe());
  }

  protected set(key: string, value: string | null): void {
    void this.router.navigate([], {
      queryParams: { [key]: value, page: null, ...(key === 'view' ? { status: null } : {}) },
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
    this.load(this.activeView(), this.statusFilter(), toPage(this.page()));
  }

  private load(
    view: TransactionView,
    status: ListAdminTransactionsRequestParams['status'],
    page: number,
  ): void {
    this.subscription?.unsubscribe();
    this.loading.set(true);
    this.error.set(null);
    const options = { context: silentErrors() };
    const request: Observable<PageResponseAdminTransaction> =
      view === 'pending-shipment'
        ? this.api.listPendingShipmentTransactions(
            { page, size: PAGE_SIZE },
            'body',
            false,
            options,
          )
        : view === 'pending-confirmation'
          ? this.api.listPendingConfirmationTransactions(
              { page, size: PAGE_SIZE },
              'body',
              false,
              options,
            )
          : this.api.listAdminTransactions(
              { status, page, size: PAGE_SIZE },
              'body',
              false,
              options,
            );
    this.subscription = request.subscribe({
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
