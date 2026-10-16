import { groupHolders } from '@/src/features/cards/holderGroups';
import { printingOptions } from '@/src/features/cards/printingOptions';
import { tcgplayerCategory, tcgplayerSearchUrl } from '@/src/features/cards/tcgplayer';
import {
  RECENT_SEARCHES_MAX,
  useRecentSearchesStore,
} from '@/src/features/catalog/recentSearchesStore';
import { FOCUS_MARGIN, baseWindow, focusWindow, zoomOf } from '@/src/features/map/mapWindow';
import type { RegionOutline } from '@/src/features/map/regionOutline';
import { highlightParts } from '@/src/features/search/highlight';
import { BINDERS_COPY, MAP_COPY, gameName } from '@/src/features/search/searchCopy';
import {
  holdersLinkTarget,
  mapLinkTarget,
  placeBindersTarget,
  wishlistLinkTarget,
} from '@/src/features/search/searchLinks';
import { nearCapNotice, wishTerms } from '@/src/features/wishlist/wishlistLabels';

import {
  ONTARIO,
  QUEBEC,
  cardHolderFixture,
  markerFixture,
  printingFixture,
  publicItemFixture,
  wishFixture,
} from '../support/fixtures';

describe('the typed part of a card name (screen 12)', () => {
  it('highlights the whole text when the name holds it, ignoring case and accents', () => {
    expect(highlightParts('Ash Blossom & Joyous Spring', 'ash bl')).toEqual({
      before: '',
      match: 'Ash Bl',
      after: 'ossom & Joyous Spring',
    });
    expect(highlightParts('Pokémon Center', 'pokem')).toEqual({
      before: '',
      match: 'Pokém',
      after: 'on Center',
    });
    expect(highlightParts('Gagaku-P.U.N.K. Crash Beat', 'ash')).toEqual({
      before: 'Gagaku-P.U.N.K. Cr',
      match: 'ash',
      after: ' Beat',
    });
  });

  it('falls back to the longest word the name holds, else to nothing', () => {
    expect(highlightParts('Snake-Eye Ash', 'ash bl')).toEqual({
      before: 'Snake-Eye ',
      match: 'Ash',
      after: '',
    });
    expect(highlightParts('Maxx "C"', 'LAVD-EN008')).toEqual({
      before: 'Maxx "C"',
      match: '',
      after: '',
    });
    expect(highlightParts('Ash', '   ')).toEqual({ before: 'Ash', match: '', after: '' });
  });
});

describe('"Check TCGplayer price" (default 9 of section 16)', () => {
  it("opens TCGplayer's search of the game, or every category for a game it has none for", () => {
    expect(tcgplayerSearchUrl('yugioh', 'Ash Blossom & Joyous Spring')).toBe(
      'https://www.tcgplayer.com/search/yugioh/product?q=Ash%20Blossom%20%26%20Joyous%20Spring'
    );
    expect(tcgplayerSearchUrl('pokemon', "Ash's Pikachu")).toBe(
      "https://www.tcgplayer.com/search/pokemon/product?q=Ash's%20Pikachu"
    );
    expect(tcgplayerCategory('mtg')).toBe('magic');
    expect(tcgplayerCategory('riftbound')).toBe('all');
    expect(tcgplayerCategory(null)).toBe('all');
    expect(tcgplayerSearchUrl('riftbound', ' Jinx ')).toBe(
      'https://www.tcgplayer.com/search/all/product?q=Jinx'
    );
  });
});

describe('holders grouped by province (screen 13)', () => {
  const row = (id: string, place: typeof QUEBEC) =>
    cardHolderFixture({
      collector: markerFixture({ id: `c-${id}`, handle: id, place }),
      item: publicItemFixture({ id }),
    });

  it('makes one group per run of a province, titles the own one, and shows no count', () => {
    const groups = groupHolders([row('a', QUEBEC), row('b', QUEBEC), row('c', ONTARIO)], 'CA-QC');
    expect(groups.map((group) => [group.key, group.title, group.rows.length])).toEqual([
      ['CA-QC', 'Quebec · your province', 2],
      ['CA-ON', 'Ontario', 1],
    ]);
    expect(groups[0]?.mine).toBe(true);
    // A collector browsing without a declared province: no group is theirs.
    expect(groupHolders([row('a', QUEBEC)], null)[0]?.title).toBe('Quebec');
  });
});

