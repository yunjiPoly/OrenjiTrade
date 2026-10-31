import type {
  FeedCardPreview,
  FeedPost,
  FeedPostKindEnum,
  MyLocationResponse,
} from '@orenji/api-client';
import { itemPriceText } from '../../features/inventory/data/item-price';

/**
 * The pure rules of the web's Home (spec 5, boards W1 and W2; the phone's R7 `feedRules`): the
 * chips and their URL words, the sections and times in this browser's time zone, a post's
 * header, the six tiles of a new-cards post, the end and empty texts, and Get started.
 */

/** The chips (`kind=` of `GET /feed`). */
export type FeedFilter = 'ALL' | 'NEW_CARDS' | 'WANTED' | 'DECK_CORES';

export const FEED_FILTERS: readonly FeedFilter[] = ['ALL', 'NEW_CARDS', 'WANTED', 'DECK_CORES'];

export const FILTER_LABELS: Readonly<Record<FeedFilter, string>> = {
  ALL: 'All',
  NEW_CARDS: 'New cards',
  WANTED: 'Wanted',
  DECK_CORES: 'Deck cores',
};

/** What a screen reader hears once a chip's posts are shown (SC 4.1.3; never a count). */
export const FILTER_ANNOUNCEMENTS: Readonly<Record<FeedFilter, string>> = {
  ALL: 'Showing all posts.',
  NEW_CARDS: 'Showing new cards.',
  WANTED: 'Showing wanted cards.',
  DECK_CORES: 'Showing deck cores.',
};

/** Said once when "New posts · Show" appears (no number, as the pill). */
export const NEWER_ANNOUNCEMENT = 'New posts are available.';

/** The colour of a chip's dot and of a post's verb (spec 5.1 and 5.2). */
export type FeedTone = 'cards' | 'wanted' | 'deckCore';

export function chipDot(filter: FeedFilter): FeedTone | null {
  switch (filter) {
    case 'NEW_CARDS':
      return 'cards';
    case 'WANTED':
      return 'wanted';
    case 'DECK_CORES':
      return 'deckCore';
    default:
      return null;
  }
}

/** Home's URL words (spec 4.11: `?kind=all|cards|wanted|deckcores`). */
const URL_KINDS: Readonly<Record<FeedFilter, string>> = {
  ALL: 'all',
  NEW_CARDS: 'cards',
  WANTED: 'wanted',
  DECK_CORES: 'deckcores',
};

/** The chip of a `?kind=` word; anything else is All. */
export function filterOfUrl(kind: string | null | undefined): FeedFilter {
  const word = (kind ?? '').toLowerCase();
  return FEED_FILTERS.find((filter) => URL_KINDS[filter] === word) ?? 'ALL';
}

/** The `?kind=` word of a chip; `null` for All (the URL stays short). */
export function urlOfFilter(filter: FeedFilter): string | null {
  return filter === 'ALL' ? null : URL_KINDS[filter];
}

// ---------------------------------------------------------------------------------------------
// Sections and times, in this browser's time zone
// ---------------------------------------------------------------------------------------------

export type FeedSection = 'today' | 'week' | 'month';

export const SECTION_TITLES: Readonly<Record<FeedSection, string>> = {
  today: 'Today',
  week: 'Earlier this week',
  month: 'Earlier this month',
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'short' });
const MONTH_DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

function dayNumber(date: Date): number {
  return Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY);
}

/** How many calendar days ago `at` was here: 0 today (a time a little ahead counts as today). */
export function calendarDaysAgo(at: Date, now: Date): number {
  return Math.max(0, dayNumber(now) - dayNumber(at));
}

/** "Today", "Earlier this week" (1 to 6 days ago), "Earlier this month" (7 days and more). */
export function sectionOf(iso: string, now: Date = new Date()): FeedSection {
  const days = calendarDaysAgo(new Date(iso), now);
  if (days === 0) {
    return 'today';
  }
  return days <= 6 ? 'week' : 'month';
}

