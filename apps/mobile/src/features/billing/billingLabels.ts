import type { ApiError } from '@/src/api/ApiError';
import { friendlyMessage } from '@/src/api/errorMessages';
import type { IconName } from '@/src/components/ui/EmptyState';
import type { StatusInfo } from '@/src/features/offers/offerLabels';
import { formatMoney } from '@/src/lib/catalog';

/**
 * Display vocabulary of Phase 10 (subscriptions with the fake billing provider, OrenjiTrade
 * credits, sponsored placements and voluntary donations; mirror of the web's
 * `shared/billing/billing-labels.ts` and `shared/plans/plan-labels.ts`). Values (prices, costs,
 * durations, rewards, limits) always come from the API.
 */

export type SubscriptionStatus =
  'PENDING' | 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED';
export type DonationStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED';
export type CreditEntryType = 'EARN' | 'SPEND' | 'GRANT' | 'EXPIRE' | 'ADJUST' | 'REVERSAL';

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
/** Referral codes: letters, digits, spaces and dashes, 3 to 32 characters. */
export const REFERRAL_CODE_PATTERN = /^[A-Za-z0-9 -]{3,32}$/;

/** `binder.views.per_day` → `Binder views per day`. */
export function humanizeKey(key: string): string {
  const words = key
    .replace(/[._]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase();
  return words ? (words[0]?.toUpperCase() ?? '') + words.slice(1) : key;
}

/** Readable label for a feature switch of a plan (`filters.advanced`, `ads.enabled`, ...). */
export function featureLabel(key: string, enabled: boolean): string {
  switch (key) {
    case 'filters.advanced':
      return enabled ? 'Advanced search filters' : 'Standard search filters';
    case 'ads.enabled':
      return enabled ? 'Sponsored placements shown' : 'No ads';
    default:
      return `${humanizeKey(key)}${enabled ? '' : ' (not included)'}`;
  }
}

/** Features that are a restriction for the viewer (ads shown, advanced filters missing). */
export function isDowngrade(key: string | undefined, enabled: boolean | undefined): boolean {
  return key === 'ads.enabled' ? !!enabled : !enabled;
}

/** `null`/`undefined` limits are unlimited. */
export function formatLimitValue(limit: number | null | undefined): string {
  return limit === null || limit === undefined ? 'Unlimited' : String(limit);
}

/** Suffix for a counter window: "per day", "per month", or nothing for totals and caps. */
export function windowSuffix(window: string | null | undefined): string {
  switch (window) {
    case 'DAY':
      return 'per day';
    case 'MONTH':
      return 'per month';
    default:
      return '';
  }
}

/** Monthly price: a currency amount; "Free" for zero unless `zeroAsFree` is false. */
export function formatPlanPrice(
  amount: number | null | undefined,
  currency: string | null | undefined,
  zeroAsFree = true
): string {
  if (!amount && zeroAsFree) {
    return 'Free';
  }
  return formatMoney(amount ?? 0, currency || 'CAD') ?? 'Free';
}

/** Money with its currency (`$4.99`), `—` when unknown. */
export function amountLabel(
  amount: number | null | undefined,
  currency: string | null | undefined
) {
  return formatMoney(amount, currency || 'CAD') ?? '—';
}

const SUBSCRIPTION_STATUS_INFO: Record<SubscriptionStatus, StatusInfo> = {
  PENDING: { label: 'Checkout open', icon: 'timer-sand', tone: 'live' },
  TRIAL: { label: 'Trial', icon: 'timer-sand', tone: 'info' },
  ACTIVE: { label: 'Active', icon: 'check-decagram', tone: 'success' },
  PAST_DUE: { label: 'Payment overdue', icon: 'alert-outline', tone: 'danger' },
  CANCELLED: { label: 'Cancelled', icon: 'block-helper', tone: 'muted' },
  EXPIRED: { label: 'Expired', icon: 'timer-off-outline', tone: 'muted' },
};

export function subscriptionStatusInfo(status: string | null | undefined): StatusInfo {
  return (
    SUBSCRIPTION_STATUS_INFO[status as SubscriptionStatus] ?? {
      label: status ?? '—',
      icon: 'information-outline',
      tone: 'info',
    }
  );
}

const DONATION_STATUS_INFO: Record<DonationStatus, StatusInfo> = {
  PENDING: { label: 'Waiting for payment', icon: 'timer-sand', tone: 'live' },
  SUCCEEDED: { label: 'Thank you', icon: 'hand-heart-outline', tone: 'success' },
  FAILED: { label: 'Did not go through', icon: 'alert-circle-outline', tone: 'danger' },
  REFUNDED: { label: 'Refunded', icon: 'cash-refund', tone: 'muted' },
};

export function donationStatusInfo(status: string | null | undefined): StatusInfo {
  return (
    DONATION_STATUS_INFO[status as DonationStatus] ?? {
      label: status ?? '—',
      icon: 'information-outline',
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
  productName?: string | null
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

/** Icons of the features credits unlock. */
export const PRODUCT_ICONS: Record<string, IconName> = {
  'filters.advanced': 'tune-variant',
  'binder.views.per_day': 'book-open-page-variant-outline',
  'map.radius.max_km': 'map-search-outline',
};

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

/** Entitlements still running (the API lists active ones; one that just ended is dropped). */
export function activeEntitlements<T extends { expiresAt?: string | null }>(
  entitlements: readonly T[],
  now: number = Date.now()
): T[] {
  return entitlements.filter(
    (entitlement) => !entitlement.expiresAt || Date.parse(entitlement.expiresAt) > now
  );
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

/** A string extension of the Problem Details body (`reason`, `currentStatus`), read defensively. */
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

/** Inline message of the referral code field; `null` when valid. */
export function referralCodeError(code: string): string | null {
  const value = code.trim();
  if (!value) {
    return 'Enter the code another collector shared with you.';
  }
  return REFERRAL_CODE_PATTERN.test(value) ? null : 'Codes use letters and digits (3 to 32).';
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

/** `March 2026` for a supporter's month (`2026-03`). */
export function supporterMonth(month: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month ?? '');
  if (!match) {
    return '';
  }
  const names = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const index = Number(match[2]) - 1;
  return `${names[index] ?? match[2]} ${match[1]}`;
}

/** One usage row of Premium (`GET /me/plan` limits). */
export interface UsageRow {
  key: string;
  label: string;
  /** "3 / 5", "Unlimited", "Up to 25 km". */
  value: string;
  /** Fill of the bar in percent, `null` without a bar (caps, unlimited, zero limits). */
  percent: number | null;
  full: boolean;
  resetsAt: string | null;
  /** An entitlement (credits, admin grant) overrides the plan value. */
  boosted: boolean;
}

/**
 * Turns the plan's limit statuses into display rows (web: `usageRows`). Counters show
 * `used / limit` with a bar; caps (the map radius) show the value; `null` limits are unlimited.
 */
export function usageRows(
  limits:
    | readonly {
        key?: string;
        kind?: string;
        limit?: number | null;
        used?: number | null;
        allowed?: boolean;
        resetsAt?: string | null;
        overridden?: boolean;
      }[]
    | null
    | undefined,
  describe: (key: string) => string
): UsageRow[] {
  return (limits ?? []).map((limit) => {
    const key = limit.key ?? '';
    const max = limit.limit;
    const unlimited = max === null || max === undefined;
    const used = limit.used ?? 0;
    let value: string;
    let percent: number | null = null;
    if (limit.kind === 'CAP') {
      value = unlimited ? 'Unlimited' : `Up to ${max}${key.endsWith('_km') ? ' km' : ''}`;
    } else if (unlimited) {
      value = `${used} used · Unlimited`;
    } else {
      value = `${used} / ${max}`;
      percent = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : null;
    }
    return {
      key,
      label: describe(key),
      value,
      percent,
      full: limit.allowed === false,
      resetsAt: limit.resetsAt ?? null,
      boosted: !!limit.overridden,
    };
  });
}

/** A client-generated idempotency key (`POST /me/credits/spend`), `[A-Za-z0-9._:-]{1,100}`. */
export function idempotencyKeyFrom(prefix: string, id: string): string {
  return `${prefix}:${id}`.replace(/[^A-Za-z0-9._:-]/g, '').slice(0, 100);
}