describe('the old links of the Map and Wishlist tabs and the holders list', () => {
  it('land on Search, on the region and the state they name', () => {
    // `/` alone is Search alone (nothing for the sign-in gate to reopen).
    expect(mapLinkTarget({})).toEqual({ pathname: '/search', params: {} });
    expect(mapLinkTarget({ region: 'europe', subdivision: 'fr-idf' })).toEqual({
      pathname: '/search',
      params: { segment: 'cards', region: 'europe', subdivision: 'FR-IDF' },
    });
    expect(mapLinkTarget({ region: '../x', subdivision: '<b>' })).toEqual({
      pathname: '/search',
      params: {},
    });
    expect(wishlistLinkTarget()).toEqual({ pathname: '/search', params: { segment: 'wishlist' } });
    expect(placeBindersTarget({ region: 'americas-north', code: 'CA-QC' })).toEqual({
      pathname: '/search',
      params: { segment: 'binders', region: 'americas-north', state: 'CA-QC' },
    });
  });

  it('send the holders list to the card page, a printing through its card', () => {
    expect(holdersLinkTarget({ card: 'c1' })).toEqual({ card: 'c1' });
    expect(holdersLinkTarget({ card: 'c1', printing: 'p1' })).toEqual({
      card: 'c1',
      printing: 'p1',
    });
    expect(holdersLinkTarget({ printing: 'p1' })).toEqual({ printing: 'p1' });
    expect(holdersLinkTarget({ card: '../evil' })).toBeNull();
    expect(holdersLinkTarget({})).toBeNull();
  });
});

describe("the map's state card (screen 11)", () => {
  it('says the binders and the deck cores above 0 only, or that there are none', () => {
    expect(MAP_COPY.stats(12, 5)).toBe('7 binders · 5 deck cores');
    expect(MAP_COPY.stats(1, 0)).toBe('1 binder');
    expect(MAP_COPY.stats(2, 2)).toBe('2 deck cores');
    expect(MAP_COPY.stats(2, 1)).toBe('1 binder · 1 deck core');
    expect(MAP_COPY.stats(0, 0)).toBe('No public binders here yet');
    expect(MAP_COPY.stateSubtitle('Canada', true)).toBe('Canada · your province');
    expect(MAP_COPY.stateSubtitle('Canada', false)).toBe('Canada');
  });

  it("opens on the collector's province: zoomed in on it, never out beyond the region", () => {
    const outline = {
      region: 'test',
      width: 1000,
      height: 600,
      home: [0, 0, 1000, 600],
      outline: '',
      shapes: [],
    } as RegionOutline;
    const base = baseWindow(outline, { width: 360, height: 576 });
    const box = [600, 200, 700, 300];
    const focused = focusWindow(base, outline, box);
    expect(focused.width).toBeCloseTo(
      Math.max(100, (100 * base.width) / base.height) * FOCUS_MARGIN
    );
    expect(zoomOf(focused, base)).toBeGreaterThan(1);
    // A province larger than the frame shows the whole region (zoom 1).
    expect(zoomOf(focusWindow(base, outline, [0, 0, 1000, 600]), base)).toBeCloseTo(1);
  });
});

describe('Search › Binders rows (screen 14)', () => {
  it("name the owner's province only when the whole region is listed", () => {
    expect(BINDERS_COPY.binderLine('maya_k', null, 120)).toBe('maya_k · 120 cards');
    expect(BINDERS_COPY.binderLine('maya_k', 'Quebec', 1)).toBe('maya_k · Quebec · 1 card');
    expect(BINDERS_COPY.coreLine('duelist.jp', null)).toBe('duelist.jp');
    expect(BINDERS_COPY.coreLine('duelist.jp', 'Quebec')).toBe('duelist.jp · Quebec');
  });
});

