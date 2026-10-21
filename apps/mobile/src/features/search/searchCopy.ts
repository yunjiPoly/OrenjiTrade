/**
 * The approved English copy of Search (owner spec 2026-10-14, section 8; mockup screens 11 to 15,
 * version 43; the game of stage G, version 50), one object per screen. No counts in Search: no "N
 * in your region", no printing or holder counts, no "wanted by"; the counts the design keeps are
 * the map's binders and deck cores and the number of your wishes. Search shows one game at a time
 * (stage G): its empty states name the browsed game.
 */

import { gameLabel } from '@/src/lib/profile';

/** The short names of the games (mockup screens 12 and 34: "Magic", "One Piece"). */
const SHORT_GAME_NAMES: Readonly<Record<string, string>> = { mtg: 'Magic', onepiece: 'One Piece' };

/** The name of a game in Search: its short name, else `fallback`, else the app's label. */
export function gameName(slug: string, fallback?: string): string {
  return SHORT_GAME_NAMES[slug] ?? fallback ?? gameLabel(slug);
}

/**
 * The examples of the search fields are Yu-Gi-Oh! codes and names (the mockup draws Yu-Gi-Oh!):
 * other games get the same words without an example (stage G, review fix 1, U3), never another
 * game's example.
 */
function withExample(game: string, words: string, example: string): string {
  return game === 'yugioh' ? `${words}${example}` : words;
}

/** "1 binder", "7 binders". */
export function binderCount(count: number): string {
  return `${count} ${count === 1 ? 'binder' : 'binders'}`;
}

/** "1 deck core", "5 deck cores". */
export function deckCoreCount(count: number): string {
  return `${count} ${count === 1 ? 'deck core' : 'deck cores'}`;
}

/** Search's header and segments (screens 11, 14 and 15). */
export const SEARCH_COPY = {
  title: 'Search',
  segmentsLabel: 'Search sections',
  cards: 'Cards',
  binders: 'Binders',
  wishlist: 'Wishlist',
} as const;

