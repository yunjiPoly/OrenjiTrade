import { FeedCardPreview, FeedPost, FeedPostKindEnum as Kind } from '@orenji/api-client';
import {
  cardTiles,
  chipEmptyText,
  emptyKind,
  endText,
  feedSections,
  feedTime,
  filterOfUrl,
  getStartedSteps,
  mergePosts,
  postPlace,
  postVerb,
  posterName,
  sectionOf,
  updatedLabel,
  urlOfFilter,
} from './home-rules';

function card(id: string, price: string | null = '$1.00'): FeedCardPreview {
  return {
    itemId: `i${id}`,
    cardId: `c${id}`,
    printingId: `p${id}`,
    name: `Card ${id}`,
    printingCode: `SET-EN00${id}`,
    rarity: 'Rare',
    imageUrl: null,
    askingPriceText: price,
    askingPrice: null,
    currency: 'CAD',
  };
}

function post(id: string, at: string, overrides: Partial<FeedPost> = {}): FeedPost {
  return {
    id,
    kind: 'NEW_CARDS',
    at,
    collector: { id: 'u1', handle: 'maya_k', displayName: 'Maya', avatarUrl: null },
    place: {
      regionCode: 'americas-north',
      countryCode: 'CA',
      countryName: 'Canada',
      subdivisionCode: 'CA-QC',
      subdivisionName: 'Quebec',
      label: 'Quebec, Canada',
    },
    newCards: { total: 1, previews: [card('1')] },
    ...overrides,
  } as FeedPost;
}

