import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { endOfDayIso, tomorrowIso } from '../users/suspend-dialog.component';

export interface ReasonDialogData {
  title: string;
  message: string;
  confirmLabel: string;
  /** Label of the text field ("Reason", "Note"). */
  label?: string;
  hint?: string;
  /** A text is required (default) or optional. */
  required?: boolean;
  maxLength?: number;
  /** Offer an optional end date (pause listings until …). */
  withUntil?: boolean;
  untilLabel?: string;
  tone?: 'default' | 'danger';
}

export interface ReasonDialogResult {
  reason: string;
  /** End of the chosen day as an ISO instant, or null. */
  until: string | null;
}

/**
 * Confirmation of an admin write that needs a reason for the audit log (hide a listing or a
 * rating, unpublish a binder, pause listings…), with an optional end date.
 */
@Component({
  selector: 'app-reason-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <mat-dialog-content>
        <p class="reason__text">{{ data.message }}</p>
        <mat-form-field appearance="outline" class="reason__field">
          <mat-label>{{ label }}</mat-label>
          <textarea
            matInput
            formControlName="reason"
            rows="3"
            [attr.maxlength]="max"
            [required]="required"
          ></textarea>
          <mat-hint>{{ data.hint ?? 'Kept in the audit log.' }}</mat-hint>
          <mat-hint align="end">{{ form.controls.reason.value.length }} / {{ max }}</mat-hint>
          @if (form.controls.reason.hasError('required')) {
            <mat-error>Give a short reason for the audit log.</mat-error>
          } @else if (form.controls.reason.hasError('maxlength')) {
            <mat-error>Keep it under {{ max }} characters.</mat-error>
          }
        </mat-form-field>
        @if (data.withUntil) {
          <mat-form-field appearance="outline" class="reason__field">
            <mat-label>{{ data.untilLabel ?? 'Until (optional)' }}</mat-label>
            <input matInput type="date" formControlName="until" [min]="minDate" />
            <mat-hint>Leave empty to keep it until someone lifts it.</mat-hint>
          </mat-form-field>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>Cancel</button>
        <button matButton="filled" type="submit" [class.reason__danger]="data.tone === 'danger'">
          {{ data.confirmLabel }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .reason__text {
      margin: 0 0 var(--spacing-4);
      color: var(--color-text-muted);
    }
    .reason__field {
      display: block;
      width: 100%;
      margin-bottom: var(--spacing-2);
    }
    .reason__danger {
      --mat-button-filled-container-color: var(--color-danger);
      --mat-button-filled-label-text-color: #fff;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReasonDialogComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly ref =
    inject<MatDialogRef<ReasonDialogComponent, ReasonDialogResult>>(MatDialogRef);
  protected readonly data = inject<ReasonDialogData>(MAT_DIALOG_DATA);
  protected readonly required = this.data.required !== false;
  protected readonly max = this.data.maxLength ?? 500;
  protected readonly label = this.data.label ?? (this.required ? 'Reason' : 'Note (optional)');
  protected readonly minDate = tomorrowIso();
  protected readonly form = this.fb.group({
    reason: ['', [...(this.required ? [Validators.required] : []), Validators.maxLength(this.max)]],
    until: [''],
  });

  protected submit(): void {
    const reason = this.form.controls.reason.value.trim();
    if (this.required && !reason) {
      this.form.controls.reason.setValue('');
    }
    if (this.form.invalid || (this.required && !reason)) {
      this.form.markAllAsTouched();
      return;
    }
    const until = this.form.controls.until.value;
    this.ref.close({ reason, until: until ? endOfDayIso(until) : null });
  }
}
