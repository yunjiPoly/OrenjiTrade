import { amountError } from '../payments/money-form';
import { createResolveForm, resolveSummary, toResolveRequest } from './resolve-form';

const CONTEXT = {
  currency: 'CAD',
  refundable: 35,
  feePercent: 5,
  buyerHandle: 'ben',
  sellerHandle: 'ada',
};

describe('resolve form', () => {
  it('needs an outcome and a note, and a split amount below the refundable amount', () => {
    const form = createResolveForm(CONTEXT);
    expect(form.controls.outcome.hasError('required')).toBe(true);
    expect(form.controls.note.hasError('required')).toBe(true);

    form.controls.outcome.setValue('BUYER');
    form.controls.note.setValue('   ');
    expect(form.controls.note.invalid).toBe(true);
    form.controls.note.setValue('The listing said near mint; the photos show a crease.');
    expect(form.valid).toBe(true);

    form.controls.outcome.setValue('SPLIT');
    expect(form.controls.refundAmount.hasError('required')).toBe(true);
    form.controls.refundAmount.setValue(35);
    expect(form.controls.refundAmount.hasError('max')).toBe(true);
    expect(
      amountError(form.controls.refundAmount.errors, { max: 35, exclusiveMax: true }, 'CAD'),
    ).toBe('A split refunds less than $35.00.');
    form.controls.refundAmount.setValue(10.005);
    expect(form.controls.refundAmount.hasError('decimals')).toBe(true);
    form.controls.refundAmount.setValue(10);
    expect(form.valid).toBe(true);
  });

  it('builds the request with the amount only for a split', () => {
    expect(toResolveRequest({ outcome: 'BUYER', refundAmount: 12, note: ' Refund. ' })).toEqual({
      outcome: 'BUYER',
      note: 'Refund.',
    });
    expect(toResolveRequest({ outcome: 'SPLIT', refundAmount: 10.5, note: 'Half.' })).toEqual({
      outcome: 'SPLIT',
      refundAmount: 10.5,
      note: 'Half.',
    });
  });

  it('states what each decision does', () => {
    expect(resolveSummary('BUYER', null, CONTEXT)).toBe(
      'Refund $35.00 to @ben. The trade is cancelled and @ada gets no payout.',
    );
    expect(resolveSummary('SELLER', null, CONTEXT)).toBe(
      'Release the payout of $33.25 to @ada. The trade completes and @ben gets no refund.',
    );
    expect(resolveSummary('SPLIT', 15, CONTEXT)).toBe(
      'Refund $15.00 to @ben and pay out $19.00 to @ada (the rest minus the fee). The trade completes.',
    );
  });
});
