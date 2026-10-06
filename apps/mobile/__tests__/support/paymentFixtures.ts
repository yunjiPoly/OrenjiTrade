import type {
  Ad,
  CreditEntry,
  Dispute,
  Donation,
  FakeBillingCheckout,
  FakeCheckout,
  FakeDonationCheckout,
  MyCredits,
  MyPlan,
  MyReferral,
  MySubscription,
  PaymentSummary,
  Plan,
  SellerAccount,
  ShipmentSummary,
  Supporters,
  TradeResponse,
} from '@/src/api/types';

import { OTHER_ID, SELF_ID, TRADE_ID, tradeFixture } from './fixtures';

/** Fictional answers of the Phase 9 and 10 endpoints (mobile stage M6). */

/** Every Phase 9 / 10 flag on (the local seed switches advertising and donations on). */
export const FLAGS_ON: Record<string, boolean> = {
  protectedPayments: true,
  premiumPlans: true,
  credits: true,
  advertising: true,
  donations: true,
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

export const FREE_PLAN: Plan = {
  code: 'FREE',
  name: 'Free',
  description: 'Everything you need to start trading.',
  monthlyPrice: 0,
  currency: 'CAD',
  features: [
    { key: 'filters.advanced', enabled: false },
    { key: 'ads.enabled', enabled: true },
  ],
  limits: [
    { key: 'binders.max', kind: 'COUNTER', window: 'TOTAL', limit: 5, description: 'Binders' },
    {
      key: 'map.radius.max_km',
      kind: 'CAP',
      window: 'TOTAL',
      limit: 25,
      description: 'Map radius (km)',
    },
  ],
};

export const PREMIUM_PLAN: Plan = {
  code: 'PREMIUM',
  name: 'Premium',
  description: 'More views, a wider map and no ads.',
  monthlyPrice: 4.99,
  currency: 'CAD',
  features: [
    { key: 'filters.advanced', enabled: true },
    { key: 'ads.enabled', enabled: false },
  ],
  limits: [
    { key: 'binders.max', kind: 'COUNTER', window: 'TOTAL', limit: 50, description: 'Binders' },
    { key: 'map.radius.max_km', kind: 'CAP', window: 'TOTAL', description: 'Map radius (km)' },
  ],
};

export const PLANS: Plan[] = [FREE_PLAN, PREMIUM_PLAN];

export function subscriptionFixture(overrides: Partial<MySubscription> = {}): MySubscription {
  return {
    id: '00000000-0000-4000-a000-000000000001',
    planCode: 'PREMIUM',
    planName: 'Premium',
    status: 'ACTIVE',
    provider: 'fake',
    amount: 4.99,
    currency: 'CAD',
    currentPeriodStart: '2026-10-05T12:00:00Z',
    currentPeriodEnd: '2026-11-05T12:00:00Z',
    cancelAtPeriodEnd: false,
    createdAt: '2026-10-05T12:00:00Z',
    activatedAt: '2026-10-05T12:00:00Z',
    ...overrides,
  };
}

/** `GET /me/plan` of a FREE collector at 5 of 5 binders. */
export function freePlanFixture(overrides: Partial<MyPlan> = {}): MyPlan {
  return {
    plan: FREE_PLAN,
    limits: [
      {
        key: 'binders.max',
        allowed: false,
        kind: 'COUNTER',
        window: 'TOTAL',
        limit: 5,
        used: 5,
        remaining: 0,
        planCode: 'FREE',
      },
      {
        key: 'map.radius.max_km',
        allowed: true,
        kind: 'CAP',
        window: 'TOTAL',
        limit: 25,
        planCode: 'FREE',
      },
    ],
    entitlements: [],
    ...overrides,
  };
}

export function premiumPlanFixture(overrides: Partial<MyPlan> = {}): MyPlan {
  return {
    plan: PREMIUM_PLAN,
    limits: [
      {
        key: 'binders.max',
        allowed: true,
        kind: 'COUNTER',
        window: 'TOTAL',
        limit: 50,
        used: 5,
        remaining: 45,
        planCode: 'PREMIUM',
      },
    ],
    entitlements: [],
    subscription: subscriptionFixture(),
    ...overrides,
  };
}

export function billingCheckoutFixture(
  overrides: Partial<FakeBillingCheckout> = {}
): FakeBillingCheckout {
  return {
    ref: 'fake_cs_test01',
    subscriptionId: '00000000-0000-4000-a000-000000000001',
    planCode: 'PREMIUM',
    planName: 'Premium',
    amount: 4.99,
    currency: 'CAD',
    status: 'PENDING',
    summary: 'Premium, billed monthly',
    ...overrides,
  };
}

export function creditEntryFixture(overrides: Partial<CreditEntry> = {}): CreditEntry {
  return {
    id: '00000000-0000-4000-a100-000000000001',
    amount: 200,
    balanceAfter: 200,
    type: 'GRANT',
    reason: 'PROMO',
    createdAt: '2026-10-01T12:00:00Z',
    ...overrides,
  };
}

export function creditsFixture(overrides: Partial<MyCredits> = {}): MyCredits {
  return {
    balance: 200,
    withdrawable: false,
    transferable: false,
    products: [
      {
        key: 'map_radius_day',
        name: 'Wider map for a day',
        description: 'See collectors up to 100 km away for 24 hours.',
        featureKey: 'map.radius.max_km',
        featureValue: '100',
        cost: 50,
        durationHours: 24,
        active: true,
      },
      {
        key: 'premium_search_day',
        name: 'Advanced filters for a day',
        featureKey: 'filters.advanced',
        cost: 500,
        durationHours: 24,
        active: true,
      },
    ],
    entries: { items: [creditEntryFixture()], nextCursor: null, hasMore: false },
    ...overrides,
  };
}

export function referralFixture(overrides: Partial<MyReferral> = {}): MyReferral {
  return {
    code: 'MAIKA42',
    redemptions: 1,
    referrerReward: 100,
    refereeReward: 50,
    redeemed: false,
    canRedeem: true,
    redeemBefore: '2026-11-04T12:00:00Z',
    ...overrides,
  };
}

export function donationFixture(overrides: Partial<Donation> = {}): Donation {
  return {
    id: '00000000-0000-4000-a200-000000000001',
    amount: 10,
    currency: 'CAD',
    status: 'SUCCEEDED',
    publicThanks: true,
    createdAt: '2026-10-02T12:00:00Z',
    ...overrides,
  };
}

export function supportersFixture(overrides: Partial<Supporters> = {}): Supporters {
  return {
    label: 'Voluntary support',
    note: 'Display names of members who chose to be thanked publicly.',
    supporters: [{ displayName: 'Noé Verdun', month: '2026-10' }],
    ...overrides,
  };
}

export function donationCheckoutFixture(
  overrides: Partial<FakeDonationCheckout> = {}
): FakeDonationCheckout {
  return {
    ref: 'fake_dn_test01',
    donationId: '00000000-0000-4000-a200-000000000001',
    amount: 10,
    currency: 'CAD',
    status: 'PENDING',
    summary: 'Voluntary support for OrenjiTrade',
    ...overrides,
  };
}

export function adFixture(overrides: Partial<Ad> = {}): Ad {
  return {
    creativeId: '00000000-0000-4000-a300-000000000001',
    placement: 'COLLECTOR_PROFILE',
    sponsored: true,
    label: 'Sponsored',
    advertiser: 'Maple Sleeve Co.',
    headline: 'Sleeves that survive every trade',
    body: 'Matte sleeves made for binders.',
    ctaLabel: 'Shop sleeves',
    clickUrl: '/api/v1/ads/00000000-0000-4000-a300-000000000001/click?token=tok-1',
    impressionToken: 'tok-1',
    ...overrides,
  };
}
