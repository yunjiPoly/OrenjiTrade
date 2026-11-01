import AsyncStorage from '@react-native-async-storage/async-storage';

import type { MyLocationResponse } from '@/src/api/types';
import {
  calendarDaysAgo,
  chipDot,
  chipEmptyText,
  codeAndRarity,
  emptyTitle,
  endText,
  feedRows,
  feedTime,
  feedWishTerms,
  gridTiles,
  isGrid,
  postHeaderLabel,
  postVerb,
  sectionOf,
} from '@/src/features/home/feedRules';
import {
  GET_STARTED_STORAGE_PREFIX,
  getStartedSteps,
  hideGetStarted,
  hydrateGetStarted,
  isComplete,
  resetGetStarted,
  useGetStartedStore,
} from '@/src/features/home/getStarted';
import { useHomeChip } from '@/src/features/home/homeChip';

import {
  ONTARIO,
  QUEBEC,
  feedPostFixture,
  feedPreviewFixture,
  locationFixture,
  printingFixture,
} from '../support/fixtures';

/**
 * The rules of Home (stage R7; owner prompt of 2026-10-19, sections 1 to 4 and 7): the sections and
 * time labels in the phone's time zone, the grid of new cards with "+n", the wish terms, the end
 * and empty texts per chip, and Get started. Dates are built on the phone's own calendar (local
 * constructors), so the day boundaries hold in any time zone the tests run in.
 */

/** A local time on 2026-10-21 (a Wednesday), or `days` before it. */
function local(hours: number, minutes = 0, days = 0): Date {
  return new Date(2026, 9, 21 - days, hours, minutes);
}

const NOW = local(15, 30);

describe('Sections and times, in the phone time zone', () => {
  it('runs in a time zone that is not UTC, so a UTC calendar would be caught', () => {
    // jest.config.js pins one (R7 review F7): under UTC, local and UTC days are the same.
    expect(NOW.getTimezoneOffset()).not.toBe(0);
    expect(NOW.getUTCDate()).toBe(NOW.getDate());
    expect(local(22, 0).getUTCDate()).not.toBe(local(22, 0).getDate());
  });

  it('starts "Today" at local midnight and "Earlier this month" at 7 days', () => {
    expect(sectionOf(local(0, 0).toISOString(), NOW)).toBe('today');
    expect(sectionOf(local(23, 59, 1).toISOString(), NOW)).toBe('week');
    expect(sectionOf(local(0, 1, 6).toISOString(), NOW)).toBe('week');
    expect(sectionOf(local(23, 59, 7).toISOString(), NOW)).toBe('month');
    expect(sectionOf(local(12, 0, 29).toISOString(), NOW)).toBe('month');
    // A time a little ahead of the phone's clock is today.
    expect(sectionOf(local(15, 31).toISOString(), NOW)).toBe('today');
    // Just after midnight, the evening before is yesterday, not today.
    const justAfterMidnight = local(0, 5);
    expect(sectionOf(local(23, 50, 1).toISOString(), justAfterMidnight)).toBe('week');
    expect(calendarDaysAgo(local(23, 50, 1), justAfterMidnight)).toBe(1);
  });

  it('counts calendar days across a daylight saving change', () => {
    // 2026-11-01 is a 25-hour day where the clocks go back (America/Toronto); elsewhere a day.
    const after = new Date(2026, 10, 2, 0, 30);
    expect(calendarDaysAgo(new Date(2026, 10, 1, 0, 30), after)).toBe(1);
    expect(calendarDaysAgo(new Date(2026, 9, 31, 23, 30), after)).toBe(2);
  });

  it('writes "5 min" and "1 h" today, the weekday this week, then the date', () => {
    expect(feedTime(local(15, 29, 0).toISOString(), local(15, 29, 30))).toBe('now');
    expect(feedTime(local(15, 25).toISOString(), NOW)).toBe('5 min');
    expect(feedTime(local(14, 30).toISOString(), NOW)).toBe('1 h');
    expect(feedTime(local(0, 10).toISOString(), NOW)).toBe('15 h');
    expect(feedTime(local(9, 0, 1).toISOString(), NOW)).toBe('Tue');
    expect(feedTime(local(9, 0, 6).toISOString(), NOW)).toBe('Thu');
    expect(feedTime(new Date(2026, 8, 28, 9).toISOString(), NOW)).toBe('Sep 28');
    expect(feedTime('not a date', NOW)).toBe('');
  });

  it('puts a title before the first post of each section, none for an empty one', () => {
    const today = feedPostFixture({ at: local(15, 25).toISOString() });
    const alsoToday = feedPostFixture({ kind: 'WANTED', at: local(13, 0).toISOString() });
    const month = feedPostFixture({ kind: 'DECK_CORE', at: local(9, 0, 12).toISOString() });
    const rows = feedRows([today, alsoToday, month], NOW);
    expect(rows.map((row) => (row.type === 'section' ? row.section : row.post.id))).toEqual([
      'today',
      today.id,
      alsoToday.id,
      'month',
      month.id,
    ]);
    // A post repeated by a later page is shown once.
    expect(feedRows([today, today], NOW).filter((row) => row.type === 'post')).toHaveLength(1);
  });
});

