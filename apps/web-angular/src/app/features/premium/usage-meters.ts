import type { LimitStatus } from '@orenji/api-client';

/** One usage row of `/premium` (`GET /me/plan` limits). */
export interface UsageRow {
  key: string;
  label: string;
  /** "3 / 5", "Unlimited", "Up to 25 km". */
  value: string;
  /** Fill of the bar in percent, `null` without a bar (caps, unlimited, zero limits). */
  percent: number | null;
  full: boolean;
  resetsAt: string | null;
  /** An entitlement (credits, admin grant) overrides the plan value. */
  boosted: boolean;
}

/**
 * Turns the plan's limit statuses into display rows. Counters show `used / limit` with a bar;
 * caps (the map radius) show the value; `null` limits are unlimited. Values come from the API.
 */
export function usageRows(
  limits: readonly LimitStatus[] | null | undefined,
  describe: (key: string) => string,
): UsageRow[] {
  return (limits ?? []).map((limit) => {
    const key = limit.key ?? '';
    const max = limit.limit;
    const unlimited = max === null || max === undefined;
    const used = limit.used ?? 0;
    let value: string;
    let percent: number | null = null;
    if (limit.kind === 'CAP') {
      value = unlimited ? 'Unlimited' : `Up to ${max}${key.endsWith('_km') ? ' km' : ''}`;
    } else if (unlimited) {
      value = `${used} used · Unlimited`;
    } else {
      value = `${used} / ${max}`;
      percent = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : null;
    }
    return {
      key,
      label: describe(key),
      value,
      percent,
      full: limit.allowed === false,
      resetsAt: limit.resetsAt ?? null,
      boosted: !!limit.overridden,
    };
  });
}
