import { ApiError } from '@/src/api/ApiError';
import {
  DEFAULT_RADIUS_KM,
  activeFilterCount,
  capAfterLimit,
  chosenRadiusKm,
  collectorDistanceLabel,
  filterKey,
  holdersTarget,
  intentLabel,
  isCovered,
  listingsLabel,
  nearbyParams,
  queryRadiusKm,
  radiusCapKm,
  ratingLabel,
  statusLabel,
  tagLabel,
  type NearbyQuery,
} from '@/src/features/map/discovery';

import { CARD_ID, PRINTING_A, nearbyFixture } from '../support/fixtures';

const base: NearbyQuery = {
  centre: null,
  radiusKm: 10,
  limitKm: 10,
  game: null,
  intent: null,
  holders: null,
};

describe('map discovery queries (the web map-query rules)', () => {
  it('asks for the own trading area without a centre', () => {
    expect(nearbyParams(base)).toEqual({ radiusKm: 10, limit: 200 });
  });

  it('sends a viewed centre with 2 decimals at most, and the filters', () => {
    expect(
      nearbyParams({
        ...base,
        centre: { lat: 45.523_456, lng: -73.581_234 },
        game: 'pokemon',
        intent: 'TRADE',
        holders: { kind: 'card', id: CARD_ID },
      })
    ).toEqual({
      radiusKm: 10,
      limit: 200,
      lat: 45.52,
      lng: -73.58,
      game: 'pokemon',
      availability: 'TRADE',
      hasCardId: CARD_ID,
    });
    expect(nearbyParams({ ...base, holders: { kind: 'printing', id: PRINTING_A } })).toMatchObject({
      hasPrintingId: PRINTING_A,
    });
  });

  it('reads "who has this near me" from the route', () => {
    expect(holdersTarget({ card: CARD_ID })).toEqual({ kind: 'card', id: CARD_ID });
    expect(holdersTarget({ card: CARD_ID, printing: PRINTING_A })).toEqual({
      kind: 'printing',
      id: PRINTING_A,
    });
    expect(holdersTarget({ card: 'not-a-uuid' })).toBeNull();
    expect(holdersTarget({ card: '' })).toBeNull();
    expect(holdersTarget({})).toBeNull();
  });

  it('sizes the radius by what is visible, the choice and the plan', () => {
    expect(queryRadiusKm(null, 10)).toBe(10);
    expect(queryRadiusKm(3.2, 10)).toBe(3.5);
    expect(queryRadiusKm(40, 10)).toBe(10);
    expect(queryRadiusKm(0.1, 10)).toBe(1);
    expect(chosenRadiusKm(null, 25)).toBe(DEFAULT_RADIUS_KM);
    expect(chosenRadiusKm(50, 25)).toBe(25);
    expect(radiusCapKm(25)).toBe(25);
    expect(radiusCapKm(null)).toBe(100);
    const limit = new ApiError({
      status: 429,
      errorCode: 'LIMIT_REACHED',
      message: 'Limit',
      problem: { limit: 25 },
    });
    expect(capAfterLimit(limit, 50, 100)).toBe(25);
    const bare = new ApiError({ status: 429, errorCode: 'LIMIT_REACHED', message: 'Limit' });
    expect(capAfterLimit(bare, 50, 100)).toBe(49);
  });

  it('never re-queries for zooming in or small pans inside the last answer', () => {
    const covered = {
      centre: { lat: 45.5, lng: -73.57 },
      radiusKm: 10,
      filterKey: filterKey(base),
    };
    const inside = { ...base, centre: { lat: 45.51, lng: -73.57 }, radiusKm: 4 };
    expect(isCovered(inside, covered)).toBe(true);
    expect(isCovered({ ...inside, radiusKm: 10 }, covered)).toBe(false);
    expect(isCovered({ ...inside, game: 'mtg' }, covered)).toBe(false);
    expect(isCovered(base, covered)).toBe(false);
    expect(isCovered(inside, null)).toBe(false);
  });

  it('counts active filters', () => {
    const none = { game: null, intent: null, radiusKm: null, freshness: null, tags: [], q: '' };
    expect(activeFilterCount(none)).toBe(0);
    expect(activeFilterCount({ ...none, game: 'mtg', intent: 'SALE', radiusKm: 25 })).toBe(3);
    expect(
      activeFilterCount({ ...none, freshness: 'ACTIVE', tags: ['local-pickup'], q: ' noé ' })
    ).toBe(3);
  });

  it('sends the freshness, tags and search text filters, which also key the covered area', () => {
    expect(
      nearbyParams({
        ...base,
        freshness: 'AGING',
        tags: ['local-pickup', 'trader'],
        q: '  noé ',
      })
    ).toEqual({
      radiusKm: 10,
      limit: 200,
      freshness: 'AGING',
      tags: ['local-pickup', 'trader'],
      query: 'noé',
    });
    expect(nearbyParams({ ...base, tags: [], q: '   ' })).toEqual({ radiusKm: 10, limit: 200 });
    expect(filterKey({ ...base, tags: ['b', 'a'] })).toBe(filterKey({ ...base, tags: ['a', 'b'] }));
    expect(filterKey({ ...base, q: 'noé' })).not.toBe(filterKey(base));
    expect(filterKey({ ...base, freshness: 'ACTIVE' })).not.toBe(filterKey(base));
  });
});

describe('map wording', () => {
  it('says how many collectors are around, with the API radius', () => {
    expect(statusLabel(undefined, false, false)).toBe('Finding collectors…');
    expect(statusLabel(undefined, false, true)).toBe('Collectors could not load');
    expect(statusLabel(nearbyFixture(), false, false)).toBe('2 collectors within 10 km');
    expect(statusLabel(nearbyFixture([]), false, false)).toBe('No collectors within 10 km yet');
    expect(statusLabel(nearbyFixture([]), true, false)).toBe(
      'Nobody lists this card within 10 km yet'
    );
    expect(statusLabel(nearbyFixture(undefined, { total: 1 }), true, false)).toBe(
      '1 collector with this card within 10 km'
    );
  });

  it('labels distances as buckets only', () => {
    expect(collectorDistanceLabel('KM_1_5', false)).toBe('1–5 km away');
    expect(collectorDistanceLabel('LT_1KM', false)).toBe('Less than 1 km away');
    expect(collectorDistanceLabel(undefined, false)).toBe('Distance hidden');
    expect(collectorDistanceLabel('KM_1_5', true)).toBe('Your public position');
  });

  it('labels ratings, listings, tags and intents like the web', () => {
    expect(ratingLabel({ average: 4.8, count: 12 })).toBe('4.8 (12 ratings)');
    expect(ratingLabel({ average: 5, count: 1 })).toBe('5.0 (1 rating)');
    expect(ratingLabel({ average: null, count: 0 })).toBe('No ratings yet');
    expect(listingsLabel({ publicBinderCount: 2, publicItemCount: 143 })).toBe(
      '2 public binders · 143 cards'
    );
    expect(listingsLabel({ publicBinderCount: 0, publicItemCount: 0 })).toBe(
      'No public listings yet'
    );
    expect(tagLabel('local-meetups')).toBe('Local meetups');
    expect(intentLabel('ACCEPTS_OFFERS')).toBe('Accepts offers');
    expect(intentLabel(null)).toBe('Any intent');
  });
});
