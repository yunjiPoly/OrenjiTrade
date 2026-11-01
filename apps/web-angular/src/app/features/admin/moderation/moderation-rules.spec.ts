import type { ModerationRule } from '@orenji/api-client';
import { ruleGroups, rulesCountLine } from './moderation-rules.component';
import { twinsLine } from './moderation-rule-labels';

const rule = (id: string, scope: string, kind: string, active = true) =>
  ({ id, scope, kind, active, pattern: id, action: 'FLAG' }) as unknown as ModerationRule;

describe('the Rules tab (board A4, review fix 1)', () => {
  const rules = [
    rule('a', 'MESSAGE', 'BANNED_TERM'),
    rule('b', 'MESSAGE', 'RATE_LIMIT', false),
    rule('c', 'POST', 'BANNED_TERM'),
    rule('d', 'REPORT', 'REPORT_THRESHOLD'),
  ];

  it('counts the rules and those on', () => {
    expect(rulesCountLine(rules)).toBe('4 rules · 3 on');
    expect(rulesCountLine([rule('x', 'TAG', 'BANNED_TERM')])).toBe('1 rule · 1 on');
  });

  it('draws every scope (an empty one too) unless a kind is chosen', () => {
    expect(ruleGroups(rules, null, null).map((group) => [group.scope, group.rules.length])).toEqual(
      [
        ['MESSAGE', 2],
        ['POST', 1],
        ['TAG', 0],
        ['PROFILE', 0],
        ['REPORT', 1],
      ],
    );
    expect(ruleGroups(rules, null, 'BANNED_TERM').map((group) => group.scope)).toEqual([
      'MESSAGE',
      'POST',
    ]);
    expect(ruleGroups(rules, 'TAG', null)).toEqual([{ scope: 'TAG', rules: [] }]);
  });
});

describe('twinsLine (WH1’s R2-2, board A4)', () => {
  it('says when the same pattern is a separate rule in other places', () => {
    const rules = [
      { id: 'a', kind: 'BANNED_TERM', pattern: 'scam', scope: 'MESSAGE' },
      { id: 'b', kind: 'BANNED_TERM', pattern: 'scam', scope: 'PROFILE' },
      { id: 'c', kind: 'BANNED_TERM', pattern: 'spam', scope: 'POST' },
      { id: 'd', kind: 'RATE_LIMIT', pattern: 'scam', scope: 'POST' },
    ];
    expect(twinsLine(rules[0], rules)).toBe(
      'The same pattern is a separate rule for profiles and ratings.',
    );
    expect(twinsLine(rules[1], rules)).toBe(
      'The same pattern is a separate rule for private messages.',
    );
    expect(twinsLine(rules[2], rules)).toBeNull();
    expect(twinsLine(rules[3], rules)).toBeNull();
  });
});
