import { flagInfo, rolloutProblem, sortFlags } from './flag-info';

describe('feature flags in words (board A18)', () => {
  it('names the flags, notes ADR 0018 and locks mlScanning', () => {
    expect(flagInfo({ key: 'publicChat' }).name).toBe('Community rooms');
    expect(flagInfo({ key: 'protectedPayments' }).note).toContain('ADR 0018');
    expect(flagInfo({ key: 'mlScanning' }).locked).toBe(
      'On hold by the owner. Leave it off until the owner lifts the hold.',
    );
    expect(flagInfo({ key: 'newThing', description: 'Later' })).toEqual({
      name: 'New Thing',
      description: 'Later',
      note: null,
      locked: null,
    });
  });

  it('orders them as the board, then by key', () => {
    const keys = sortFlags([
      { key: 'zeta' },
      { key: 'mlScanning' },
      { key: 'alpha' },
      { key: 'cardTextScan' },
      { key: 'publicChat' },
      { key: 'protectedPayments' },
    ] as never).map((flag) => flag.key);
    expect(keys).toEqual([
      'cardTextScan',
      'publicChat',
      'protectedPayments',
      'mlScanning',
      'alpha',
      'zeta',
    ]);
  });

  it('accepts a rollout from 0 to 100', () => {
    expect(rolloutProblem('50')).toBeNull();
    expect(rolloutProblem('0')).toBeNull();
    expect(rolloutProblem('101')).toBe('Use a whole number from 0 to 100.');
    expect(rolloutProblem('5.5')).not.toBeNull();
    expect(rolloutProblem('')).not.toBeNull();
  });
});
