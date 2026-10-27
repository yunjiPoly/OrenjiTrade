import type { ListingRef } from '@/src/account/guestAction';
import type {
  FeedCardPreview,
  FeedNewCards,
  FeedPost,
  FeedPostKind,
  FeedWish,
} from '@/src/api/types';
import { itemPriceText } from '@/src/features/inventory/itemPrice';
import { GUEST_COPY } from '@/src/features/guest/guestCopy';
import { wishTerms } from '@/src/features/wishlist/wishlistLabels';

import { HOME_COPY } from './homeCopy';

/**
 * The pure rules of Home's feed (owner prompt of 2026-10-19, sections 1, 2 and 4; mockup v50
 * screens 10, 10b and 10c): the chips, the sections and time labels in the phone's time zone, the
 * header of a post, the tiles of a new-cards post, the end and the empty texts.
 */

/** The chips (and `kind=` of `GET /feed`). */
export type FeedFilter = 'ALL' | 'NEW_CARDS' | 'WANTED' | 'DECK_CORES';

export const FEED_FILTERS: readonly FeedFilter[] = ['ALL', 'NEW_CARDS', 'WANTED', 'DECK_CORES'];

/** The colour of a chip's dot and of a post's verb. */
export type FeedTone = 'cards' | 'wanted' | 'deckCore';

/** A kind chip's dot (All has none): orange new cards, teal wishes, purple deck cores. */
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

// ---------------------------------------------------------------------------------------------
// Sections and times, in the phone's time zone
// ---------------------------------------------------------------------------------------------

export type FeedSection = 'today' | 'week' | 'month';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'short' });
const MONTH_DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

/** The local calendar day of `date` as a whole number (daylight saving time does not count). */
function dayNumber(date: Date): number {
  return Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY);
}

/**
 * How many calendar days ago `at` was, on the phone's calendar: 0 today (from local midnight),
 * 1 yesterday... A time a little ahead of the phone's clock counts as today.
 */
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

/** The title of a section. */
export function sectionTitle(section: FeedSection): string {
  return HOME_COPY.sections[section];
}

/** "5 min" and "1 h" today, the weekday ("Wed") this week, then the date ("Sep 28"). */
export function feedTime(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) {
    return '';
  }
  const section = sectionOf(iso, now);
  if (section === 'today') {
    const elapsed = Math.max(0, now.getTime() - at.getTime());
    if (elapsed < MINUTE) {
      return HOME_COPY.time.now;
    }
    if (elapsed < HOUR) {
      return HOME_COPY.time.minutes(Math.floor(elapsed / MINUTE));
    }
    return HOME_COPY.time.hours(Math.floor(elapsed / HOUR));
  }
  return section === 'week' ? WEEKDAY.format(at) : MONTH_DAY.format(at);
}

/** A row of the feed list: a section title, or a post. */
export type FeedRow =
  | { type: 'section'; key: string; section: FeedSection }
  | { type: 'post'; key: string; post: FeedPost };

/**
 * The posts in their sections, newest first as the API sends them: a section title only before
 * the first post of a section (a section without posts after the filter has no title).
 */
export function feedRows(posts: readonly FeedPost[], now: Date = new Date()): FeedRow[] {
  const rows: FeedRow[] = [];
  const seen = new Set<string>();
  let current: FeedSection | null = null;
  for (const post of posts) {
    if (seen.has(post.id)) {
      continue;
    }
    seen.add(post.id);
    const section = sectionOf(post.at, now);
    if (section !== current) {
      current = section;
      rows.push({ type: 'section', key: `section-${section}`, section });
    }
    rows.push({ type: 'post', key: `post-${post.id}`, post });
  }
  return rows;
}

// ---------------------------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------------------------

/** The verb of a post's header and its colour. */
export function postVerb(post: Pick<FeedPost, 'kind' | 'newCards'>): {
  verb: string;
  tone: FeedTone;
} {
  switch (post.kind as FeedPostKind) {
    case 'NEW_CARDS':
      return { verb: HOME_COPY.verbs.cards(post.newCards?.total ?? 1), tone: 'cards' };
    case 'WANTED':
      return { verb: HOME_COPY.verbs.wanted, tone: 'wanted' };
    default:
      return { verb: HOME_COPY.verbs.deckCore, tone: 'deckCore' };
  }
}

/** The province of a post's collector ("Quebec"; the country for a whole-country place). */
export function postProvince(post: Pick<FeedPost, 'place'>): string {
  return post.place.subdivisionName || post.place.countryName;
}

/**
 * Whether the reader may not see who posted (a guest, stage R15): the API sends no handle, the
 * post says "A collector" with a plain avatar and keeps its place.
 */
export function isUnnamed(post: Pick<FeedPost, 'collector'>): boolean {
  return !post.collector.handle;
}

