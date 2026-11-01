import {
  DelistPolicyValue,
  delistPolicyErrors,
  freshnessSentence,
  freshnessStages,
} from './delist-policy-validation';

const VALID: DelistPolicyValue = {
  name: 'Default',
  agingAfterDays: 15,
  staleAfterDays: 31,
  hiddenAfterDays: 46,
  warnBeforeHiddenDays: 5,
  maxStrikes: 3,
  unansweredAfterHours: 72,
};

describe('delist policy validation', () => {
  it('accepts the seeded policy', () => {
    expect(delistPolicyErrors(VALID)).toEqual({});
  });

  it('keeps aging < stale < hidden', () => {
    const errors = delistPolicyErrors({ ...VALID, staleAfterDays: 15, hiddenAfterDays: 10 });
    expect(errors.staleAfterDays).toBe('Must come after “aging”.');
    expect(errors.hiddenAfterDays).toBe('Must come after “stale”.');
    expect(delistPolicyErrors({ ...VALID, agingAfterDays: 0 }).agingAfterDays).toBe(
      'At least 1 day.',
    );
    expect(delistPolicyErrors({ ...VALID, hiddenAfterDays: 4000 }).hiddenAfterDays).toBe(
      'At most 3650 days.',
    );
  });

  it('bounds the warning, strikes, delay and name', () => {
    expect(delistPolicyErrors({ ...VALID, warnBeforeHiddenDays: 46 }).warnBeforeHiddenDays).toBe(
      'Between 0 and 45 days.',
    );
    expect(delistPolicyErrors({ ...VALID, maxStrikes: 0 }).maxStrikes).toBe('Between 1 and 100.');
    expect(delistPolicyErrors({ ...VALID, unansweredAfterHours: 721 }).unansweredAfterHours).toBe(
      'Between 1 and 720 hours.',
    );
    expect(delistPolicyErrors({ ...VALID, agingAfterDays: null }).agingAfterDays).toBeDefined();
    expect(delistPolicyErrors({ ...VALID, maxStrikes: 2.5 }).maxStrikes).toBeDefined();
    expect(delistPolicyErrors({ ...VALID, name: 'x'.repeat(81) }).name).toBeDefined();
  });

  it('previews the four freshness stages of a valid policy only', () => {
    const stages = freshnessStages(VALID);
    expect(stages.map((stage) => `${stage.label} ${stage.range}`)).toEqual([
      'Fresh 0–14 days',
      'Aging 15–30 days',
      'Stale 31–45 days',
      'Hidden 46+ days',
    ]);
    expect(freshnessStages({ ...VALID, staleAfterDays: 10 })).toEqual([]);
  });

  it('sums the timeline up in board A17’s sentence, with the reminder’s day (review fix 1)', () => {
    const value = {
      name: 'Default',
      agingAfterDays: 14,
      staleAfterDays: 30,
      hiddenAfterDays: 45,
      warnBeforeHiddenDays: 7,
      maxStrikes: 3,
      unansweredAfterHours: 72,
    };
    expect(freshnessSentence(value)).toEqual({
      sentence:
        'A listing nobody confirms is aging after 14 days, stale after 30 and hidden after 45. Its owner gets a reminder on day 38, 7 days before it is hidden. Confirming it makes it fresh again.',
      reminderDay: 38,
    });
    expect(freshnessSentence({ ...value, warnBeforeHiddenDays: 0 })?.reminderDay).toBeNull();
    expect(freshnessSentence({ ...value, staleAfterDays: 10 })).toBeNull();
  });
});
