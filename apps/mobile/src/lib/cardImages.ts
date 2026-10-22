import { absoluteApiUrl, API_BASE_URL } from '@/src/api/client';

/**
 * Card pictures (ADR 0015, ADR 0021): the app only ever displays pictures the API serves under
 * `/api/v1/public/` (`card-images/{id}`: the capped local cache or a placeholder;
 * `placeholder-images/**`; `media/**`). Provider URLs (YGOPRODeck, Scryfall, TCGdex) stay
 * server-side and are never hotlinked: any other URL is refused and the placeholder art is shown
 * instead.
 */
const ALLOWED_PREFIXES = [
  '/api/v1/public/card-images/',
  '/api/v1/public/placeholder-images/',
  '/api/v1/public/media/',
];

function originOf(url: string): string | null {
  const match = /^(https?:\/\/[^/?#]+)/i.exec(url);
  return match?.[1]?.toLowerCase() ?? null;
}

function pathOf(url: string): string {
  const withoutOrigin = url.replace(/^https?:\/\/[^/?#]+/i, '');
  return withoutOrigin.split(/[?#]/)[0] ?? '';
}

/**
 * The absolute URL to render for an API-provided picture, or null when the value is empty or is
 * not one of the API's public picture routes on the API origin.
 */
export function safeCardImageUrl(
  src: string | null | undefined,
  apiBaseUrl: string = API_BASE_URL
): string | null {
  const value = src?.trim();
  if (!value) {
    return null;
  }
  const absolute = /^https?:\/\//i.test(value) ? value : absoluteApiUrl(value);
  if (originOf(absolute) !== originOf(apiBaseUrl)) {
    return null;
  }
  const path = pathOf(absolute);
  if (path.includes('..') || !ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return null;
  }
  return absolute;
}

/**
 * Credits owed for each game's catalog source (Yu-Gi-Oh! as the web's attributions; Magic and
 * Pokémon from stage R10, ADR 0021). `credit` + `provider` + `creditSuffix` is the line shown under
 * a card's pictures, `notice` the publisher's notice; `aboutLine` is the game's sentence in
 * Settings › Appearance. The Magic and Pokémon notices are drafts for the lawyer review.
 */
export interface CardDataAttribution {
  game: string;
  provider: string;
  providerUrl: string;
  credit: string;
  creditSuffix?: string;
  notice: string;
  aboutLine: string;
}

export const CARD_DATA_ATTRIBUTIONS: readonly CardDataAttribution[] = [
  {
    // docs/providers/ygoprodeck.md, "Copyright and attribution".
    game: 'yugioh',
    provider: 'YGOPRODeck',
    providerUrl: 'https://ygoprodeck.com',
    credit: 'Card data and images courtesy of',
    notice:
      'Yu-Gi-Oh! is a trademark of Konami Digital Entertainment, Inc.; card content © 4K Media Inc. ' +
      'OrenjiTrade is not affiliated with Konami or 4K Media.',
    aboutLine: 'Yu-Gi-Oh! card data from YGOPRODeck.',
  },
  {
    // docs/providers/tcgdex.md, "Copyright and attribution" (draft for the lawyer review).
    game: 'pokemon',
    provider: 'TCGdex',
    providerUrl: 'https://tcgdex.dev',
    credit: 'Card data courtesy of',
    creditSuffix: ' (MIT licence)',
    notice:
      'Pokémon card content is © The Pokémon Company, Nintendo, Creatures and GAME FREAK. ' +
      'OrenjiTrade is not affiliated with them.',
    aboutLine: 'Pokémon card data from TCGdex.',
  },
  {
    // docs/providers/scryfall.md, "Copyright and attribution": Wizards of the Coast's Fan Content
    // Policy notice (draft for the lawyer review).
    game: 'mtg',
    provider: 'Scryfall',
    providerUrl: 'https://scryfall.com',
    credit: 'Card data and images courtesy of',
    notice:
      'OrenjiTrade is unofficial Fan Content permitted under the Fan Content Policy. Not ' +
      'approved/endorsed by Wizards. Portions of the materials used are property of Wizards of ' +
      'the Coast. ©Wizards of the Coast LLC.',
    aboutLine: 'Magic card data and images from Scryfall.',
  },
];

export function attributionFor(game: string | null | undefined): CardDataAttribution | null {
  return CARD_DATA_ATTRIBUTIONS.find((entry) => entry.game === game) ?? null;
}

/**
 * The credits Settings › Appearance shows: those of the games whose catalogue holds cards, in the
 * games' order. Without the games list (still loading, or offline) every credit is shown: a credit
 * never misleads, a missing one would.
 */
export function creditedGames(
  games: readonly { slug?: string | null; hasCards?: boolean | null }[] | null | undefined
): CardDataAttribution[] {
  if (!games) {
    return [...CARD_DATA_ATTRIBUTIONS];
  }
  return games
    .filter((game) => game.hasCards === true)
    .map((game) => attributionFor(game.slug))
    .filter((entry): entry is CardDataAttribution => entry !== null);
}
