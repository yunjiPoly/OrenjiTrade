import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import type { ResolveDisputeRequest } from '@orenji/api-client';
import { RESOLUTION_NOTE_MAX, money } from '../../../shared/payments/payment-labels';
import { AUDITED } from '../shared/admin-actions';
import { amountError } from '../payments/money-form';
import {
  DisputeOutcome,
  ResolveContext,
  createResolveForm,
  resolveSummary,
  toResolveRequest,
} from './resolve-form';

/**
 * "Resolve" of an admin dispute: for the buyer (full refund, trade cancelled), for the seller
 * (payout released) or a split (a refund amount below the refundable amount, the rest paid out
 * minus the fee), with a note both collectors see; then a review step before anything is sent.
 */
@Component({
  selector: 'app-resolve-dispute-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatRadioModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ reviewing() ? 'Confirm the decision' : 'Resolve the dispute' }}</h2>
    <form [formGroup]="form" (submit)="submit($event)" novalidate>
      <mat-dialog-content>
        @if (!reviewing()) {
          <p class="lead">
            The payment provider holds {{ refundableText }}. Choose who gets it; the decision is
            final and both collectors are notified.
          </p>
          <fieldset class="outcomes">
            <legend class="outcomes__title" id="outcome-label">Decision</legend>
            <mat-radio-group
              formControlName="outcome"
              aria-labelledby="outcome-label"
              class="outcomes__group"
            >
              <mat-radio-button value="BUYER">
                <span class="outcome__label">For the buyer: full refund</span>
                <span class="outcome__hint"
                  >{{ refundableText }} back to &#64;{{ data.buyerHandle }}; the trade is
                  cancelled.</span
                >
              </mat-radio-button>
              <mat-radio-button value="SELLER">
                <span class="outcome__label">For the seller: release the payout</span>
                <span class="outcome__hint"
                  >&#64;{{ data.sellerHandle }} is paid out; the trade completes.</span
                >
              </mat-radio-button>
              <mat-radio-button value="SPLIT">
                <span class="outcome__label">Split</span>
                <span class="outcome__hint"
                  >Refund part to the buyer, pay the rest out to the seller.</span
                >
              </mat-radio-button>
            </mat-radio-group>
            @if (form.controls.outcome.invalid && form.controls.outcome.touched) {
              <p class="field-error" role="alert">Choose a decision.</p>
            }
          </fieldset>
          @if (form.controls.outcome.value === 'SPLIT') {
            <mat-form-field appearance="outline" class="wide">
              <mat-label>Refund to the buyer ({{ data.currency }})</mat-label>
              <input
                matInput
                type="number"
                inputmode="decimal"
                min="0.01"
                step="0.01"
                formControlName="refundAmount"
              />
              <mat-hint>Less than {{ refundableText }}</mat-hint>
              @if (form.controls.refundAmount.invalid) {
                <mat-error>{{ amountMessage() }}</mat-error>
              }
            </mat-form-field>
          }
          <mat-form-field appearance="outline" class="wide">
            <mat-label>Decision note</mat-label>
            <textarea
              matInput
              rows="3"
              formControlName="note"
              [attr.maxlength]="noteMax"
              aria-required="true"
            ></textarea>
            <mat-hint>Both collectors see it.</mat-hint>
            <mat-hint align="end">{{ form.controls.note.value.length }} / {{ noteMax }}</mat-hint>
            @if (form.controls.note.invalid) {
              <mat-error>{{
                form.controls.note.hasError('maxlength')
                  ? 'Keep the note under ' + noteMax + ' characters.'
                  : 'Explain the decision to both collectors.'
              }}</mat-error>
            }
          </mat-form-field>
        } @else {
          <p class="review" data-testid="resolve-review">
            <mat-icon aria-hidden="true">balance</mat-icon>
            <span>{{ summary() }} This cannot be undone. {{ audited }}</span>
          </p>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        @if (reviewing()) {
          <button matButton type="button" (click)="reviewing.set(false)">Back</button>
          <button matButton="filled" type="submit">Confirm decision</button>
        } @else {
          <button matButton type="button" mat-dialog-close>Cancel</button>
          <button matButton="filled" type="submit">Review decision</button>
        }
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .lead {
      color: var(--color-text-muted);
    }
    .outcomes {
      margin: 0 0 var(--spacing-3);
      padding: 0;
      border: 0;
    }
    .outcomes__title {
      margin-bottom: var(--spacing-2);
      padding: 0;
      font-weight: var(--font-weight-semibold);
    }
    .outcomes__group {
      display: flex;
      flex-direction: column;
    }
    .outcome__label {
      display: block;
      color: var(--color-ink);
      font-weight: var(--font-weight-medium);
    }
    .outcome__hint {
      display: block;
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .wide {
      display: block;
      width: 100%;
    }
    .field-error {
      margin: var(--spacing-1) 0 0;
      color: var(--color-danger);
      font-size: var(--font-size-sm);
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
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResolveDisputeDialogComponent {
  private readonly ref =
    inject<MatDialogRef<ResolveDisputeDialogComponent, ResolveDisputeRequest>>(MatDialogRef);
  protected readonly data = inject<ResolveContext>(MAT_DIALOG_DATA);
  protected readonly form = createResolveForm(this.data);
  protected readonly noteMax = RESOLUTION_NOTE_MAX;
  protected readonly audited = AUDITED;
  protected readonly refundableText = money(this.data.refundable, this.data.currency);
  protected readonly reviewing = signal(false);

  protected amountMessage(): string {
    return (
      amountError(
        this.form.controls.refundAmount.errors,
        { max: this.data.refundable, exclusiveMax: true },
        this.data.currency,
      ) ?? ''
    );
  }

  protected summary(): string {
    const value = this.form.getRawValue();
    return resolveSummary(
      (value.outcome ?? 'BUYER') as DisputeOutcome,
      value.refundAmount,
      this.data,
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
    this.ref.close(toResolveRequest(this.form.getRawValue()));
  }
}
