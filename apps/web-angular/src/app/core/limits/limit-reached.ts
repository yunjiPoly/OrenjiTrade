import { ApiError } from '../http/api-error';

/**
 * What the limit-reached dialog explains (from the 429 `LIMIT_REACHED` problem extensions). The
 * limits are the same for every collector since stage F1: no plan, nothing to buy.
 */
export interface LimitReachedInfo {
  limitKey: string;
  limit: number | null;
  used: number | null;
  /** ISO instant when the window resets; `null` for totals and caps. */
  resetsAt: string | null;
  requestId: string | null;
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
    requestId: error.requestId,
  };
}

export function isLimitReached(error: unknown): error is ApiError {
  return error instanceof ApiError && error.errorCode === 'LIMIT_REACHED';
}
