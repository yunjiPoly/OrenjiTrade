import { ApiError } from '../../core/http/api-error';
import { friendlyMessage } from '../../core/http/api-error-messages';
import { formatPrice } from '../inventory/inventory-labels';
import type { StatusInfo } from '../offers/offer-labels';
import { humanizeKey } from '../plans/plan-labels';

/**
 * Display vocabulary of Phase 10 (subscriptions with the fake billing provider, OrenjiTrade
 * credits, sponsored placements and voluntary donations; contract
 * `docs/api/contracts/phase10-freemium-credits-ads-donations.md` and the API's documented
 * deviations). Values (prices, costs, durations, rewards) always come from the API.
 */

export type SubscriptionStatus =
  'PENDING' | 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED';

export type DonationStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED';

export type CreditEntryType = 'EARN' | 'SPEND' | 'GRANT' | 'EXPIRE' | 'ADJUST' | 'REVERSAL';

export const SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
  'PENDING',
  'TRIAL',
  'ACTIVE',
  'PAST_DUE',
  'CANCELLED',
  'EXPIRED',
];

export const DONATION_STATUSES: readonly DonationStatus[] = [
  'PENDING',
  'SUCCEEDED',
  'FAILED',
  'REFUNDED',
];

/** Credits are non-cash (contract): the sentence every credit screen shows. */
export const CREDITS_NOT_CASH =
  'Credits are not money: they are never withdrawable or transferable and only unlock features on OrenjiTrade.';

/** Donations are voluntary (contract): the sentence every donation screen shows. */
export const DONATION_NOTE =
  'Donations are voluntary support. They never change ratings, search ranking or trust.';

/** The API's limit for a donation message (`DonationRequests.CheckoutRequest`). */
export const DONATION_MESSAGE_MAX = 280;
/** Suggested donation amounts (a starting point only: the API enforces the accepted range). */
export const DONATION_PRESETS: readonly number[] = [5, 10, 25, 50];
/** Currencies offered first; the API answers 400 with the accepted list for any other. */
export const DONATION_CURRENCIES: readonly string[] = ['CAD', 'USD'];

const SUBSCRIPTION_STATUS_INFO: Record<SubscriptionStatus, StatusInfo> = {
  PENDING: { label: 'Checkout open', icon: 'pending', tone: 'live' },
  TRIAL: { label: 'Trial', icon: 'hourglass_top', tone: 'info' },
  ACTIVE: { label: 'Active', icon: 'verified', tone: 'success' },
  PAST_DUE: { label: 'Payment overdue', icon: 'warning', tone: 'danger' },
  CANCELLED: { label: 'Cancelled', icon: 'block', tone: 'muted' },
  EXPIRED: { label: 'Expired', icon: 'timer_off', tone: 'muted' },
};

export function subscriptionStatusInfo(status: string | null | undefined): StatusInfo {
  return (
    SUBSCRIPTION_STATUS_INFO[status as SubscriptionStatus] ?? {
      label: status ?? '—',
      icon: 'info',
      tone: 'info',
    }
  );
}

/** A subscription that gives its plan right now (TRIAL, ACTIVE, PAST_DUE). */
export function isEntitling(status: string | null | undefined): boolean {
  return status === 'TRIAL' || status === 'ACTIVE' || status === 'PAST_DUE';
}

const DONATION_STATUS_INFO: Record<DonationStatus, StatusInfo> = {
  PENDING: { label: 'Waiting for payment', icon: 'pending', tone: 'live' },
  SUCCEEDED: { label: 'Thank you', icon: 'volunteer_activism', tone: 'success' },
  FAILED: { label: 'Did not go through', icon: 'error', tone: 'danger' },
  REFUNDED: { label: 'Refunded', icon: 'currency_exchange', tone: 'muted' },
};

export function donationStatusInfo(status: string | null | undefined): StatusInfo {
  return (
    DONATION_STATUS_INFO[status as DonationStatus] ?? {
      label: status ?? '—',
      icon: 'info',
      tone: 'info',
    }
  );
}

const CREDIT_TYPE_LABELS: Record<CreditEntryType, string> = {
  EARN: 'Earned',
  SPEND: 'Spent',
  GRANT: 'Granted',
  EXPIRE: 'Expired',
  ADJUST: 'Adjusted',
  REVERSAL: 'Reversed',
};

