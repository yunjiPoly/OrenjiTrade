import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import type { AdminPlan, UpdatePlanRequest } from '@orenji/api-client';
import { featureLabel } from '../../../shared/plans/plan-labels';
import { LIMITS } from './admin-billing-labels';

const PRICE = /^\d{1,4}([.,]\d{1,2})?$/;

/**
 * Edits a plan (SUPER_ADMIN): name, description, display price and currency, availability,
 * order and feature switches. The FREE plan cannot be disabled; limits are edited in Usage
 * limits. Closes with the update request.
 */
@Component({
  selector: 'app-plan-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
  ],
  template: `
    <h2 mat-dialog-title>Edit the {{ plan.name }} plan</h2>
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <mat-dialog-content class="plan-form">
        <mat-form-field appearance="outline">
          <mat-label>Name</mat-label>
          <input matInput formControlName="name" [attr.maxlength]="limits.planName" />
          @if (form.controls.name.hasError('required')) {
            <mat-error>Enter a name.</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Description</mat-label>
          <textarea
            matInput
            formControlName="description"
            rows="2"
            [attr.maxlength]="limits.planDescription"
          ></textarea>
        </mat-form-field>
        <div class="plan-form__row">
          <mat-form-field appearance="outline">
            <mat-label>Monthly price</mat-label>
            <input matInput formControlName="monthlyPrice" inputmode="decimal" />
            <mat-hint>Shown on the plans; the provider charges its own price.</mat-hint>
            @if (form.controls.monthlyPrice.invalid) {
              <mat-error>0.00 to 9999.99.</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Currency</mat-label>
            <input matInput formControlName="currency" maxlength="3" />
            @if (form.controls.currency.invalid) {
              <mat-error>A 3-letter code.</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Order</mat-label>
            <input matInput type="number" formControlName="sortOrder" min="0" max="10000" />
          </mat-form-field>
        </div>
        <mat-slide-toggle formControlName="active" [disabled]="plan.code === 'FREE'">
          Offered to members
        </mat-slide-toggle>
        @if (features.length) {
          <fieldset class="plan-form__features">
            <legend>Features</legend>
            @for (feature of features.controls; track $index) {
              <mat-slide-toggle [formControl]="feature.controls.enabled">
                {{ label(feature.controls.key.value) }}
                <code>{{ feature.controls.key.value }}</code>
              </mat-slide-toggle>
            }
          </fieldset>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>Cancel</button>
        <button matButton="filled" type="submit">Save plan</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .plan-form {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-2);
    }
    .plan-form__row {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-3);
    }
    .plan-form__row mat-form-field {
      flex: 1 1 140px;
    }
    .plan-form__features {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-2);
      margin: var(--spacing-2) 0 0;
      padding: var(--spacing-3);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
    }
    .plan-form__features code {
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlanDialogComponent {
  protected readonly plan = inject<AdminPlan>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<PlanDialogComponent, UpdatePlanRequest>>(MatDialogRef);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly limits = LIMITS;
  protected readonly features = this.fb.array(
    (this.plan.features ?? []).map((feature) =>
      this.fb.group({
        key: this.fb.control(feature.key ?? ''),
        enabled: this.fb.control(!!feature.enabled),
        value: this.fb.control(feature.value ?? ''),
      }),
    ),
  );
  protected readonly form = this.fb.group({
    name: this.fb.control(this.plan.name ?? '', [
      Validators.required,
      Validators.maxLength(LIMITS.planName),
    ]),
    description: this.fb.control(this.plan.description ?? '', [
      Validators.maxLength(LIMITS.planDescription),
    ]),
    monthlyPrice: this.fb.control((this.plan.monthlyPrice ?? 0).toFixed(2), [
      Validators.required,
      Validators.pattern(PRICE),
    ]),
    currency: this.fb.control(this.plan.currency ?? 'CAD', [
      Validators.required,
      Validators.pattern(/^[A-Za-z]{3}$/),
    ]),
    active: this.fb.control(this.plan.active !== false),
    sortOrder: this.fb.control(this.plan.sortOrder ?? 0, [
      Validators.min(0),
      Validators.max(10_000),
    ]),
    features: this.features,
  });

  protected label(key: string): string {
    return featureLabel(key, true);
  }

  protected submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      return;
    }
    const value = this.form.getRawValue();
    this.ref.close({
      name: value.name.trim(),
      description: value.description.trim() || undefined,
      monthlyPrice: Number(value.monthlyPrice.replace(',', '.')),
      currency: value.currency.toUpperCase(),
      active: this.plan.code === 'FREE' ? true : value.active,
      sortOrder: Number(value.sortOrder),
      features: value.features.map((feature) => ({
        key: feature.key,
        enabled: feature.enabled,
        ...(feature.value ? { value: feature.value } : {}),
      })),
    });
  }
}