/**
 * The listing a post is about, for a guest's action kept until they sign in (stage R15): its
 * newest card, its wish or its deck core; never the collector.
 */
export function postListing(post: FeedPost): ListingRef | null {
  const first = post.newCards?.previews?.[0];
  if (post.kind === 'NEW_CARDS' && first) {
    return { itemId: first.itemId };
  }
  if (post.kind === 'WANTED' && post.wanted) {
    return { wishId: post.wanted.wishId };
  }
  if (post.kind === 'DECK_CORE' && post.deckCore) {
    return { binderId: post.deckCore.binderId };
  }
  return null;
}

/** Who posted, as the header writes it: the handle, or "A collector" for a guest (stage R15). */
export function postWho(post: Pick<FeedPost, 'collector'>): string {
  return post.collector.handle || GUEST_COPY.aCollector;
}

/**
 * What a screen reader says for a post's header: "maya_k listed 12 cards, 5 min, Quebec"; for a
 * guest "A collector listed 12 cards, 5 min, Quebec. Sign in to see who" (mockup v50, 70).
 */
export function postHeaderLabel(post: FeedPost, now: Date = new Date()): string {
  const summary = HOME_COPY.headerLabel(
    postWho(post),
    postVerb(post).verb,
    feedTime(post.at, now),
    postProvince(post)
  );
  return isUnnamed(post) ? GUEST_COPY.postHeaderLabel(summary) : summary;
}

/** A card's asking price as typed ("$11.50", "90% TCG"), or null without one. */
export function previewPrice(preview: FeedCardPreview): string | null {
  return itemPriceText(preview);
}

/** A tile of a new-cards post's grid. */
export type CardTile =
  | { kind: 'card'; key: string; preview: FeedCardPreview; price: string | null; label: string }
  | { kind: 'more'; key: string; preview: FeedCardPreview | null; count: number; label: string };

/**
 * The tiles of a post of 2 or more cards (4 columns): the cards, at most 4; with 5 or more, the
 * first 3 and a dimmed 4th tile "+{n}" (n = the total minus 3) that opens the collector's cards.
 * Groups of 2 or 3 leave the other columns empty.
 */
export function gridTiles(cards: Pick<FeedNewCards, 'total' | 'previews'>): CardTile[] {
  const previews = cards.previews ?? [];
  const card = (preview: FeedCardPreview): CardTile => {
    const price = previewPrice(preview);
    return {
      kind: 'card',
      key: preview.itemId,
      preview,
      price,
      label: HOME_COPY.tileLabel(preview.name, price),
    };
  };
  if (cards.total <= 4) {
    return previews.slice(0, 4).map(card);
  }
  const more = cards.total - 3;
  return [
    ...previews.slice(0, 3).map(card),
    {
      kind: 'more',
      key: 'more',
      preview: previews[3] ?? null,
      count: more,
      label: HOME_COPY.moreTileLabel(more),
    },
  ];
}

/** Whether a new-cards post shows the grid (2 or more cards) rather than one row. */
export function isGrid(cards: Pick<FeedNewCards, 'total'>): boolean {
  return cards.total >= 2;
}

/** "{code} · {rarity}" of a single card's row, the parts it has. */
export function codeAndRarity(preview: Pick<FeedCardPreview, 'printingCode' | 'rarity'>): {
  code: string | null;
  rarity: string | null;
} {
  return { code: preview.printingCode?.trim() || null, rarity: preview.rarity?.trim() || null };
}

/** The terms of a wish as the Wishlist segment writes them ("Any printing · NM only · 85% TCG"). */
export function feedWishTerms(wish: FeedWish): string {
  return wishTerms({
    printing: wish.printing,
    rarity: wish.rarity,
    nearMintOnly: wish.nearMintOnly,
    priceTerm: wish.priceTerm,
  });
}

// ---------------------------------------------------------------------------------------------
// The end and the empty states
// ---------------------------------------------------------------------------------------------

/** "That’s everything new for Yu-Gi-Oh! in Americas (North) from the last 30 days." */
export function endText(filter: FeedFilter, game: string, region: string, days: number): string {
  return HOME_COPY.end.text(HOME_COPY.end.what[filter], game, region, days);
}

/** "No new cards in Americas (North) in the last 30 days." (and the wishes, the deck cores). */
export function chipEmptyText(
  filter: Exclude<FeedFilter, 'ALL'>,
  region: string,
  days: number
): string {
  return HOME_COPY.chipEmpty[filter](region, days);
}

/**
 * The title of the quiet state (10c): "Nothing new in {region} yet" when the whole region is
 * quiet, "Nothing new in {game} yet" when only the browsed game is.
 */
export function emptyTitle(regionHasPosts: boolean, game: string, region: string): string {
  return HOME_COPY.empty.title(regionHasPosts ? game : region);
}
