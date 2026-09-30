import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import type { DonationCheckoutRequest } from '@orenji/api-client';

/** A positive amount with at most two decimals ("7", "7.5", "7.50"). */
const AMOUNT = /^\d{1,7}([.,]\d{1,2})?$/;

/** Parses a typed amount (comma or dot decimals); `null` when it is not a valid amount. */
export function parseAmount(text: string | null | undefined): number | null {
  const value = (text ?? '').trim();
  if (!AMOUNT.test(value)) {
    return null;
  }
  const amount = Number(value.replace(',', '.'));
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null;
}

/** Validator of the custom amount field (`amount` error for anything but a positive amount). */
export const amountValidator: ValidatorFn = (
  control: AbstractControl<string>,
): ValidationErrors | null => {
  const value = control.value?.trim() ?? '';
  if (!value) {
    return null; // `required` reports empty values
  }
  return parseAmount(value) === null ? { amount: true } : null;
};

export interface DonationFormValue {
  /** A preset amount ("10") or `other`. */
  preset: string;
  custom: string;
  currency: string;
  message: string;
  publicThanks: boolean;
}

/** The checkout request for the form value, or `null` when the amount is missing or invalid. */
export function donationRequest(value: DonationFormValue): DonationCheckoutRequest | null {
  const amount = parseAmount(value.preset === 'other' ? value.custom : value.preset);
  if (amount === null) {
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
