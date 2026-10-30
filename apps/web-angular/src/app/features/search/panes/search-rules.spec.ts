import type { PlatformRegion, PublicBinderSummary } from '@orenji/api-client';
import { mapCountLine } from '../../map/data/boundaries';
import { searchMapLabel } from '../map/search-map.component';
import { binderRowLine } from './binder-row.component';
import { bindersEmptyText } from './binders-pane.component';
import { stateGroups, stateLine } from './state-list.component';
import { wishLimitLine, wishTerms } from './wishlist-pane.component';

describe('Search rules (spec 6, web stage WD)', () => {
  it('names the map with the game and the region', () => {
    expect(searchMapLabel('Yu-Gi-Oh!', 'Americas (North)')).toBe(
      'Map of public Yu-Gi-Oh! binders by state or province in Americas (North)',
    );
  });

  it('says only the non-zero parts on the map and in the state list', () => {
    expect(mapCountLine(5, 1)).toBe('4 binders · 1 deck core');
    expect(mapCountLine(1, 0)).toBe('1 binder');
    expect(mapCountLine(2, 2)).toBe('2 deck cores');
    expect(mapCountLine(0, 0)).toBe('No public binders here yet');
    expect(stateLine(12, 5)).toBe('7 binders · 5 deck cores');
    expect(stateLine(undefined, undefined)).toBe('');
  });

  it('groups the states by country, by name, muting the ones without binders', () => {
    const region = {
      code: 'americas-north',
      countries: [
        {
          code: 'CA',
          name: 'Canada',
          subdivisions: [
            { code: 'CA-QC', name: 'Quebec' },
            { code: 'CA-AB', name: 'Alberta' },
          ],
        },
      ],
    } as unknown as PlatformRegion;
    const [canada] = stateGroups(region, new Map([['CA-QC', 3]]), new Map());
    expect(canada.label).toBe('Canada');
    expect(canada.rows.map((row) => [row.name, row.line, row.empty])).toEqual([
      ['Alberta', '', true],
      ['Quebec', '3 binders', false],
    ]);
  });

  it('writes a binder row and a deck core row the phone way, without counting results', () => {
    const owner = { handle: 'maya_k', place: { subdivisionName: 'Quebec' } };
    expect(
      binderRowLine({ owner, itemCount: 120, sellsAsCore: false } as PublicBinderSummary),
    ).toBe('maya_k · Quebec · 120 cards');
    expect(binderRowLine({ owner, itemCount: 20, sellsAsCore: true } as PublicBinderSummary)).toBe(
      'maya_k · Quebec',
    );
    // A guest never sees who (R15).
    expect(
      binderRowLine({
        owner: { handle: null, place: owner.place },
        itemCount: 1,
      } as unknown as PublicBinderSummary),
    ).toBe('A collector · Quebec · 1 card');
  });

  it('has the spec empty states, a guest one without collectors by name', () => {
    expect(bindersEmptyText('binders', '', 'Yu-Gi-Oh!', false)).toBe(
      'No public Yu-Gi-Oh! binders here yet.',
    );
    expect(bindersEmptyText('deckcores', '', 'Magic', false)).toBe(
      'No Magic deck cores for sale here yet.',
    );
    expect(bindersEmptyText('binders', 'yubel', 'Yu-Gi-Oh!', false)).toBe(
      'Nothing matches. Try a deck name, a card name or a collector.',
    );
    expect(bindersEmptyText('binders', 'yubel', 'Yu-Gi-Oh!', true)).toContain('Sign in');
  });

  it("writes a wish's terms on one line, and the cap plainly", () => {
    expect(
      wishTerms({
        printing: undefined,
        rarity: null,
        nearMintOnly: false,
        priceTerm: { label: '90% TCG' },
      } as never),
    ).toBe('Any printing · 90% TCG');
    expect(
      wishTerms({ printing: { printingCode: 'TN19-EN013' }, nearMintOnly: true } as never),
    ).toBe('TN19-EN013 · NM only');
    expect(wishTerms({ rarity: 'Ultra Rare', nearMintOnly: false } as never)).toBe(
      'Any Ultra Rare',
    );
    expect(wishLimitLine(20, 20)).toBe(
      'You have 20 wishes, the most each collector can have. Every collector has the same limits.',
    );
    expect(wishLimitLine(4, 20)).toBeNull();
    expect(wishLimitLine(4, null)).toBeNull();
  });
});