/** "now", "5 min" and "1 h" today, the weekday ("Wed") this week, then the date ("Sep 28"). */
export function feedTime(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) {
    return '';
  }
  const section = sectionOf(iso, now);
  if (section === 'today') {
    const elapsed = Math.max(0, now.getTime() - at.getTime());
    if (elapsed < MINUTE) {
      return 'now';
    }
    if (elapsed < HOUR) {
      return `${Math.floor(elapsed / MINUTE)} min`;
    }
    return `${Math.floor(elapsed / HOUR)} h`;
  }
  return section === 'week' ? WEEKDAY.format(at) : MONTH_DAY.format(at);
}

/** "Updated just now", "Updated 5 min ago", "Updated 2 h ago" (the toolbar, spec 5.1). */
export function updatedLabel(loadedAt: number | null, now: number = Date.now()): string {
  if (loadedAt === null) {
    return '';
  }
  const elapsed = Math.max(0, now - loadedAt);
  if (elapsed < MINUTE) {
    return 'Updated just now';
  }
  if (elapsed < HOUR) {
    return `Updated ${Math.floor(elapsed / MINUTE)} min ago`;
  }
  return `Updated ${Math.floor(elapsed / HOUR)} h ago`;
}

/** A section with its posts, newest first as the API sends them. */
export interface FeedSectionGroup {
  section: FeedSection;
  title: string;
  posts: FeedPost[];
}

/**
 * The posts in their sections; a post seen twice (a new-cards post whose newest card left between
 * two pages comes back once with a new time, R7's contract) keeps its first copy.
 */
export function feedSections(
  posts: readonly FeedPost[],
  now: Date = new Date(),
): FeedSectionGroup[] {
  const groups: FeedSectionGroup[] = [];
  const seen = new Set<string>();
  for (const post of posts) {
    if (seen.has(post.id)) {
      continue;
    }
    seen.add(post.id);
    const section = sectionOf(post.at, now);
    const last = groups[groups.length - 1];
    if (last && last.section === section) {
      last.posts.push(post);
    } else {
      groups.push({ section, title: SECTION_TITLES[section], posts: [post] });
    }
  }
  return groups;
}

/** Appends a page, keeping the copy of a post already shown (R7: dedupe by id). */
export function mergePosts(shown: readonly FeedPost[], page: readonly FeedPost[]): FeedPost[] {
  const known = new Set(shown.map((post) => post.id));
  return [...shown, ...page.filter((post) => !known.has(post.id))];
}

// ---------------------------------------------------------------------------------------------
// A post
// ---------------------------------------------------------------------------------------------

/** "listed 12 cards", "wants a card", "is selling a deck core" and its tone. */
export function postVerb(post: Pick<FeedPost, 'kind' | 'newCards'>): {
  text: string;
  tone: FeedTone;
} {
  switch (post.kind as `${FeedPostKindEnum}`) {
    case 'WANTED':
      return { text: 'wants a card', tone: 'wanted' };
    case 'DECK_CORE':
      return { text: 'is selling a deck core', tone: 'deckCore' };
    default: {
      const total = post.newCards?.total ?? 0;
      return { text: total === 1 ? 'listed a card' : `listed ${total} cards`, tone: 'cards' };
    }
  }
}

/** The collector a post shows: the handle, or "A collector" for a guest (R15). */
export function posterName(post: Pick<FeedPost, 'collector'>): string {
  return post.collector.handle || 'A collector';
}

/** The province a post shows (a whole-country pseudo-subdivision names its country). */
export function postPlace(post: Pick<FeedPost, 'place'>): string {
  return post.place.subdivisionName || post.place.countryName || '';
}

/** One tile of a new-cards post: a card, or the "+N" tile that opens the profile. */
export type CardTile =
  { kind: 'card'; card: FeedCardPreview; price: string | null } | { kind: 'more'; count: number };

/** Tiles per row on the web (spec 5.2: 6 columns, the 6th "+N" from 7 cards). */
export const TILE_COLUMNS = 6;

/**
 * The tiles of a new-cards post of `total` cards with these previews (at most 6 asked):
 * every card up to 6; from 7 cards, 5 cards and "+N" (N the cards not shown).
 */
