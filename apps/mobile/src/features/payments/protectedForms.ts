import type { OpenDisputeRequest, ShipTradeRequest } from '@/src/api/types';

import {
  DISPUTE_DESCRIPTION_MIN,
  DISPUTE_TEXT_MAX,
  SHIP_CARRIER_MAX,
  SHIP_NOTES_MAX,
  SHIP_TRACKING_MAX,
  type DisputeReason,
} from './paymentLabels';

/**
 * Forms of the protected trade steps (Phase 9; mirror of the web's
 * `features/trades/dialogs/protected-forms.ts`): the seller's shipping confirmation (carrier
 * ≤ 80, tracking ≤ 100, notes ≤ 500; all optional for the API, tracking recommended) and the
 * buyer's dispute (reason + description ≤ 2000, required), with the request bodies they produce.
 */

export interface ShipFormValue {
  carrier: string;
  trackingNumber: string;
  notes: string;
}

export type ShipFormErrors = Partial<Record<keyof ShipFormValue, string>>;

export const EMPTY_SHIP_FORM: ShipFormValue = { carrier: '', trackingNumber: '', notes: '' };

export function shipFormErrors(value: ShipFormValue): ShipFormErrors {
  const errors: ShipFormErrors = {};
  if (value.carrier.length > SHIP_CARRIER_MAX) {
    errors.carrier = `Keep the carrier under ${SHIP_CARRIER_MAX} characters.`;
  }
  if (value.trackingNumber.length > SHIP_TRACKING_MAX) {
    errors.trackingNumber = `Keep the tracking number under ${SHIP_TRACKING_MAX} characters.`;
  }
  if (value.notes.length > SHIP_NOTES_MAX) {
    errors.notes = `Keep the note under ${SHIP_NOTES_MAX} characters.`;
  }
  return errors;
}

/** `POST /trades/{id}/ship` body: trimmed, empty fields left out. */
export function toShipRequest(value: ShipFormValue): ShipTradeRequest {
  const carrier = value.carrier.trim();
  const trackingNumber = value.trackingNumber.trim();
  const notes = value.notes.trim();
  return {
    ...(carrier ? { carrier } : {}),
    ...(trackingNumber ? { trackingNumber } : {}),
    ...(notes ? { notes } : {}),
  };
}

export interface DisputeFormValue {
  reason: DisputeReason | null;
  description: string;
}

export type DisputeFormErrors = Partial<Record<keyof DisputeFormValue, string>>;

/** Inline message of the dispute description; `null` when valid. */
export function descriptionError(description: string): string | null {
  const trimmed = description.trim();
  if (!trimmed) {
    return 'Describe what is wrong so an admin can review it.';
  }
  if (trimmed.length < DISPUTE_DESCRIPTION_MIN) {
    return `Add a few more details (at least ${DISPUTE_DESCRIPTION_MIN} characters).`;
  }
  if (description.length > DISPUTE_TEXT_MAX) {
    return `Keep it under ${DISPUTE_TEXT_MAX} characters.`;
  }
  return null;
}

export function disputeFormErrors(value: DisputeFormValue): DisputeFormErrors {
  const errors: DisputeFormErrors = {};
  if (!value.reason) {
    errors.reason = 'Choose what went wrong.';
  }
  const description = descriptionError(value.description);
  if (description) {
    errors.description = description;
  }
  return errors;
}

/** `POST /trades/{id}/disputes` body. */
export function toDisputeRequest(value: DisputeFormValue): OpenDisputeRequest {
  return {
    reason: (value.reason ?? 'OTHER') as OpenDisputeRequest['reason'],
    description: value.description.trim(),
  };
}

/** A statement added as TEXT evidence: required, at most 2000 characters. */
export function statementError(text: string): string | null {
  if (!text.trim()) {
    return 'Write what you want the admin to know.';
  }
  if (text.length > DISPUTE_TEXT_MAX) {
    return `Keep it under ${DISPUTE_TEXT_MAX} characters.`;
  }
  return null;
}

/** A message of the dispute thread: required, at most 2000 characters. */
export function disputeMessageError(text: string): string | null {
  if (!text.trim()) {
    return 'Write a message first.';
  }
  if (text.length > DISPUTE_TEXT_MAX) {
    return `Keep it under ${DISPUTE_TEXT_MAX} characters.`;
  }
  return null;
}
