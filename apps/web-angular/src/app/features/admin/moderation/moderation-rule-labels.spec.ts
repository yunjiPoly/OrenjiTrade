import { describeRate, ruleErrors, scopesOf } from './moderation-rule-labels';

describe('moderation rule labels', () => {
  it('mirrors the kind and scope combinations of the API', () => {
    expect(scopesOf('BANNED_TERM')).toEqual(['MESSAGE', 'POST', 'TAG', 'PROFILE']);
    expect(scopesOf('RATE_LIMIT')).toEqual(['MESSAGE', 'POST', 'REPORT']);
    expect(scopesOf('THRESHOLD')).toEqual(['MESSAGE', 'POST']);
    expect(scopesOf('REPORT_THRESHOLD')).toEqual(['REPORT']);
    expect(scopesOf('UNKNOWN')).toEqual([]);
  });

  it('reads rate patterns in words', () => {
    expect(describeRate('30/60')).toBe('30 per minute');
    expect(describeRate('5/86400')).toBe('5 per day');
    expect(describeRate('3/604800')).toBe('3 per week');
    expect(describeRate('60/7200')).toBe('60 per 2 hours');
    expect(describeRate('4/45')).toBe('4 per 45 seconds');
    expect(describeRate('zorblax')).toBeNull();
  });

  it('validates patterns and scopes like the API', () => {
    expect(ruleErrors({ kind: 'BANNED_TERM', scope: 'MESSAGE', pattern: 'zorb(lax)?' })).toEqual(
      {},
    );
    expect(ruleErrors({ kind: 'BANNED_TERM', scope: 'REPORT', pattern: 'x' }).scope).toContain(
      'cannot apply',
    );
    expect(ruleErrors({ kind: 'BANNED_TERM', scope: 'POST', pattern: 'zorb(' }).pattern).toBe(
      'This is not a valid regular expression.',
    );
    expect(ruleErrors({ kind: 'RATE_LIMIT', scope: 'REPORT', pattern: '5/86400' })).toEqual({});
    expect(
      ruleErrors({ kind: 'RATE_LIMIT', scope: 'POST', pattern: '5 per day' }).pattern,
    ).toContain('<count>/<seconds>');
    expect(ruleErrors({ kind: 'THRESHOLD', scope: 'POST', pattern: '0/60' }).pattern).toBeDefined();
    expect(ruleErrors({ kind: 'BANNED_TERM', scope: 'TAG', pattern: '   ' }).pattern).toContain(
      '1 to 200',
    );
  });
});
