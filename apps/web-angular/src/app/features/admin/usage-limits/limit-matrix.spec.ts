import { AdminPlan, AdminUsageLimit } from '@orenji/api-client';
import { buildLimitMatrix, limitValueError, replaceLimit } from './limit-matrix';

const PLANS = [
  { code: 'PREMIUM', name: 'Premium', sortOrder: 1, active: true },
  { code: 'FREE', name: 'Free', sortOrder: 0, active: true },
] as AdminPlan[];

const LIMITS = [
  {
    id: 'l1',
    planCode: 'FREE',
    key: 'wishlist.items.max',
    kind: 'COUNTER',
    window: 'TOTAL',
    maxValue: 20,
    description: 'Wishlist items',
  },
  {
    id: 'l2',
    planCode: 'PREMIUM',
    key: 'wishlist.items.max',
    kind: 'COUNTER',
    window: 'TOTAL',
    maxValue: 500,
  },
  {
    id: 'l3',
    planCode: 'FREE',
    key: 'binder.views.per_day',
    kind: 'COUNTER',
    window: 'DAY',
    maxValue: 30,
    description: 'Public binder views per day',
  },
  {
    id: 'l4',
    planCode: 'PREMIUM',
    key: 'binder.views.per_day',
    kind: 'COUNTER',
    window: 'DAY',
    unlimited: true,
  },
  {
    id: 'l5',
    planCode: 'TRIAL',
    key: 'binders.max',
    kind: 'COUNTER',
    window: 'TOTAL',
    maxValue: 10,
  },
] as AdminUsageLimit[];

describe('buildLimitMatrix', () => {
  it('orders plans by sort order and rows by key, one cell per plan', () => {
    const matrix = buildLimitMatrix(PLANS, LIMITS);
    expect(matrix.plans.map((plan) => plan.code)).toEqual(['FREE', 'PREMIUM', 'TRIAL']);
    expect(matrix.rows.map((row) => row.key)).toEqual([
      'binder.views.per_day',
      'binders.max',
      'wishlist.items.max',
    ]);
    const wishlist = matrix.rows[2];
    expect(wishlist.description).toBe('Wishlist items');
    expect(wishlist.cells['FREE']?.maxValue).toBe(20);
    expect(wishlist.cells['PREMIUM']?.maxValue).toBe(500);
    expect(wishlist.cells['TRIAL']).toBeNull();
    expect(matrix.rows[0].cells['PREMIUM']?.unlimited).toBe(true);
  });

  it('replaces a saved limit by id', () => {
    const updated = { ...LIMITS[0], maxValue: 25 };
    const next = replaceLimit(LIMITS, updated);
    expect(next[0].maxValue).toBe(25);
    expect(next[1]).toBe(LIMITS[1]);
  });
});

describe('limitValueError', () => {
  it('accepts whole numbers from 0 and unlimited', () => {
    expect(limitValueError(false, '0')).toBeNull();
    expect(limitValueError(false, '500')).toBeNull();
    expect(limitValueError(true, '')).toBeNull();
  });

  it('rejects empty, negative, fractional and huge values', () => {
    expect(limitValueError(false, ' ')).toBe('Enter a value or choose unlimited.');
    expect(limitValueError(false, '-1')).toBe('Use 0 or more.');
    expect(limitValueError(false, '2.5')).toBe('Use a whole number.');
    expect(limitValueError(false, '2000000')).toBe('Use at most 1,000,000.');
  });
});
