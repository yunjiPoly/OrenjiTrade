import { DelistPolicyValue, delistPolicyErrors, freshnessStages } from './delist-policy-validation';

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
});
