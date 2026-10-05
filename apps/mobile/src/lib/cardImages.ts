import { absoluteApiUrl, API_BASE_URL } from '@/src/api/client';

/**
 * Card pictures (ADR 0015): the app only ever displays pictures the API serves under
 * `/api/v1/public/` (`card-images/{id}`: the capped local cache or a placeholder;
 * `placeholder-images/**`; `media/**`). Provider URLs (YGOPRODeck, ...) stay server-side and are
 * never hotlinked: any other URL is refused and the placeholder art is shown instead.
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

/** Credits owed for each game's catalog source (same entries as the web's attributions). */
export interface CardDataAttribution {
  game: string;
  provider: string;
  providerUrl: string;
  credit: string;
  notice: string;
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
  },
];

export function attributionFor(game: string | null | undefined): CardDataAttribution | null {
  return CARD_DATA_ATTRIBUTIONS.find((entry) => entry.game === game) ?? null;
}
