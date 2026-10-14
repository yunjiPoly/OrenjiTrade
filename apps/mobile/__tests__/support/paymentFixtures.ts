import type {
  Ad,
  CreditEntry,
  Donation,
  FakeBillingCheckout,
  FakeDonationCheckout,
  MyCredits,
  MyPlan,
  MyReferral,
  MySubscription,
  Plan,
  Supporters,
} from '@/src/api/types';

/** Fictional answers of the Phase 10 endpoints (mobile stage M6; protected payments left the phone, ADR 0018). */

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
      key: 'wishlist.items.max',
      kind: 'CAP',
      window: 'TOTAL',
      limit: 20,
      description: 'Wishlist items',
    },
  ],
};

export const PREMIUM_PLAN: Plan = {
  code: 'PREMIUM',
  name: 'Premium',
  description: 'More views, more wishes and no ads.',
  monthlyPrice: 4.99,
  currency: 'CAD',
  features: [
    { key: 'filters.advanced', enabled: true },
    { key: 'ads.enabled', enabled: false },
  ],
  limits: [
    { key: 'binders.max', kind: 'COUNTER', window: 'TOTAL', limit: 50, description: 'Binders' },
    { key: 'wishlist.items.max', kind: 'CAP', window: 'TOTAL', description: 'Wishlist items' },
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
        key: 'wishlist.items.max',
        allowed: true,
        kind: 'CAP',
        window: 'TOTAL',
        limit: 20,
        used: 2,
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
        key: 'binder_views_day',
        name: 'Unlimited binder views',
        description: 'Open as many public binders as you like for 24 hours.',
        featureKey: 'binder.views.per_day',
        featureValue: 'unlimited',
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
