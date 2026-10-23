/** `September 29, 2026` (the web's `date: 'longDate'`), or the raw value when unparsable. */
export function formatLongDate(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  try {
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/** `March 2025` (Settings › Account's "Member since"), or the raw value when unparsable. */
export function formatMonthYear(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  try {
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
  } catch {
    return date.toISOString().slice(0, 7);
  }
}

/** Date and time (the web's `date: 'medium'`). */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  try {
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return date.toISOString().replace('T', ' ').slice(0, 16);
  }
}

const MONTH_DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const MONTH_DAY_YEAR = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

/**
 * `Oct 17` this year, `Oct 17, 2025` another year (the rating form's "sold to you Oct 17", stage
 * R14), or the raw value when unparsable. English only (owner, 2026-10-20).
 */
export function formatMonthDay(value: string | null | undefined, now: Date = new Date()): string {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.getFullYear() === now.getFullYear()
    ? MONTH_DAY.format(date)
    : MONTH_DAY_YEAR.format(date);
}

/**
 * `Nov 1, 2024` (a set's release day, stage R14), or the raw value when unparsable. The day is
 * read from the value's first ten characters, so it is the day the catalog says wherever the
 * phone is (never the day before west of Greenwich).
 */
export function formatReleaseDay(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  const date = day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return MONTH_DAY_YEAR.format(date);
}
