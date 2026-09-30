import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import type { GrantEntitlementRequest } from '@orenji/api-client';
import { fromLocalInput } from './admin-billing-labels';

/** A key the grant dialog offers: a plan limit (number / unlimited) or a feature (on / off). */
export interface EntitlementKey {
  key: string;
  label: string;
  kind: 'limit' | 'feature';
}

export interface GrantEntitlementDialogData {
  handle: string;
  keys: readonly EntitlementKey[];
}

/** `unlimited` or a whole number for limits; `true` / `false` for features. */
export function entitlementValueError(kind: 'limit' | 'feature', value: string): string | null {
  const text = value.trim().toLowerCase();
  if (kind === 'feature') {
    return text === 'true' || text === 'false' ? null : 'Choose on or off.';
  }
  return text === 'unlimited' || /^\d{1,7}$/.test(text)
    ? null
    : 'Enter a whole number or “unlimited”.';
}

function futureValidator(control: AbstractControl<string>): ValidationErrors | null {
  const iso = fromLocalInput(control.value);
  if (!control.value) {
    return null;
  }
  return iso && Date.parse(iso) > Date.now() ? null : { future: true };
}

/**
 * Grants an entitlement to one account (ADMIN): a plan limit override (a number or
 * `unlimited`) or a feature switch, optionally until a date, with a note for the audit log.
 * Explicit entitlements beat the plan's values (ADR 0014). Closes with the request.
 */
@Component({
  selector: 'app-grant-entitlement-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  template: `
    <h2 mat-dialog-title>Grant an entitlement to &#64;{{ data.handle }}</h2>
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <mat-dialog-content class="grant">
        <p class="grant__text">
          An entitlement overrides the member's plan for one limit or feature, at once.
        </p>
        <mat-form-field appearance="outline">
          <mat-label>Limit or feature</mat-label>
          <mat-select formControlName="featureKey">
            @for (option of data.keys; track option.key) {
              <mat-option [value]="option.key">{{ option.label }}</mat-option>
            }
          </mat-select>
          @if (form.controls.featureKey.hasError('required')) {
            <mat-error>Choose what to override.</mat-error>
          }
        </mat-form-field>
        @if (kind() === 'feature') {
          <mat-form-field appearance="outline">
            <mat-label>Value</mat-label>
            <mat-select formControlName="value">
              <mat-option value="true">On</mat-option>
              <mat-option value="false">Off</mat-option>
            </mat-select>
          </mat-form-field>
        } @else {
          <mat-form-field appearance="outline">
            <mat-label>Value</mat-label>
            <input matInput formControlName="value" autocomplete="off" />
            <mat-hint>A whole number, or “unlimited”.</mat-hint>
            @if (valueError(); as message) {
              <mat-error>{{ message }}</mat-error>
            }
          </mat-form-field>
        }
        <mat-form-field appearance="outline">
          <mat-label>Until (optional)</mat-label>
          <input matInput type="datetime-local" formControlName="expiresAt" />
          <mat-hint>Empty: until someone revokes it.</mat-hint>
          @if (form.controls.expiresAt.hasError('future')) {
            <mat-error>Choose a moment in the future.</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Note</mat-label>
          <textarea matInput formControlName="note" rows="2" maxlength="500"></textarea>
          <mat-hint>Kept with the entitlement and in the audit log.</mat-hint>
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>Cancel</button>
        <button matButton="filled" type="submit">Grant entitlement</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .grant {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-1);
    }
    .grant__text {
      margin: 0 0 var(--spacing-2);
      color: var(--color-text-muted);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GrantEntitlementDialogComponent {
  protected readonly data = inject<GrantEntitlementDialogData>(MAT_DIALOG_DATA);
  private readonly ref =
    inject<MatDialogRef<GrantEntitlementDialogComponent, GrantEntitlementRequest>>(MatDialogRef);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly form = this.fb.group({
    featureKey: this.fb.control('', [Validators.required]),
    value: this.fb.control('', [Validators.required]),
    expiresAt: this.fb.control('', [futureValidator]),
    note: this.fb.control('', [Validators.maxLength(500)]),
  });
  private readonly key = toSignal(this.form.controls.featureKey.valueChanges, {
    initialValue: '',
  });
  private readonly value = toSignal(this.form.controls.value.valueChanges, { initialValue: '' });
  protected readonly kind = computed(
    () => this.data.keys.find((option) => option.key === this.key())?.kind ?? 'limit',
  );
  protected readonly valueError = computed(() =>
    this.value() ? entitlementValueError(this.kind(), this.value()) : null,
  );

  protected submit(): void {
    this.form.markAllAsTouched();
    const value = this.form.getRawValue();
    const error = value.value ? entitlementValueError(this.kind(), value.value) : 'required';
    if (error) {
      this.form.controls.value.setErrors({ value: true });
    }
    if (this.form.invalid || error) {
      return;
    }
    const expiresAt = fromLocalInput(value.expiresAt);
    this.ref.close({
      featureKey: value.featureKey,
      value: value.value.trim().toLowerCase(),
      ...(expiresAt ? { expiresAt } : {}),
      ...(value.note.trim() ? { note: value.note.trim() } : {}),
    });
  }
}
