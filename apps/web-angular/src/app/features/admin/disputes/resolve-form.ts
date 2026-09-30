import { FormControl, FormGroup, Validators } from '@angular/forms';
import type { ResolveDisputeRequest, ResolveDisputeRequestOutcomeEnum } from '@orenji/api-client';
import { RESOLUTION_NOTE_MAX, money } from '../../../shared/payments/payment-labels';
import { amountValidator, toAmount } from '../payments/money-form';

export type DisputeOutcome = 'BUYER' | 'SELLER' | 'SPLIT';

/** What the admin decides with: amounts of the held payment and the parties' handles. */
export interface ResolveContext {
  currency: string;
  /** Amount still refundable (amount − refunded). */
  refundable: number;
  /** Fee percent of the payment (applied to what is paid out). */
  feePercent: number;
  buyerHandle: string;
  sellerHandle: string;
}

export type ResolveForm = FormGroup<{
  outcome: FormControl<DisputeOutcome | null>;
  refundAmount: FormControl<number | null>;
  note: FormControl<string>;
}>;

/**
 * The "Resolve" form of an admin dispute (`POST /admin/disputes/{id}/resolve`): the outcome, the
 * refund of a SPLIT (more than 0, less than the refundable amount, 2 decimals) and the note shown
 * to both collectors (required, ≤ 1000).
 */
export function createResolveForm(context: ResolveContext): ResolveForm {
  const form: ResolveForm = new FormGroup({
    outcome: new FormControl<DisputeOutcome | null>(null, [Validators.required]),
    refundAmount: new FormControl<number | null>(null),
    note: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.maxLength(RESOLUTION_NOTE_MAX),
        Validators.pattern(/\S/),
      ],
    }),
  });
  const split = amountValidator(() => ({ max: context.refundable, exclusiveMax: true }));
  form.controls.outcome.valueChanges.subscribe((outcome) => {
    const amount = form.controls.refundAmount;
    amount.setValidators(outcome === 'SPLIT' ? [split] : []);
    amount.updateValueAndValidity({ emitEvent: false });
  });
  return form;
}

/** The request body (the amount only for a split; BUYER refunds everything refundable). */
export function toResolveRequest(value: {
  outcome: DisputeOutcome | null;
  refundAmount: number | null;
  note: string;
}): ResolveDisputeRequest {
  const outcome = (value.outcome ?? 'BUYER') as ResolveDisputeRequestOutcomeEnum;
  return {
    outcome,
    ...(value.outcome === 'SPLIT' ? { refundAmount: toAmount(value.refundAmount) } : {}),
    note: value.note.trim(),
  };
}

/** Fee on an amount, half-up to the cent (the API's `PaymentRules.fee`). */
export function feeOn(amount: number, feePercent: number): number {
  return Math.round(amount * feePercent) / 100;
}

/** What the decision does, in words, for the review step. */
export function resolveSummary(
  outcome: DisputeOutcome,
  refundAmount: number | null,
  context: ResolveContext,
): string {
  const { currency, refundable, feePercent, buyerHandle, sellerHandle } = context;
  switch (outcome) {
    case 'BUYER':
      return `Refund ${money(refundable, currency)} to @${buyerHandle}. The trade is cancelled and @${sellerHandle} gets no payout.`;
    case 'SELLER': {
      const payout = refundable - feeOn(refundable, feePercent);
      return `Release the payout of ${money(payout, currency)} to @${sellerHandle}. The trade completes and @${buyerHandle} gets no refund.`;
    }
    case 'SPLIT': {
      const refund = toAmount(refundAmount);
      const rest = Math.round((refundable - refund) * 100) / 100;
      const payout = rest - feeOn(rest, feePercent);
      return `Refund ${money(refund, currency)} to @${buyerHandle} and pay out ${money(payout, currency)} to @${sellerHandle} (the rest minus the fee). The trade completes.`;
    }
  }
}
