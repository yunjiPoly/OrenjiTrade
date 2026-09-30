import {
  availabilityFilterLabel,
  avatarColor,
  freshnessFilterLabel,
  isAvailabilityFilter,
  isFreshnessFilter,
  itemAvailability,
  listingsLabel,
  markerTone,
  ratingLabel,
  tagLabel,
} from './discovery-labels';

describe('discovery labels', () => {
  it('knows the filter values the API accepts', () => {
    expect(isAvailabilityFilter('ACCEPTS_OFFERS')).toBe(true);
    expect(isAvailabilityFilter('COLLECTION_ONLY')).toBe(false);
    expect(isFreshnessFilter('AGING')).toBe(true);
    expect(isFreshnessFilter('STALE')).toBe(false);
    expect(availabilityFilterLabel('SALE')).toBe('For sale');
    expect(availabilityFilterLabel(null)).toBe('Any availability');
    expect(freshnessFilterLabel('ACTIVE')).toBe('Fresh listings');
  });

  it('words ratings, listings and tags', () => {
    expect(ratingLabel({ average: null, count: 0 })).toBe('No ratings yet');
    expect(ratingLabel({ average: 4.84, count: 12 })).toBe('4.8 (12 ratings)');
    expect(ratingLabel({ average: 5, count: 1 })).toBe('5.0 (1 rating)');
    expect(listingsLabel({ publicBinderCount: 0, publicItemCount: 0 })).toBe(
      'No public listings yet',
    );
    expect(listingsLabel({ publicBinderCount: 2, publicItemCount: 143 })).toBe(
      '2 public binders · 143 cards',
    );
    expect(listingsLabel({ publicBinderCount: 1, publicItemCount: 1 })).toBe(
      '1 public binder · 1 card',
    );
    expect(tagLabel('local-meetups')).toBe('Local meetups');
    expect(tagLabel('trader', new Map([['trader', 'Trader']]))).toBe('Trader');
  });

  it('maps freshness to marker rings and item availability to chips', () => {
    expect(markerTone('ACTIVE')).toBe('fresh');
    expect(markerTone('AGING')).toBe('aging');
    expect(markerTone(null)).toBe('none');
    expect(itemAvailability('TRADE_OR_SALE')).toBe('TRADE_OR_SALE');
    expect(itemAvailability('SOMETHING')).toBeNull();
  });

  it('derives a stable avatar colour from the name', () => {
    expect(avatarColor('Maïka Tremblay')).toBe(avatarColor('Maïka Tremblay'));
    expect(avatarColor('')).toMatch(/^#[0-9A-F]{6}$/);
  });
});
