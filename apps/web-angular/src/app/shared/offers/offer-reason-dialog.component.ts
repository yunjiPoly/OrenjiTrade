import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { OFFER_REASON_MAX } from './offer-labels';

export interface OfferReasonDialogData {
  title: string;
  message: string;
  confirmLabel: string;
  /** Field label ("Reason (optional)", "Why are you cancelling?"). */
  label: string;
  /** A reason is required (trade cancellation) or optional (decline, withdraw). */
  required: boolean;
  placeholder?: string;
  tone?: 'default' | 'danger';
}

/** Closes with the trimmed reason ('' when none was given), or `undefined` when dismissed. */
export interface OfferReasonDialogResult {
  reason: string;
}

/**
 * Confirmation with a reason shown to the other party: decline an offer (optional), withdraw an
 * offer (optional), cancel a trade (required). Reasons are at most 500 characters.
 */
@Component({
  selector: 'app-offer-reason-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <form (submit)="submit($event)" novalidate>
      <mat-dialog-content>
        <p class="lead">{{ data.message }}</p>
        <mat-form-field appearance="outline" class="field">
          <mat-label>{{ data.label }}</mat-label>
          <textarea
            matInput
            rows="3"
            [formControl]="reason"
            [attr.maxlength]="max"
            [required]="data.required"
            [placeholder]="data.placeholder ?? ''"
          ></textarea>
          <mat-hint>Shown to the other collector.</mat-hint>
          <mat-hint align="end">{{ length() }} / {{ max }}</mat-hint>
          @if (reason.hasError('required')) {
            <mat-error>Give a short reason.</mat-error>
          } @else if (reason.hasError('maxlength')) {
            <mat-error>Keep it under {{ max }} characters.</mat-error>
          }
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>Back</button>
        <button matButton="filled" type="submit" [class.danger]="data.tone === 'danger'">
          {{ data.confirmLabel }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .lead {
      margin: 0 0 var(--spacing-4);
      color: var(--color-text-muted);
    }
    .field {
      display: block;
      width: 100%;
    }
    .danger {
      --mat-button-filled-container-color: var(--color-danger);
      --mat-button-filled-label-text-color: #fff;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OfferReasonDialogComponent {
  private readonly ref =
    inject<MatDialogRef<OfferReasonDialogComponent, OfferReasonDialogResult>>(MatDialogRef);
  protected readonly data = inject<OfferReasonDialogData>(MAT_DIALOG_DATA);
  protected readonly max = OFFER_REASON_MAX;
  protected readonly reason = new FormControl('', {
    nonNullable: true,
    validators: [
      ...(this.data.required ? [Validators.required] : []),
      Validators.maxLength(OFFER_REASON_MAX),
    ],
  });
  private readonly value = toSignal(this.reason.valueChanges, { initialValue: '' });
  protected readonly length = computed(() => this.value().length);

  protected submit(event: Event): void {
    event.preventDefault();
    const reason = this.reason.value.trim();
    if (this.data.required && !reason) {
      this.reason.setValue('');
    }
    this.reason.markAsTouched();
    if (this.reason.invalid || (this.data.required && !reason)) {
      return;
    }
    this.ref.close({ reason });
  }
}
