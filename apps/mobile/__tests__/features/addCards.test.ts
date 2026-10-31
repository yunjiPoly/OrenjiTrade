import { ownedGameSlugs } from '@/src/features/inventory/InventoryFilterSheet';
import {
  filterPrintings,
  printingVariant,
  rarityChoices,
  releaseYear,
} from '@/src/features/inventory/PrintingPicker';

import { printingFixture } from '../support/fixtures';

const lavd = printingFixture({
  id: 'p-1',
  printingCode: 'LAVD-EN008',
  setCode: 'LAVD',
  setName: 'Legendary Arc-V Decks',
  rarity: 'Common',
  setReleaseDate: '2025-01-10',
});
const macr = printingFixture({
  id: 'p-2',
  printingCode: 'MACR-EN036',
  setCode: 'MACR',
  setName: 'Maximum Crisis',
  rarity: 'Secret',
  setReleaseDate: '2017-05-04',
});
const macrFirst = printingFixture({
  id: 'p-3',
  printingCode: 'MACR-EN036',
  setCode: 'MACR',
  setName: 'Maximum Crisis',
  rarity: 'Secret',
  edition: 'FIRST_EDITION',
  setReleaseDate: null,
});

describe('Choose the printing (screen 5)', () => {
  it('says the year of the set when it is known', () => {
    expect(releaseYear(lavd)).toBe('2025');
    expect(releaseYear(macrFirst)).toBeNull();
    expect(releaseYear(printingFixture({ setReleaseDate: undefined }))).toBeNull();
  });

  it('offers the rarities in the order they first appear', () => {
    expect(rarityChoices([lavd, macr, macrFirst])).toEqual(['Common', 'Secret']);
    expect(rarityChoices([printingFixture({ rarity: undefined })])).toEqual([]);
  });

  it('filters by set code, set name or code, and by rarity', () => {
    const all = [lavd, macr, macrFirst];
    expect(filterPrintings(all, '', null)).toHaveLength(3);
    expect(filterPrintings(all, 'lavd', null)).toEqual([lavd]);
    expect(filterPrintings(all, 'crisis', null)).toEqual([macr, macrFirst]);
    expect(filterPrintings(all, ' en036 ', null)).toEqual([macr, macrFirst]);
    expect(filterPrintings(all, '', 'Common')).toEqual([lavd]);
    expect(filterPrintings(all, 'crisis', 'Common')).toEqual([]);
  });

  it('tells apart printings that share a code by what differs', () => {
    const all = [lavd, macr, macrFirst];
    expect(printingVariant(lavd, all)).toBeNull();
    expect(printingVariant(macr, all)).toBe('Unlimited');
    expect(printingVariant(macrFirst, all)).toBe('1st Edition');
    const french = printingFixture({ id: 'p-4', language: 'fr', finish: 'REVERSE_HOLO' });
    expect(printingVariant(french, [printingFixture(), french])).toBe('French · Reverse holo');
  });
});

describe('Filter and sort (screen 2)', () => {
  it('lists the games of the collector in the catalogue order, unknown ones last', () => {
    const games = [{ slug: 'pokemon' }, { slug: 'yugioh' }, { slug: 'mtg' }];
    expect(ownedGameSlugs({ mtg: 2, yugioh: 5, riftbound: 1, pokemon: 0 }, games)).toEqual([
      'yugioh',
      'mtg',
      'riftbound',
    ]);
    expect(ownedGameSlugs(undefined, games)).toEqual([]);
  });
});
