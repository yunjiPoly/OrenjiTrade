import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import type { ShipTradeRequest } from '@orenji/api-client';
import {
  SHIP_CARRIER_MAX,
  SHIP_NOTES_MAX,
  SHIP_TRACKING_MAX,
} from '../../../shared/payments/payment-labels';
import { createShipForm, toShipRequest } from './protected-forms';

export interface ShipDialogData {
  buyerName: string;
  cardName: string;
}

/**
 * "Mark as shipped" (seller, PAID protected trades): carrier, tracking number and a note for the
 * buyer. Closes with the `POST /trades/{id}/ship` body; the page sends it.
 */
@Component({
  selector: 'app-ship-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  template: `
    <h2 mat-dialog-title>Mark as shipped</h2>
    <form [formGroup]="form" (submit)="submit($event)" novalidate>
      <mat-dialog-content>
        <p class="lead">
          Ship {{ data.cardName }} to {{ data.buyerName }}, then share how to follow it. Tracking
          protects you both if something goes wrong.
        </p>
        <div class="row">
          <mat-form-field appearance="outline">
            <mat-label>Carrier</mat-label>
            <input
              matInput
              formControlName="carrier"
              autocomplete="off"
              [attr.maxlength]="carrierMax"
              placeholder="Canada Post"
            />
            @if (form.controls.carrier.invalid) {
              <mat-error>Keep the carrier under {{ carrierMax }} characters.</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Tracking number</mat-label>
            <input
              matInput
              formControlName="trackingNumber"
              autocomplete="off"
              class="mono"
              [attr.maxlength]="trackingMax"
            />
            @if (form.controls.trackingNumber.invalid) {
              <mat-error>Keep the tracking number under {{ trackingMax }} characters.</mat-error>
            }
          </mat-form-field>
        </div>
        <mat-form-field appearance="outline" class="wide">
          <mat-label>Note to {{ data.buyerName }} (optional)</mat-label>
          <textarea
            matInput
            rows="2"
            formControlName="notes"
            [attr.maxlength]="notesMax"
            placeholder="Packed in a top loader and a bubble mailer."
          ></textarea>
          <mat-hint align="end">{{ form.controls.notes.value.length }} / {{ notesMax }}</mat-hint>
          @if (form.controls.notes.invalid) {
            <mat-error>Keep the note under {{ notesMax }} characters.</mat-error>
          }
        </mat-form-field>
        @if (!form.controls.trackingNumber.value.trim()) {
          <p class="tip" role="note">
            <mat-icon aria-hidden="true">info</mat-icon>
            Without tracking, a “never arrived” dispute is harder to settle in your favour.
          </p>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>Cancel</button>
        <button matButton="filled" type="submit">
          <mat-icon aria-hidden="true">local_shipping</mat-icon>
          Mark as shipped
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .lead {
      color: var(--color-text-muted);
    }
    .row {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--spacing-3);
    }
    .wide {
      display: block;
      width: 100%;
    }
    .tip {
      display: flex;
      align-items: center;
      gap: var(--spacing-2);
      margin: var(--spacing-2) 0 0;
      padding: var(--spacing-2) var(--spacing-3);
      border-radius: var(--radius-md);
      background: color-mix(in srgb, var(--color-info) 10%, var(--color-surface));
      font-size: var(--font-size-sm);
    }
    .tip mat-icon {
      flex: 0 0 auto;
      color: var(--color-info);
    }
    @media (max-width: 599px) {
      .row {
        grid-template-columns: minmax(0, 1fr);
        gap: 0;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShipDialogComponent {
  private readonly ref = inject<MatDialogRef<ShipDialogComponent, ShipTradeRequest>>(MatDialogRef);
  protected readonly data = inject<ShipDialogData>(MAT_DIALOG_DATA);
  protected readonly form = createShipForm();
  protected readonly carrierMax = SHIP_CARRIER_MAX;
  protected readonly trackingMax = SHIP_TRACKING_MAX;
  protected readonly notesMax = SHIP_NOTES_MAX;

  protected submit(event: Event): void {
    event.preventDefault();
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      return;
    }
    this.ref.close(toShipRequest(this.form.getRawValue()));
  }
}