export function creditTypeLabel(type: string | null | undefined): string {
  return CREDIT_TYPE_LABELS[type as CreditEntryType] ?? humanizeKey(type ?? '');
}

const CREDIT_REASON_LABELS: Record<string, string> = {
  REFERRAL: 'Referral reward',
  PROMO: 'Welcome credits',
  REWARD: 'Reward',
  FEATURE_UNLOCK: 'Feature unlocked',
  ADMIN: 'From the OrenjiTrade team',
  CORRECTION: 'Correction',
};

/** What a ledger entry was for; `productName` names the unlocked feature of a spend. */
export function creditReasonLabel(
  reason: string | null | undefined,
  productName?: string | null,
): string {
  if (reason === 'FEATURE_UNLOCK' && productName) {
    return productName;
  }
  return CREDIT_REASON_LABELS[reason ?? ''] ?? humanizeKey(reason ?? '');
}

/** Signed credit amount: `+100`, `−50`. */
export function signedCredits(amount: number | null | undefined): string {
  const value = amount ?? 0;
  if (value > 0) {
    return `+${value.toLocaleString('en-CA')}`;
  }
  if (value < 0) {
    return `−${Math.abs(value).toLocaleString('en-CA')}`;
  }
  return '0';
}

/** `1 credit`, `1,250 credits`. */
export function creditsLabel(amount: number | null | undefined): string {
  const value = amount ?? 0;
  return `${value.toLocaleString('en-CA')} ${Math.abs(value) === 1 ? 'credit' : 'credits'}`;
}

/** `24 hours`, `2 days`, `1 hour`. */
export function durationLabel(hours: number | null | undefined): string {
  const value = hours ?? 0;
  if (value >= 48 && value % 24 === 0) {
    return `${value / 24} days`;
  }
  return `${value} ${value === 1 ? 'hour' : 'hours'}`;
}

/** Money with its currency (`$4.99`, `US$10.00`), `—` when unknown. */
export function amountLabel(
  amount: number | null | undefined,
  currency: string | null | undefined,
) {
  return formatPrice(amount, currency) ?? '—';
}

/** Readable name of an entitlement / plan feature key (`filters.advanced`). */
export function entitlementLabel(featureKey: string | null | undefined, value?: string | null) {
  switch (featureKey) {
    case 'filters.advanced':
      return 'Advanced search filters';
    case 'ads.enabled':
      return value === 'false' ? 'No ads' : 'Sponsored placements';
    case 'binder.views.per_day':
      return value === 'unlimited' ? 'Unlimited binder views' : `Binder views per day: ${value}`;
    case 'map.radius.max_km':
      return value ? `Map radius up to ${value} km` : 'Wider map radius';
    default: {
      const label = humanizeKey(featureKey ?? '');
      return value && value !== 'true' ? `${label}: ${value}` : label;
    }
  }
}

const SOURCE_LABELS: Record<string, string> = {
  SUBSCRIPTION: 'Subscription',
  ADMIN_GRANT: 'From the OrenjiTrade team',
  PROMO: 'Promotion',
  CREDIT_PURCHASE: 'Unlocked with credits',
};

export function entitlementSourceLabel(source: string | null | undefined): string {
  return SOURCE_LABELS[source ?? ''] ?? humanizeKey(source ?? '');
}

/**
 * A string extension of the Problem Details body (`reason`, `currentStatus`). The generated
 * `ProblemDetail` declares them since Phase 10 but a proxy may send less: read defensively.
 */
function extension(error: ApiError, key: string): unknown {
  return (error.problem as Record<string, unknown> | null)?.[key];
}

