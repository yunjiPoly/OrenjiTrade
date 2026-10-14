import { isApiError, type ApiError } from '@/src/api/ApiError';

import { relativeTime } from './relativeTime';

/**
 * Usage limits (ADR 0014; the same for every collector since stage F1): a reached limit answers
 * `429 LIMIT_REACHED` with the extensions `limitKey`, `limit`, `used`, `resetsAt` (mirror of the
 * web's `core/limits/limit-reached.ts`). Screens explain it where it happened instead of a generic
 * error; nothing is sold to lift a limit.
 */
export interface LimitReachedInfo {
  limitKey: string;
  limit: number | null;
  used: number | null;
  /** ISO instant when the window resets; `null` for totals and caps. */
  resetsAt: string | null;
  /** How many the refused action asked for at once (an import: the new cards it adds). */
  requested: number | null;
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
    requested: numberOrNull(problem.requested),
  };
}

/** What each limit counts (the seed descriptions of `usage_limit`, V011). */
const LIMIT_NAMES: Record<string, string> = {
  'binders.max': 'binders',
  'binder.views.per_day': 'public binder views today',
  'wishlist.items.max': 'wishlist items',
  'offers.per_day': 'offers today',
  'saved_searches.max': 'saved searches',
  'inventory.items.max': 'inventory cards',
};

/**
 * One sentence for a reached limit: "You have used 5 of 5 binders. Delete a binder you no longer
 * need." Resets are mentioned when the window has one. No plan and no upgrade: every collector has
 * the same limits.
 */
export function limitReachedMessage(info: LimitReachedInfo, now: number = Date.now()): string {
  const what = LIMIT_NAMES[info.limitKey] ?? 'uses of this feature';
  const usage =
    info.used !== null && info.limit !== null
      ? `You have used ${info.used} of ${info.limit} ${what}.`
      : `You reached the limit of ${what}.`;
  const reset = info.resetsAt
    ? ` It resets ${relativeTime(info.resetsAt, now)}.`
    : info.limitKey === 'binders.max'
      ? ' Delete a binder you no longer need.'
      : '';
  return `${usage}${reset}`;
}
