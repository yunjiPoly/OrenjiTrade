import type { AdminPlan, AdminUsageLimit } from '@orenji/api-client';

export interface LimitMatrixPlan {
  code: string;
  name: string;
  active: boolean;
}

export interface LimitMatrixRow {
  key: string;
  description: string;
  kind: string;
  window: string;
  /** One cell per plan code; `null` when the plan has no row for the key. */
  cells: Record<string, AdminUsageLimit | null>;
}

export interface LimitMatrix {
  plans: LimitMatrixPlan[];
  rows: LimitMatrixRow[];
}

/**
 * Plans x limits: columns are plans in display order (`sortOrder`, then plans that only appear in
 * the limits), rows are limit keys in alphabetical order.
 */
export function buildLimitMatrix(
  plans: readonly AdminPlan[],
  limits: readonly AdminUsageLimit[],
): LimitMatrix {
  const columns: LimitMatrixPlan[] = [...plans]
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((plan) => ({
      code: plan.code ?? '',
      name: plan.name ?? plan.code ?? '',
      active: plan.active !== false,
    }));
  for (const limit of limits) {
    const code = limit.planCode ?? '';
    if (code && !columns.some((column) => column.code === code)) {
      columns.push({ code, name: code, active: true });
    }
  }

  const rows = new Map<string, LimitMatrixRow>();
  for (const limit of limits) {
    const key = limit.key ?? '';
    if (!key) {
      continue;
    }
    let row = rows.get(key);
    if (!row) {
      row = {
        key,
        description: limit.description ?? '',
        kind: limit.kind ?? '',
        window: limit.window ?? '',
        cells: Object.fromEntries(columns.map((column) => [column.code, null])),
      };
      rows.set(key, row);
    }
    if (!row.description && limit.description) {
      row.description = limit.description;
    }
    row.cells[limit.planCode ?? ''] = limit;
  }
  return {
    plans: columns,
    rows: [...rows.values()].sort((a, b) => a.key.localeCompare(b.key)),
  };
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
