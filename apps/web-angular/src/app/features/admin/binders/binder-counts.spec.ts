import { visibilityBreakdown } from './binder-counts';

describe('visibilityBreakdown (board A10)', () => {
  it('reads each visibility in words, zeros included', () => {
    expect(
      visibilityBreakdown([
        { visibility: 'PUBLIC', count: 1042 },
        { visibility: 'TEMPORARILY_PUBLIC', count: 3 },
        { visibility: 'PRIVATE', count: 0 },
      ]),
    ).toBe('1,042 public · 3 temporarily public · 0 private');
  });

  it('says nothing when a count is missing', () => {
    expect(visibilityBreakdown([])).toBe('');
    expect(visibilityBreakdown([{ visibility: 'PUBLIC', count: Number.NaN }])).toBe('');
  });
});
