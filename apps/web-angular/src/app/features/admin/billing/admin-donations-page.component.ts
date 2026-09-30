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
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import {
  AdminBillingService,
  AdminDonations,
  DonationSettings,
  ListAdminDonationsRequestParams,
} from '@orenji/api-client';
import { Subscription, firstValueFrom } from 'rxjs';
import { SessionService } from '../../../core/auth/session.service';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { DONATION_STATUSES, amountLabel } from '../../../shared/billing/billing-labels';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { confirmAdminAction, runAdminAction } from '../shared/admin-actions';
import { AdminChipComponent } from '../shared/admin-chip.component';
import { parseMoney, statusText, statusTone } from './admin-billing-labels';

const PAGE_SIZE = 20;
const CURRENCY_LIST = /^[A-Za-z]{3}(\s*,\s*[A-Za-z]{3}){0,9}$/;

/**
 * `/admin/donations` (ADMIN; SUPER_ADMIN changes the settings): voluntary donations, newest
 * first, with totals of succeeded donations per currency (`?status=&page=`), and the accepted
 * amounts and currencies (`donations.*`, audited `donations.settings.update`). A row opens the
 * donation (webhooks, refund).
 */
@Component({
  selector: 'app-admin-donations-page',
  imports: [
    DatePipe,
    ReactiveFormsModule,
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
        title="Donations"
        subtitle="Voluntary support. Donations never change ratings, search ranking or trust."
      />
      <div class="billing-sections">
        <section aria-labelledby="donations-title">
          <div class="billing-head">
            <h2 id="donations-title">Donations</h2>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Status</mat-label>
              <mat-select
                [value]="statusFilter() ?? null"
                (selectionChange)="setStatus($event.value)"
              >
                <mat-option [value]="null">Any status</mat-option>
                @for (status of statuses; track status) {
                  <mat-option [value]="status">{{ text(status) }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </div>
          @if (error(); as error) {
            <app-error-state
              title="Donations could not load"
              [message]="message(error)"
              [requestId]="error.requestId"
              (retry)="reload()"
            />
          } @else if (loading() && !result()) {
            <app-skeleton variant="list" lines="5" />
          } @else if (result(); as data) {
            @if ((data.totals ?? []).length) {
              <ul class="billing-tiles" aria-label="Totals of succeeded donations">
                @for (total of data.totals ?? []; track total.currency) {
                  <li class="billing-tile">
                    <span class="billing-tile__label"
                      >{{ total.donations }} succeeded · {{ total.currency }}</span
                    >
                    <span class="billing-tile__value">{{
                      money(total.total, total.currency)
                    }}</span>
                  </li>
                }
              </ul>
            }
            @if ((data.donations?.items ?? []).length === 0) {
              <app-empty-state icon="volunteer_activism" title="No donations match" />
            } @else {
              <div class="billing-table-wrap" [class.admin-dim]="loading()">
                <table class="billing-table" aria-label="Donations">
                  <thead>
                    <tr>
                      <th scope="col">When</th>
                      <th scope="col" class="num">Amount</th>
                      <th scope="col">Status</th>
                      <th scope="col">Public thanks</th>
                      <th scope="col">Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (donation of data.donations?.items ?? []; track donation.id) {
                      <tr data-testid="admin-donation-row">
                        <td class="nowrap">
                          <a [routerLink]="['/admin/donations', donation.id]">{{
                            donation.createdAt | date: 'short'
                          }}</a>
                        </td>
                        <td class="num strong">{{ money(donation.amount, donation.currency) }}</td>
                        <td>
                          <app-admin-chip [tone]="tone(donation.status)">{{
                            text(donation.status)
                          }}</app-admin-chip>
                        </td>
                        <td>{{ donation.publicThanks ? 'Yes' : 'No' }}</td>
                        <td>{{ donation.message ?? '' }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              @if ((data.donations?.totalItems ?? 0) > pageSize) {
                <mat-paginator
                  [length]="data.donations?.totalItems ?? 0"
                  [pageIndex]="data.donations?.page ?? 0"
                  [pageSize]="pageSize"
                  [hidePageSize]="true"
                  aria-label="Donation pages"
                  (page)="onPage($event)"
                />
              }
            }
          }
        </section>

        <section class="admin-card" aria-labelledby="donation-settings-title">
          <h2 id="donation-settings-title">Accepted amounts</h2>
          @if (settingsError(); as error) {
            <app-error-state
              compact
              title="Settings could not load"
              [message]="message(error)"
              (retry)="loadSettings()"
            />
          } @else if (settings(); as current) {
            <form class="settings" [formGroup]="form" (ngSubmit)="saveSettings()" novalidate>
              <mat-form-field appearance="outline">
                <mat-label>Minimum</mat-label>
                <input matInput formControlName="minAmount" inputmode="decimal" />
                @if (form.controls.minAmount.invalid) {
                  <mat-error>0.50 to 1000.00.</mat-error>
                }
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Maximum</mat-label>
                <input matInput formControlName="maxAmount" inputmode="decimal" />
                @if (form.controls.maxAmount.invalid) {
                  <mat-error>1.00 to 10000.00, at least the minimum.</mat-error>
                }
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Currencies</mat-label>
                <input matInput formControlName="currencies" />
                <mat-hint>ISO codes separated by commas, e.g. CAD, USD.</mat-hint>
                @if (form.controls.currencies.invalid) {
                  <mat-error>1 to 10 three-letter codes.</mat-error>
                }
              </mat-form-field>
              <div class="settings__foot">
                <span class="admin-muted">
                  @if (current.updatedAt) {
                    Last changed {{ current.updatedAt | date: 'medium' }}
                  }
                </span>
                @if (session.isSuperAdmin()) {
                  <button matButton="filled" type="submit" [disabled]="form.pristine || saving()">
                    Save amounts
                  </button>
                } @else {
                  <span class="admin-muted">Only super admins change these.</span>
                }
              </div>
            </form>
          } @else {
            <app-skeleton variant="list" lines="2" />
          }
        </section>
      </div>
    </div>
  `,
  styleUrls: ['../shared/admin-page.scss', './admin-billing.scss'],
  styles: `
    .settings {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: var(--spacing-2) var(--spacing-4);
    }
    .settings__foot {
      display: flex;
      flex-wrap: wrap;
      grid-column: 1 / -1;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-3);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDonationsPageComponent {
  private readonly api = inject(AdminBillingService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly session = inject(SessionService);

  readonly status = input<string | undefined>();
  readonly page = input<string | undefined>();

  protected readonly statuses = DONATION_STATUSES;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly text = statusText;
  protected readonly tone = statusTone;
  protected readonly money = amountLabel;
  protected readonly statusFilter = computed(() =>
    (DONATION_STATUSES as readonly string[]).includes(this.status() ?? '')
      ? (this.status() as ListAdminDonationsRequestParams['status'])
      : undefined,
  );
  protected readonly result = signal<AdminDonations | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly settings = signal<DonationSettings | null>(null);
  protected readonly settingsError = signal<ApiError | null>(null);
  protected readonly saving = signal(false);
  protected readonly form = this.fb.group({
    minAmount: this.fb.control('', [Validators.required]),
    maxAmount: this.fb.control('', [Validators.required]),
    currencies: this.fb.control('', [Validators.required, Validators.pattern(CURRENCY_LIST)]),
  });

  private request: Subscription | null = null;

  constructor() {
    effect(() => {
      const params = this.params();
      untracked(() => this.load(params));
    });
    void this.loadSettings();
    inject(DestroyRef).onDestroy(() => this.request?.unsubscribe());
  }

  protected message(error: ApiError): string {
    return friendlyMessage(error);
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
    this.load(this.params());
  }

  async loadSettings(): Promise<void> {
    this.settingsError.set(null);
    try {
      this.showSettings(
        await firstValueFrom(
          this.api.getAdminDonationSettings('body', false, { context: silentErrors() }),
        ),
      );
    } catch (error) {
      this.settingsError.set(toApiError(error));
    }
  }

  protected async saveSettings(): Promise<void> {
    const value = this.form.getRawValue();
    const min = parseMoney(value.minAmount);
    const max = parseMoney(value.maxAmount);
    const currencies = value.currencies
      .split(',')
      .map((code) => code.trim().toUpperCase())
      .filter(Boolean);
    if (min === null || Number.isNaN(min) || min < 0.5 || min > 1000) {
      this.form.controls.minAmount.setErrors({ range: true });
    }
    if (
      max === null ||
      Number.isNaN(max) ||
      max < 1 ||
      max > 10000 ||
      (min !== null && max < min)
    ) {
      this.form.controls.maxAmount.setErrors({ range: true });
    }
    this.form.markAllAsTouched();
    if (this.form.invalid || min === null || max === null) {
      return;
    }
    const confirmed = await confirmAdminAction(this.dialog, {
      title: 'Change the accepted donations?',
      message: `Donations from ${min.toFixed(2)} to ${max.toFixed(2)} in ${currencies.join(', ')}. Applies to new donations.`,
      confirmLabel: 'Save amounts',
    });
    if (!confirmed) {
      return;
    }
    this.saving.set(true);
    const saved = await runAdminAction(
      this.snackBar,
      this.api.updateAdminDonationSettings(
        { updateDonationSettingsRequest: { minAmount: min, maxAmount: max, currencies } },
        'body',
        false,
        { context: silentErrors() },
      ),
      'The accepted donations are saved.',
    );
    this.saving.set(false);
    if (saved) {
      this.showSettings(saved);
    }
  }

  private showSettings(settings: DonationSettings): void {
    this.settings.set(settings);
    this.form.reset({
      minAmount: settings.minAmount !== undefined ? settings.minAmount.toFixed(2) : '',
      maxAmount: settings.maxAmount !== undefined ? settings.maxAmount.toFixed(2) : '',
      currencies: (settings.currencies ?? []).join(', '),
    });
    if (this.session.isSuperAdmin()) {
      this.form.enable();
    } else {
      this.form.disable();
    }
  }

  private params(): ListAdminDonationsRequestParams {
    const page = Number.parseInt(this.page() ?? '', 10);
    return {
      status: this.statusFilter(),
      page: Number.isFinite(page) && page > 0 ? page : 0,
      size: PAGE_SIZE,
    };
  }

  private load(params: ListAdminDonationsRequestParams): void {
    this.request?.unsubscribe();
    this.loading.set(true);
    this.error.set(null);
    this.request = this.api
      .listAdminDonations(params, 'body', false, { context: silentErrors() })
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
