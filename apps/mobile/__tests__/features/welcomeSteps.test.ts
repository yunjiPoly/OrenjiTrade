import { gameTileNote } from '@/src/features/onboarding/GameTiles';
import { discoverableHelp } from '@/src/features/onboarding/OnboardingSteps';
import {
  firstWelcomeStep,
  handleCheckState,
  openingGame,
  previousWelcomeStep,
  welcomeStepNumber,
} from '@/src/features/onboarding/welcomeSteps';
import { welcomeTagChips } from '@/src/features/onboarding/WelcomeTags';

import { TAGS } from '../support/fixtures';

const OPTIONS = [
  { slug: 'yugioh', name: 'Yu-Gi-Oh!', browsable: true },
  { slug: 'pokemon', name: 'Pokémon', browsable: true },
  { slug: 'one-piece', name: 'One Piece', browsable: false },
];

describe('the welcome (stage R12): three steps', () => {
  it('starts on the first step the account has not done, and resumes there', () => {
    expect(firstWelcomeStep(undefined)).toBe('profile');
    expect(firstWelcomeStep({ profileComplete: false, interestsSet: true })).toBe('profile');
    expect(firstWelcomeStep({ profileComplete: true, interestsSet: false })).toBe('games');
    expect(firstWelcomeStep({ profileComplete: true, interestsSet: true })).toBe('place');
  });

  it('numbers the steps 1 to 3 and goes back one at a time', () => {
    expect(welcomeStepNumber('profile')).toBe(1);
    expect(welcomeStepNumber('games')).toBe(2);
    expect(welcomeStepNumber('place')).toBe(3);
    expect(previousWelcomeStep('profile')).toBeNull();
    expect(previousWelcomeStep('games')).toBe('profile');
    expect(previousWelcomeStep('place')).toBe('games');
  });
});

describe('the game that opens first', () => {
  it('is the first game picked that has cards', () => {
    expect(openingGame(['pokemon', 'yugioh'], OPTIONS)).toBe('pokemon');
    expect(openingGame(['yugioh', 'pokemon'], OPTIONS)).toBe('yugioh');
    // A game whose cards are coming soon can be picked, but the next one opens first.
    expect(openingGame(['one-piece', 'pokemon'], OPTIONS)).toBe('pokemon');
    expect(openingGame(['one-piece'], OPTIONS)).toBeNull();
    expect(openingGame([], OPTIONS)).toBeNull();
    // Without the games list, the first picked.
    expect(openingGame(['one-piece', 'pokemon'], null)).toBe('one-piece');
  });

  it('says "Opens first" on its tile and "Cards coming soon" on the games without cards', () => {
    expect(gameTileNote({ slug: 'pokemon', browsable: true }, 'pokemon')).toBe('Opens first');
    expect(gameTileNote({ slug: 'yugioh', browsable: true }, 'pokemon')).toBeNull();
    expect(gameTileNote({ slug: 'one-piece', browsable: false }, 'pokemon')).toBe(
      'Cards coming soon'
    );
    expect(gameTileNote({ slug: 'one-piece', browsable: false }, null)).toBe('Cards coming soon');
  });
});

describe('the live handle check', () => {
  const answer = (handle: string, status: string) => ({
    handle,
    status,
    available: status === 'AVAILABLE' || status === 'CURRENT',
  });

  it('shows nothing for an empty or malformed handle, or while typing', () => {
    expect(handleCheckState({ typed: '', settled: '', fetching: false, answer: undefined })).toBe(
      'idle'
    );
    expect(
      handleCheckState({ typed: 'ab', settled: 'ab', fetching: false, answer: undefined })
    ).toBe('idle');
    expect(
      handleCheckState({
        typed: 'sam_trades',
        settled: 'sam_trad',
        fetching: false,
        answer: answer('sam_trad', 'AVAILABLE'),
      })
    ).toBe('idle');
  });

  it('spins while asking, then a check when free or one’s own, “taken” when held or reserved', () => {
    expect(
      handleCheckState({
        typed: 'sam_trades',
        settled: 'sam_trades',
        fetching: true,
        answer: undefined,
      })
    ).toBe('checking');
    expect(
      handleCheckState({
        typed: 'Sam_Trades',
        settled: 'sam_trades',
        fetching: false,
        answer: answer('sam_trades', 'AVAILABLE'),
      })
    ).toBe('available');
    expect(
      handleCheckState({
        typed: 'maika',
        settled: 'maika',
        fetching: false,
        answer: answer('maika', 'CURRENT'),
      })
    ).toBe('available');
    expect(
      handleCheckState({
        typed: 'admin',
        settled: 'admin',
        fetching: false,
        answer: answer('admin', 'TAKEN'),
      })
    ).toBe('taken');
    // A failed check (offline, 429) shows nothing: the save decides.
    expect(
      handleCheckState({
        typed: 'sam_trades',
        settled: 'sam_trades',
        fetching: false,
        answer: undefined,
      })
    ).toBe('idle');
  });
});

describe('the place step', () => {
  it('names the region and the province in the line of "Show me on the map"', () => {
    expect(discoverableHelp('Americas (North)', 'Quebec')).toBe(
      'Collectors of Americas (North) can find your public binders in Quebec. Off until you turn it on.'
    );
    expect(discoverableHelp('Americas (North)', null)).toBe(
      'Collectors of Americas (North) can find your public binders in your state or province. Off until you turn it on.'
    );
  });
});

describe('the tags of the welcome', () => {
  it('lists the picked tags first, then up to 12 suggestions, greyed once 12 are picked', () => {
    const chips = welcomeTagChips({
      selected: [TAGS[0]!],
      customLabels: ['Graded cards'],
      suggestions: TAGS,
    });
    expect(chips.map((chip) => [chip.label, chip.selected])).toEqual([
      ['Tracked shipping', true],
      ['Graded cards', true],
      ['Binder collector', false],
    ]);
    const full = welcomeTagChips({
      selected: [],
      customLabels: Array.from({ length: 12 }, (_, index) => `Tag ${index}`),
      suggestions: TAGS,
    });
    expect(full.filter((chip) => !chip.selected).every((chip) => chip.disabled)).toBe(true);
  });
});
