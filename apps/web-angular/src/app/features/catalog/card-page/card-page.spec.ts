import type { PrintingSummary } from '@orenji/api-client';
import { printingCaption } from './card-page.component';
import { filterPrintings, printingRowLabel } from './printing-popover.component';

const printings = [
  {
    id: 'p2',
    printingCode: 'RA01-EN008',
    setCode: 'RA01',
    setName: '25th Anniversary Rarity Collection',
    setReleaseDate: '2023-11-02',
    rarity: 'Secret Rare',
  },
  {
    id: 'p1',
    printingCode: 'MACR-EN036',
    setCode: 'MACR',
    setName: 'Maximum Crisis',
    setReleaseDate: '2017-05-04',
    rarity: 'Secret Rare',
  },
  {
    id: 'p3',
    printingCode: 'LAVD-EN008',
    setCode: 'LAVD',
    setName: 'Legendary Arc-V Decks',
    setReleaseDate: '2017-11-17',
    rarity: 'Ultra Rare',
  },
] as PrintingSummary[];

describe('the card page (spec 7)', () => {
  it('names the first printing for "Any printing", and the chosen one otherwise', () => {
    expect(printingCaption(null, printings)).toEqual({
      lead: 'First printed in Maximum Crisis',
      line: 'MACR-EN036 · 2017',
    });
    expect(printingCaption(printings[2], printings)).toEqual({
      lead: 'Legendary Arc-V Decks',
      line: 'LAVD-EN008 · 2017',
    });
    expect(printingCaption(null, [])).toBeNull();
  });

  it('writes the picker rows without any count', () => {
    expect(printingRowLabel(printings[2])).toBe(
      'LAVD-EN008 · Legendary Arc-V Decks · 2017 · Ultra Rare',
    );
  });

  it('filters the picker by set code or set name, and by rarity chip', () => {
    expect(filterPrintings(printings, 'lavd', null).map((p) => p.id)).toEqual(['p3']);
    expect(filterPrintings(printings, 'crisis', null).map((p) => p.id)).toEqual(['p1']);
    expect(filterPrintings(printings, '', 'Secret Rare').map((p) => p.id)).toEqual(['p2', 'p1']);
    expect(filterPrintings(printings, 'ra01', 'Ultra Rare')).toEqual([]);
  });
});
