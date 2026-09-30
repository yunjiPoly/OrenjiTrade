import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import type { CreditProduct, UpdateCreditProductRequest } from '@orenji/api-client';
import { LIMITS } from './admin-billing-labels';

/**
 * Edits a credit product (SUPER_ADMIN): name, description, unlocked value, cost, duration and
 * availability. The entitlement key is fixed. Closes with the update request.
 */
@Component({
  selector: 'app-credit-product-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
  ],
  template: `
    <h2 mat-dialog-title>Edit “{{ product.name }}”</h2>
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <mat-dialog-content class="product-form">
        <p class="product-form__key">
          Unlocks <code>{{ product.featureKey }}</code> (key <code>{{ product.key }}</code
          >)
        </p>
        <mat-form-field appearance="outline">
          <mat-label>Name</mat-label>
          <input matInput formControlName="name" [attr.maxlength]="limits.productName" />
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
            [attr.maxlength]="limits.productDescription"
          ></textarea>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Unlocked value</mat-label>
          <input matInput formControlName="featureValue" />
          <mat-hint>true, a number or unlimited.</mat-hint>
        </mat-form-field>
        <div class="product-form__row">
          <mat-form-field appearance="outline">
            <mat-label>Cost (credits)</mat-label>
            <input matInput type="number" formControlName="cost" min="1" max="100000" />
            @if (form.controls.cost.invalid) {
              <mat-error>1 to 100,000 credits.</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Duration (hours)</mat-label>
            <input matInput type="number" formControlName="durationHours" min="1" max="720" />
            @if (form.controls.durationHours.invalid) {
              <mat-error>1 to 720 hours.</mat-error>
            }
          </mat-form-field>
        </div>
        <mat-slide-toggle formControlName="active">Members can unlock it</mat-slide-toggle>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>Cancel</button>
        <button matButton="filled" type="submit">Save product</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .product-form {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-1);
    }
    .product-form__key {
      margin: 0 0 var(--spacing-2);
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .product-form__row {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-3);
    }
    .product-form__row mat-form-field {
      flex: 1 1 160px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreditProductDialogComponent {
  protected readonly product = inject<CreditProduct>(MAT_DIALOG_DATA);
  private readonly ref =
    inject<MatDialogRef<CreditProductDialogComponent, UpdateCreditProductRequest>>(MatDialogRef);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly limits = LIMITS;
  protected readonly form = this.fb.group({
    name: this.fb.control(this.product.name ?? '', [
      Validators.required,
      Validators.maxLength(LIMITS.productName),
    ]),
    description: this.fb.control(this.product.description ?? '', [
      Validators.maxLength(LIMITS.productDescription),
    ]),
    featureValue: this.fb.control(this.product.featureValue ?? '', [Validators.maxLength(200)]),
    cost: this.fb.control(this.product.cost ?? 1, [
      Validators.required,
      Validators.min(1),
      Validators.max(100_000),
    ]),
    durationHours: this.fb.control(this.product.durationHours ?? 24, [
      Validators.required,
      Validators.min(1),
      Validators.max(720),
    ]),
    active: this.fb.control(this.product.active !== false),
  });

  protected submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      return;
    }
    const value = this.form.getRawValue();
    this.ref.close({
      name: value.name.trim(),
      description: value.description.trim() || undefined,
      featureValue: value.featureValue.trim() || undefined,
      cost: Number(value.cost),
      durationHours: Number(value.durationHours),
      active: value.active,
    });
  }
}
