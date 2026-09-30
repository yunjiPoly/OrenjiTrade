/** Values of the auto-delist policy editor (`UpdateDelistPolicyRequest`). */
export interface DelistPolicyValue {
  name: string;
  agingAfterDays: number | null;
  staleAfterDays: number | null;
  hiddenAfterDays: number | null;
  warnBeforeHiddenDays: number | null;
  maxStrikes: number | null;
  unansweredAfterHours: number | null;
}

export type DelistPolicyField = keyof DelistPolicyValue;

export const DELIST_LIMITS = {
  hiddenMaxDays: 3650,
  strikesMin: 1,
  strikesMax: 100,
  unansweredMinHours: 1,
  unansweredMaxHours: 720,
  nameMax: 80,
} as const;

function whole(value: number | null): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

/**
 * Field errors of a policy, mirroring `DelistPolicyService.validate`: aging ≥ 1 day, then
 * stale > aging, hidden > stale (≤ 3650), a warning between 0 and hidden − 1 days before hiding,
 * 1–100 strikes and an unanswered-conversation delay of 1–720 hours. Empty when valid.
 */
export function delistPolicyErrors(
  value: DelistPolicyValue,
): Partial<Record<DelistPolicyField, string>> {
  const errors: Partial<Record<DelistPolicyField, string>> = {};
  const { agingAfterDays: aging, staleAfterDays: stale, hiddenAfterDays: hidden } = value;
  if (!whole(aging) || aging < 1) {
    errors.agingAfterDays = 'At least 1 day.';
  }
  if (!whole(stale)) {
    errors.staleAfterDays = 'Enter a number of days.';
  } else if (whole(aging) && stale <= aging) {
    errors.staleAfterDays = 'Must come after “aging”.';
  }
  if (!whole(hidden)) {
    errors.hiddenAfterDays = 'Enter a number of days.';
  } else if (whole(stale) && hidden <= stale) {
    errors.hiddenAfterDays = 'Must come after “stale”.';
  } else if (hidden > DELIST_LIMITS.hiddenMaxDays) {
    errors.hiddenAfterDays = `At most ${DELIST_LIMITS.hiddenMaxDays} days.`;
  }
  const warn = value.warnBeforeHiddenDays;
  if (!whole(warn) || warn < 0 || (whole(hidden) && warn >= hidden)) {
    errors.warnBeforeHiddenDays = whole(hidden)
      ? `Between 0 and ${Math.max(0, hidden - 1)} days.`
      : 'Enter a number of days.';
  }
  const strikes = value.maxStrikes;
  if (!whole(strikes) || strikes < DELIST_LIMITS.strikesMin || strikes > DELIST_LIMITS.strikesMax) {
    errors.maxStrikes = `Between ${DELIST_LIMITS.strikesMin} and ${DELIST_LIMITS.strikesMax}.`;
  }
  const hours = value.unansweredAfterHours;
  if (
    !whole(hours) ||
    hours < DELIST_LIMITS.unansweredMinHours ||
    hours > DELIST_LIMITS.unansweredMaxHours
  ) {
    errors.unansweredAfterHours = `Between ${DELIST_LIMITS.unansweredMinHours} and ${DELIST_LIMITS.unansweredMaxHours} hours.`;
  }
  if (value.name.trim().length > DELIST_LIMITS.nameMax) {
    errors.name = `At most ${DELIST_LIMITS.nameMax} characters.`;
  }
  return errors;
}

export interface FreshnessStage {
  key: 'ACTIVE' | 'AGING' | 'STALE' | 'HIDDEN';
  label: string;
  /** "0–14 days", "46+ days". */
  range: string;
  /** Share of the timeline (percent) for the preview bar. */
  share: number;
}

/** The four freshness stages of a valid policy, for the timeline preview (empty otherwise). */
export function freshnessStages(value: DelistPolicyValue): FreshnessStage[] {
  const { agingAfterDays: aging, staleAfterDays: stale, hiddenAfterDays: hidden } = value;
  if (!whole(aging) || !whole(stale) || !whole(hidden) || !(aging < stale && stale < hidden)) {
    return [];
  }
  const total = hidden * 1.25;
  return [
    { key: 'ACTIVE', label: 'Fresh', range: `0–${aging - 1} days`, share: (aging / total) * 100 },
    {
      key: 'AGING',
      label: 'Aging',
      range: `${aging}–${stale - 1} days`,
      share: ((stale - aging) / total) * 100,
    },
    {
      key: 'STALE',
      label: 'Stale',
      range: `${stale}–${hidden - 1} days`,
      share: ((hidden - stale) / total) * 100,
    },
    { key: 'HIDDEN', label: 'Hidden', range: `${hidden}+ days`, share: 20 },
  ];
}
