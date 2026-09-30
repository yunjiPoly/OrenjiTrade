import type {
  ModerationRuleActionEnum,
  ModerationRuleKindEnum,
  ModerationRuleScopeEnum,
} from '@orenji/api-client';

/** Moderation rule vocabulary (ADR 0014) and the server's validation, mirrored for the editor. */
export type RuleKind = `${ModerationRuleKindEnum}`;
export type RuleScope = `${ModerationRuleScopeEnum}`;
export type RuleAction = `${ModerationRuleActionEnum}`;

export const RULE_KINDS: readonly RuleKind[] = [
  'BANNED_TERM',
  'RATE_LIMIT',
  'THRESHOLD',
  'REPORT_THRESHOLD',
];
export const RULE_SCOPES: readonly RuleScope[] = ['MESSAGE', 'POST', 'TAG', 'PROFILE', 'REPORT'];
export const RULE_ACTIONS: readonly RuleAction[] = ['FLAG', 'BLOCK'];

export const RULE_KIND_LABELS: Record<string, string> = {
  BANNED_TERM: 'Banned term',
  RATE_LIMIT: 'Rate limit',
  THRESHOLD: 'Repeated content',
  REPORT_THRESHOLD: 'Report threshold',
};

export const RULE_KIND_HINTS: Record<string, string> = {
  BANNED_TERM: 'Regular expression, matched without accents or case.',
  RATE_LIMIT: 'Count per window in seconds, e.g. 30/60 for 30 per minute.',
  THRESHOLD: 'Identical texts per window in seconds, e.g. 5/600.',
  REPORT_THRESHOLD: 'Reports from distinct members per window in seconds, e.g. 3/604800.',
};

export const RULE_SCOPE_LABELS: Record<string, string> = {
  MESSAGE: 'Private messages',
  POST: 'Community posts',
  TAG: 'Custom tags',
  PROFILE: 'Profiles and ratings',
  REPORT: 'Collector reports',
};

export const RULE_ACTION_LABELS: Record<string, string> = {
  FLAG: 'Flag for review',
  BLOCK: 'Block',
};

export function ruleKindLabel(kind: string): string {
  return RULE_KIND_LABELS[kind] ?? kind;
}

export function ruleScopeLabel(scope: string): string {
  return RULE_SCOPE_LABELS[scope] ?? scope;
}

export function ruleActionLabel(action: string): string {
  return RULE_ACTION_LABELS[action] ?? action;
}

/** Scopes a kind may apply to (`ModerationRuleService.scopesOf`). */
export function scopesOf(kind: RuleKind | string): RuleScope[] {
  switch (kind) {
    case 'BANNED_TERM':
      return ['MESSAGE', 'POST', 'TAG', 'PROFILE'];
    case 'RATE_LIMIT':
      return ['MESSAGE', 'POST', 'REPORT'];
    case 'THRESHOLD':
      return ['MESSAGE', 'POST'];
    case 'REPORT_THRESHOLD':
      return ['REPORT'];
    default:
      return [];
  }
}

export const RULE_PATTERN_MAX = 200;
const RATE_SYNTAX = /^[1-9][0-9]{0,5}\/[1-9][0-9]{0,6}$/;

/** "30 per minute" style reading of a `<count>/<seconds>` pattern (null when not one). */
export function describeRate(pattern: string): string | null {
  if (!RATE_SYNTAX.test(pattern)) {
    return null;
  }
  const [count, seconds] = pattern.split('/').map(Number);
  const windows: [number, string][] = [
    [604800, 'week'],
    [86400, 'day'],
    [3600, 'hour'],
    [60, 'minute'],
  ];
  for (const [length, unit] of windows) {
    if (seconds % length === 0) {
      const amount = seconds / length;
      return `${count} per ${amount === 1 ? unit : `${amount} ${unit}s`}`;
    }
  }
  return `${count} per ${seconds} seconds`;
}

/** Problems of a rule before it is sent (empty when valid), keyed by form field. */
export function ruleErrors(value: {
  kind: string;
  scope: string;
  pattern: string;
}): Partial<Record<'scope' | 'pattern', string>> {
  const errors: Partial<Record<'scope' | 'pattern', string>> = {};
  if (!scopesOf(value.kind).includes(value.scope as RuleScope)) {
    errors.scope = `${ruleKindLabel(value.kind)} rules cannot apply to ${ruleScopeLabel(
      value.scope,
    ).toLowerCase()}.`;
  }
  const pattern = value.pattern.trim();
  if (!pattern || pattern.length > RULE_PATTERN_MAX) {
    errors.pattern = `Enter 1 to ${RULE_PATTERN_MAX} characters.`;
  } else if (value.kind === 'BANNED_TERM') {
    try {
      new RegExp(pattern);
    } catch {
      errors.pattern = 'This is not a valid regular expression.';
    }
  } else if (!RATE_SYNTAX.test(pattern)) {
    errors.pattern = 'Use <count>/<seconds>, for example 5/86400.';
  }
  return errors;
}
