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
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import {
  AdminBillingService,
  AdminCreditGrantRequest,
  AdminCreditLedger,
  ListAdminCreditLedgerRequestParams,
} from '@orenji/api-client';
import { Subscription } from 'rxjs';
import { SessionService } from '../../../core/auth/session.service';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import {
  creditReasonLabel,
  creditTypeLabel,
  creditsLabel,
  signedCredits,
} from '../../../shared/billing/billing-labels';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { runAdminAction } from '../shared/admin-actions';
import { isUuid } from './admin-billing-labels';
import { AdminCreditRulesComponent } from './admin-credit-rules.component';
import {
  GrantCreditsDialogComponent,
  GrantCreditsDialogData,
} from './grant-credits-dialog.component';

const PAGE_SIZE = 25;

/**
 * `/admin/credits` (ADMIN): the append-only credit ledger of every account or of one
 * (`?userId=`, with its balance), "Grant or adjust credits" (audited `credits.grant`), credit
 * products and referral rules (SUPER_ADMIN edits).
 */
@Component({
  selector: 'app-admin-credits-page',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    AdminCreditRulesComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    PageHeaderComponent,
    SkeletonComponent,
  ],
  template: `
    <div class="admin-page">
      <app-page-header
        title="Credits"
        subtitle="OrenjiTrade credits are non-cash and append-only: grants and corrections add ledger entries."
      >
        <button actions matButton="filled" type="button" (click)="grant()">
          <mat-icon aria-hidden="true">add_card</mat-icon>
          Grant credits
        </button>
      </app-page-header>

      <div class="billing-sections">
        <section aria-labelledby="ledger-title">
          <div class="billing-head">
            <h2 id="ledger-title">Ledger</h2>
            <div class="admin-filters" role="search" aria-label="Filter the ledger">
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
                  (keydown.enter)="setUser(account.value)"
                  (blur)="setUser(account.value)"
                />
                @if (userError()) {
                  <mat-hint class="admin-error">Enter a full account id (UUID).</mat-hint>
                }
              </mat-form-field>
              @if (userFilter()) {
                <button matButton type="button" (click)="setUser('')">All accounts</button>
              }
            </div>
          </div>
          @if (error(); as error) {
            <app-error-state
              title="The ledger could not load"
              [message]="message(error)"
              [requestId]="error.requestId"
              (retry)="reload()"
            />
          } @else if (loading() && !ledger()) {
            <div aria-busy="true">
              <span class="visually-hidden">Loading the ledger</span>
              <app-skeleton variant="list" lines="6" />
            </div>
          } @else if (ledger(); as data) {
            @if (userFilter()) {
              <ul class="billing-tiles">
                <li class="billing-tile">
                  <span class="billing-tile__label">Balance</span>
                  <span class="billing-tile__value" data-testid="admin-credit-balance">{{
                    credits(data.balance)
                  }}</span>
                </li>
                <li class="billing-tile">
                  <span class="billing-tile__label">Account</span>
                  <a [routerLink]="['/admin/users', userFilter()]">Open the account</a>
                  <a routerLink="/admin/audit-logs" [queryParams]="{ targetId: userFilter() }"
                    >Audit log</a
                  >
                </li>
              </ul>
            }
            @if ((data.entries?.items ?? []).length === 0) {
              <app-empty-state
                icon="toll"
                title="No ledger entries"
                description="Nothing was earned, granted or spent yet."
              />
            } @else {
              <div class="billing-table-wrap" [class.admin-dim]="loading()">
                <table class="billing-table" aria-label="Credit ledger">
                  <thead>
                    <tr>
                      <th scope="col">When</th>
                      @if (!userFilter()) {
                        <th scope="col">Account</th>
                      }
                      <th scope="col">Entry</th>
                      <th scope="col" class="num">Amount</th>
                      <th scope="col" class="num">Balance after</th>
                      <th scope="col">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (entry of data.entries?.items ?? []; track entry.id) {
                      <tr data-testid="admin-ledger-row">
                        <td class="nowrap">{{ entry.createdAt | date: 'short' }}</td>
                        @if (!userFilter()) {
                          <td>
                            <a
                              [routerLink]="[]"
                              [queryParams]="{ userId: entry.userId, page: null }"
                              queryParamsHandling="merge"
                              >{{ shortId(entry.userId) }}</a
                            >
                          </td>
                        }
                        <td>
                          <span class="strong">{{ type(entry.type) }}</span>
                          <span class="muted">{{ reason(entry.reason) }}</span>
                        </td>
                        <td class="num strong">{{ signed(entry.amount) }}</td>
                        <td class="num">{{ entry.balanceAfter }}</td>
                        <td>{{ entry.note ?? '' }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              @if ((data.entries?.totalItems ?? 0) > pageSize) {
                <mat-paginator
                  [length]="data.entries?.totalItems ?? 0"
                  [pageIndex]="data.entries?.page ?? 0"
                  [pageSize]="pageSize"
                  [hidePageSize]="true"
                  aria-label="Ledger pages"
                  (page)="onPage($event)"
                />
              }
            }
          }
        </section>

        <app-admin-credit-rules [canEdit]="session.isSuperAdmin()" />
      </div>
    </div>
  `,
  styleUrls: ['../shared/admin-page.scss', './admin-billing.scss'],
  styles: `
    .billing-head .admin-filters {
      margin: 0;
    }
    .admin-error {
      color: var(--color-danger);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminCreditsPageComponent {
  private readonly api = inject(AdminBillingService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly session = inject(SessionService);

  readonly userId = input<string | undefined>();
  readonly page = input<string | undefined>();

  protected readonly pageSize = PAGE_SIZE;
  protected readonly credits = creditsLabel;
  protected readonly signed = signedCredits;
  protected readonly type = creditTypeLabel;
  protected readonly userFilter = computed(() =>
    isUuid(this.userId()) ? this.userId()!.trim() : undefined,
  );
  protected readonly userError = signal(false);
  protected readonly ledger = signal<AdminCreditLedger | null>(null);
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

  protected reason(reason: string | undefined): string {
    return creditReasonLabel(reason);
  }

  /** The distinctive end of an account id (seed ids share their beginning). */
  protected shortId(id: string | undefined): string {
    return id ? `…${id.slice(-8)}` : '—';
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

  protected grant(): void {
    this.dialog
      .open<GrantCreditsDialogComponent, GrantCreditsDialogData, AdminCreditGrantRequest>(
        GrantCreditsDialogComponent,
        { data: { userId: this.userFilter() ?? null }, panelClass: 'app-dialog--md' },
      )
      .afterClosed()
      .subscribe(async (request) => {
        if (!request) {
          return;
        }
        const entry = await runAdminAction(
          this.snackBar,
          this.api.grantAdminCredits({ adminCreditGrantRequest: request }, 'body', false, {
            context: silentErrors(),
          }),
          request.amount > 0
            ? `${creditsLabel(request.amount)} granted.`
            : `${creditsLabel(-request.amount)} removed.`,
          'The balance cannot go below 0.',
        );
        if (!entry) {
          return;
        }
        if (this.userFilter() === request.userId) {
          this.reload();
        } else {
          void this.router.navigate([], {
            queryParams: { userId: request.userId, page: null },
            queryParamsHandling: 'merge',
          });
        }
      });
  }

  private params(): ListAdminCreditLedgerRequestParams {
    const page = Number.parseInt(this.page() ?? '', 10);
    return {
      userId: this.userFilter(),
      page: Number.isFinite(page) && page > 0 ? page : 0,
      size: PAGE_SIZE,
    };
  }

  private load(params: ListAdminCreditLedgerRequestParams): void {
    this.request?.unsubscribe();
    this.loading.set(true);
    this.error.set(null);
    this.request = this.api
      .listAdminCreditLedger(params, 'body', false, { context: silentErrors() })
      .subscribe({
        next: (ledger) => {
          this.ledger.set(ledger);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.error.set(toApiError(error));
          this.loading.set(false);
        },
      });
  }
}
