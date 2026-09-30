import { FormControl, FormGroup, Validators } from '@angular/forms';
import type {
  OpenDisputeRequest,
  OpenDisputeRequestReasonEnum,
  ShipTradeRequest,
} from '@orenji/api-client';
import {
  DISPUTE_TEXT_MAX,
  DisputeReason,
  SHIP_CARRIER_MAX,
  SHIP_NOTES_MAX,
  SHIP_TRACKING_MAX,
} from '../../../shared/payments/payment-labels';

/**
 * Forms of the protected trade steps (Phase 9): the seller's shipping confirmation (carrier ≤ 80,
 * tracking ≤ 100, notes ≤ 500; all optional for the API, tracking recommended) and the buyer's
 * dispute (reason + description ≤ 2000, required), with the request bodies they produce.
 */

export type ShipForm = FormGroup<{
  carrier: FormControl<string>;
  trackingNumber: FormControl<string>;
  notes: FormControl<string>;
}>;

export function createShipForm(): ShipForm {
  return new FormGroup({
    carrier: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(SHIP_CARRIER_MAX)],
    }),
    trackingNumber: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(SHIP_TRACKING_MAX)],
    }),
    notes: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(SHIP_NOTES_MAX)],
    }),
  });
}

/** `POST /trades/{id}/ship` body: trimmed, empty fields left out. */
export function toShipRequest(value: {
  carrier: string;
  trackingNumber: string;
  notes: string;
}): ShipTradeRequest {
  const carrier = value.carrier.trim();
  const trackingNumber = value.trackingNumber.trim();
  const notes = value.notes.trim();
  return {
    ...(carrier ? { carrier } : {}),
    ...(trackingNumber ? { trackingNumber } : {}),
    ...(notes ? { notes } : {}),
  };
}

export type DisputeForm = FormGroup<{
  reason: FormControl<DisputeReason | null>;
  description: FormControl<string>;
}>;

/** A description needs a few words: at least 10 characters besides spaces. */
export const DISPUTE_DESCRIPTION_MIN = 10;

export function createDisputeForm(): DisputeForm {
  return new FormGroup({
    reason: new FormControl<DisputeReason | null>(null, [Validators.required]),
    description: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.maxLength(DISPUTE_TEXT_MAX),
        (control) =>
          typeof control.value === 'string' &&
          control.value.trim().length > 0 &&
          control.value.trim().length < DISPUTE_DESCRIPTION_MIN
            ? { tooShort: true }
            : null,
      ],
    }),
  });
}

/** Inline message of the dispute description; `null` when valid. */
export function descriptionError(
  errors: Record<string, unknown> | null | undefined,
): string | null {
  if (!errors) {
    return null;
  }
  if (errors['required']) {
    return 'Describe what is wrong so an admin can review it.';
  }
  if (errors['tooShort']) {
    return 'Add a few more details (at least 10 characters).';
  }
  if (errors['maxlength']) {
    return `Keep it under ${DISPUTE_TEXT_MAX} characters.`;
  }
  return 'Check the description.';
}

/** `POST /trades/{id}/disputes` body. */
export function toDisputeRequest(value: {
  reason: DisputeReason | null;
  description: string;
}): OpenDisputeRequest {
  return {
    reason: (value.reason ?? 'OTHER') as OpenDisputeRequestReasonEnum,
    description: value.description.trim(),
  };
}
