import {
  GameMetadataField,
  GameMetadataFieldTypeEnum,
  MarketPriceSourceEnum as Source,
} from '@orenji/api-client';
import {
  editionLabel,
  finishLabel,
  formatMarketPrice,
  formatMetadataValue,
  languageLabel,
  marketPriceInfo,
  metadataEntries,
} from './catalog-labels';

const FIELDS = [
  { key: 'hp', label: 'HP', type: 'number' },
  { key: 'types', label: 'Types', type: 'string_list' },
  { key: 'stage', label: 'Stage', type: 'string' },
  { key: 'promo', label: 'Promo', type: 'boolean' },
] as GameMetadataField[];

describe('catalog labels', () => {
  it('labels editions, finishes and languages', () => {
    expect(editionLabel('FIRST_EDITION')).toBe('1st Edition');
    expect(editionLabel('SPECIAL_PRINT')).toBe('Special print');
    expect(finishLabel('REVERSE_HOLO')).toBe('Reverse holo');
    expect(languageLabel('fr')).toBe('French');
    expect(languageLabel('ja')).toBe('Japanese');
    expect(languageLabel(undefined)).toBe('—');
  });

  it('formats market prices with their currency', () => {
    expect(formatMarketPrice({ amount: 42, currency: 'CAD', source: Source.Sample })).toBe(
      '$42.00',
    );
    expect(formatMarketPrice({ amount: 3.5, currency: 'USD', source: Source.Ygoprodeck })).toBe(
      'US$3.50',
    );
    expect(formatMarketPrice(undefined)).toBeNull();
    expect(formatMarketPrice({ currency: 'CAD', source: Source.Catalog })).toBeNull();
  });

  it('labels a market price with its source and date', () => {
    expect(
      marketPriceInfo({
        amount: 25,
        currency: 'USD',
        source: Source.Ygoprodeck,
        updatedAt: '2026-10-01T00:00:00Z',
      }),
    ).toEqual({
      label: 'TCG market price',
      detail: 'YGOPRODeck set price (TCGplayer-based, USD) · updated Oct 1, 2026',
    });
    expect(marketPriceInfo({ amount: 25, currency: 'CAD', source: Source.Sample })).toEqual({
      label: 'Sample market price',
      detail: 'Fictional price of the local sample catalog',
    });
    expect(marketPriceInfo({ amount: 25, currency: 'CAD', source: Source.Catalog })?.label).toBe(
      'Market price',
    );
    expect(marketPriceInfo(null)).toBeNull();
  });

  it('formats metadata values by schema type', () => {
    expect(formatMetadataValue({ type: GameMetadataFieldTypeEnum.Number }, 3000)).toBe('3,000');
    expect(formatMetadataValue({ type: GameMetadataFieldTypeEnum.Boolean }, true)).toBe('Yes');
    expect(
      formatMetadataValue({ type: GameMetadataFieldTypeEnum.StringList }, ['Fire', 'Water']),
    ).toBe('Fire, Water');
    expect(formatMetadataValue(null, '')).toBe('—');
  });

  it('orders metadata entries by the schema and keeps undeclared keys when asked', () => {
    const entries = metadataEntries(
      FIELDS,
      { stage: 'Basic', hp: 70, types: ['Fire'], artist: 'Fictional', promo: false },
      { includeUndeclared: true },
    );
    expect(entries.map((entry) => [entry.label, entry.value])).toEqual([
      ['HP', '70'],
      ['Types', 'Fire'],
      ['Stage', 'Basic'],
      ['Promo', 'No'],
      ['Artist', 'Fictional'],
    ]);
    expect(entries[1].items).toEqual(['Fire']);
  });

  it('limits entries to the given keys (summary fields)', () => {
    const entries = metadataEntries(FIELDS, { hp: 70, stage: 'Basic' }, { only: ['stage', 'hp'] });
    expect(entries.map((entry) => entry.key)).toEqual(['stage', 'hp']);
  });
});
