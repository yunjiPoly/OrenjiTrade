import { isApiError, type ApiError } from '@/src/api/ApiError';

import { relativeTime } from './relativeTime';

/**
 * Freemium limits (ADR 0014): a reached limit answers `429 LIMIT_REACHED` with the extensions
 * `limitKey`, `limit`, `used`, `resetsAt`, `planCode` (mirror of the web's
 * `core/limits/limit-reached.ts`). Screens explain it where it happened instead of a generic
 * error.
 */
export interface LimitReachedInfo {
  limitKey: string;
  limit: number | null;
  used: number | null;
  /** ISO instant when the window resets; `null` for totals and caps. */
  resetsAt: string | null;
  planCode: string | null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

export function isLimitReached(error: unknown): error is ApiError {
  return isApiError(error) && error.errorCode === 'LIMIT_REACHED';
}

/** Reads the limit extensions of a `LIMIT_REACHED` error; tolerant of missing fields. */
export function limitReachedInfo(error: ApiError): LimitReachedInfo {
  const problem = (error.problem ?? {}) as Record<string, unknown>;
  return {
    limitKey: textOrNull(problem.limitKey) ?? '',
    limit: numberOrNull(problem.limit),
    used: numberOrNull(problem.used),
    resetsAt: textOrNull(problem.resetsAt),
    planCode: textOrNull(problem.planCode),
  };
}

/** What each limit counts (the seed descriptions of `usage_limit`, V011). */
const LIMIT_NAMES: Record<string, string> = {
  'binders.max': 'binders',
  'binder.views.per_day': 'public binder views today',
  'wishlist.items.max': 'wishlist items',
  'offers.per_day': 'offers today',
  'saved_searches.max': 'saved searches',
};

const PLAN_NAMES: Record<string, string> = { FREE: 'Free', PREMIUM: 'Premium' };

/**
 * One sentence for a reached limit: "You have used 5 of 5 binders on the Free plan. Delete a
 * binder you no longer need." Resets are mentioned when the window has one. Premium is named
 * only while premium plans are sold (`premiumOffered`, the `premiumPlans` flag): with every money
 * feature off (launch configuration) nothing in the app pitches an upgrade.
 */
export function limitReachedMessage(
  info: LimitReachedInfo,
  now: number = Date.now(),
  options: { premiumOffered?: boolean } = {}
): string {
  const what = LIMIT_NAMES[info.limitKey] ?? 'uses of this feature';
  const plan = info.planCode ? (PLAN_NAMES[info.planCode] ?? info.planCode) : null;
  const usage =
    info.used !== null && info.limit !== null
      ? `You have used ${info.used} of ${info.limit} ${what}${plan ? ` on the ${plan} plan` : ''}.`
      : `You reached the ${what} your plan allows.`;
  const premium = options.premiumOffered ? ' Premium raises the limit.' : '';
  const reset = info.resetsAt
    ? ` It resets ${relativeTime(info.resetsAt, now)}.`
    : info.limitKey === 'binders.max'
      ? ` Delete a binder you no longer need${premium ? ', or Premium raises the limit' : ''}.`
      : premium;
  return `${usage}${reset}`;
}
