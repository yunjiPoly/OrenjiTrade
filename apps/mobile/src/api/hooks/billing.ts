import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';

import type { ApiError } from '../ApiError';
import { api, required } from '../client';
import { meKeys, publicKeys } from '../queryKeys';
import { useHomeRegion } from './regions';
import type {
  Ad,
  AdPlacement,
  CreditSpend,
  Donation,
  DonationCheckout,
  DonationCheckoutRequest,
  FakeBillingCheckout,
  FakeDonationCheckout,
  MyCredits,
  MyReferral,
  MySubscription,
  Plan,
  ReferralRedemption,
  SubscriptionCheckout,
  Supporters,
} from '../types';
import { useIsAuthenticated, useUid } from './useUid';

type Uid = string | null;

/** Entries per ledger page (web: `LEDGER_PAGE_SIZE`). */
export const LEDGER_PAGE_SIZE = 20;
/** Supporters shown on the support screen (web: `SUPPORTERS_LIMIT`). */
export const SUPPORTERS_LIMIT = 30;

/** `GET /api/v1/plans`: the plans with their limits and features (public). */
export function usePlans(enabled = true) {
  return useQuery<Plan[], ApiError>({
    queryKey: publicKeys.plans,
    queryFn: async () => required((await api.GET('/api/v1/plans')).data),
    enabled,
    staleTime: 60 * 60_000,
  });
}

/**
 * Everything a plan change affects: the account (`/me` carries the plan), the plan with its
 * usage, the ads served (Premium has none) and the credits (stacked boosts).
 */
export function refreshAfterPlanChange(queryClient: QueryClient, uid: Uid): void {
  void queryClient.invalidateQueries({ queryKey: meKeys.account(uid) });
  void queryClient.invalidateQueries({ queryKey: meKeys.plan(uid) });
  void queryClient.invalidateQueries({ queryKey: meKeys.ads(uid) });
  void queryClient.invalidateQueries({ queryKey: meKeys.credits(uid) });
}

/**
 * `POST /api/v1/me/subscription/checkout`: opens (or resumes) a checkout of a paid plan; answers
 * where to pay (`url`: the web path `/checkout/fake-billing/<ref>` with the local fake provider).
 * 409 ALREADY_SUBSCRIBED while a subscription is live; 404 FEATURE_DISABLED while
 * `premiumPlans` is off.
 */
export function useStartSubscriptionCheckout() {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<SubscriptionCheckout, ApiError, string>({
    mutationFn: async (planCode) =>
      required((await api.POST('/api/v1/me/subscription/checkout', { body: { planCode } })).data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: meKeys.plan(uid) });
    },
    onError: (error) => {
      if (error.errorCode === 'ALREADY_SUBSCRIBED') {
        void queryClient.invalidateQueries({ queryKey: meKeys.plan(uid) });
      }
    },
  });
}

/**
 * `POST /api/v1/me/subscription/cancel`: at the period end (the plan stays until then) or at once
 * (the free plan applies now); also closes an open checkout. 404 when there is none.
 */
export function useCancelSubscription() {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<MySubscription, ApiError, boolean>({
    mutationFn: async (atPeriodEnd) =>
      required((await api.POST('/api/v1/me/subscription/cancel', { body: { atPeriodEnd } })).data),
    onSettled: () => refreshAfterPlanChange(queryClient, uid),
  });
}

/** `GET /api/v1/billing/fake/{ref}`: a fake billing checkout (the member who opened it only). */
export async function readFakeBillingCheckout(ref: string): Promise<FakeBillingCheckout> {
  return required(
    (await api.GET('/api/v1/billing/fake/{ref}', { params: { path: { ref } } })).data
  );
}

/** `POST /api/v1/billing/fake/{ref}/confirm`: pays or simulates a declined payment. */
export async function confirmFakeBillingCheckout(
  ref: string,
  outcome: 'SUCCEEDED' | 'FAILED'
): Promise<void> {
  await api.POST('/api/v1/billing/fake/{ref}/confirm', {
    params: { path: { ref } },
    body: { outcome },
  });
}

/**
 * `GET /api/v1/me/credits`: the balance, the products credits unlock and the append-only ledger
 * (newest first, cursor pages). `withdrawable` and `transferable` are always false.
 */
export function useMyCredits(enabled = true) {
  const uid = useUid();
  return useInfiniteQuery<MyCredits, ApiError>({
    queryKey: meKeys.creditLedger(uid),
    initialPageParam: null,
    queryFn: async ({ pageParam }) =>
      required(
        (
          await api.GET('/api/v1/me/credits', {
            params: {
              query: {
                limit: LEDGER_PAGE_SIZE,
                ...(pageParam ? { cursor: pageParam as string } : {}),
              },
            },
          })
        ).data
      ),
    getNextPageParam: (last) =>
      last.entries?.hasMore && last.entries.nextCursor ? last.entries.nextCursor : undefined,
    enabled: useIsAuthenticated() && enabled,
    staleTime: 0,
  });
}

/** `GET /api/v1/me/referrals`: the caller's code, its rewards and whether they can redeem one. */
export function useMyReferral(enabled = true) {
  const uid = useUid();
  return useQuery<MyReferral, ApiError>({
    queryKey: meKeys.referral(uid),
    queryFn: async () => required((await api.GET('/api/v1/me/referrals')).data),
    enabled: useIsAuthenticated() && enabled,
    staleTime: 0,
  });
}

