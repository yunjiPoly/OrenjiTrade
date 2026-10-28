import type { CardSuggestion, CollectorByName } from '@orenji/api-client';
import { cardTarget, searchOptions, splitMatch } from './global-search.model';

const card = (overrides: Partial<CardSuggestion>): CardSuggestion => ({
  kind: 'CARD' as CardSuggestion['kind'],
  id: 'card-1',
  name: 'Ash Blossom & Joyous Spring',
  game: 'yugioh',
  ...overrides,
});

const printing = (id: string, code: string, cardId = 'card-1'): CardSuggestion =>
  card({
    kind: 'PRINTING' as CardSuggestion['kind'],
    id: cardId,
    printingId: id,
    printingCode: code,
  });

const collector = (handle: string): CollectorByName => ({
  id: `id-${handle}`,
  handle,
  displayName: handle,
  place: {
    regionCode: 'americas-north',
    countryCode: 'CA',
    countryName: 'Canada',
    subdivisionCode: 'CA-QC',
    subdivisionName: 'Quebec',
    label: 'Quebec, Canada',
  },
});

describe('the global search rules (spec 4.4)', () => {
  it('opens a code that matches one printing with that printing preselected', () => {
    const one = printing('p-1', 'LAVD-EN008');
    expect(cardTarget(one, [one])).toEqual({
      commands: ['/cards', 'card-1'],
      queryParams: { printing: 'p-1' },
    });
  });

  it('opens a code several printings share on "Any printing" (the first-printing defect)', () => {
    const a = printing('p-1', 'RA01-EN011');
    const b = printing('p-2', 'ra01-en011 ');
    expect(cardTarget(a, [a, b])).toEqual({ commands: ['/cards', 'card-1'], queryParams: {} });
    expect(cardTarget(card({}), [a])).toEqual({ commands: ['/cards', 'card-1'], queryParams: {} });
  });

  it('lists up to 8 cards, 3 collectors and always "Search binders and deck cores"', () => {
    const cards = Array.from({ length: 11 }, (_, i) => card({ id: `c-${i}`, name: `Card ${i}` }));
    const people = ['a', 'b', 'c', 'd'].map(collector);
    const options = searchOptions(' yubel ', cards, people);
    expect(options.filter((o) => o.kind === 'card')).toHaveLength(8);
    expect(options.filter((o) => o.kind === 'collector')).toHaveLength(3);
    const last = options.at(-1)!;
    expect(last.kind).toBe('binders');
    expect(last.queryParams).toEqual({ tab: 'binders', q: 'yubel' });
    expect(new Set(options.map((o) => o.id)).size).toBe(options.length);
  });

  it('drops a card the API repeats', () => {
    const options = searchOptions('ash', [card({}), card({}), printing('p-1', 'X-1')], []);
    expect(options.filter((o) => o.kind === 'card')).toHaveLength(2);
  });

  it('splits a name around its first match, case-insensitive', () => {
    expect(splitMatch('Snake-Eye Ash', 'ash')).toEqual({ pre: 'Snake-Eye ', hit: 'Ash', post: '' });
    expect(splitMatch('Yubel', 'zzz')).toEqual({ pre: 'Yubel', hit: '', post: '' });
    expect(splitMatch('Yubel', '')).toEqual({ pre: 'Yubel', hit: '', post: '' });
  });
});
