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
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import {
  AdminBillingService,
  ListAdminSubscriptionsRequestParams,
  PageResponseAdminSubscription,
} from '@orenji/api-client';
import { Subscription } from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { SUBSCRIPTION_STATUSES, amountLabel } from '../../../shared/billing/billing-labels';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { AdminChipComponent } from '../shared/admin-chip.component';
import { isUuid, statusText, statusTone } from './admin-billing-labels';

const PAGE_SIZE = 20;

/**
 * `/admin/subscriptions` (ADMIN): subscriptions, most recent change first, filtered by status,
 * plan and account (`?status=&plan=&userId=&page=`). A row opens the detail (history, webhooks,
 * cancel).
 */
@Component({
  selector: 'app-admin-subscriptions-page',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatPaginatorModule,
    MatSelectModule,
    AdminChipComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    PageHeaderComponent,
    SkeletonComponent,
  ],
  template: `
    <div class="admin-page">
      <app-page-header
        title="Subscriptions"
        subtitle="Premium subscriptions through the billing provider (the local fake provider moves no money)."
      />
      <div class="admin-filters" role="search" aria-label="Filter subscriptions">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Status</mat-label>
          <mat-select
            [value]="statusFilter() ?? null"
            (selectionChange)="setFilter('status', $event.value)"
          >
            <mat-option [value]="null">Any status</mat-option>
            @for (status of statuses; track status) {
              <mat-option [value]="status">{{ text(status) }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Plan</mat-label>
          <mat-select [value]="plan() ?? null" (selectionChange)="setFilter('plan', $event.value)">
            <mat-option [value]="null">Any plan</mat-option>
            <mat-option value="PREMIUM">Premium</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field
          appearance="outline"
          subscriptSizing="dynamic"
          class="admin-filters__search"
        >
          <mat-label>Account id</mat-label>
          <input
            matInput
            #account
            [value]="userFilter() ?? ''"
            placeholder="00000000-0000-…"
            (keydown.enter)="setUser(account.value)"
            (blur)="setUser(account.value)"
          />
          @if (userError()) {
            <mat-hint class="admin-error">Enter a full account id (UUID).</mat-hint>
          }
        </mat-form-field>
      </div>

      @if (error(); as error) {
        <app-error-state
          title="Subscriptions could not load"
          [message]="message(error)"
          [requestId]="error.requestId"
          (retry)="reload()"
        />
      } @else if (loading() && !result()) {
        <div aria-busy="true">
          <span class="visually-hidden">Loading subscriptions</span>
          <app-skeleton variant="list" lines="6" />
        </div>
      } @else if (result(); as page) {
        @if ((page.items ?? []).length === 0) {
          <app-empty-state
            icon="workspace_premium"
            title="No subscriptions match"
            description="Try another status, plan or account."
          />
        } @else {
          <p class="admin-count" aria-live="polite">
            {{ page.totalItems }} {{ page.totalItems === 1 ? 'subscription' : 'subscriptions' }}
          </p>
          <div class="billing-table-wrap" [class.admin-dim]="loading()">
            <table class="billing-table" aria-label="Subscriptions">
              <thead>
                <tr>
                  <th scope="col">Member</th>
                  <th scope="col">Plan</th>
                  <th scope="col">Status</th>
                  <th scope="col" class="num">Price</th>
                  <th scope="col">Period end</th>
                  <th scope="col">Updated</th>
                </tr>
              </thead>
              <tbody>
                @for (row of page.items ?? []; track row.id) {
                  <tr data-testid="subscription-row">
                    <td>
                      <a class="strong" [routerLink]="['/admin/subscriptions', row.id]"
                        >&#64;{{ row.userHandle ?? 'deleted' }}</a
                      >
                      <span class="muted">{{ row.provider }}</span>
                    </td>
                    <td>{{ row.planCode }}</td>
                    <td>
                      <app-admin-chip [tone]="tone(row.status)">{{
                        text(row.status)
                      }}</app-admin-chip>
                      @if (row.cancelAtPeriodEnd) {
                        <span class="muted">Ends at period end</span>
                      }
                    </td>
                    <td class="num">{{ money(row.amount, row.currency) }}</td>
                    <td class="nowrap">{{ row.currentPeriodEnd | date: 'mediumDate' }}</td>
                    <td class="nowrap">{{ row.updatedAt | date: 'short' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          @if ((page.totalItems ?? 0) > pageSize) {
            <mat-paginator
              [length]="page.totalItems ?? 0"
              [pageIndex]="page.page ?? 0"
              [pageSize]="pageSize"
              [hidePageSize]="true"
              aria-label="Subscription pages"
              (page)="onPage($event)"
            />
          }
        }
      }
    </div>
  `,
  styleUrls: ['../shared/admin-page.scss', './admin-billing.scss'],
  styles: `
    .admin-error {
      color: var(--color-danger);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminSubscriptionsPageComponent {
  private readonly api = inject(AdminBillingService);
  private readonly router = inject(Router);

  readonly status = input<string | undefined>();
  readonly plan = input<string | undefined>();
  readonly userId = input<string | undefined>();
  readonly page = input<string | undefined>();

  protected readonly statuses = SUBSCRIPTION_STATUSES;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly text = statusText;
  protected readonly tone = statusTone;
  protected readonly money = amountLabel;
  protected readonly statusFilter = computed(() =>
    (SUBSCRIPTION_STATUSES as readonly string[]).includes(this.status() ?? '')
      ? (this.status() as ListAdminSubscriptionsRequestParams['status'])
      : undefined,
  );
  protected readonly userFilter = computed(() =>
    isUuid(this.userId()) ? this.userId()!.trim() : undefined,
  );
  protected readonly userError = signal(false);
  protected readonly result = signal<PageResponseAdminSubscription | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<ApiError | null>(null);

  private request: Subscription | null = null;

  constructor() {
    effect(() => {
      const params = this.params();
      untracked(() => this.load(params));
    });
    inject(DestroyRef).onDestroy(() => this.request?.unsubscribe());
  }

  protected message(error: ApiError): string {
    return friendlyMessage(error);
  }

  protected setFilter(key: 'status' | 'plan', value: string | null): void {
    void this.router.navigate([], {
      queryParams: { [key]: value, page: null },
      queryParamsHandling: 'merge',
    });
  }

  protected setUser(value: string): void {
    const text = value.trim();
    if (text && !isUuid(text)) {
      this.userError.set(true);
      return;
    }
    this.userError.set(false);
    if ((this.userFilter() ?? '') !== text) {
      void this.router.navigate([], {
        queryParams: { userId: text || null, page: null },
        queryParamsHandling: 'merge',
      });
    }
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

  private params(): ListAdminSubscriptionsRequestParams {
    const page = Number.parseInt(this.page() ?? '', 10);
    return {
      status: this.statusFilter(),
      plan: this.plan() || undefined,
      userId: this.userFilter(),
      page: Number.isFinite(page) && page > 0 ? page : 0,
      size: PAGE_SIZE,
    };
  }

  private load(params: ListAdminSubscriptionsRequestParams): void {
    this.request?.unsubscribe();
    this.loading.set(true);
    this.error.set(null);
    this.request = this.api
      .listAdminSubscriptions(params, 'body', false, { context: silentErrors() })
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
