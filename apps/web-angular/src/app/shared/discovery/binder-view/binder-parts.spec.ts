import { ownerLine, ratingText } from './binder-parts.component';

describe('binder owner words (spec 8)', () => {
  it('shows a rating only when there is one', () => {
    expect(ratingText({ average: 4.94, count: 12 })).toBe('★4.9');
    expect(ratingText({ average: null, count: 0 })).toBeNull();
    expect(ratingText(null)).toBeNull();
  });

  it('places the owner by province only, never a city', () => {
    const owner = { place: { subdivisionName: 'Quebec', label: 'Quebec, Canada' } } as never;
    expect(ownerLine(owner, 2)).toBe('Quebec · 2 public binders');
    expect(ownerLine(owner, 1)).toBe('Quebec · 1 public binder');
    expect(ownerLine(owner, null)).toBe('Quebec');
  });
});
