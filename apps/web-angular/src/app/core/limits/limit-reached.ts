import { ApiError } from '../http/api-error';

/** What the limit-reached dialog explains (from the 429 `LIMIT_REACHED` problem extensions). */
export interface LimitReachedInfo {
  limitKey: string;
  limit: number | null;
  used: number | null;
  /** ISO instant when the window resets; `null` for totals and caps. */
  resetsAt: string | null;
  planCode: string | null;
  /** Same-app path of the upgrade page (never an external URL). */
  upgradeUrl: string;
  requestId: string | null;
}

export const DEFAULT_UPGRADE_URL = '/premium';

/** Only same-app absolute paths are followed; anything else falls back to `/premium`. */
export function safeUpgradeUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return DEFAULT_UPGRADE_URL;
  }
  return /^\/[\w\-/?=&.%]*$/.test(value) ? value : DEFAULT_UPGRADE_URL;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Reads the limit extensions of a `LIMIT_REACHED` error; tolerant of missing fields. */
export function limitReachedInfo(error: ApiError): LimitReachedInfo {
  const problem = error.problem ?? {};
  return {
    limitKey: typeof problem.limitKey === 'string' && problem.limitKey ? problem.limitKey : '',
    limit: numberOrNull(problem.limit),
    used: numberOrNull(problem.used),
    resetsAt: typeof problem.resetsAt === 'string' && problem.resetsAt ? problem.resetsAt : null,
    planCode: typeof problem.planCode === 'string' && problem.planCode ? problem.planCode : null,
    upgradeUrl: safeUpgradeUrl(problem.upgradeUrl),
    requestId: error.requestId,
  };
}

export function isLimitReached(error: unknown): error is ApiError {
  return error instanceof ApiError && error.errorCode === 'LIMIT_REACHED';
}
