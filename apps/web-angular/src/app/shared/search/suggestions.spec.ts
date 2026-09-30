import type { SearchSuggestion } from '@orenji/api-client';
import {
  groupSuggestions,
  holdersParams,
  isCardSuggestion,
  suggestionIcon,
  suggestionKindLabel,
  suggestionPage,
} from './suggestions';

function entry(type: string, id: string, extra: Partial<SearchSuggestion> = {}): SearchSuggestion {
  return { type: type as SearchSuggestion['type'], id, label: `${type} ${id}`, ...extra };
}

describe('search suggestions', () => {
  it('groups interleaved entries by kind, cards first, without duplicates', () => {
    const groups = groupSuggestions([
      entry('COLLECTOR', 'u1', { slug: 'maika' }),
      entry('CARD', 'c1'),
      entry('TAG', 't1'),
      entry('PRINTING', 'p1'),
      entry('SET', 's1'),
      entry('CARD', 'c1'),
      entry('BINDER', 'b1'),
    ]);
    expect(groups.map((group) => [group.label, group.items.map((item) => item.id)])).toEqual([
      ['Cards', ['c1', 'p1']],
      ['Collectors', ['u1']],
      ['Binders', ['b1']],
      ['Sets', ['s1']],
      ['Tags', ['t1']],
    ]);
    expect(groupSuggestions([])).toEqual([]);
  });

  it('opens cards as holders and other kinds on their pages', () => {
    expect(isCardSuggestion(entry('CARD', 'c1'))).toBe(true);
    expect(holdersParams(entry('CARD', 'c1'))).toEqual({ card: 'c1' });
    expect(holdersParams(entry('PRINTING', 'p1'))).toEqual({ printing: 'p1' });
    expect(holdersParams(entry('SET', 's1'))).toBeNull();
    expect(suggestionPage(entry('SET', 's1'))).toEqual(['/sets', 's1']);
    expect(suggestionPage(entry('BINDER', 'b1'))).toEqual(['/binders', 'b1']);
    expect(suggestionPage(entry('COLLECTOR', 'u1', { slug: 'maika' }))).toEqual([
      '/collectors',
      'maika',
    ]);
    expect(suggestionPage(entry('COLLECTOR', 'u1'))).toBeNull();
    expect(suggestionPage(entry('TAG', 't1'))).toBeNull();
  });

  it('labels and illustrates every kind', () => {
    expect(suggestionKindLabel('PRINTING')).toBe('Printing');
    expect(suggestionKindLabel('TAG')).toBe('Tag');
    expect(suggestionIcon('BINDER')).toBe('menu_book');
    expect(suggestionIcon('CARD')).toBe('style');
  });
});
