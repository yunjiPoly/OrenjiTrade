import { LOCALE_ID, Pipe, PipeTransform, inject } from '@angular/core';

export type DateInput = Date | string | number | null | undefined;

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/** Below this distance from "now" we say "just now" rather than "0 seconds ago". */
const JUST_NOW_THRESHOLD_MS = 45 * SECOND;

const UNITS: readonly [Intl.RelativeTimeFormatUnit, number, number][] = [
  // [unit, unit length in ms, use this unit while |diff| is below this many ms]
  ['minute', MINUTE, HOUR],
  ['hour', HOUR, DAY],
  ['day', DAY, WEEK],
  ['week', WEEK, MONTH],
  ['month', MONTH, YEAR],
  ['year', YEAR, Number.POSITIVE_INFINITY],
];

export function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Formats the distance between `value` and `now` in words: "just now", "3 hours ago",
 * "yesterday", "in 2 days". Uses `Intl.RelativeTimeFormat`; empty string for invalid input.
 */
export function formatRelativeTime(
  value: DateInput,
  now: Date | number = Date.now(),
  locale = 'en',
): string {
  const date = toDate(value);
  if (!date) {
    return '';
  }
  const nowMs = typeof now === 'number' ? now : now.getTime();
  const diff = date.getTime() - nowMs;
  const distance = Math.abs(diff);

  if (distance < JUST_NOW_THRESHOLD_MS) {
    return 'just now';
  }

  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  for (const [unit, length, limit] of UNITS) {
    if (distance < limit) {
      return formatter.format(Math.round(diff / length), unit);
    }
  }
  return formatter.format(Math.round(diff / YEAR), 'year');
}

/**
 * `{{ updatedAt | relativeTime }}` -> "3 hours ago".
 * Pass a second argument (`now`) to make the output deterministic in tests.
 */
@Pipe({ name: 'relativeTime' })
export class RelativeTimePipe implements PipeTransform {
  private readonly locale = inject(LOCALE_ID);

  transform(value: DateInput, now: Date | number = Date.now()): string {
    return formatRelativeTime(value, now, this.locale);
  }
}
