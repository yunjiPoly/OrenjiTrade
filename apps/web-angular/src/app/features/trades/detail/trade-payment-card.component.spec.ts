import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { PaymentSummary } from '@orenji/api-client';
import { tradeResponse } from '../../../shared/offers/testing/offer-fixtures';
import { TradePaymentCardComponent } from './trade-payment-card.component';
import { TradeStepsComponent } from './trade-steps.component';

const PAYMENT: PaymentSummary = {
  id: 'pay-1',
  status: 'SECURED',
  amount: 40,
  currency: 'CAD',
  provider: 'fake',
  platformFee: 2,
  sellerAmount: 38,
  refundedAmount: 0,
  payoutAmount: null,
  payoutFrozen: false,
  disputeWindowEndsAt: '2026-10-07T12:00:00Z',
  securedAt: '2026-09-30T12:00:00Z',
};

describe('TradePaymentCardComponent', () => {
  let fixture: ComponentFixture<TradePaymentCardComponent>;
  let element: HTMLElement;

  function render(payment: PaymentSummary, viewerRole: 'BUYER' | 'SELLER'): void {
    fixture.componentRef.setInput('payment', payment);
    fixture.componentRef.setInput('viewerRole', viewerRole);
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    fixture = TestBed.createComponent(TradePaymentCardComponent);
    element = fixture.nativeElement as HTMLElement;
  });

  it('shows what the buyer pays and what the seller receives', () => {
    render(PAYMENT, 'BUYER');
    expect(element.querySelector('[data-testid="payment-amount"]')?.textContent).toContain(
      '$40.00',
    );
    expect(element.querySelector('[data-testid="payment-seller-amount"]')?.textContent).toContain(
      'Seller receives',
    );
    expect(element.textContent).toContain('Payment secured');
    expect(element.textContent).toContain('Dispute window ends');
    expect(element.textContent).toContain('Local test provider');
    expect(element.textContent?.toLowerCase()).not.toContain('escrow');
  });

  it('shows the released payout and a payout on hold', () => {
    render(
      {
        ...PAYMENT,
        status: 'PAID_OUT',
        payoutAmount: 38,
        payoutReleasedAt: '2026-10-01T10:00:00Z',
      },
      'SELLER',
    );
    expect(element.querySelector('[data-testid="payment-payout"]')?.textContent).toContain(
      'Payout released to you',
    );
    render({ ...PAYMENT, payoutFrozen: true }, 'SELLER');
    expect(element.textContent).toContain('The payout is on hold while a dispute is reviewed.');
  });

  it('shows the refund of a refunded payment without a seller share', () => {
    render(
      { ...PAYMENT, status: 'REFUNDED', refundedAmount: 40, refundedAt: '2026-10-01T10:00:00Z' },
      'BUYER',
    );
    expect(element.querySelector('[data-testid="payment-refunded"]')?.textContent).toContain(
      'Refunded to you',
    );
    expect(element.querySelector('[data-testid="payment-seller-amount"]')).toBeNull();
    expect(element.querySelector('[data-testid="payment-fee"]')).toBeNull();
    expect(element.textContent).not.toContain('Dispute window ends');
  });
});

describe('TradeStepsComponent with payment protection', () => {
  it('follows payment, shipment, receipt and payout', () => {
    const fixture = TestBed.createComponent(TradeStepsComponent);
    fixture.componentRef.setInput(
      'trade',
      tradeResponse({
        status: 'PAID',
        protectionEnabled: true,
        payment: PAYMENT,
        nextAction: { actor: 'SELLER', action: 'SHIP' },
        allowedOperations: [],
      }),
    );
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const state = (key: string) =>
      element.querySelector(`[data-testid="step-${key}"]`)?.getAttribute('data-state');
    expect(state('paid')).toBe('done');
    expect(state('shipped')).toBe('current');
    expect(state('received')).toBe('todo');
    expect(state('completed')).toBe('todo');
    expect(element.querySelector('[data-testid="step-meetup"]')).toBeNull();
  });
});
