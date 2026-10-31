import type { ModerationRule } from '@orenji/api-client';
import { ruleGroups, rulesCountLine } from './moderation-rules.component';

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
