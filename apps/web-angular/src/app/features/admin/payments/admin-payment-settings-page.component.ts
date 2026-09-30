import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminPaymentsService, PaymentSettings } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { SessionService } from '../../../core/auth/session.service';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { AUDITED, confirmAdminAction, runAdminAction } from '../shared/admin-actions';
import { PaymentsSubnavComponent } from './payments-subnav.component';

/**
 * `/admin/payments/settings`: the payment rules (`GET/PUT /admin/payments/settings`,
 * `platform_settings` `payments.*`): dispute window, platform fee, automatic release after the
 * window, the buyer's reminder lead time and whether ADMINs may refund. Admins read; super admins
 * edit (confirmed, audited, applied by every instance within 60 s).
 */
@Component({
  selector: 'app-admin-payment-settings-page',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSlideToggleModule,
    ErrorStateComponent,
    PageHeaderComponent,
    PaymentsSubnavComponent,
    SkeletonComponent,
  ],
  template: `
    <div class="admin-page">
      <app-page-header
        title="Payments"
        subtitle="The rules of payment protection. Changes apply to new steps within a minute."
      />
      <app-payments-subnav>
        @if (error(); as error) {
          <app-error-state
            title="The payment rules could not load"
            [message]="errorMessage()"
            [requestId]="error.requestId"
            (retry)="load()"
          />
        } @else if (settings(); as current) {
          <form class="admin-card ps" [formGroup]="form" (submit)="save($event)" novalidate>
            <h2>Payment rules</h2>
            @if (!canEdit()) {
              <p class="ps__readonly" role="note">
                <mat-icon aria-hidden="true">lock</mat-icon>
                Only a super admin can change these rules.
              </p>
            }
            <div class="ps__grid">
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Dispute window (days)</mat-label>
                <input
                  matInput
                  type="number"
                  min="1"
                  max="60"
                  formControlName="disputeWindowDays"
                />
                <mat-hint>After the shipment, 1–60</mat-hint>
                @if (form.controls.disputeWindowDays.invalid) {
                  <mat-error>Between 1 and 60 days.</mat-error>
                }
              </mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Platform fee (%)</mat-label>
                <input
                  matInput
                  type="number"
                  min="0"
                  max="30"
                  step="0.01"
                  formControlName="platformFeePercent"
                />
                <mat-hint>Deducted from the seller's payout, 0–30</mat-hint>
                @if (form.controls.platformFeePercent.invalid) {
                  <mat-error>Between 0 and 30, at most 2 decimals.</mat-error>
                }
              </mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Release reminder (hours before)</mat-label>
                <input
                  matInput
                  type="number"
                  min="1"
                  max="168"
                  formControlName="releaseReminderHours"
                />
                <mat-hint>The buyer is reminded before the automatic release, 1–168</mat-hint>
                @if (form.controls.releaseReminderHours.invalid) {
                  <mat-error>Between 1 and 168 hours.</mat-error>
                }
              </mat-form-field>
            </div>
            <div class="ps__toggles">
              <mat-slide-toggle formControlName="autoReleaseEnabled">
                Release the payout automatically when the dispute window ends
              </mat-slide-toggle>
              <mat-slide-toggle formControlName="adminRefundsEnabled">
                Admins may refund payments (otherwise super admins only)
              </mat-slide-toggle>
            </div>
            @if (current.updatedAt) {
              <p class="admin-muted">
                Last changed {{ current.updatedAt | date: 'MMM d, y, h:mm a' }}
              </p>
            }
            @if (canEdit()) {
              <div class="ps__actions">
                <button
                  matButton
                  type="button"
                  [disabled]="saving() || form.pristine"
                  (click)="reset()"
                >
                  Discard
                </button>
                <button matButton="filled" type="submit" [disabled]="saving() || form.pristine">
                  {{ saving() ? 'Saving…' : 'Save rules' }}
                </button>
              </div>
            }
          </form>
        } @else {
          <div aria-busy="true">
            <span class="visually-hidden">Loading the payment rules</span>
            <app-skeleton height="240px" />
          </div>
        }
      </app-payments-subnav>
    </div>
  `,
  styleUrls: ['../shared/admin-page.scss'],
  styles: `
    .ps {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-3);
      max-width: 860px;
    }
    .ps__grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: var(--spacing-3);
    }
    .ps__toggles {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-3);
      margin-top: var(--spacing-3);
    }
    .ps__readonly {
      display: flex;
      align-items: center;
      gap: var(--spacing-2);
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .ps__actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--spacing-2);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminPaymentSettingsPageComponent {
  private readonly api = inject(AdminPaymentsService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly session = inject(SessionService);

  protected readonly settings = signal<PaymentSettings | null>(null);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly saving = signal(false);
  protected readonly canEdit = computed(() => this.session.isSuperAdmin());
  protected readonly errorMessage = computed(() => {
    const error = this.error();
    return error ? friendlyMessage(error) : '';
  });
  protected readonly form = new FormGroup({
    disputeWindowDays: new FormControl<number | null>(null, [
      Validators.required,
      Validators.min(1),
      Validators.max(60),
      Validators.pattern(/^\d+$/),
    ]),
    platformFeePercent: new FormControl<number | null>(null, [
      Validators.required,
      Validators.min(0),
      Validators.max(30),
      Validators.pattern(/^\d+(\.\d{1,2})?$/),
    ]),
    releaseReminderHours: new FormControl<number | null>(null, [
      Validators.required,
      Validators.min(1),
      Validators.max(168),
      Validators.pattern(/^\d+$/),
    ]),
    autoReleaseEnabled: new FormControl(false, { nonNullable: true }),
    adminRefundsEnabled: new FormControl(false, { nonNullable: true }),
  });

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.error.set(null);
    try {
      const settings = await firstValueFrom(
        this.api.getPaymentSettings('body', false, { context: silentErrors() }),
      );
      this.apply(settings);
    } catch (error) {
      this.error.set(toApiError(error));
    }
  }

  protected reset(): void {
    const settings = this.settings();
    if (settings) {
      this.apply(settings);
    }
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    this.form.markAllAsTouched();
    if (!this.canEdit() || this.form.invalid || this.form.pristine) {
      return;
    }
    const confirmed = await confirmAdminAction(this.dialog, {
      title: 'Change the payment rules?',
      message: `The new rules apply to every protected trade's next step within a minute. ${AUDITED}`,
      confirmLabel: 'Save rules',
    });
    if (!confirmed) {
      return;
    }
    const value = this.form.getRawValue();
    this.saving.set(true);
    const updated = await runAdminAction(
      this.snackBar,
      this.api.updatePaymentSettings(
        {
          updatePaymentSettingsRequest: {
            disputeWindowDays: Number(value.disputeWindowDays),
            platformFeePercent: Number(value.platformFeePercent),
            releaseReminderHours: Number(value.releaseReminderHours),
            autoReleaseEnabled: value.autoReleaseEnabled,
            adminRefundsEnabled: value.adminRefundsEnabled,
          },
        },
        'body',
        false,
        { context: silentErrors() },
      ),
      'Payment rules saved.',
    );
    this.saving.set(false);
    if (updated) {
      this.apply(updated);
    }
  }

  private apply(settings: PaymentSettings): void {
    this.settings.set(settings);
    this.form.reset({
      disputeWindowDays: settings.disputeWindowDays,
      platformFeePercent: settings.platformFeePercent,
      releaseReminderHours: settings.releaseReminderHours,
      autoReleaseEnabled: settings.autoReleaseEnabled,
      adminRefundsEnabled: settings.adminRefundsEnabled,
    });
    if (this.canEdit()) {
      this.form.enable();
    } else {
      this.form.disable();
    }
  }
}