describe('Posts', () => {
  it('says what a collector did, coloured by kind, and reads the header as one line', () => {
    expect(postVerb(feedPostFixture())).toEqual({ verb: 'listed 12 cards', tone: 'cards' });
    expect(
      postVerb(feedPostFixture({ newCards: { total: 1, previews: [feedPreviewFixture(1)] } })).verb
    ).toBe('listed a card');
    expect(postVerb(feedPostFixture({ kind: 'WANTED' }))).toEqual({
      verb: 'wants a card',
      tone: 'wanted',
    });
    expect(postVerb(feedPostFixture({ kind: 'DECK_CORE' }))).toEqual({
      verb: 'is selling a deck core',
      tone: 'deckCore',
    });
    const post = feedPostFixture({ at: local(15, 25).toISOString(), place: ONTARIO });
    expect(postHeaderLabel(post, NOW)).toBe('maya_k listed 12 cards, 5 min, Ontario');
    expect(postHeaderLabel({ ...post, place: QUEBEC }, NOW)).toBe(
      'maya_k listed 12 cards, 5 min, Quebec'
    );
  });

  it('lays out groups of 1, 2, 3, 4, 5 and 12 cards, with "+n" from 5', () => {
    const previews = (count: number) =>
      Array.from({ length: Math.min(count, 4) }, (_, i) => feedPreviewFixture(i + 1));
    const tiles = (total: number) => gridTiles({ total, previews: previews(total) });

    expect(isGrid({ total: 1 })).toBe(false);
    expect(isGrid({ total: 2 })).toBe(true);
    expect(tiles(2).map((tile) => tile.kind)).toEqual(['card', 'card']);
    expect(tiles(3).map((tile) => tile.kind)).toEqual(['card', 'card', 'card']);
    expect(tiles(4).map((tile) => tile.kind)).toEqual(['card', 'card', 'card', 'card']);
    const five = tiles(5);
    expect(five.map((tile) => tile.kind)).toEqual(['card', 'card', 'card', 'more']);
    expect(five[3]).toMatchObject({
      kind: 'more',
      count: 2,
      label: '2 more cards from this collector',
    });
    const twelve = tiles(12);
    expect(twelve[3]).toMatchObject({ kind: 'more', count: 9 });
    // The "+n" tile shows the 4th card's picture, dimmed.
    expect(twelve[3]?.kind === 'more' && twelve[3].preview?.name).toBe('Feed Card 4');
    // Prices exactly as typed; a tile says its card and price.
    expect(twelve[0]).toMatchObject({ kind: 'card', price: '$1.50', label: 'Feed Card 1, $1.50' });
    const noPrice = gridTiles({
      total: 2,
      previews: [
        feedPreviewFixture(1, { askingPriceText: '90% TCG' }),
        feedPreviewFixture(2, { askingPriceText: null, askingPrice: null }),
      ],
    });
    expect(noPrice.map((tile) => (tile.kind === 'card' ? tile.price : null))).toEqual([
      '90% TCG',
      null,
    ]);
    expect(noPrice[1]?.label).toBe('Feed Card 2');
    // A price set before stage R2 (an amount, no text) shows as an amount.
    const amount = gridTiles({
      total: 2,
      previews: [
        feedPreviewFixture(1, { askingPriceText: null, askingPrice: 42, currency: 'CAD' }),
        feedPreviewFixture(2),
      ],
    });
    expect(amount[0]?.kind === 'card' && amount[0].price).toMatch(/42\.00/);
  });

  it('gives a single card its code and rarity', () => {
    expect(codeAndRarity(feedPreviewFixture(7))).toEqual({
      code: 'FDC-EN007',
      rarity: 'Super Rare',
    });
    expect(codeAndRarity({ printingCode: ' ', rarity: null })).toEqual({
      code: null,
      rarity: null,
    });
  });

  it('writes the wish terms as the Wishlist segment does', () => {
    const wish = feedPostFixture({ kind: 'WANTED' }).wanted!;
    expect(feedWishTerms(wish)).toBe('Any printing · NM only · 85% TCG');
    expect(
      feedWishTerms({
        ...wish,
        printing: printingFixture({ printingCode: 'EXFO-EN065' }),
        priceTerm: undefined,
      })
    ).toBe('EXFO-EN065 · NM only');
    expect(
      feedWishTerms({ ...wish, rarity: 'Ultra Rare', nearMintOnly: false, priceTerm: undefined })
    ).toBe('Any printing · Ultra Rare');
  });
});

