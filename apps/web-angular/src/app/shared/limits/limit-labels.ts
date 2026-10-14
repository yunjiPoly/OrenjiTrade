/**
 * Wording for the usage limits (the same for every collector since stage F1, "free for all").
 * Values (numbers, windows) always come from the API; this file only turns keys into readable
 * sentences.
 */

/** What each limit counts (the descriptions of the `usage_limit` rows, V011 and V113). */
const LIMIT_LABELS: Record<string, string> = {
  'binder.views.per_day': 'Public binder views per day',
  'wishlist.alerts.per_day': 'Wishlist alerts per day',
  'wishlist.items.max': 'Wishlist items',
  'binders.max': 'Binders',
  'saved_searches.max': 'Saved searches',
  'offers.per_day': 'Offers sent per day',
  'inventory.items.max': 'Inventory items',
};

/** The readable name of a limit key ("Public binder views per day"); unknown keys humanized. */
export function limitLabel(key: string): string {
  return LIMIT_LABELS[key] ?? (key ? humanizeKey(key) : 'Usage limit');
}

/** `binder.views.per_day` -> `Binder views per day`. */
export function humanizeKey(key: string): string {
  const words = key
    .replace(/[._]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : key;
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

export function windowLabel(window: string | null | undefined): string {
  switch (window) {
    case 'DAY':
      return 'Daily';
    case 'MONTH':
      return 'Monthly';
    case 'TOTAL':
      return 'Total';
    default:
      return window ?? '';
  }
}

/**
 * When a reached limit's count starts again, from its key: "today" for the daily ones, "this
 * month" for the monthly ones, "on your account" for totals.
 */
export function limitPeriod(key: string): string {
  if (/\.per_day$/.test(key)) {
    return 'today';
  }
  if (/\.per_month$/.test(key)) {
    return 'this month';
  }
  return 'on your account';
}
