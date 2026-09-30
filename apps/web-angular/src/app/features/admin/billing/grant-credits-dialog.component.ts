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
import { AdminCreditGrantRequest, AdminCreditGrantRequestReasonEnum } from '@orenji/api-client';
import { creditsLabel } from '../../../shared/billing/billing-labels';
import { GRANT_REASONS, LIMITS, isUuid } from './admin-billing-labels';

export interface GrantCreditsDialogData {
  userId?: string | null;
}

function uuidValidator(control: AbstractControl<string>): ValidationErrors | null {
  return !control.value || isUuid(control.value) ? null : { uuid: true };
}

function amountValidator(control: AbstractControl<string>): ValidationErrors | null {
  const text = `${control.value ?? ''}`.trim();
  if (!text) {
    return null;
  }
  const value = Number(text);
  return Number.isInteger(value) && value !== 0 && Math.abs(value) <= LIMITS.grantAmount
    ? null
    : { amount: true };
}

/**
 * Grant (positive) or adjust (negative) a member's credits: account id, amount, reason and a
 * note for the ledger. The submit button restates the change; the ledger is never edited, a
 * negative amount appends an ADJUST entry (never below a balance of 0). Closes with the request.
 */
@Component({
  selector: 'app-grant-credits-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  template: `
    <h2 mat-dialog-title>Grant or adjust credits</h2>
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <mat-dialog-content class="grant">
        <p class="grant__text">
          Credits are non-cash. A positive amount grants credits; a negative amount corrects a
          balance (never below 0). The ledger keeps every entry.
        </p>
        <mat-form-field appearance="outline">
          <mat-label>Account id</mat-label>
          <input matInput formControlName="userId" autocomplete="off" />
          <mat-hint>From the account page in Users.</mat-hint>
          @if (form.controls.userId.hasError('required')) {
            <mat-error>Enter the account id.</mat-error>
          } @else if (form.controls.userId.hasError('uuid')) {
            <mat-error>Enter a full account id (UUID).</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Amount</mat-label>
          <input matInput formControlName="amount" inputmode="numeric" autocomplete="off" />
          <mat-hint>Whole credits, e.g. 100 or -20.</mat-hint>
          @if (form.controls.amount.hasError('required')) {
            <mat-error>Enter an amount.</mat-error>
          } @else if (form.controls.amount.hasError('amount')) {
            <mat-error>A whole number between -{{ max }} and {{ max }}, not 0.</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Reason</mat-label>
          <mat-select formControlName="reason">
            @for (reason of reasons; track reason) {
              <mat-option [value]="reason">{{ reasonLabel(reason) }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Note</mat-label>
          <textarea matInput formControlName="note" rows="2" [attr.maxlength]="noteMax"></textarea>
          <mat-hint>Kept in the ledger and the audit log; never shown to the member.</mat-hint>
          @if (form.controls.note.hasError('required')) {
            <mat-error>Add a short note for the ledger.</mat-error>
          }
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>Cancel</button>
        <button matButton="filled" type="submit">{{ submitLabel() }}</button>
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
export class GrantCreditsDialogComponent {
  private readonly data = inject<GrantCreditsDialogData>(MAT_DIALOG_DATA);
  private readonly ref =
    inject<MatDialogRef<GrantCreditsDialogComponent, AdminCreditGrantRequest>>(MatDialogRef);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly reasons = GRANT_REASONS;
  protected readonly max = LIMITS.grantAmount;
  protected readonly noteMax = LIMITS.grantNote;
  protected readonly form = this.fb.group({
    userId: this.fb.control(this.data.userId ?? '', [Validators.required, uuidValidator]),
    amount: this.fb.control('', [Validators.required, amountValidator]),
    reason: this.fb.control<string>('ADMIN'),
    note: this.fb.control('', [Validators.required, Validators.maxLength(LIMITS.grantNote)]),
  });
  private readonly amount = toSignal(this.form.controls.amount.valueChanges, {
    initialValue: '',
  });
  protected readonly submitLabel = computed(() => {
    const value = Number(this.amount());
    if (!Number.isInteger(value) || value === 0) {
      return 'Grant credits';
    }
    return value > 0 ? `Grant ${creditsLabel(value)}` : `Remove ${creditsLabel(-value)}`;
  });

  protected reasonLabel(reason: string): string {
    return reason.charAt(0) + reason.slice(1).toLowerCase();
  }

  protected submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      return;
    }
    const value = this.form.getRawValue();
    this.ref.close({
      userId: value.userId.trim(),
      amount: Number(value.amount),
      reason: value.reason as AdminCreditGrantRequestReasonEnum,
      note: value.note.trim(),
    });
  }
}
