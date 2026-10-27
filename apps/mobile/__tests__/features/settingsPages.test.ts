import { ApiError } from '@/src/api/ApiError';
import { profileTagChips } from '@/src/features/profile/profileTags';
import { isTagProblem, profileChanges, saveBody } from '@/src/features/profile/useProfileEditor';
import { CHANNELS, cellLabel } from '@/src/features/settings/notificationOptions';
import { SETTINGS_HOME_COPY } from '@/src/features/settings/settingsCopy';
import { formatMonthYear } from '@/src/lib/dates';

import { TAGS } from '../support/fixtures';

const [TRACKED, BINDER] = TAGS as [(typeof TAGS)[0], (typeof TAGS)[0]];

const saved = {
  handle: 'maika',
  displayName: 'Maïka Test',
  bio: 'Binder collector.',
  games: ['pokemon', 'yugioh'],
  languages: ['fr', 'en'],
  tagIds: [TRACKED.id],
  customTags: ['Cube drafter'],
};

const current = (overrides: Partial<Parameters<typeof profileChanges>[0]> = {}) => ({
  draft: { handle: 'maika', displayName: 'Maïka Test', bio: 'Binder collector.' },
  games: ['pokemon', 'yugioh'],
  languages: ['fr', 'en'],
  tags: [TRACKED],
  customTags: ['Cube drafter'],
  ...overrides,
});

describe("Edit profile's one save (stage R13)", () => {
  it('tells what changed as the API would keep it', () => {
    expect(profileChanges(current(), saved)).toEqual({ details: false, tags: false });
    // The handle as kept (trimmed, lower case), the name and the bio trimmed.
    expect(
      profileChanges(
        current({
          draft: { handle: ' Maika ', displayName: 'Maïka Test ', bio: ' Binder collector.' },
        }),
        saved
      )
    ).toEqual({ details: false, tags: false });
    expect(
      profileChanges(current({ draft: { handle: 'maika', displayName: 'Maïka', bio: '' } }), saved)
        .details
    ).toBe(true);
    // The first game opens first: the order of the games counts.
    expect(profileChanges(current({ games: ['yugioh', 'pokemon'] }), saved).details).toBe(true);
    expect(profileChanges(current({ languages: ['fr'] }), saved).details).toBe(true);
    // The tags are a set.
    expect(profileChanges(current({ tags: [TRACKED, BINDER] }), saved)).toEqual({
      details: false,
      tags: true,
    });
    expect(profileChanges(current({ customTags: [] }), saved).tags).toBe(true);
    // The same tags in another order are no change (review fix 1): unpicking a tag and picking it
    // again leaves "No changes yet".
    const both = {
      ...saved,
      tagIds: [TRACKED.id, BINDER.id],
      customTags: ['Cube drafter', 'Foils'],
    };
    expect(
      profileChanges(
        current({ tags: [BINDER, TRACKED], customTags: ['Foils', 'Cube drafter'] }),
        both
      )
    ).toEqual({ details: false, tags: false });
  });

  it('sends the tags in the same request only when they changed', () => {
    expect(saveBody(current(), false)).toEqual({
      handle: 'maika',
      displayName: 'Maïka Test',
      bio: 'Binder collector.',
      games: ['pokemon', 'yugioh'],
      languages: ['fr', 'en'],
    });
    expect(saveBody(current({ tags: [BINDER] }), true).tags).toEqual({
      tagIds: [BINDER.id],
      customLabels: ['Cube drafter'],
    });
  });

  it('knows a refused tag from a refused field', () => {
    const problem = (field: string) =>
      new ApiError({
        status: 400,
        errorCode: 'VALIDATION_FAILED',
        message: 'Validation failed',
        fieldErrors: { [field]: 'not allowed' },
      });
    expect(isTagProblem(problem('customLabels[0]'))).toBe(true);
    expect(isTagProblem(problem('tagIds'))).toBe(true);
    expect(isTagProblem(problem('displayName'))).toBe(false);
  });

  it('keeps an unpicked tag on the page and greys the others at 12', () => {
    const chips = profileTagChips(
      { tags: [TRACKED], custom: ['Cube drafter'] },
      { tags: [BINDER], customTags: [] }
    );
    expect(chips.map((chip) => [chip.label, chip.selected])).toEqual([
      ['Tracked shipping', false],
      ['Binder collector', true],
      ['Cube drafter', false],
    ]);
    const full = profileTagChips(
      { tags: [TRACKED], custom: [] },
      {
        tags: [BINDER],
        customTags: Array.from({ length: 11 }, (_, index) => `Tag ${index}`),
      }
    );
    expect(full.find((chip) => chip.label === 'Tracked shipping')?.disabled).toBe(true);
    // At 11 the 12th can still be picked (review fix 1).
    const eleven = profileTagChips(
      { tags: [TRACKED], custom: [] },
      {
        tags: [BINDER],
        customTags: Array.from({ length: 10 }, (_, index) => `Tag ${index}`),
      }
    );
    expect(eleven.every((chip) => !chip.disabled)).toBe(true);
  });
});

describe('the notification grid (stage R13)', () => {
  it('names each cell by topic and channel, and says when the channel is off', () => {
    expect(CHANNELS.map((channel) => channel.column)).toEqual(['App', 'Push', 'Email']);
    expect(CHANNELS.map((channel) => channel.label)).toEqual(['In the app', 'Push', 'Email']);
    const [app, , email] = CHANNELS;
    expect(cellLabel('Messages', app as (typeof CHANNELS)[0], true)).toBe('Messages in the app');
    expect(cellLabel('Ratings', email as (typeof CHANNELS)[0], false)).toBe(
      'Ratings by email, channel off'
    );
  });
});

describe("Settings' lines (stage R13)", () => {
  it('says where the collector ships from and whether they are on the map', () => {
    expect(SETTINGS_HOME_COPY.locationLine('Quebec, Canada', true)).toBe(
      'Quebec, Canada · On the map'
    );
    expect(SETTINGS_HOME_COPY.locationLine(null, false)).toBe('Not set yet · Not on the map');
    expect(SETTINGS_HOME_COPY.profileCardLine('maika')).toBe('@maika · Edit profile');
  });

  it("writes Account's member since as a month and a year", () => {
    expect(formatMonthYear('2025-03-14T12:00:00Z')).toMatch(/2025/);
    expect(formatMonthYear('2025-03-14T12:00:00Z')).not.toMatch(/14/);
    expect(formatMonthYear('not a date')).toBe('not a date');
    expect(formatMonthYear(null)).toBe('');
  });
});
