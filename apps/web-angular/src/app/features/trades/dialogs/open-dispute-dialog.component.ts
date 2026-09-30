import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import type { OpenDisputeRequest } from '@orenji/api-client';
import { startWith } from 'rxjs';
import { DISPUTE_REASONS, DISPUTE_TEXT_MAX } from '../../../shared/payments/payment-labels';
import { createDisputeForm, descriptionError, toDisputeRequest } from './protected-forms';

export interface OpenDisputeDialogData {
  sellerName: string;
  cardName: string;
  /** End of the dispute window, worded (`null` before the shipment). */
  windowEndsAt: string | null;
}

/**
 * "Open a dispute" (buyer, PAID or SHIPPED protected trades within the window): the reason and a
 * description. Explains that the payout goes on hold and that photos, documents and messages are
 * added on the dispute page. Closes with the `POST /trades/{id}/disputes` body.
 */
@Component({
  selector: 'app-open-dispute-dialog',
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
    <h2 mat-dialog-title>Open a dispute</h2>
    <form [formGroup]="form" (submit)="submit($event)" novalidate>
      <mat-dialog-content>
        <p class="lead">
          Something wrong with {{ data.cardName }}? Tell us what happened. The payout to
          {{ data.sellerName }} goes on hold and an OrenjiTrade admin reviews what you both share.
          @if (data.windowEndsAt) {
            You can open a dispute until {{ data.windowEndsAt }}.
          }
        </p>
        <fieldset class="reasons">
          <legend class="reasons__title" id="dispute-reason-label">What went wrong?</legend>
          <mat-radio-group
            formControlName="reason"
            aria-labelledby="dispute-reason-label"
            class="reasons__group"
          >
            @for (reason of reasons; track reason.value) {
              <mat-radio-button [value]="reason.value">
                <span class="reason__label">{{ reason.label }}</span>
                <span class="reason__hint">{{ reason.hint }}</span>
              </mat-radio-button>
            }
          </mat-radio-group>
          @if (form.controls.reason.invalid && form.controls.reason.touched) {
            <p class="field-error" role="alert">Choose what went wrong.</p>
          }
        </fieldset>
        <mat-form-field appearance="outline" class="wide">
          <mat-label>Describe the problem</mat-label>
          <textarea
            matInput
            rows="4"
            formControlName="description"
            [attr.maxlength]="max"
            placeholder="What did you receive, and how does it differ from the listing?"
            aria-required="true"
          ></textarea>
          <mat-hint align="end">{{ length() }} / {{ max }}</mat-hint>
          @if (form.controls.description.invalid) {
            <mat-error>{{ error() }}</mat-error>
          }
        </mat-form-field>
        <p class="next" role="note">
          <mat-icon aria-hidden="true">photo_camera</mat-icon>
          Next, add photos or documents and talk with {{ data.sellerName }} on the dispute page.
        </p>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>Cancel</button>
        <button matButton="filled" type="submit">Open dispute</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .lead {
      color: var(--color-text-muted);
    }
    .reasons {
      margin: 0 0 var(--spacing-3);
      padding: 0;
      border: 0;
    }
    .reasons__title {
      margin-bottom: var(--spacing-2);
      padding: 0;
      color: var(--color-ink);
      font-weight: var(--font-weight-semibold);
    }
    .reasons__group {
      display: flex;
      flex-direction: column;
    }
    .reason__label {
      display: block;
      color: var(--color-ink);
      font-weight: var(--font-weight-medium);
    }
    .reason__hint {
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
    .next {
      display: flex;
      align-items: center;
      gap: var(--spacing-2);
      margin: var(--spacing-2) 0 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .next mat-icon {
      flex: 0 0 auto;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OpenDisputeDialogComponent {
  private readonly ref =
    inject<MatDialogRef<OpenDisputeDialogComponent, OpenDisputeRequest>>(MatDialogRef);
  protected readonly data = inject<OpenDisputeDialogData>(MAT_DIALOG_DATA);
  protected readonly form = createDisputeForm();
  protected readonly reasons = DISPUTE_REASONS;
  protected readonly max = DISPUTE_TEXT_MAX;
  private readonly description = toSignal(
    this.form.controls.description.valueChanges.pipe(startWith('')),
    { initialValue: '' },
  );
  protected length(): number {
    return this.description().length;
  }

  protected error(): string {
    return descriptionError(this.form.controls.description.errors) ?? '';
  }

  protected submit(event: Event): void {
    event.preventDefault();
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      return;
    }
    this.ref.close(toDisputeRequest(this.form.getRawValue()));
  }
}