/**
 * `POST /api/v1/me/credits/spend`: unlocks a product for its duration with the dialog's
 * idempotency key (a retry of the same key answers the original result without spending
 * twice). 409 INSUFFICIENT_CREDITS (`balance`, `cost`).
 */
export function useSpendCredits() {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<CreditSpend, ApiError, { productKey: string; idempotencyKey: string }>({
    mutationFn: async ({ productKey, idempotencyKey }) =>
      required(
        (
          await api.POST('/api/v1/me/credits/spend', {
            body: { featureKey: productKey, idempotencyKey },
          })
        ).data
      ),
    onSettled: () => {
      // The balance, the ledger and the boosts (stacked entitlements raise the limits).
      void queryClient.invalidateQueries({ queryKey: meKeys.credits(uid) });
      void queryClient.invalidateQueries({ queryKey: meKeys.plan(uid) });
    },
  });
}

/** `POST /api/v1/me/referrals/redeem`: another member's code (once, shortly after joining). */
export function useRedeemReferral() {
  const uid = useUid();
  const queryClient = useQueryClient();
  return useMutation<ReferralRedemption, ApiError, string>({
    mutationFn: async (code) =>
      required(
        (await api.POST('/api/v1/me/referrals/redeem', { body: { code: code.trim() } })).data
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: meKeys.credits(uid) });
    },
  });
}

/** `GET /api/v1/public/donations/supporters`: opt-in display names and months, never amounts. */
export function useSupporters() {
  return useQuery<Supporters, ApiError>({
    queryKey: publicKeys.supporters,
    queryFn: async () =>
      required(
        (
          await api.GET('/api/v1/public/donations/supporters', {
            params: { query: { limit: SUPPORTERS_LIMIT } },
          })
        ).data
      ),
    staleTime: 60_000,
  });
}

/** `GET /api/v1/me/donations`: the caller's donations, newest first. */
export function useMyDonations(enabled = true) {
  const uid = useUid();
  return useQuery<Donation[], ApiError>({
    queryKey: meKeys.donations(uid),
    queryFn: async () => required((await api.GET('/api/v1/me/donations')).data) ?? [],
    enabled: useIsAuthenticated() && enabled,
    staleTime: 0,
  });
}

/**
 * `POST /api/v1/donations/checkout`: opens a voluntary donation checkout; answers where to pay
 * (the web path `/checkout/fake-donation/<ref>` with the local fake provider). 400 with the
 * accepted amounts and currencies; 404 FEATURE_DISABLED while `donations` is off.
 */
export function useStartDonationCheckout() {
  return useMutation<DonationCheckout, ApiError, DonationCheckoutRequest>({
    mutationFn: async (request) =>
      required((await api.POST('/api/v1/donations/checkout', { body: request })).data),
  });
}

/** `GET /api/v1/donations/fake/{ref}`: a fake donation checkout (the donor only). */
export async function readFakeDonationCheckout(ref: string): Promise<FakeDonationCheckout> {
  return required(
    (await api.GET('/api/v1/donations/fake/{ref}', { params: { path: { ref } } })).data
  );
}

/** `POST /api/v1/donations/fake/{ref}/confirm`: pays or simulates a declined payment. */
export async function confirmFakeDonationCheckout(
  ref: string,
  outcome: 'SUCCEEDED' | 'FAILED'
): Promise<void> {
  await api.POST('/api/v1/donations/fake/{ref}/confirm', {
    params: { path: { ref } },
    body: { outcome },
  });
}

/**
 * `GET /api/v1/ads?placement=&game=&region=`: the sponsored placements served to this viewer in
 * the home region (`[]` for Premium members and `ads.enabled` entitlements; every ad is labelled
 * "Sponsored"). The answer is never cached by the API (`no-store`); it is read once per
 * placement, game, plan and region.
 */
export function useAds(
  placement: AdPlacement,
  game: string | null | undefined,
  plan: string | null | undefined,
  enabled: boolean
) {
  const uid = useUid();
  const region = useHomeRegion();
  return useQuery<Ad[], ApiError>({
    queryKey: meKeys.adSlot(uid, placement, game ?? null, plan ?? null, region),
    queryFn: async () => {
      const ads = required(
        (
          await api.GET('/api/v1/ads', {
            params: { query: { placement, region, ...(game ? { game } : {}) } },
          })
        ).data
      );
      return Array.isArray(ads) ? ads : [];
    },
    enabled: useIsAuthenticated() && enabled,
    staleTime: 10 * 60_000,
    retry: false,
  });
}

/** Impressions already recorded in this app session (one per serve token). */
const recordedImpressions = new Set<string>();

/**
 * `POST /api/v1/ads/{creativeId}/impression` with the serve token, once per served ad (the API
 * also deduplicates per token). Failures are ignored: an impression is best effort.
 */
export function recordAdImpression(ad: Pick<Ad, 'creativeId' | 'impressionToken'>): void {
  const token = ad.impressionToken;
  if (!ad.creativeId || !token || recordedImpressions.has(token)) {
    return;
  }
  recordedImpressions.add(token);
  void api
    .POST('/api/v1/ads/{creativeId}/impression', {
      params: { path: { creativeId: ad.creativeId } },
      body: { token },
    })
    .catch(() => undefined);
}

/** Test hook: forget the recorded impressions. */
export function resetRecordedImpressions(): void {
  recordedImpressions.clear();
}
