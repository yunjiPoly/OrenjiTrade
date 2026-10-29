import { pruneSelection, selectAllLoaded, selectRange, stepRow, toggleOne } from './selection';

const ORDER = ['a', 'b', 'c', 'd', 'e'];

describe('selection (spec 9.6)', () => {
  it('toggles one card', () => {
    expect([...toggleOne(new Set(), 'a')]).toEqual(['a']);
    expect([...toggleOne(new Set(['a']), 'a')]).toEqual([]);
    expect([...toggleOne(new Set(['a']), 'a', true)]).toEqual(['a']);
  });

  it('Shift+click selects the range from the last card clicked, in the order shown', () => {
    expect([...selectRange(new Set(['b']), ORDER, 'b', 'd', true)].sort()).toEqual(['b', 'c', 'd']);
    expect([...selectRange(new Set(ORDER), ORDER, 'd', 'b', false)].sort()).toEqual(['a', 'e']);
    expect([...selectRange(new Set(), ORDER, null, 'c', true)]).toEqual(['c']);
  });

  it('Ctrl/Cmd+A selects the loaded cards, and again none', () => {
    expect(selectAllLoaded(new Set(['a']), ORDER).size).toBe(5);
    expect(selectAllLoaded(new Set(ORDER), ORDER).size).toBe(0);
  });

  it('drops cards no longer loaded, and keeps the same set when nothing left', () => {
    const kept = new Set(['a', 'z']);
    expect([...pruneSelection(kept, ORDER)]).toEqual(['a']);
    const same = new Set(['a']);
    expect(pruneSelection(same, ORDER)).toBe(same);
  });

  it('moves with the arrows or j and k, stopping at the ends', () => {
    expect(stepRow(ORDER, null, 1)).toBe('a');
    expect(stepRow(ORDER, 'e', 1)).toBe('e');
    expect(stepRow(ORDER, 'b', -1)).toBe('a');
    expect(stepRow([], 'b', 1)).toBeNull();
  });
});
