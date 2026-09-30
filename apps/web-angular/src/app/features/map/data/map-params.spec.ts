import {
  DEFAULT_MAP_PARAMS,
  activeFilterCount,
  holdersTarget,
  mapParamsToQuery,
  parseMapParams,
} from './map-params';

const CARD = '69c8ee73-9bf6-42e2-9178-a00582a544e5';
const PRINTING = 'caeba705-6348-48c4-90e1-81d87e0a3656';

describe('map params', () => {
  it('defaults to the plain map', () => {
    expect(parseMapParams({})).toEqual(DEFAULT_MAP_PARAMS);
  });

  it('parses and bounds every filter like the API', () => {
    const params = parseMapParams({
      game: ' YuGiOh ',
      availability: 'trade_or_sale',
      freshness: 'active',
      tags: 'trader, local-meetups,trader,BAD TAG,a,b,c,d',
      radius: '250',
      card: CARD.toUpperCase(),
      view: 'list',
    });
    expect(params).toEqual({
      game: 'yugioh',
      availability: 'TRADE_OR_SALE',
      freshness: 'ACTIVE',
      tags: ['trader', 'local-meetups', 'a', 'b', 'c'],
      radiusKm: 100,
      card: CARD,
      printing: null,
      view: 'list',
    });
  });

  it('drops unknown values instead of sending them', () => {
    const params = parseMapParams({
      availability: 'COLLECTION_ONLY',
      freshness: 'STALE',
      radius: 'far',
      card: 'not-a-uuid',
      view: 'grid',
    });
    expect(params.availability).toBeNull();
    expect(params.freshness).toBeNull();
    expect(params.radiusKm).toBeNull();
    expect(params.card).toBeNull();
    expect(params.view).toBe('map');
    expect(parseMapParams({ radius: '0.2' }).radiusKm).toBe(1);
  });

  it('prefers the printing over the card', () => {
    const params = parseMapParams({ card: CARD, printing: PRINTING });
    expect(params.card).toBeNull();
    expect(holdersTarget(params)).toEqual({ kind: 'printing', id: PRINTING });
    expect(holdersTarget(parseMapParams({ card: CARD }))).toEqual({ kind: 'card', id: CARD });
    expect(holdersTarget(DEFAULT_MAP_PARAMS)).toBeNull();
  });

  it('round-trips through the URL and keeps defaults out of it', () => {
    expect(mapParamsToQuery(DEFAULT_MAP_PARAMS)).toEqual({
      game: null,
      availability: null,
      freshness: null,
      tags: null,
      radius: null,
      card: null,
      printing: null,
      view: null,
    });
    const params = parseMapParams({ game: 'pokemon', tags: 'trader', radius: '15', view: 'list' });
    const query = mapParamsToQuery(params);
    expect(query).toMatchObject({ game: 'pokemon', tags: 'trader', radius: '15', view: 'list' });
    expect(parseMapParams(query as Record<string, string>)).toEqual(params);
  });

  it('counts the narrowing filters', () => {
    expect(activeFilterCount(DEFAULT_MAP_PARAMS)).toBe(0);
    expect(
      activeFilterCount(
        parseMapParams({ game: 'mtg', availability: 'SALE', tags: 'a,b', radius: '20' }),
      ),
    ).toBe(4);
  });
});
