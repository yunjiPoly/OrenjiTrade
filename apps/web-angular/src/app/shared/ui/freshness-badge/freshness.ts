import { DateInput, toDate } from '../../pipes/relative-time.pipe';

/** Inventory freshness buckets (docs/design/design-system.md). */
export type FreshnessState = 'fresh' | 'aging' | 'stale' | 'hidden';

export const FRESHNESS_STATES: readonly FreshnessState[] = ['fresh', 'aging', 'stale', 'hidden'];

export const FRESHNESS_LABELS: Record<FreshnessState, string> = {
  fresh: 'Fresh',
  aging: 'Aging',
  stale: 'Stale',
  hidden: 'Hidden',
};

/** Upper bounds (inclusive, in days) for each bucket. `hidden` is everything above. */
export const FRESHNESS_THRESHOLD_DAYS = { fresh: 14, aging: 30, stale: 45 } as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Derives the freshness bucket from the last update/confirmation date. */
export function freshnessFromDate(value: DateInput, now: Date | number = Date.now()): FreshnessState {
  const date = toDate(value);
  if (!date) {
    return 'hidden';
  }
  const nowMs = typeof now === 'number' ? now : now.getTime();
  const ageDays = Math.max(0, (nowMs - date.getTime()) / DAY_MS);
  if (ageDays <= FRESHNESS_THRESHOLD_DAYS.fresh) {
    return 'fresh';
  }
  if (ageDays <= FRESHNESS_THRESHOLD_DAYS.aging) {
    return 'aging';
  }
  if (ageDays <= FRESHNESS_THRESHOLD_DAYS.stale) {
    return 'stale';
  }
  return 'hidden';
}
