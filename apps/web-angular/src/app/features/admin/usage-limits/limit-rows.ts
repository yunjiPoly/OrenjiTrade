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

/** A group of board A14 ("Browsing", "Collection", "Wishlist", "Not in the apps"). */
export interface LimitGroup {
  id: string;
  label: string;
  note: string | null;
  limits: AdminUsageLimit[];
}

const GROUPS: readonly {
  id: string;
  label: string;
  note: string | null;
  keys: readonly string[];
}[] = [
  { id: 'browsing', label: 'Browsing', note: null, keys: ['binder.views.per_day'] },
  {
    id: 'collection',
    label: 'Collection',
    note: null,
    keys: ['binders.max', 'inventory.items.max'],
  },
  {
    id: 'wishlist',
    label: 'Wishlist',
    note: null,
    keys: ['wishlist.items.max', 'wishlist.alerts.per_day'],
  },
  {
    id: 'not-in-apps',
    label: 'Not in the apps',
    note: 'Offers are no longer in the apps; only the paused web’s old offer screens use this.',
    keys: ['offers.per_day'],
  },
];

/**
 * The limits grouped as board A14 (spec 15.7): each known key in its group, any other key under
 * "Other" (a limit added later still shows). Empty groups are left out.
 */
export function groupLimits(limits: readonly AdminUsageLimit[]): LimitGroup[] {
  const sorted = sortLimits(limits);
  const placed = new Set<string>();
  const groups: LimitGroup[] = [];
  for (const group of GROUPS) {
    const rows = group.keys
      .map((key) => sorted.find((limit) => limit.key === key))
      .filter((limit): limit is AdminUsageLimit => !!limit);
    rows.forEach((limit) => placed.add(limit.key ?? ''));
    if (rows.length) {
      groups.push({ id: group.id, label: group.label, note: group.note, limits: rows });
    }
  }
  const other = sorted.filter((limit) => !placed.has(limit.key ?? ''));
  if (other.length) {
    groups.push({ id: 'other', label: 'Other', note: null, limits: other });
  }
  return groups;
}
