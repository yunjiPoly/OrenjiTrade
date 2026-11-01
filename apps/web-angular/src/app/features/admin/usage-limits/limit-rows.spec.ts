import { AdminUsageLimit } from '@orenji/api-client';
import { groupLimits, limitValueError, replaceLimit, sortLimits } from './limit-rows';

const LIMITS = [
  { id: 'l2', key: 'wishlist.items.max', kind: 'COUNTER', window: 'TOTAL', maxValue: 20 },
  { id: 'l1', key: 'binder.views.per_day', kind: 'COUNTER', window: 'DAY', maxValue: 30 },
  { id: 'l3', key: 'inventory.items.max', kind: 'COUNTER', window: 'TOTAL', unlimited: true },
] as AdminUsageLimit[];

describe('usage limit rows', () => {
  it('lists one row per key, in key order', () => {
    expect(sortLimits(LIMITS).map((limit) => limit.key)).toEqual([
      'binder.views.per_day',
      'inventory.items.max',
      'wishlist.items.max',
    ]);
    expect(sortLimits([...LIMITS, { id: 'x' } as AdminUsageLimit])).toHaveLength(3);
  });

  it('replaces a saved limit and keeps the others', () => {
    const saved = { ...LIMITS[1], maxValue: 45 };
    expect(replaceLimit(LIMITS, saved)).toEqual([LIMITS[0], saved, LIMITS[2]]);
  });

  it('validates an inline edit', () => {
    expect(limitValueError(true, '')).toBeNull();
    expect(limitValueError(false, '')).toBe('Enter a value or choose unlimited.');
    expect(limitValueError(false, '2.5')).toBe('Use a whole number.');
    expect(limitValueError(false, '-1')).toBe('Use 0 or more.');
    expect(limitValueError(false, '1000001')).toBe('Use at most 1,000,000.');
    expect(limitValueError(false, '0')).toBeNull();
  });
});

describe('groupLimits (board A14)', () => {
  const limit = (key: string) => ({ id: key, key }) as never;

  it('groups the known keys and keeps any other one under Other', () => {
    const groups = groupLimits([
      limit('offers.per_day'),
      limit('wishlist.items.max'),
      limit('binder.views.per_day'),
      limit('binders.max'),
      limit('new.thing.max'),
      limit('inventory.items.max'),
      limit('wishlist.alerts.per_day'),
    ]);
    expect(groups.map((g) => g.label)).toEqual([
      'Browsing',
      'Collection',
      'Wishlist',
      'Not in the apps',
      'Other',
    ]);
    expect(groups[1].limits.map((l) => l.key)).toEqual(['binders.max', 'inventory.items.max']);
    expect(groups[3].note).toContain('Offers are no longer in the apps');
    expect(groups[4].limits.map((l) => l.key)).toEqual(['new.thing.max']);
  });

  it('leaves empty groups out', () => {
    expect(groupLimits([limit('binders.max')]).map((g) => g.id)).toEqual(['collection']);
  });
});
