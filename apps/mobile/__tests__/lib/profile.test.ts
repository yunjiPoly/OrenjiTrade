import { ApiError } from '@/src/api/ApiError';
import {
  customTagCandidate,
  draftOf,
  gameLabel,
  gamesFrom,
  initialsOf,
  profileRequest,
  profileServerErrors,
  splitTags,
  validateProfile,
} from '@/src/lib/profile';

import { GAMES, TAGS, profileFixture } from '../support/fixtures';

describe('profile rules', () => {
  it('validates handle, display name and bio like the API', () => {
    expect(validateProfile({ handle: '', displayName: '', bio: '' })).toEqual({
      handle: 'Choose a handle.',
      displayName: 'Enter a display name.',
      bio: null,
    });
    expect(validateProfile({ handle: 'ab', displayName: 'M', bio: '' }).handle).toBe(
      'Use at least 3 characters.'
    );
    expect(validateProfile({ handle: 'bad-handle', displayName: 'M', bio: '' }).handle).toBe(
      'Only lowercase letters, digits and underscores.'
    );
    expect(validateProfile({ handle: 'Maika_1', displayName: 'M', bio: 'x'.repeat(501) })).toEqual({
      handle: null,
      displayName: null,
      bio: 'Use at most 500 characters.',
    });
  });

  it('builds the full PUT /me/profile body', () => {
    expect(
      profileRequest({ handle: ' Maika ', displayName: ' Maïka ', bio: '  ' }, ['pokemon'], ['fr'])
    ).toEqual({
      handle: 'maika',
      displayName: 'Maïka',
      bio: null,
      games: ['pokemon'],
      languages: ['fr'],
    });
  });

  it('prefills from the profile, else from the sign-up name', () => {
    expect(draftOf(profileFixture())).toEqual({
      handle: 'maika',
      displayName: 'Maïka Test',
      bio: 'Binder collector in Montréal.',
    });
    expect(draftOf(undefined, 'From sign-up')).toEqual({
      handle: '',
      displayName: 'From sign-up',
      bio: '',
    });
  });

  it('maps server validation onto the fields', () => {
    expect(
      profileServerErrors(
        ApiError.fromProblem(409, { errorCode: 'HANDLE_TAKEN', message: 'taken' })
      )?.handle
    ).toBe('That handle is already taken. Try another one.');
    expect(
      profileServerErrors(
        ApiError.fromProblem(400, {
          errorCode: 'VALIDATION_FAILED',
          message: 'invalid',
          errors: [{ field: 'bio', message: 'contains a blocked term' }],
        })
      )
    ).toEqual({ handle: null, displayName: null, bio: 'contains a blocked term' });
    expect(profileServerErrors(ApiError.network(new Error('offline')))).toBeNull();
  });

  it('separates curated tags from custom labels', () => {
    const custom = {
      id: 'c1',
      slug: 'vintage-holo',
      label: 'Vintage holo',
      category: 'CUSTOM' as const,
      usageCount: 1,
    };
    expect(splitTags([...TAGS, custom])).toEqual({ curated: TAGS, custom: ['Vintage holo'] });
  });

  it('accepts a custom tag of 2–24 characters that is not already there', () => {
    expect(customTagCandidate('  vintage   holo ', [])).toBe('vintage holo');
    expect(customTagCandidate('x', [])).toBeNull();
    expect(customTagCandidate('x'.repeat(25), [])).toBeNull();
    expect(customTagCandidate('Local Pickup', ['local pickup'])).toBeNull();
  });

  it('lists the API games with friendly labels and falls back to the built-in list', () => {
    expect(gamesFrom(GAMES).map((game) => game.label)).toEqual(['Pokémon', 'Yu-Gi-Oh!']);
    expect(gamesFrom(undefined).length).toBe(4);
    expect(gameLabel('mtg')).toBe('Magic: The Gathering');
    expect(gameLabel('unknown')).toBe('unknown');
  });

  it('derives avatar initials', () => {
    expect(initialsOf('Maïka Tremblay')).toBe('MT');
    expect(initialsOf('collector1')).toBe('CO');
    expect(initialsOf('')).toBe('?');
  });
});
