import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import type { RefundPaymentRequest } from '@orenji/api-client';
import { REFUND_REASON_MAX, money } from '../../../shared/payments/payment-labels';
import { AUDITED } from '../shared/admin-actions';
import { amountError, amountValidator, toAmount } from './money-form';

export interface RefundDialogData {
  summary: string;
  buyerHandle: string;
  currency: string;
  /** What is still refundable (amount − refunded). */
  refundable: number;
  /** The payout was already released (a refund then marks the payment partly refunded). */
  paidOut: boolean;
}

/**
 * "Refund" of an admin payment (`POST /admin/payments/{id}/refund`, SUPER_ADMIN or ADMIN under the
 * refund policy): amount (at most the refundable amount, 2 decimals) and a reason for the audit
 * log, then a review step that states exactly what happens before anything is sent.
 */
@Component({
  selector: 'app-refund-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ reviewing() ? 'Confirm the refund' : 'Refund this payment' }}</h2>
    <form [formGroup]="form" (submit)="submit($event)" novalidate>
      <mat-dialog-content>
        @if (!reviewing()) {
          <p class="lead">
            {{ data.summary }} · refundable {{ refundableText }}. The payment provider sends the
            money back to &#64;{{ data.buyerHandle }}.
          </p>
          <mat-form-field appearance="outline" class="wide">
            <mat-label>Amount ({{ data.currency }})</mat-label>
            <input
              matInput
              type="number"
              inputmode="decimal"
              min="0.01"
              step="0.01"
              formControlName="amount"
            />
            <mat-hint>At most {{ refundableText }}</mat-hint>
            @if (form.controls.amount.invalid) {
              <mat-error>{{ amountMessage() }}</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline" class="wide">
            <mat-label>Reason</mat-label>
            <textarea
              matInput
              rows="2"
              formControlName="reason"
              [attr.maxlength]="reasonMax"
              aria-required="true"
            ></textarea>
            <mat-hint>Kept in the audit log.</mat-hint>
            @if (form.controls.reason.invalid) {
              <mat-error>{{
                form.controls.reason.hasError('maxlength')
                  ? 'Keep the reason under ' + reasonMax + ' characters.'
                  : 'Say why the payment is refunded.'
              }}</mat-error>
            }
          </mat-form-field>
        } @else {
          <p class="review" data-testid="refund-review">
            <mat-icon aria-hidden="true">currency_exchange</mat-icon>
            <span>
              Refund <strong>{{ amountText() }}</strong> to &#64;{{ data.buyerHandle }} for
              {{ data.summary }}.
              @if (fullRefund() && !data.paidOut) {
                This is the whole payment: an unfinished trade is cancelled.
              } @else if (data.paidOut) {
                The payout was already released: the payment becomes partly refunded.
              } @else {
                The seller's payout shrinks by the refunded amount.
              }
              This cannot be undone. {{ audited }}
            </span>
          </p>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        @if (reviewing()) {
          <button matButton type="button" (click)="reviewing.set(false)">Back</button>
          <button matButton="filled" type="submit" class="danger">Refund {{ amountText() }}</button>
        } @else {
          <button matButton type="button" mat-dialog-close>Cancel</button>
          <button matButton="filled" type="submit">Review refund</button>
        }
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .lead {
      color: var(--color-text-muted);
    }
    .wide {
      display: block;
      width: 100%;
    }
    .review {
      display: flex;
      gap: var(--spacing-3);
      margin: 0;
      padding: var(--spacing-3) var(--spacing-4);
      border-radius: var(--radius-md);
      background: color-mix(in srgb, var(--color-warning) 14%, var(--color-surface));
    }
    .review mat-icon {
      flex: 0 0 auto;
    }
    .danger {
      --mat-button-filled-container-color: var(--color-danger);
      --mat-button-filled-label-text-color: #fff;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RefundDialogComponent {
  private readonly ref =
    inject<MatDialogRef<RefundDialogComponent, RefundPaymentRequest>>(MatDialogRef);
  protected readonly data = inject<RefundDialogData>(MAT_DIALOG_DATA);
  protected readonly reasonMax = REFUND_REASON_MAX;
  protected readonly audited = AUDITED;
  protected readonly refundableText = money(this.data.refundable, this.data.currency);
  protected readonly reviewing = signal(false);
  protected readonly form = new FormGroup({
    amount: new FormControl<number | null>(this.data.refundable, [
      amountValidator(() => ({ max: this.data.refundable })),
    ]),
    reason: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.maxLength(REFUND_REASON_MAX),
        Validators.pattern(/\S/),
      ],
    }),
  });

  protected amountMessage(): string {
    return (
      amountError(
        this.form.controls.amount.errors,
        { max: this.data.refundable },
        this.data.currency,
      ) ?? ''
    );
  }

  protected amountText(): string {
    return money(toAmount(this.form.controls.amount.value), this.data.currency);
  }

  protected fullRefund(): boolean {
    return (
      Math.round(toAmount(this.form.controls.amount.value) * 100) ===
      Math.round(this.data.refundable * 100)
    );
  }

  protected submit(event: Event): void {
    event.preventDefault();
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      return;
    }
    if (!this.reviewing()) {
      this.reviewing.set(true);
      return;
    }
    this.ref.close({
      amount: toAmount(this.form.controls.amount.value),
      reason: this.form.controls.reason.value.trim(),
    });
  }
}
