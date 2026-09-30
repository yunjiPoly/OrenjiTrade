const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

export type DateInput = Date | string | number;

function toTimestamp(input: DateInput): number {
  if (input instanceof Date) {
    return input.getTime();
  }
  if (typeof input === 'number') {
    return input;
  }
  return new Date(input).getTime();
}

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'}`;
}

/**
 * Human-readable elapsed time such as `3 hours ago`, `just now` or `in 2 days`.
 *
 * @param input the instant to describe (ISO string, epoch ms or Date)
 * @param now reference instant, defaults to `Date.now()` (inject in tests)
 */
export function relativeTime(input: DateInput, now: DateInput = Date.now()): string {
  const target = toTimestamp(input);
  const reference = toTimestamp(now);
  if (Number.isNaN(target) || Number.isNaN(reference)) {
    return 'unknown';
  }

  const diff = reference - target;
  const isFuture = diff < 0;
  const elapsed = Math.abs(diff);

  let label: string;
  if (elapsed < 45 * SECOND) {
    return 'just now';
  } else if (elapsed < HOUR) {
    label = plural(Math.max(1, Math.round(elapsed / MINUTE)), 'minute');
  } else if (elapsed < DAY) {
    label = plural(Math.max(1, Math.round(elapsed / HOUR)), 'hour');
  } else if (elapsed < WEEK) {
    label = plural(Math.max(1, Math.round(elapsed / DAY)), 'day');
  } else if (elapsed < MONTH) {
    label = plural(Math.max(1, Math.round(elapsed / WEEK)), 'week');
  } else if (elapsed < YEAR) {
    label = plural(Math.max(1, Math.round(elapsed / MONTH)), 'month');
  } else {
    label = plural(Math.max(1, Math.round(elapsed / YEAR)), 'year');
  }

  return isFuture ? `in ${label}` : `${label} ago`;
}

/** `Updated 3 hours ago` — the freshness caption used under binder and inventory rows. */
export function updatedRelativeTime(input: DateInput, now: DateInput = Date.now()): string {
  return `Updated ${relativeTime(input, now)}`;
}
