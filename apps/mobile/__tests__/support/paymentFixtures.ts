import type {
  Dispute,
  FakeCheckout,
  PaymentSummary,
  SellerAccount,
  ShipmentSummary,
  TradeResponse,
} from '@/src/api/types';

import { OTHER_ID, SELF_ID, TRADE_ID, tradeFixture } from './fixtures';

/** Fictional answers of the Phase 9 endpoints (mobile stage M6). */

/** Every flag the local seed switches on (protected payments; Phase 10 left with stage F1). */
export const FLAGS_ON: Record<string, boolean> = {
  protectedPayments: true,
  publicChat: true,
  mlScanning: false,
};

export function flags(overrides: Record<string, boolean> = {}): Record<string, boolean> {
  return { ...FLAGS_ON, ...overrides };
}

export const PAYMENT_ID = '00000000-0000-4000-9f00-000000000001';
export const DISPUTE_ID = '00000000-0000-4000-9f00-000000000101';
export const CHECKOUT_REF = 'fake_pi_test01';

export function paymentFixture(overrides: Partial<PaymentSummary> = {}): PaymentSummary {
  return {
    id: PAYMENT_ID,
    status: 'REQUIRES_ACTION',
    amount: 40,
    currency: 'CAD',
    securedAt: null,
    provider: 'fake',
    platformFee: 2,
    sellerAmount: 38,
    refundedAmount: 0,
    payoutAmount: null,
    payoutFrozen: false,
    checkoutUrl: `/checkout/fake/${CHECKOUT_REF}`,
    disputeWindowEndsAt: null,
    payoutReleasedAt: null,
    refundedAt: null,
    ...overrides,
  };
}

export function shipmentFixture(overrides: Partial<ShipmentSummary> = {}): ShipmentSummary {
  return {
    carrier: 'Canada Post',
    trackingNumber: 'CP123456789CA',
    sellerNotes: 'Top loader and bubble mailer.',
    shippedAt: '2026-10-05T14:00:00Z',
    deliveredAt: null,
    ...overrides,
  };
}

/** A protected cash trade of 40 CAD waiting for Maïka's (the buyer's) payment. */
export function protectedTradeFixture(overrides: Partial<TradeResponse> = {}): TradeResponse {
  return tradeFixture({
    status: 'AWAITING_PAYMENT',
    protectionEnabled: true,
    nextAction: { actor: 'BUYER', action: 'PAY' },
    allowedOperations: ['PAY', 'MARK_MEETUP', 'CANCEL'],
    ...overrides,
  });
}

export function disputeFixture(overrides: Partial<Dispute> = {}): Dispute {
  return {
    id: DISPUTE_ID,
    tradeId: TRADE_ID,
    status: 'OPEN',
    reason: 'DAMAGED',
    description: 'The card arrived with a crease across the art.',
    openedAt: '2026-10-05T15:00:00Z',
    updatedAt: '2026-10-05T15:00:00Z',
    resolvedAt: null,
    resolutionNote: null,
    refundAmount: null,
    viewerRole: 'BUYER',
    buyer: { id: SELF_ID, handle: 'maika', displayName: 'Maïka Test', avatarUrl: null },
    seller: { id: OTHER_ID, handle: 'collector2', displayName: 'Noé Verdun', avatarUrl: null },
    payment: {
      id: PAYMENT_ID,
      status: 'SECURED',
      amount: 40,
      currency: 'CAD',
      refundedAmount: 0,
      payoutAmount: null,
      payoutFrozen: true,
      disputeWindowEndsAt: '2026-10-12T14:00:00Z',
    },
    shipment: shipmentFixture(),
    summary: 'Azure-Eyes Silver Dragon · 40.00 CAD',
    evidence: [
      {
        id: '00000000-0000-4000-9f10-000000000001',
        kind: 'TEXT',
        role: 'BUYER',
        body: 'The crease is visible under a lamp.',
        createdAt: '2026-10-05T15:01:00Z',
      },
    ],
    timeline: [
      {
        id: '00000000-0000-4000-9f20-000000000001',
        event: 'OPENED',
        actorRole: 'BUYER',
        details: { reason: 'DAMAGED' },
        createdAt: '2026-10-05T15:00:00Z',
      },
    ],
    messages: [
      {
        id: '00000000-0000-4000-9f30-000000000001',
        authorRole: 'SELLER',
        authorName: 'Noé Verdun',
        body: 'Sorry about that, it left in perfect shape.',
        createdAt: '2026-10-05T15:10:00Z',
      },
    ],
    canAddEvidence: true,
    canPostMessage: true,
    evidenceLeft: 9,
    ...overrides,
  };
}

export function sellerAccountFixture(overrides: Partial<SellerAccount> = {}): SellerAccount {
  return {
    provider: 'fake',
    status: 'NOT_STARTED',
    payoutsEnabled: false,
    ready: false,
    updatedAt: null,
    ...overrides,
  };
}

export function fakeCheckoutFixture(overrides: Partial<FakeCheckout> = {}): FakeCheckout {
  return {
    ref: CHECKOUT_REF,
    paymentId: PAYMENT_ID,
    tradeId: TRADE_ID,
    status: 'REQUIRES_ACTION',
    amount: 40,
    currency: 'CAD',
    summary: 'Azure-Eyes Silver Dragon from Noé Verdun',
    ...overrides,
  };
}
