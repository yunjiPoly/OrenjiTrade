import {
  boundedQuery,
  editionLabel,
  finishLabel,
  formatMarketPrice,
  formatMetadataValue,
  formatMoney,
  languageName,
  metadataEntries,
  PRINTING_CODE,
  printingCode,
  printingFacts,
  printingImageUrl,
  titleCaseEnum,
  uniqueSuggestions,
} from '@/src/lib/catalog';

import { printingFixture } from '../support/fixtures';

describe('catalog labels', () => {
  it('words editions, finishes and languages like the web', () => {
    expect(editionLabel('FIRST_EDITION')).toBe('1st Edition');
    expect(editionLabel('SPECIAL_PROMO')).toBe('Special promo');
    expect(editionLabel(null)).toBe('—');
    expect(finishLabel('REVERSE_HOLO')).toBe('Reverse holo');
    expect(finishLabel('GALAXY')).toBe('Galaxy');
    expect(languageName('fr')).toBe('French');
    expect(languageName('ja')).toBe('Japanese');
    expect(languageName(undefined)).toBe('—');
    expect(titleCaseEnum('')).toBe('');
  });

  it('falls back to the code for an unknown language', () => {
    expect(languageName('xx')).toBe('XX');
  });

  it('formats prices and market prices', () => {
    expect(formatMoney(45, 'CAD')).toMatch(/45\.00/);
    expect(formatMoney(null)).toBeNull();
    expect(formatMoney(Number.NaN)).toBeNull();
    expect(formatMoney(12.5, 'NOPE')).toMatch(/12\.50/);
    expect(formatMarketPrice({ amount: 38, currency: 'CAD' })).toMatch(/38\.00/);
    expect(formatMarketPrice(undefined)).toBeNull();
  });

  it('formats metadata values by type', () => {
    expect(formatMetadataValue(null, ['Fire', 'Water'])).toBe('Fire, Water');
    expect(formatMetadataValue(null, [])).toBe('—');
    expect(formatMetadataValue({ type: 'boolean' }, true)).toBe('Yes');
    expect(formatMetadataValue({ type: 'boolean' }, 'false')).toBe('No');
    expect(formatMetadataValue({ type: 'number' }, 1200)).toMatch(/1.?200/);
    expect(formatMetadataValue(null, '')).toBe('—');
    expect(formatMetadataValue(null, 'Dragon')).toBe('Dragon');
  });

  it('orders metadata by the schema, then undeclared keys, without empty values', () => {
    const entries = metadataEntries(
      [
        { key: 'hp', label: 'HP', type: 'number' },
        { key: 'types', label: 'Types', type: 'string_list' },
        { key: 'stage', label: '', type: 'string' },
      ],
      { weakness: 'Water', types: ['Fire'], hp: 320, stage: '', retreatCost: 2 }
    );
    expect(entries.map((entry) => [entry.label, entry.value])).toEqual([
      ['HP', '320'],
      ['Types', 'Fire'],
      ['Weakness', 'Water'],
      ['Retreat cost', '2'],
    ]);
    expect(metadataEntries(null, null)).toEqual([]);
  });
});

describe('printings', () => {
  it('derives codes, pictures and facts', () => {
    expect(printingCode(printingFixture())).toBe('SVX-001');
    expect(printingCode(printingFixture({ printingCode: undefined }))).toBe('SVX-001');
    expect(
      printingCode(printingFixture({ printingCode: undefined, collectorNumber: undefined }))
    ).toBe('SVX');
    expect(printingCode(null)).toBe('');
    expect(printingImageUrl(printingFixture())).toBe('/api/v1/public/card-images/pa');
    expect(
      printingImageUrl(
        printingFixture({ images: [{ kind: 'BACK', url: '/api/v1/public/card-images/back' }] })
      )
    ).toBe('/api/v1/public/card-images/back');
    expect(printingImageUrl(printingFixture({ images: [] }))).toBeNull();
    expect(printingFacts(printingFixture())).toBe('Ultra Rare · Unlimited · English · Holo');
    expect(printingFacts(printingFixture({ rarity: undefined, finish: undefined }))).toBe(
      'Unlimited · English'
    );
  });

  it('recognises printing codes', () => {
    expect(PRINTING_CODE.test('AZR-EN001')).toBe(true);
    expect(PRINTING_CODE.test('SVX-001')).toBe(true);
    expect(PRINTING_CODE.test('emberfang')).toBe(false);
  });

  it('removes duplicate suggestions and bounds queries', () => {
    const card = { kind: 'CARD' as const, id: 'c1', name: 'A' };
    const printing = { kind: 'PRINTING' as const, id: 'c1', printingCode: 'X-1', name: 'A' };
    expect(uniqueSuggestions([card, printing, { ...card }, { ...printing }])).toEqual([
      card,
      printing,
    ]);
    expect(boundedQuery('  fox  ')).toBe('fox');
    expect(boundedQuery('x'.repeat(150))).toHaveLength(100);
  });
});
