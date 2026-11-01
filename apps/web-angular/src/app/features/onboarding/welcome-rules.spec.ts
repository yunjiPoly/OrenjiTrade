import {
  firstWelcomeStep,
  handleCheckState,
  openingGame,
  previousWelcomeStep,
  welcomeDisplayName,
  welcomeGames,
  welcomeStepNumber,
} from './welcome-rules';

describe('the welcome rules (spec 14)', () => {
  it('starts or resumes at the first unfinished step, numbered from 1 of 3', () => {
    expect(firstWelcomeStep(null)).toBe('profile');
    expect(firstWelcomeStep({ profileComplete: true })).toBe('games');
    expect(firstWelcomeStep({ profileComplete: true, interestsSet: true })).toBe('place');
    expect(welcomeStepNumber('games')).toBe(2);
    expect(previousWelcomeStep('profile')).toBeNull();
    expect(previousWelcomeStep('place')).toBe('games');
  });

  it('offers the ACTIVE games; the first picked game that has cards opens first', () => {
    const games = welcomeGames([
      { slug: 'yugioh', name: 'Yu-Gi-Oh!', status: 'ACTIVE', hasCards: true },
      { slug: 'riftbound', name: 'Riftbound', status: 'ACTIVE', hasCards: false },
      { slug: 'secret', name: 'Hidden', status: 'HIDDEN', hasCards: true },
    ] as never);
    expect(games.map((game) => [game.slug, game.browsable])).toEqual([
      ['yugioh', true],
      ['riftbound', false],
    ]);
    expect(openingGame(['riftbound', 'yugioh'], games)).toBe('yugioh');
    expect(openingGame(['riftbound'], games)).toBeNull();
  });

  it('says what the handle check found only for the handle typed and settled', () => {
    const base = { typed: 'sam_trades', settled: 'sam_trades', checking: false };
    expect(handleCheckState({ ...base, answer: null, checking: true })).toBe('checking');
    expect(
      handleCheckState({
        ...base,
        answer: { handle: 'sam_trades', status: 'AVAILABLE', available: true } as never,
      }),
    ).toBe('free');
    expect(
      handleCheckState({
        ...base,
        answer: { handle: 'sam_trades', status: 'CURRENT', available: true } as never,
      }),
    ).toBe('yours');
    expect(
      handleCheckState({
        ...base,
        answer: { handle: 'sam_trades', status: 'TAKEN', available: false } as never,
      }),
    ).toBe('taken');
    // Still typing, malformed, or an answer for another handle: nothing.
    expect(handleCheckState({ ...base, settled: 'sam_trad', answer: null })).toBe('idle');
    expect(handleCheckState({ ...base, typed: 'S!', settled: 's!', answer: null })).toBe('idle');
    expect(
      handleCheckState({
        ...base,
        answer: { handle: 'other', status: 'TAKEN', available: false } as never,
      }),
    ).toBe('idle');
  });

  it('offers the name typed at sign-up while the account still has the handle as its name', () => {
    expect(welcomeDisplayName('collector_4vp9pf', 'collector_4vp9pf', 'Sam T.')).toBe('Sam T.');
    expect(welcomeDisplayName('', 'collector_4vp9pf', 'Sam T.')).toBe('Sam T.');
    expect(welcomeDisplayName('Sam Tremblay', 'sam', 'Other')).toBe('Sam Tremblay');
    expect(welcomeDisplayName('collector_4vp9pf', 'collector_4vp9pf', null)).toBe(
      'collector_4vp9pf',
    );
  });
});
