import type { DonationCheckoutRequest } from '@/src/api/types';

import { DONATION_MESSAGE_MAX } from './billingLabels';

/** A positive amount with at most two decimals ("7", "7.5", "7.50"). */
const AMOUNT = /^\d{1,7}([.,]\d{1,2})?$/;

/** Parses a typed amount (comma or dot decimals); `null` when it is not a valid amount. */
export function parseDonationAmount(text: string | null | undefined): number | null {
  const value = (text ?? '').trim();
  if (!AMOUNT.test(value)) {
    return null;
  }
  const amount = Number(value.replace(',', '.'));
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null;
}

export interface DonationFormValue {
  /** A preset amount ("10") or `other`. */
  preset: string;
  custom: string;
  currency: string;
  message: string;
  publicThanks: boolean;
}

export type DonationFormErrors = Partial<Record<'custom' | 'message', string>>;

/** Field messages of the donation form (web: `DonationFormComponent`). */
export function donationFormErrors(value: DonationFormValue): DonationFormErrors {
  const errors: DonationFormErrors = {};
  if (value.preset === 'other') {
    if (!value.custom.trim()) {
      errors.custom = 'Enter an amount.';
    } else if (parseDonationAmount(value.custom) === null) {
      errors.custom = 'Enter a positive amount with at most two decimals.';
    }
  }
  if (value.message.length > DONATION_MESSAGE_MAX) {
    errors.message = `Keep it under ${DONATION_MESSAGE_MAX} characters.`;
  }
  return errors;
}

/** The checkout request for the form value, or `null` when the amount is missing or invalid. */
export function donationRequest(value: DonationFormValue): DonationCheckoutRequest | null {
  const amount = parseDonationAmount(value.preset === 'other' ? value.custom : value.preset);
  if (amount === null || value.message.length > DONATION_MESSAGE_MAX) {
    return null;
  }
  const message = value.message.trim();
  return {
    amount,
    currency: value.currency,
    ...(message ? { message } : {}),
    publicThanks: value.publicThanks,
  };
}
