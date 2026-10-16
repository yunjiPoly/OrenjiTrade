import {
  formatLimitValue,
  humanizeKey,
  limitLabel,
  limitPeriod,
  windowLabel,
  windowSuffix,
} from './limit-labels';

describe('limit labels', () => {
  it('names the limits and humanizes unknown keys', () => {
    expect(limitLabel('binder.views.per_day')).toBe('Public binder views per day');
    expect(limitLabel('binders.max')).toBe('Binders');
    expect(limitLabel('inventory.items.max')).toBe('Inventory items');
    expect(limitLabel('something.new')).toBe('Something new');
    expect(limitLabel('')).toBe('Usage limit');
    expect(humanizeKey('binder.views.per_day')).toBe('Binder views per day');
    expect(humanizeKey('savedSearches')).toBe('Saved searches');
  });

  it('formats values, windows and periods', () => {
    expect(formatLimitValue(null)).toBe('Unlimited');
    expect(formatLimitValue(0)).toBe('0');
    expect(windowSuffix('DAY')).toBe('per day');
    expect(windowSuffix('TOTAL')).toBe('');
    expect(windowLabel('MONTH')).toBe('Monthly');
    expect(limitPeriod('offers.per_day')).toBe('today');
    expect(limitPeriod('binders.max')).toBe('on your account');
  });
});