function numberExtension(error: ApiError, key: string): number | null {
  const value = extension(error, key);
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Why the subscription checkout was refused (409 ALREADY_SUBSCRIBED, 404 FEATURE_DISABLED). */
export function checkoutProblem(error: ApiError): string {
  switch (error.errorCode) {
    case 'ALREADY_SUBSCRIBED': {
      const status = extension(error, 'currentStatus');
      const label =
        typeof status === 'string' ? subscriptionStatusInfo(status).label.toLowerCase() : null;
      return label
        ? `You already have a subscription (${label}). Manage it below instead of starting another one.`
        : 'You already have a subscription. Manage it below instead of starting another one.';
    }
    case 'FEATURE_DISABLED':
      return 'Premium subscriptions are not available right now. Please try again later.';
    case 'VALIDATION_FAILED':
      return 'This plan cannot be bought right now.';
    default:
      return friendlyMessage(error);
  }
}

/** Why a credit spend was refused (409 INSUFFICIENT_CREDITS with `balance` / `cost`). */
export function spendProblem(error: ApiError): string {
  switch (error.errorCode) {
    case 'INSUFFICIENT_CREDITS': {
      const balance = numberExtension(error, 'balance');
      const cost = numberExtension(error, 'cost');
      return balance !== null && cost !== null
        ? `You have ${creditsLabel(balance)} and this costs ${creditsLabel(cost)}.`
        : 'You do not have enough credits for this.';
    }
    case 'CONFLICT':
      return 'This unlock was already used for another feature. Close the dialog and try again.';
    case 'FEATURE_DISABLED':
      return 'Credits are not available right now. Please try again later.';
    case 'NOT_FOUND':
      return 'This feature can no longer be unlocked with credits.';
    default:
      return friendlyMessage(error);
  }
}

/** Why a referral code was refused (404 unknown code, 409 REFERRAL_NOT_ALLOWED `reason`). */
export function referralProblem(error: ApiError): string {
  if (error.status === 404 && error.errorCode !== 'FEATURE_DISABLED') {
    return 'This code does not exist. Check the spelling with the collector who shared it.';
  }
  if (error.errorCode === 'REFERRAL_NOT_ALLOWED') {
    switch (extension(error, 'reason')) {
      case 'SELF':
        return 'This is your own code: share it with other collectors instead.';
      case 'ALREADY_REDEEMED':
        return 'You already redeemed a referral code. Each account can redeem one.';
      case 'ACCOUNT_TOO_OLD':
        return 'Referral codes can only be redeemed shortly after joining, and that window has closed.';
      case 'REFERRER_LIMIT':
        return 'This code reached its redemption limit.';
      default:
        return error.message || 'This code cannot be redeemed.';
    }
  }
  if (error.errorCode === 'FEATURE_DISABLED') {
    return 'Referrals are not available right now. Please try again later.';
  }
  return friendlyMessage(error);
}

/** Field messages of a refused donation (400 with the accepted range and currencies). */
export function donationProblem(error: ApiError): {
  message: string;
  amount: string | null;
  currency: string | null;
} {
  if (error.errorCode === 'VALIDATION_FAILED') {
    const amount = error.fieldErrors['amount'] ?? null;
    const currency = error.fieldErrors['currency'] ?? null;
    return {
      message: 'Check the amount and the currency.',
      amount: amount ? `The amount ${amount}.` : null,
      currency: currency ? `The currency ${currency}.` : null,
    };
  }
  if (error.errorCode === 'FEATURE_DISABLED') {
    return {
      message: 'Donations are not available right now. Thank you for thinking of it.',
      amount: null,
      currency: null,
    };
  }
  return { message: friendlyMessage(error), amount: null, currency: null };
}

/**
 * Where a checkout answer sends the collector: a same-app path of a local fake checkout
 * (`/checkout/fake-billing/…`, `/checkout/fake-donation/…`) or an https page of a real provider.
 * Anything else is refused (`null`).
 */
export function checkoutTarget(
  url: string | null | undefined,
): { kind: 'app'; path: string } | { kind: 'external'; url: string } | null {
  if (!url) {
    return null;
  }
  if (/^\/checkout\/fake-(billing|donation)\/[\w-]{1,80}$/.test(url)) {
    return { kind: 'app', path: url };
  }
  if (/^https:\/\/[^\s/]+\/\S*$/.test(url)) {
    return { kind: 'external', url };
  }
  return null;
}

/** A client-generated idempotency key (`POST /me/credits/spend`), `[A-Za-z0-9._:-]{1,100}`. */
export function newIdempotencyKey(prefix = 'web'): string {
  const cryptoApi = globalThis.crypto as { randomUUID?: () => string } | undefined;
  const random = cryptoApi?.randomUUID
    ? cryptoApi.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}:${random}`;
}
