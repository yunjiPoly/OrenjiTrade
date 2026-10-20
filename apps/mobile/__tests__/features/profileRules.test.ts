import {
  activeLabel,
  matchingItem,
  memberYear,
  profileChips,
  profileLine,
  profilePlace,
  profileUrl,
  ratingText,
  referenceMonth,
} from '@/src/features/collectors/profileRules';

import {
  CARD_ID,
  ONTARIO,
  PRINTING_A,
  PRINTING_B,
  QUEBEC,
  collectorFixture,
  itemFixture,
  printingFixture,
} from '../support/fixtures';

describe('the line under a profile header (owner spec, section 9; ADR 0017)', () => {
  it('names the state or province, with the city only when the API sends it', () => {
    expect(profilePlace({ ...QUEBEC, city: 'Laval' })).toBe('Laval, Quebec');
    expect(profilePlace({ ...ONTARIO, city: null })).toBe('Ontario');
    expect(profilePlace({ ...ONTARIO, city: '  ' })).toBe('Ontario');
    expect(profilePlace(null)).toBeNull();
    expect(profilePlace(undefined)).toBeNull();
  });

  it('says "Active this week" or "Active this month", nothing finer, older or hidden', () => {
    expect(activeLabel('TODAY')).toBe('Active this week');
    expect(activeLabel('THIS_WEEK')).toBe('Active this week');
    expect(activeLabel('THIS_MONTH')).toBe('Active this month');
    expect(activeLabel('LONGER_AGO')).toBeNull();
    expect(activeLabel('HIDDEN')).toBeNull();
  });

  it('puts place, member since and activity on one line; yours has no activity', () => {
    const other = collectorFixture({
      location: { ...ONTARIO, city: 'Ottawa' },
      memberSince: '2024-03-01',
      lastActiveBucket: 'THIS_WEEK',
    });
    expect(profileLine(other, false)).toEqual({
      place: 'Ottawa, Ontario',
      member: 'Member since 2024',
      active: 'Active this week',
    });
    expect(profileLine(other, true).active).toBeNull();
    expect(profileLine(collectorFixture({ location: undefined }), false).place).toBeNull();
    expect(memberYear('2026-09-01T12:00:00Z')).toBe('2026');
    expect(memberYear('soon')).toBe('soon');
  });
});

describe('the chips beside the avatar', () => {
  it('lists the games first, then the tags, without a tag that repeats a game', () => {
    expect(
      profileChips(
        ['yugioh', 'pokemon'],
        [
          { slug: 'yu-gi-oh', label: 'Yu-Gi-Oh' },
          { slug: 'trader', label: 'Trader' },
          { slug: 'french', label: 'French' },
          { slug: 'trader-2', label: 'trader' },
        ]
      )
    ).toEqual([
      { label: 'Yu-Gi-Oh!', kind: 'game' },
      { label: 'Pokémon', kind: 'game' },
      { label: 'Trader', kind: 'tag' },
      { label: 'French', kind: 'tag' },
    ]);
    expect(profileChips([], [])).toEqual([]);
  });
});

describe('ratings, references and the share link', () => {
  it('writes the average with one decimal, nothing before the first rating', () => {
    expect(ratingText({ average: 4.85, count: 14 })).toBe('4.8');
    expect(ratingText({ average: 5, count: 1 })).toBe('5.0');
    expect(ratingText({ average: null, count: 0 })).toBeNull();
    expect(ratingText({ average: 4, count: 0 })).toBeNull();
  });

  it('dates a reference by its month', () => {
    expect(referenceMonth('2026-09-25T12:00:00Z')).toBe('Sep 2026');
    expect(referenceMonth('not a date')).toBe('');
  });

  it('shares the public address of the profile', () => {
    expect(profileUrl('duelist_jp')).toBe('https://www.orenjitrade.com/collectors/duelist_jp');
    expect(profileUrl('a b')).toBe('https://www.orenjitrade.com/collectors/a%20b');
  });
});

describe('"I have it" picks your copy of the wished card (owner spec, section 10)', () => {
  const card = { id: CARD_ID, name: 'Azure-Eyes Sky Dragon', game: 'yugioh' };
  const copy = (id: string, overrides: Parameters<typeof itemFixture>[0] = {}) =>
    itemFixture({ id, card, ...overrides });
  const wish = { cardId: CARD_ID, cardName: 'Azure-Eyes Sky Dragon' };

  it('is null when you hold none of the card', () => {
    expect(matchingItem([], wish)).toBeNull();
    expect(
      matchingItem([itemFixture({ card: { id: 'other', name: 'Other', game: 'yugioh' } })], wish)
    ).toBeNull();
    expect(matchingItem([copy('zero', { quantity: 0 })], wish)).toBeNull();
  });

  it('takes the wished printing first, then the wished rarity, then any printing', () => {
    const exact = copy('exact', { printing: printingFixture({ id: PRINTING_B }) });
    const rare = copy('rare', {
      printing: printingFixture({ id: PRINTING_A, rarity: 'Secret Rare' }),
    });
    const any = copy('any', { printing: printingFixture({ id: 'p3', rarity: 'Common' }) });
    expect(matchingItem([any, rare, exact], { ...wish, printing: { id: PRINTING_B } })?.id).toBe(
      'exact'
    );
    expect(matchingItem([any, rare], { ...wish, rarity: 'Secret Rare' })?.id).toBe('rare');
    expect(matchingItem([any], { ...wish, printing: { id: PRINTING_B } })?.id).toBe('any');
  });

  it('prefers a public copy, then the newest', () => {
    const privateNew = copy('private-new', {
      visibility: 'PRIVATE',
      updatedAt: '2026-10-10T12:00:00Z',
    });
    const publicOld = copy('public-old', {
      visibility: 'PUBLIC',
      updatedAt: '2026-10-01T12:00:00Z',
    });
    const publicNew = copy('public-new', {
      visibility: 'PUBLIC',
      updatedAt: '2026-10-05T12:00:00Z',
    });
    expect(matchingItem([privateNew, publicOld, publicNew], wish)?.id).toBe('public-new');
    expect(matchingItem([privateNew], wish)?.id).toBe('private-new');
  });

  it('never takes a copy filed in one of your deck cores: it sells only with its core', () => {
    const exact = copy('in-core', {
      printing: printingFixture({ id: PRINTING_B }),
      binder: { id: 'core-1', name: 'Yubel core' },
    });
    const loose = copy('loose', {
      printing: printingFixture({ id: 'p3', rarity: 'Common' }),
      binder: { id: 'binder-1', name: 'Trades' },
    });
    const cores = new Set(['core-1']);
    const wished = { ...wish, printing: { id: PRINTING_B } };
    expect(matchingItem([exact, loose], wished, cores)?.id).toBe('loose');
    expect(matchingItem([exact], wished, cores)).toBeNull();
    // A binder that is not a deck core keeps its cards eligible.
    expect(matchingItem([exact, loose], wished)?.id).toBe('in-core');
  });
});
