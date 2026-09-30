import { FormControl } from '@angular/forms';
import { formatPayload } from './admin-webhooks-page.component';
import { parseTransactionView, paymentTone, transactionMoment } from './admin-payment-labels';
import { amountError, amountValidator, toAmount } from './money-form';

describe('admin payment helpers', () => {
  it('validates refund amounts up to the refundable amount', () => {
    const control = new FormControl<number | null>(null, [amountValidator(() => ({ max: 40 }))]);
    expect(amountError(control.errors, { max: 40 }, 'CAD')).toBe('Enter an amount.');
    control.setValue(-1);
    expect(amountError(control.errors, { max: 40 }, 'CAD')).toBe('Enter an amount above 0.');
    control.setValue(40.01);
    expect(amountError(control.errors, { max: 40 }, 'CAD')).toBe('At most $40.00 can be refunded.');
    control.setValue(40);
    expect(control.valid).toBe(true);
    control.setValue(0.125);
    expect(control.hasError('decimals')).toBe(true);
    expect(toAmount('12.345')).toBe(12.35);
  });

  it('picks the view, tone and moment of transaction rows', () => {
    expect(parseTransactionView('pending-shipment')).toBe('pending-shipment');
    expect(parseTransactionView('bogus')).toBe('all');
    expect(paymentTone('PAID_OUT')).toBe('success');
    expect(paymentTone('FAILED')).toBe('danger');
    const row = {
      createdAt: '2026-09-01T10:00:00Z',
      securedAt: '2026-09-01T10:05:00Z',
      shippedAt: '2026-09-02T10:00:00Z',
      disputeWindowEndsAt: '2026-09-09T10:00:00Z',
      payoutReleasedAt: null,
    };
    expect(transactionMoment(row as never)).toEqual({
      label: 'Window ends',
      at: '2026-09-09T10:00:00Z',
    });
    expect(transactionMoment({ ...row, shippedAt: null } as never).label).toBe('Secured');
  });

  it('pretty-prints webhook payloads when they parse', () => {
    expect(formatPayload('{"type":"payment.secured","data":{"id":"x"}}')).toBe(
      '{\n  "type": "payment.secured",\n  "data": {\n    "id": "x"\n  }\n}',
    );
    expect(formatPayload('not json')).toBe('not json');
    expect(formatPayload(null)).toBe('(empty)');
  });
});
