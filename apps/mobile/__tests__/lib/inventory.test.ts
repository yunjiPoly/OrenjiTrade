import { ApiError } from '@/src/api/ApiError';
import {
  availabilityLabel,
  badgeFreshness,
  binderKindLabel,
  cardCount,
  conditionLabel,
  endsLabel,
  needsConfirmation,
  publicUntilFor,
  publishedMessage,
} from '@/src/lib/inventory';
import {
  activeInventoryFilterCount,
  DEFAULT_INVENTORY_FILTERS,
  inventoryListQuery,
  isFiltered,
  UNFILED,
} from '@/src/lib/inventoryFilters';
import { isLimitReached, limitReachedInfo, limitReachedMessage } from '@/src/lib/limits';

const NOW = Date.parse('2026-10-05T12:00:00Z');

describe('inventory labels', () => {
  it('words intents, binder kinds, conditions and counts', () => {
    expect(availabilityLabel('TRADE_OR_SALE')).toBe('Trade or sale');
    expect(availabilityLabel('COLLECTION_ONLY')).toBe('Collection only');
    expect(availabilityLabel('SOMETHING')).toBe('Unknown');
    expect(binderKindLabel('SALE')).toBe('For sale');
    expect(binderKindLabel(undefined)).toBe('Binder');
    expect(conditionLabel('NEAR_MINT')).toBe('Near Mint');
    expect(conditionLabel('POOR_SHAPE')).toBe('Poor shape');
    expect(conditionLabel(null)).toBe('—');
    expect(cardCount(1)).toBe('1 card');
    expect(cardCount(3)).toBe('3 cards');
  });

  it('describes publications and their ends', () => {
    expect(publishedMessage('Trades', 'ONE_HOUR')).toBe('“Trades” is public for 1 hour.');
    expect(publishedMessage('Trades', 'ONE_DAY')).toBe('“Trades” is public for 24 hours.');
    expect(publishedMessage('Trades', 'UNTIL_DISABLED')).toBe(
      '“Trades” is public until you make it private.'
    );
    expect(publicUntilFor('1h', NOW)).toBe('2026-10-05T13:00:00.000Z');
    // 30 days minus a safety margin, so a fast clock never crosses the API's bound.
    expect(Date.parse(publicUntilFor('30d', NOW)) - NOW).toBeLessThan(30 * 86_400_000);
    expect(endsLabel('2026-10-05T15:00:00Z', NOW)).toBe('ends in 3 hours');
    expect(endsLabel('2026-10-05T10:00:00Z', NOW)).toBe('ended 2 hours ago');
    expect(endsLabel(null, NOW)).toBeNull();
    expect(endsLabel('not a date', NOW)).toBeNull();
  });

  it('maps freshness to badges and flags listings to confirm', () => {
    expect(badgeFreshness('ACTIVE')).toBe('FRESH');
    expect(badgeFreshness('AGING')).toBe('AGING');
    expect(badgeFreshness('STALE')).toBe('STALE');
    expect(badgeFreshness('HIDDEN')).toBe('HIDDEN');
    expect(needsConfirmation('STALE')).toBe(true);
    expect(needsConfirmation('HIDDEN')).toBe(true);
    expect(needsConfirmation('AGING')).toBe(false);
  });
});

describe('inventory filters', () => {
  it('builds the list query like the web (binder, unfiled, price ascending)', () => {
    expect(inventoryListQuery(DEFAULT_INVENTORY_FILTERS, 0)).toEqual({
      sort: 'updated',
      page: 0,
      size: 24,
    });
    expect(
      inventoryListQuery(
        {
          q: '  fox ',
          game: 'pokemon',
          availability: 'TRADE',
          binder: 'b-1',
          freshness: 'STALE',
          sort: 'price-asc',
        },
        2
      )
    ).toEqual({
      query: 'fox',
      game: 'pokemon',
      availability: 'TRADE',
      freshness: 'STALE',
      binderId: 'b-1',
      sort: 'price',
      direction: 'asc',
      page: 2,
      size: 24,
    });
    expect(inventoryListQuery({ ...DEFAULT_INVENTORY_FILTERS, binder: UNFILED }, 0)).toEqual({
      sort: 'updated',
      unfiled: true,
      page: 0,
      size: 24,
    });
  });

  it('counts filters', () => {
    expect(activeInventoryFilterCount(DEFAULT_INVENTORY_FILTERS)).toBe(0);
    expect(isFiltered(DEFAULT_INVENTORY_FILTERS)).toBe(false);
    expect(
      activeInventoryFilterCount({
        ...DEFAULT_INVENTORY_FILTERS,
        game: 'mtg',
        availability: 'SALE',
      })
    ).toBe(2);
    expect(isFiltered({ ...DEFAULT_INVENTORY_FILTERS, q: 'x' })).toBe(true);
    expect(isFiltered({ ...DEFAULT_INVENTORY_FILTERS, binder: UNFILED })).toBe(true);
  });
});

describe('freemium limits', () => {
  const limit = (extra: Record<string, unknown>) =>
    ApiError.fromProblem(429, {
      status: 429,
      errorCode: 'LIMIT_REACHED',
      message: 'Limit reached',
      ...extra,
    });

  it('reads the LIMIT_REACHED extensions', () => {
    const error = limit({ limitKey: 'binders.max', limit: 5, used: 5, planCode: 'FREE' });
    expect(isLimitReached(error)).toBe(true);
    expect(isLimitReached(new Error('x'))).toBe(false);
    expect(limitReachedInfo(error)).toEqual({
      limitKey: 'binders.max',
      limit: 5,
      used: 5,
      resetsAt: null,
      planCode: 'FREE',
    });
    expect(limitReachedMessage(limitReachedInfo(error))).toBe(
      'You have used 5 of 5 binders on the Free plan. Delete a binder you no longer need, or Premium raises the limit.'
    );
  });

  it('mentions resets and tolerates missing numbers', () => {
    const daily = limitReachedInfo(
      limit({
        limitKey: 'binder.views.per_day',
        limit: 30,
        used: 30,
        resetsAt: '2026-10-06T00:00:00Z',
      })
    );
    expect(limitReachedMessage(daily, NOW)).toBe(
      'You have used 30 of 30 public binder views today. It resets in 12 hours.'
    );
    expect(limitReachedMessage(limitReachedInfo(limit({})), NOW)).toBe(
      'You reached the uses of this feature your plan allows. Premium raises the limit.'
    );
  });
});
