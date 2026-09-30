import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { money } from '../../../shared/payments/payment-labels';

/**
 * Money amounts of the admin payment forms (refunds, split decisions): a number with at most two
 * decimals inside bounds the API enforces (`@DecimalMin`, `@Digits(fraction = 2)`, "at most the
 * refundable amount"; a split refund must stay strictly below it).
 */

/** Hundredths of an amount, or NaN when it has more than 2 decimals. */
function cents(value: number): number {
  const scaled = Math.round(value * 100);
  return Math.abs(value * 100 - scaled) < 1e-6 ? scaled : Number.NaN;
}

export interface AmountBounds {
  /** Inclusive maximum (refunds) … */
  max: number;
  /** … or exclusive maximum (split refunds: less than the refundable amount). */
  exclusiveMax?: boolean;
}

export function amountValidator(bounds: () => AmountBounds): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const raw: unknown = control.value;
    if (raw === null || raw === undefined || raw === '') {
      return { required: true };
    }
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
      return { min: true };
    }
    if (Number.isNaN(cents(value))) {
      return { decimals: true };
    }
    const { max, exclusiveMax } = bounds();
    if (
      exclusiveMax ? cents(value) >= Math.round(max * 100) : cents(value) > Math.round(max * 100)
    ) {
      return { max: true };
    }
    return null;
  };
}

/** Inline message of an amount field; `null` when valid. */
export function amountError(
  errors: ValidationErrors | null | undefined,
  bounds: AmountBounds,
  currency: string,
): string | null {
  if (!errors) {
    return null;
  }
  if (errors['required']) {
    return 'Enter an amount.';
  }
  if (errors['min']) {
    return 'Enter an amount above 0.';
  }
  if (errors['decimals']) {
    return 'Use at most 2 decimals.';
  }
  if (errors['max']) {
    return bounds.exclusiveMax
      ? `A split refunds less than ${money(bounds.max, currency)}.`
      : `At most ${money(bounds.max, currency)} can be refunded.`;
  }
  return 'Enter a valid amount.';
}

/** The amount rounded to the cent for the request body. */
export function toAmount(value: unknown): number {
  return Math.round(Number(value) * 100) / 100;
}
