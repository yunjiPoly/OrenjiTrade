/**
 * Wording for plans, limits and plan features. Values (numbers, windows) always come from the API;
 * this file only turns keys into readable sentences.
 */

/** Readable label for a feature switch of a plan (`filters.advanced`, `ads.enabled`, ...). */
export function featureLabel(key: string, enabled: boolean): string {
  switch (key) {
    case 'filters.advanced':
      return enabled ? 'Advanced search filters' : 'Standard search filters';
    case 'ads.enabled':
      return enabled ? 'Sponsored placements shown' : 'No ads';
    default:
      return `${humanizeKey(key)}${enabled ? '' : ' (not included)'}`;
  }
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

/** Monthly price: a localised currency amount; "Free" for zero unless `zeroAsFree` is false. */
export function formatPlanPrice(
  amount: number | null | undefined,
  currency: string | null | undefined,
  locale = 'en-CA',
  zeroAsFree = true,
): string {
  if (!amount && zeroAsFree) {
    return 'Free';
  }
  amount = amount ?? 0;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency || 'CAD',
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency ?? ''}`.trim();
  }
}