export function cardTiles(
  previews: readonly FeedCardPreview[],
  total: number,
  columns: number = TILE_COLUMNS,
): CardTile[] {
  const count = Math.max(total, previews.length);
  const shown = count > columns ? previews.slice(0, columns - 1) : previews.slice(0, columns);
  const tiles: CardTile[] = shown.map((card) => ({
    kind: 'card',
    card,
    price: itemPriceText(card),
  }));
  if (count > shown.length) {
    tiles.push({ kind: 'more', count: count - shown.length });
  }
  return tiles;
}

/** "RA01-EN075 · Platinum Secret Rare" under a single card. */
export function cardLine(card: Pick<FeedCardPreview, 'printingCode' | 'rarity'>): string {
  return [card.printingCode, card.rarity].filter(Boolean).join(' · ');
}

// ---------------------------------------------------------------------------------------------
// End and empty states (spec 5.4)
// ---------------------------------------------------------------------------------------------

const END_WHAT: Readonly<Record<FeedFilter, string>> = {
  ALL: 'everything new',
  NEW_CARDS: 'every new card',
  WANTED: 'every wish',
  DECK_CORES: 'every deck core',
};

/** "That's everything new for Yu-Gi-Oh! in Americas (North) from the last 30 days." */
export function endText(filter: FeedFilter, game: string, region: string, days: number): string {
  return `That’s ${END_WHAT[filter]} for ${game} in ${region} from the last ${days} days.`;
}

/** A chip with nothing in the window (the other kinds have posts). */
export function chipEmptyText(filter: FeedFilter, region: string, days: number): string {
  switch (filter) {
    case 'WANTED':
      return `No wishes in ${region} in the last ${days} days.`;
    case 'DECK_CORES':
      return `No deck cores in ${region} in the last ${days} days.`;
    default:
      return `No new cards in ${region} in the last ${days} days.`;
  }
}

/**
 * Which empty state the first page asks for: the whole region quiet (day one, W2), the browsed
 * game quiet while the region has posts of other games, one chip empty, or none.
 */
export type EmptyKind = 'region' | 'game' | 'chip' | null;

export function emptyKind(page: {
  items: readonly unknown[];
  gameHasPosts: boolean;
  regionHasPosts: boolean;
}): EmptyKind {
  if (page.items.length > 0) {
    return null;
  }
  if (!page.regionHasPosts) {
    return 'region';
  }
  return page.gameHasPosts ? 'chip' : 'game';
}

// ---------------------------------------------------------------------------------------------
// Get started (spec 5.3; the phone's getStarted)
// ---------------------------------------------------------------------------------------------

export type ProvinceStep =
  | { state: 'done'; place: string }
  | { state: 'todo' }
  /** A location, but hidden from the map: "Turn on Show me on the map". */
  | { state: 'hidden' };

export interface GetStartedSteps {
  province: ProvinceStep;
  card: boolean;
  wish: boolean;
  done: number;
}

/** The steps, or `null` while one of the three answers is not known. */
export function getStartedSteps(input: {
  location: MyLocationResponse | null | undefined;
  publicCards: number | null | undefined;
  wishes: number | null | undefined;
}): GetStartedSteps | null {
  if (!input.location || input.publicCards == null || input.wishes == null) {
    return null;
  }
  const where = input.location.location;
  const province: ProvinceStep = !where?.subdivisionCode
    ? { state: 'todo' }
    : input.location.discoverable
      ? { state: 'done', place: where.label || `${where.subdivisionName}, ${where.countryName}` }
      : { state: 'hidden' };
  const card = input.publicCards > 0;
  const wish = input.wishes > 0;
  const done = (province.state === 'done' ? 1 : 0) + (card ? 1 : 0) + (wish ? 1 : 0);
  return { province, card, wish, done };
}

/**
 * localStorage key of "Hide these steps" per account (the phone keeps it per account too); it
 * goes on sign-out (`core/auth/account-storage.ts`, WE review P4).
 */
export { GET_STARTED_HIDDEN_PREFIX } from '../../core/auth/account-storage';
