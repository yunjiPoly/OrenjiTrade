import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  AdminBillingService,
  CreditProduct,
  CreditSettings,
  UpdateCreditProductRequest,
} from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { creditsLabel, durationLabel } from '../../../shared/billing/billing-labels';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { confirmAdminAction, runAdminAction } from '../shared/admin-actions';
import { AdminChipComponent } from '../shared/admin-chip.component';
import { CreditProductDialogComponent } from './credit-product-dialog.component';

/**
 * Credit products (what credits unlock) and the referral rules (`credits.*` settings). Everybody
 * with ADMIN reads them; SUPER_ADMIN edits them (audited `credits.product.update`,
 * `credits.settings.update`).
 */
@Component({
  selector: 'app-admin-credit-rules',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    AdminChipComponent,
    ErrorStateComponent,
    SkeletonComponent,
  ],
  template: `
    <section class="admin-card" aria-labelledby="products-title">
      <div class="billing-head">
        <h2 id="products-title">Credit products</h2>
        @if (!canEdit()) {
          <span class="admin-muted">Only super admins change products.</span>
        }
      </div>
      @if (productsError(); as error) {
        <app-error-state
          compact
          title="Products could not load"
          [message]="message(error)"
          (retry)="load()"
        />
      } @else if (products(); as list) {
        <div class="billing-table-wrap">
          <table class="billing-table" aria-label="Credit products">
            <thead>
              <tr>
                <th scope="col">Product</th>
                <th scope="col">Unlocks</th>
                <th scope="col" class="num">Cost</th>
                <th scope="col" class="num">Duration</th>
                <th scope="col">Status</th>
                @if (canEdit()) {
                  <th scope="col"><span class="visually-hidden">Actions</span></th>
                }
              </tr>
            </thead>
            <tbody>
              @for (product of list; track product.key) {
                <tr>
                  <td>
                    <span class="strong">{{ product.name }}</span>
                    <span class="muted">{{ product.key }}</span>
                  </td>
                  <td>
                    <code>{{ product.featureKey }}</code> = {{ product.featureValue }}
                  </td>
                  <td class="num">{{ credits(product.cost) }}</td>
                  <td class="num">{{ duration(product.durationHours) }}</td>
                  <td>
                    <app-admin-chip [tone]="product.active ? 'success' : 'neutral'">{{
                      product.active ? 'Available' : 'Hidden'
                    }}</app-admin-chip>
                  </td>
                  @if (canEdit()) {
                    <td>
                      <button
                        matButton
                        type="button"
                        [attr.aria-label]="'Edit ' + product.name"
                        (click)="editProduct(product)"
                      >
                        Edit
                      </button>
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <app-skeleton variant="list" lines="3" />
      }
    </section>

    <section class="admin-card" aria-labelledby="referral-rules-title">
      <h2 id="referral-rules-title">Referral rules</h2>
      @if (settingsError(); as error) {
        <app-error-state
          compact
          title="Referral rules could not load"
          [message]="message(error)"
          (retry)="load()"
        />
      } @else if (settings(); as current) {
        <form class="rules" [formGroup]="form" (ngSubmit)="saveSettings()" novalidate>
          <mat-form-field appearance="outline">
            <mat-label>Referrer reward</mat-label>
            <input matInput type="number" formControlName="referrerReward" min="0" max="10000" />
            <mat-hint>Credits for the member who shared the code.</mat-hint>
            @if (form.controls.referrerReward.invalid) {
              <mat-error>0 to 10,000.</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>New member reward</mat-label>
            <input matInput type="number" formControlName="refereeReward" min="0" max="10000" />
            @if (form.controls.refereeReward.invalid) {
              <mat-error>0 to 10,000.</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Redemption window (days)</mat-label>
            <input matInput type="number" formControlName="maxAccountAgeDays" min="1" max="365" />
            <mat-hint>After joining.</mat-hint>
            @if (form.controls.maxAccountAgeDays.invalid) {
              <mat-error>1 to 365 days.</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Redemptions per code</mat-label>
            <input matInput type="number" formControlName="maxPerReferrer" min="1" max="10000" />
            @if (form.controls.maxPerReferrer.invalid) {
              <mat-error>1 to 10,000.</mat-error>
            }
          </mat-form-field>
          <div class="rules__foot">
            <span class="admin-muted">
              @if (current.updatedAt) {
                Last changed {{ current.updatedAt | date: 'medium' }}
              }
            </span>
            @if (canEdit()) {
              <button matButton="filled" type="submit" [disabled]="form.pristine || saving()">
                Save referral rules
              </button>
            }
          </div>
        </form>
      } @else {
        <app-skeleton variant="list" lines="2" />
      }
    </section>
  `,
  styleUrls: ['../shared/admin-page.scss', './admin-billing.scss'],
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-6);
    }
    .rules {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: var(--spacing-2) var(--spacing-4);
    }
    .rules__foot {
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
export class AdminCreditRulesComponent {
  private readonly api = inject(AdminBillingService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly fb = inject(NonNullableFormBuilder);

  /** SUPER_ADMIN may change products and rules. */
  readonly canEdit = input(false);

  protected readonly products = signal<CreditProduct[] | null>(null);
  protected readonly productsError = signal<ApiError | null>(null);
  protected readonly settings = signal<CreditSettings | null>(null);
  protected readonly settingsError = signal<ApiError | null>(null);
  protected readonly saving = signal(false);
  protected readonly credits = creditsLabel;
  protected readonly duration = durationLabel;
  protected readonly form = this.fb.group({
    referrerReward: this.fb.control(0, [
      Validators.required,
      Validators.min(0),
      Validators.max(10_000),
    ]),
    refereeReward: this.fb.control(0, [
      Validators.required,
      Validators.min(0),
      Validators.max(10_000),
    ]),
    maxAccountAgeDays: this.fb.control(30, [
      Validators.required,
      Validators.min(1),
      Validators.max(365),
    ]),
    maxPerReferrer: this.fb.control(50, [
      Validators.required,
      Validators.min(1),
      Validators.max(10_000),
    ]),
  });

  constructor() {
    void this.load();
  }

  protected message(error: ApiError): string {
    return friendlyMessage(error);
  }

  async load(): Promise<void> {
    this.productsError.set(null);
    this.settingsError.set(null);
    await Promise.all([
      firstValueFrom(this.api.listAdminCreditProducts('body', false, { context: silentErrors() }))
        .then((products) => this.products.set(products ?? []))
        .catch((error: unknown) => this.productsError.set(toApiError(error))),
      firstValueFrom(this.api.getAdminCreditSettings('body', false, { context: silentErrors() }))
        .then((settings) => this.showSettings(settings))
        .catch((error: unknown) => this.settingsError.set(toApiError(error))),
    ]);
  }

  protected editProduct(product: CreditProduct): void {
    this.dialog
      .open<CreditProductDialogComponent, CreditProduct, UpdateCreditProductRequest>(
        CreditProductDialogComponent,
        { data: product, panelClass: 'app-dialog--md' },
      )
      .afterClosed()
      .subscribe(async (request) => {
        if (!request || !product.key) {
          return;
        }
        const saved = await runAdminAction(
          this.snackBar,
          this.api.updateAdminCreditProduct(
            { key: product.key, updateCreditProductRequest: request },
            'body',
            false,
            { context: silentErrors() },
          ),
          `“${request.name}” is saved.`,
        );
        if (saved) {
          this.products.update((list) =>
            (list ?? []).map((entry) => (entry.key === saved.key ? saved : entry)),
          );
        }
      });
  }

  protected async saveSettings(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      return;
    }
    const value = this.form.getRawValue();
    const confirmed = await confirmAdminAction(this.dialog, {
      title: 'Change the referral rules?',
      message: `Referrers earn ${creditsLabel(value.referrerReward)}, new members ${creditsLabel(value.refereeReward)}, within ${value.maxAccountAgeDays} days of joining, up to ${value.maxPerReferrer} redemptions per code. Applies to the next redemptions.`,
      confirmLabel: 'Save referral rules',
    });
    if (!confirmed) {
      return;
    }
    this.saving.set(true);
    const saved = await runAdminAction(
      this.snackBar,
      this.api.updateAdminCreditSettings(
        {
          updateCreditSettingsRequest: {
            referrerReward: Number(value.referrerReward),
            refereeReward: Number(value.refereeReward),
            maxAccountAgeDays: Number(value.maxAccountAgeDays),
            maxPerReferrer: Number(value.maxPerReferrer),
          },
        },
        'body',
        false,
        { context: silentErrors() },
      ),
      'The referral rules are saved.',
    );
    this.saving.set(false);
    if (saved) {
      this.showSettings(saved);
    }
  }

  private showSettings(settings: CreditSettings): void {
    this.settings.set(settings);
    this.form.reset({
      referrerReward: settings.referrerReward ?? 0,
      refereeReward: settings.refereeReward ?? 0,
      maxAccountAgeDays: settings.maxAccountAgeDays ?? 30,
      maxPerReferrer: settings.maxPerReferrer ?? 50,
    });
    if (this.canEdit()) {
      this.form.enable();
    } else {
      this.form.disable();
    }
  }
}