describe('The chips, the end and the empty states', () => {
  it('gives each kind chip its dot, All none', () => {
    expect(chipDot('ALL')).toBeNull();
    expect(chipDot('NEW_CARDS')).toBe('cards');
    expect(chipDot('WANTED')).toBe('wanted');
    expect(chipDot('DECK_CORES')).toBe('deckCore');
  });

  it('ends with a text per chip', () => {
    const region = 'Americas (North)';
    expect(endText('ALL', 'Yu-Gi-Oh!', region, 30)).toBe(
      'That’s everything new for Yu-Gi-Oh! in Americas (North) from the last 30 days.'
    );
    expect(endText('NEW_CARDS', 'Yu-Gi-Oh!', region, 30)).toBe(
      'That’s every new card for Yu-Gi-Oh! in Americas (North) from the last 30 days.'
    );
    expect(endText('WANTED', 'Pokémon', region, 30)).toBe(
      'That’s every wish for Pokémon in Americas (North) from the last 30 days.'
    );
    expect(endText('DECK_CORES', 'Yu-Gi-Oh!', 'Europe', 14)).toBe(
      'That’s every deck core for Yu-Gi-Oh! in Europe from the last 14 days.'
    );
  });

  it('says which chip is empty, and which place is quiet', () => {
    expect(chipEmptyText('NEW_CARDS', 'Europe', 30)).toBe(
      'No new cards in Europe in the last 30 days.'
    );
    expect(chipEmptyText('WANTED', 'Europe', 30)).toBe('No wishes in Europe in the last 30 days.');
    expect(chipEmptyText('DECK_CORES', 'Europe', 30)).toBe(
      'No deck cores in Europe in the last 30 days.'
    );
    expect(emptyTitle(false, 'Yu-Gi-Oh!', 'Americas (North)')).toBe(
      'Nothing new in Americas (North) yet'
    );
    expect(emptyTitle(true, 'Yu-Gi-Oh!', 'Americas (North)')).toBe('Nothing new in Yu-Gi-Oh! yet');
  });
});

describe('Get started', () => {
  const noLocation: MyLocationResponse = { location: null, discoverable: false } as never;

  it('waits for the three answers', () => {
    expect(getStartedSteps({ location: undefined, publicCards: 0, wishes: 0 })).toBeNull();
    expect(getStartedSteps({ location: noLocation, publicCards: undefined, wishes: 0 })).toBeNull();
    expect(getStartedSteps({ location: noLocation, publicCards: 0, wishes: undefined })).toBeNull();
  });

  it('asks for a province, then to turn on the map, then shows the place', () => {
    expect(getStartedSteps({ location: noLocation, publicCards: 0, wishes: 0 })).toEqual({
      province: { state: 'todo' },
      card: false,
      wish: false,
      done: 0,
    });
    // A location hidden from the map: "Turn on".
    expect(
      getStartedSteps({
        location: locationFixture({ discoverable: false }),
        publicCards: 0,
        wishes: 0,
      })?.province
    ).toEqual({ state: 'hidden' });
    const done = getStartedSteps({
      location: locationFixture({ discoverable: true }),
      publicCards: 2,
      wishes: 0,
    });
    expect(done).toEqual({
      province: { state: 'done', place: 'Quebec, Canada' },
      card: true,
      wish: false,
      done: 2,
    });
    expect(isComplete(done!)).toBe(false);
    const all = getStartedSteps({
      location: locationFixture({ discoverable: true }),
      publicCards: 1,
      wishes: 3,
    });
    expect(all?.done).toBe(3);
    expect(isComplete(all!)).toBe(true);
  });

  it('is hidden for good per account on this phone', async () => {
    resetGetStarted();
    await AsyncStorage.clear();
    await hydrateGetStarted('uid-a');
    expect(useGetStartedStore.getState().hidden['uid-a']).toBe(false);
    await hideGetStarted('uid-a');
    expect(useGetStartedStore.getState().hidden['uid-a']).toBe(true);
    expect(await AsyncStorage.getItem(`${GET_STARTED_STORAGE_PREFIX}uid-a`)).toBe('hidden');
    // Another account on the same phone still sees it; the first after a restart still does not.
    resetGetStarted();
    await hydrateGetStarted('uid-b');
    await hydrateGetStarted('uid-a');
    expect(useGetStartedStore.getState().hidden).toEqual({ 'uid-a': true, 'uid-b': false });
  });
});

describe('The chip of Home', () => {
  it('starts on All whenever the app starts, and is kept nowhere else', async () => {
    // Default 3 of the owner prompt (section 8): kept while the app runs, back to All on restart.
    await AsyncStorage.clear();
    expect(useHomeChip.getInitialState()).toEqual({ kind: 'ALL' });
    useHomeChip.setState({ kind: 'WANTED' });
    expect(await AsyncStorage.getAllKeys()).toEqual([]);
    useHomeChip.setState(useHomeChip.getInitialState());
  });
});
