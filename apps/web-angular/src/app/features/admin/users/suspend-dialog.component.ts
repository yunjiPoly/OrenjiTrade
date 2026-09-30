import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { SuspendUserRequest } from '@orenji/api-client';

export interface SuspendDialogData {
  handle: string;
}

/** Local date (yyyy-mm-dd) of tomorrow, the earliest end date of a temporary suspension. */
export function tomorrowIso(now = new Date()): string {
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
  const day = String(tomorrow.getDate()).padStart(2, '0');
  return `${tomorrow.getFullYear()}-${month}-${day}`;
}

/** End of the given local day as an ISO instant (`until` of the suspend request). */
export function endOfDayIso(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day, 23, 59, 59).toISOString();
}

/** Asks for the reason (required) and an optional end date; closes with the request body. */
@Component({
  selector: 'app-suspend-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  template: `
    <h2 mat-dialog-title>Suspend &#64;{{ data.handle }}</h2>
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <mat-dialog-content>
        <p class="suspend__text">
          The collector is signed out, hidden from the map and search, and cannot use OrenjiTrade
          until the suspension ends or is lifted. This action is recorded in the audit log.
        </p>
        <mat-form-field appearance="outline" class="suspend__field">
          <mat-label>Reason</mat-label>
          <textarea matInput formControlName="reason" rows="3" maxlength="500" required></textarea>
          <mat-hint>Visible to staff in the audit log.</mat-hint>
          @if (form.controls.reason.hasError('required')) {
            <mat-error>A reason is required.</mat-error>
          }
        </mat-form-field>
        <mat-form-field appearance="outline" class="suspend__field">
          <mat-label>Suspended until (optional)</mat-label>
          <input matInput type="date" formControlName="until" [min]="minDate" />
          <mat-hint>Leave empty for an indefinite suspension.</mat-hint>
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>Cancel</button>
        <button matButton="filled" type="submit" class="suspend__danger">Suspend account</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .suspend__text {
      margin: 0 0 var(--spacing-4);
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .suspend__field {
      display: block;
      width: 100%;
      margin-bottom: var(--spacing-2);
    }
    .suspend__danger {
      --mat-button-filled-container-color: var(--color-danger);
      --mat-button-filled-label-text-color: #fff;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuspendDialogComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly dialogRef =
    inject<MatDialogRef<SuspendDialogComponent, SuspendUserRequest>>(MatDialogRef);
  protected readonly data = inject<SuspendDialogData>(MAT_DIALOG_DATA);
  protected readonly minDate = tomorrowIso();

  protected readonly form = this.fb.group({
    reason: ['', [Validators.required, Validators.maxLength(500)]],
    until: [''],
  });

  protected submit(): void {
    const reason = this.form.controls.reason.value.trim();
    if (!reason) {
      this.form.controls.reason.setValue('');
    }
    if (this.form.invalid || !reason) {
      this.form.markAllAsTouched();
      return;
    }
    const until = this.form.controls.until.value;
    this.dialogRef.close({ reason, until: until ? endOfDayIso(until) : null });
  }
}