/** The map, Search's default view (screen 11). */
export const MAP_COPY = {
  /** The field of the browsed game (`game` is its slug). */
  field: (game: string) => withExample(game, 'Card name or code', ', like LOB-EN001'),
  fieldHint: 'Opens the card search',
  myProvince: 'Show my province',
  /**
   * The state card: "{n} binders · {n} deck cores", only the parts above 0 ("1 binder" alone, "2
   * deck cores" alone), "No public {game} binders here yet" without any. `binderCount` of the API
   * counts every public binder of the browsed game, deck cores included (stages R3 and G).
   */
  stats(binders: number, deckCores: number, game: string): string {
    const plain = Math.max(0, binders - deckCores);
    const parts = [
      plain > 0 ? binderCount(plain) : null,
      deckCores > 0 ? deckCoreCount(deckCores) : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(' · ') : `No public ${game} binders here yet`;
  },
  /** What a screen reader says for the drawn map (stage G). */
  mapLabel: (game: string, region: string) =>
    `Map of public ${game} binders by state or province in ${region}`,
  /** "Canada · your province", or the country alone. */
  stateSubtitle(country: string, mine: boolean): string {
    return mine ? `${country} · your province` : country;
  },
  seeBinders: 'See binders',
  close: 'Close',
  countsError: 'We could not count the binders right now.',
  tryAgain: 'Try again',
  /** Screen readers choose a state or province from this list instead of the drawn map. */
  listTitle: 'States and provinces',
  privacy:
    'OrenjiTrade never uses your GPS: collectors choose their state or province, and that is all anyone sees.',
} as const;

/** Typing a card (screen 12): the browsed game's cards only, no game chips (stage G). */
export const TYPING_COPY = {
  /** The field's name and placeholder: "{game} card name or code". */
  field: (game: string) => `${game} card name or code`,
  clear: 'Clear search',
  cancel: 'Cancel',
  collectors: 'Collectors',
  recent: 'Recent searches',
  clearRecent: 'Clear',
  clearRecentLabel: 'Clear recent searches',
  privacy: 'Only you see your searches. You can turn this off in Settings › Privacy.',
  noMatch: (game: string, text: string) => `No ${game} card matches “${text}”`,
  noMatchHint: (game: string) =>
    withExample(game, 'Try fewer letters, or the code printed on the card', ', like LAVD-EN008') +
    '.',
  loading: 'Loading cards',
  error: 'Cards could not load',
  searchAgain: (text: string) => `Search again for ${text}`,
} as const;

/** Who has this card, the one card page (screen 13). */
export const CARD_PAGE_COPY = {
  back: 'Back',
  addToWishlist: 'Add to wishlist',
  onWishlist: 'On your wishlist',
  wishAdded: (name: string) => `${name} is on your wishlist. Refine it in Search › Wishlist.`,
  wishRemoved: (name: string) => `${name} left your wishlist.`,
  tcgplayer: 'Check TCGplayer price',
  tcgplayerLabel: 'Check the TCGplayer price, opens in your browser',
  anyPrinting: 'Any printing',
  /** A wish of any printing in one rarity ("Available", its alert): the wish's own words. */
  anyPrintingIn: (rarity: string) => `Any printing · ${rarity}`,
  printingSheet: 'Printing',
  printingLine: (code: string, rarity: string | null | undefined) =>
    rarity ? `${code} · ${rarity}` : code,
  deckCoreBanner: 'Also in a deck core',
  /** "{core} · {handle} · {province} · {price}". */
  deckCoreLine: (
    core: string,
    handle: string,
    province: string | null,
    price: string | null | undefined
  ) => [core, handle, province, price || null].filter(Boolean).join(' · '),
  ownProvince: (province: string) => `${province} · your province`,
  message: (handle: string) => `Message ${handle}`,
  openProfile: (handle: string) => `${handle}, open profile`,
  empty: (region: string) => `Nobody in ${region} lists this card yet.`,
  emptyPrinting: (region: string) => `Nobody in ${region} lists this printing yet.`,
  emptyRarity: (region: string, rarity: string) =>
    `Nobody in ${region} lists this card in ${rarity} yet.`,
  loading: 'Loading the card',
  error: 'This card could not load',
  holdersError: 'The holders could not load',
  notFound: 'Card not found',
  notFoundHint: 'This card does not exist or is no longer in the catalog.',
  searchCards: 'Search cards',
} as const;

/** Search › Binders (screen 14). */
export const BINDERS_COPY = {
  fieldLabel: 'Deck, binder or collector',
  placeholder: (game: string) => withExample(game, 'Deck, binder or collector', ', like Yubel'),
  /** The state chip: what it says to a screen reader. */
  stateChip: (state: string) => `Showing ${state}. Show the whole region`,
  pickOnMap: 'Pick on the map',
  kindsLabel: 'Show',
  binders: 'Binders',
  deckCores: 'Deck cores',
  /** A binder row: "{handle} · {n} cards", with the province when the whole region is listed. */
  binderLine: (handle: string, province: string | null, cards: number) =>
    [handle, province, `${cards} ${cards === 1 ? 'card' : 'cards'}`].filter(Boolean).join(' · '),
  /** A deck core row: "{handle}", with the province when the whole region is listed. */
  coreLine: (handle: string, province: string | null) =>
    [handle, province].filter(Boolean).join(' · '),
  noBinders: (game: string) => `No public ${game} binders here yet.`,
  noDeckCores: (game: string) => `No ${game} deck cores for sale here yet.`,
  noMatch: 'Nothing matches. Try a deck name, a card name or a collector.',
  loading: 'Loading binders',
  error: 'Binders could not load',
} as const;

/** Search › Wishlist (screen 15). */
export const WISHLIST_COPY = {
  alerts: 'Tell me when someone in my region lists one',
  alertsLabel: 'Wishlist alerts',
  alertsOn: 'We tell you when someone in your region lists one of your wishes.',
  alertsOff: 'Wishlist alerts are off.',
  addWish: 'Add a wish',
  available: 'Available',
  availableLabel: 'Available: a collector of your region lists it. Opens who has this card.',
  none: 'None yet',
  anyPrinting: 'Any printing',
  nearMintOnly: 'NM only',
  empty: 'No wishes yet',
  emptyHint: 'Add the cards you are looking for. Wishlist alerts tell you when someone lists one.',
  /** Wishes of other games only: the browsed game has none (stage G). */
  emptyGame: (game: string) => `No ${game} wishes yet`,
  emptyGameHint: (game: string) =>
    `Add the ${game} cards you are looking for. Your other games' wishes show when you switch game.`,
  loading: 'Loading your wishlist',
  error: 'Your wishlist could not load',
  needsLocation:
    'Choose your state or province in Settings › Location so collectors of your region can be found for your wishes.',
} as const;