describe('Home rules (spec 5, boards W1 and W2)', () => {
  const now = new Date(2026, 9, 29, 15, 0);

  it('reads and writes the chip of the URL (spec 4.11: all, cards, wanted, deckcores)', () => {
    expect(filterOfUrl('cards')).toBe('NEW_CARDS');
    expect(filterOfUrl('WANTED')).toBe('WANTED');
    expect(filterOfUrl('deckcores')).toBe('DECK_CORES');
    expect(filterOfUrl('nonsense')).toBe('ALL');
    expect(filterOfUrl(undefined)).toBe('ALL');
    expect(urlOfFilter('ALL')).toBeNull();
    expect(urlOfFilter('DECK_CORES')).toBe('deckcores');
  });

  it('puts posts in Today, Earlier this week and Earlier this month, with their times', () => {
    const today = new Date(2026, 9, 29, 14, 55).toISOString();
    const hours = new Date(2026, 9, 29, 9, 0).toISOString();
    const week = new Date(2026, 9, 27, 9, 0).toISOString();
    const month = new Date(2026, 9, 17, 9, 0).toISOString();
    expect(sectionOf(today, now)).toBe('today');
    expect(sectionOf(week, now)).toBe('week');
    expect(sectionOf(month, now)).toBe('month');
    expect(feedTime(today, now)).toBe('5 min');
    expect(feedTime(hours, now)).toBe('6 h');
    expect(feedTime(week, now)).toBe('Tue');
    expect(feedTime(month, now)).toBe('Oct 17');
    expect(feedTime(new Date(2026, 9, 29, 14, 59, 40).toISOString(), now)).toBe('now');
  });

  it('says when it was updated, without a number of posts', () => {
    const at = now.getTime();
    expect(updatedLabel(null, at)).toBe('');
    expect(updatedLabel(at - 20_000, at)).toBe('Updated just now');
    expect(updatedLabel(at - 5 * 60_000, at)).toBe('Updated 5 min ago');
    expect(updatedLabel(at - 2 * 3_600_000, at)).toBe('Updated 2 h ago');
  });

  it('groups by section and keeps the first copy of a post seen twice (R7: dedupe by id)', () => {
    const a = post('a', new Date(2026, 9, 29, 14, 0).toISOString());
    const b = post('b', new Date(2026, 9, 27, 14, 0).toISOString());
    const again = post('a', new Date(2026, 9, 26, 14, 0).toISOString());
    const groups = feedSections([a, b, again], now);
    expect(groups.map((g) => [g.title, g.posts.map((p) => p.id)])).toEqual([
      ['Today', ['a']],
      ['Earlier this week', ['b']],
    ]);
    expect(mergePosts([a], [again, b]).map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('words a post\'s header, a guest\'s collector as "A collector" (R15)', () => {
    const one = post('a', now.toISOString());
    expect(postVerb(one)).toEqual({ text: 'listed a card', tone: 'cards' });
    expect(postVerb({ kind: Kind.NewCards, newCards: { total: 12, previews: [] } })).toEqual({
      text: 'listed 12 cards',
      tone: 'cards',
    });
    expect(postVerb({ kind: Kind.Wanted }).text).toBe('wants a card');
    expect(postVerb({ kind: Kind.DeckCore }).tone).toBe('deckCore');
    expect(posterName(one)).toBe('maya_k');
    const guest = post('g', now.toISOString(), {
      collector: { id: null, handle: null, displayName: null, avatarUrl: null },
    });
    expect(posterName(guest)).toBe('A collector');
    expect(postPlace(guest)).toBe('Quebec');
  });

  it('shows up to 6 tiles, and from 7 cards five and "+N" (spec 5.2)', () => {
    const six = ['1', '2', '3', '4', '5', '6'].map((id) => card(id));
    expect(cardTiles(six, 6).map((t) => t.kind)).toEqual(Array(6).fill('card'));
    const twelve = cardTiles(six, 12);
    expect(twelve).toHaveLength(6);
    expect(twelve[5]).toEqual({ kind: 'more', count: 7 });
    expect(twelve.slice(0, 5).every((t) => t.kind === 'card')).toBe(true);
    // The phone's 4 pictures (an older server): four cards and "+8".
    const four = cardTiles(six.slice(0, 4), 12);
    expect(four.map((t) => (t.kind === 'more' ? `+${t.count}` : t.card.name))).toEqual([
      'Card 1',
      'Card 2',
      'Card 3',
      'Card 4',
      '+8',
    ]);
    expect(cardTiles([card('1', null)], 2)[0]).toEqual(
      expect.objectContaining({ kind: 'card', price: null }),
    );
  });

  it('words the end and the empty states', () => {
    expect(endText('ALL', 'Yu-Gi-Oh!', 'Americas (North)', 30)).toBe(
      'That’s everything new for Yu-Gi-Oh! in Americas (North) from the last 30 days.',
    );
    expect(endText('WANTED', 'Pokémon', 'Europe', 30)).toContain('every wish for Pokémon');
    expect(chipEmptyText('DECK_CORES', 'Europe', 30)).toBe(
      'No deck cores in Europe in the last 30 days.',
    );
    expect(emptyKind({ items: [], gameHasPosts: false, regionHasPosts: false })).toBe('region');
    expect(emptyKind({ items: [], gameHasPosts: false, regionHasPosts: true })).toBe('game');
    expect(emptyKind({ items: [], gameHasPosts: true, regionHasPosts: true })).toBe('chip');
    expect(emptyKind({ items: [1], gameHasPosts: true, regionHasPosts: true })).toBeNull();
  });

  it('counts Get started: a province on the map, a public card, a wish', () => {
    const location = {
      discoverable: true,
      location: {
        regionCode: 'americas-north',
        regionName: 'Americas (North)',
        countryCode: 'CA',
        countryName: 'Canada',
        subdivisionCode: 'CA-QC',
        subdivisionName: 'Quebec',
        label: 'Quebec, Canada',
        city: null,
        showCity: false,
      },
    };
    expect(getStartedSteps({ location, publicCards: null, wishes: 0 })).toBeNull();
    expect(getStartedSteps({ location, publicCards: 0, wishes: 0 })).toEqual({
      province: { state: 'done', place: 'Quebec, Canada' },
      card: false,
      wish: false,
      done: 1,
    });
    expect(
      getStartedSteps({
        location: { ...location, discoverable: false },
        publicCards: 2,
        wishes: 1,
      }),
    ).toEqual(expect.objectContaining({ province: { state: 'hidden' }, done: 2 }));
    expect(
      getStartedSteps({ location: { discoverable: false }, publicCards: 1, wishes: 1 }),
    ).toEqual(expect.objectContaining({ province: { state: 'todo' }, done: 2 }));
  });
});
