import {
  featureLabel,
  formatLimitValue,
  formatPlanPrice,
  humanizeKey,
  windowSuffix,
} from './plan-labels';

describe('plan labels', () => {
  it('humanizes limit keys', () => {
    expect(humanizeKey('binder.views.per_day')).toBe('Binder views per day');
    expect(humanizeKey('savedSearches')).toBe('Saved searches');
  });

  it('formats values, windows and prices', () => {
    expect(formatLimitValue(null)).toBe('Unlimited');
    expect(formatLimitValue(0)).toBe('0');
    expect(windowSuffix('DAY')).toBe('per day');
    expect(windowSuffix('TOTAL')).toBe('');
    expect(formatPlanPrice(0, 'CAD')).toBe('Free');
    expect(formatPlanPrice(4.99, 'CAD')).toBe('$4.99');
  });

  it('words plan features', () => {
    expect(featureLabel('ads.enabled', false)).toBe('No ads');
    expect(featureLabel('filters.advanced', true)).toBe('Advanced search filters');
    expect(featureLabel('priority.support', false)).toBe('Priority support (not included)');
  });
});