describe('Search › Wishlist rows (screen 15)', () => {
  it('words the terms of a wish in one line', () => {
    expect(
      wishTerms(
        wishFixture({
          printing: printingFixture({ printingCode: 'TN19-EN013' }),
          priceTerm: undefined,
        })
      )
    ).toBe('TN19-EN013 · NM only');
    expect(
      wishTerms(
        wishFixture({
          nearMintOnly: true,
          priceTerm: { label: '100% TCG', percent: 100, orMore: false },
        })
      )
    ).toBe('Any printing · NM only · 100% TCG');
    expect(wishTerms(wishFixture({ nearMintOnly: false, priceTerm: undefined }))).toBe(
      'Any printing'
    );
    expect(
      wishTerms(wishFixture({ rarity: 'Ultra Rare', nearMintOnly: false, priceTerm: undefined }))
    ).toBe('Any printing · Ultra Rare');
  });

  it('shows a usage line only near the cap (the same cap for everyone)', () => {
    expect(nearCapNotice(null)).toBeNull();
    expect(nearCapNotice({ used: 2, limit: 20 })).toBeNull();
    expect(nearCapNotice({ used: 16, limit: 20 })).toBe('16 of 20 wishes');
    expect(nearCapNotice({ used: 20, limit: 20 })).toBe(
      '20 of 20 wishes. Remove one to add another.'
    );
    expect(nearCapNotice({ used: 500, limit: null })).toBeNull();
  });
});

describe('the printings of "Any printing ▾"', () => {
  it('read "{code} · {rarity}", with what differs when two would read the same', () => {
    expect(
      printingOptions([
        printingFixture({ id: 'a', printingCode: 'LAVD-EN008', rarity: 'Ultra Rare' }),
        printingFixture({ id: 'b', printingCode: 'RA01-EN008', rarity: 'Secret Rare' }),
        printingFixture({
          id: 'c',
          printingCode: 'RA01-EN008',
          rarity: 'Secret Rare',
          language: 'fr',
        }),
      ])
    ).toEqual([
      { id: 'a', label: 'LAVD-EN008 · Ultra Rare' },
      { id: 'b', label: 'RA01-EN008 · Secret Rare · English' },
      { id: 'c', label: 'RA01-EN008 · Secret Rare · French' },
    ]);
  });
});

describe('game names in Search', () => {
  it('uses the short names of the mockup', () => {
    expect(gameName('mtg')).toBe('Magic');
    expect(gameName('yugioh')).toBe('Yu-Gi-Oh!');
    expect(gameName('pokemon')).toBe('Pokémon');
  });
});

describe('recent searches and "Remember my searches" (default 2 of section 16)', () => {
  beforeEach(() => useRecentSearchesStore.setState({ byUser: {}, forgetting: {} }));

  it('keeps at most 8, newest first, without twins', () => {
    const store = useRecentSearchesStore.getState();
    for (let index = 0; index < 10; index++) {
      store.remember('u1', `card ${index}`);
    }
    store.remember('u1', 'CARD 5');
    const list = useRecentSearchesStore.getState().byUser.u1 ?? [];
    expect(list).toHaveLength(RECENT_SEARCHES_MAX);
    expect(list[0]).toBe('CARD 5');
    expect(list.filter((entry) => entry.toLowerCase() === 'card 5')).toHaveLength(1);
  });

  it('off clears the list and stops it; on starts again from nothing', () => {
    const store = useRecentSearchesStore.getState();
    store.remember('u1', 'ash');
    store.remember('u2', 'fox');
    store.setRemembering('u1', false);
    expect(useRecentSearchesStore.getState().byUser.u1).toBeUndefined();
    useRecentSearchesStore.getState().remember('u1', 'snake');
    expect(useRecentSearchesStore.getState().byUser.u1).toBeUndefined();
    // Another account of this phone keeps its own.
    expect(useRecentSearchesStore.getState().byUser.u2).toEqual(['fox']);
    useRecentSearchesStore.getState().setRemembering('u1', true);
    useRecentSearchesStore.getState().remember('u1', 'snake');
    expect(useRecentSearchesStore.getState().byUser.u1).toEqual(['snake']);
  });

  it('drops the per-segment lists of before stage R5 when read back', async () => {
    const migrate = useRecentSearchesStore.persist.getOptions().migrate;
    expect(
      await migrate?.(
        { byUser: { u1: ['ash'], 'u1/collectors': ['noé'], 'u1/binders': ['trades'] } },
        1
      )
    ).toEqual({ byUser: { u1: ['ash'] }, forgetting: {} });
  });
});
