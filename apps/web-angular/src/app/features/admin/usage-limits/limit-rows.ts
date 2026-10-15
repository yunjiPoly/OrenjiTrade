import type { AdminUsageLimit } from '@orenji/api-client';

/** The usage limits in alphabetical order of their key (one per key, the same for everyone). */
export function sortLimits(limits: readonly AdminUsageLimit[]): AdminUsageLimit[] {
  return [...limits]
    .filter((limit) => !!limit.key)
    .sort((a, b) => (a.key ?? '').localeCompare(b.key ?? ''));
}

/** Replaces one limit (after a save) and keeps the rest. */
export function replaceLimit(
  limits: readonly AdminUsageLimit[],
  updated: AdminUsageLimit,
): AdminUsageLimit[] {
  return limits.map((limit) => (limit.id === updated.id ? updated : limit));
}

/** Validates an inline edit: a whole number from 0 to 1,000,000, or unlimited. */
export function limitValueError(unlimited: boolean, raw: string): string | null {
  if (unlimited) {
    return null;
  }
  if (raw.trim() === '') {
    return 'Enter a value or choose unlimited.';
  }
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    return 'Use a whole number.';
  }
  if (value < 0) {
    return 'Use 0 or more.';
  }
  if (value > 1_000_000) {
    return 'Use at most 1,000,000.';
  }
  return null;
}
