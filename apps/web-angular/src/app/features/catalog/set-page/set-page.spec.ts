import type { BinderResponse, PrintingSummary } from '@orenji/api-client';
import { addBodies, cardsLabel, printingDistinction, sameGameBinders } from './set-page.component';

describe('"Add from this set" (spec 7.5, owner check)', () => {
  it('makes one create per tile with copies, Private by default, in the chosen binder', () => {
    const counts = new Map([
      ['p1', 2],
      ['p2', 0],
      ['p3', 1],
    ]);
    expect(addBodies(counts, 'PRIVATE', null)).toEqual([
      {
        printingId: 'p1',
        quantity: 2,
        visibility: 'PRIVATE',
        availability: 'TRADE_OR_SALE',
        acceptsOffers: false,
        conditionStated: false,
      },
      {
        printingId: 'p3',
        quantity: 1,
        visibility: 'PRIVATE',
        availability: 'TRADE_OR_SALE',
        acceptsOffers: false,
        conditionStated: false,
      },
    ]);
    expect(addBodies(new Map([['p1', 1]]), 'PUBLIC', 'b1')[0]).toEqual(
      expect.objectContaining({ visibility: 'PUBLIC', binderId: 'b1' }),
    );
  });

  it("offers only the binders of the set's game", () => {
    const binders = [
      { id: 'y', game: 'yugioh', games: [] },
      { id: 'm', game: 'mtg', games: [] },
      { id: 'new', game: null, games: [] },
    ] as unknown as BinderResponse[];
    expect(sameGameBinders(binders, 'yugioh').map((b) => b.id)).toEqual(['y', 'new']);
  });

  it('counts the cards chosen', () => {
    expect(cardsLabel(1)).toBe('1 card');
    expect(cardsLabel(7)).toBe('7 cards');
  });

  it('tells two printings of one code apart by edition (and finish), never a lone one', () => {
    const printings = [
      { id: 'a', printingCode: 'AZR-EN011', edition: 'FIRST_EDITION', finish: 'NORMAL' },
      { id: 'b', printingCode: 'AZR-EN011', edition: 'UNLIMITED', finish: 'NORMAL' },
      { id: 'c', printingCode: 'AZR-EN012', edition: 'FIRST_EDITION', finish: 'NORMAL' },
    ] as PrintingSummary[];
    expect(printingDistinction(printings[0], printings)).toBe('1st Edition');
    expect(printingDistinction(printings[1], printings)).toBe('Unlimited');
    expect(printingDistinction(printings[2], printings)).toBe('');
  });
});
