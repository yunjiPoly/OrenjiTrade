import type { GameResponse, SearchCardsRequestParams } from '@orenji/api-client';
import { QUERY_MAX_LENGTH } from '../../../shared/catalog/catalog-constants';

/** State of `/cards`, mirrored in the URL (`?q=&game=&set=&rarity=&language=&edition=&page=&size=`). */
export interface CardSearchParams {
  q: string;
  game: string | null;
  /** Set code (the API accepts an id or a code). */
  set: string | null;
  rarity: string | null;
  language: string | null;
  edition: string | null;
  page: number;
  size: number;
}

export const CARD_PAGE_SIZES: readonly number[] = [24, 48, 96];
export const DEFAULT_CARD_PAGE_SIZE = 24;

export type CardFilterKey = 'game' | 'set' | 'rarity' | 'language' | 'edition';

function text(value: string | null | undefined, max: number): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function nonNegativeInt(value: string | null | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/** Parses (and bounds, per the API's validation) the query parameters of `/cards`. */
export function parseCardSearchParams(raw: {
  q?: string | null;
  game?: string | null;
  set?: string | null;
  rarity?: string | null;
  language?: string | null;
  edition?: string | null;
  page?: string | null;
  size?: string | null;
}): CardSearchParams {
  const size = nonNegativeInt(raw.size, DEFAULT_CARD_PAGE_SIZE);
  const language = (raw.language ?? '').trim();
  return {
    q: text(raw.q, QUERY_MAX_LENGTH) ?? '',
    game: text(raw.game, 32),
    set: text(raw.set, 40),
    rarity: text(raw.rarity, 40),
    language: /^[a-z]{2}$/i.test(language) ? language.toLowerCase() : null,
    edition: text(raw.edition, 32),
    page: Math.min(nonNegativeInt(raw.page, 0), 10_000),
    size: CARD_PAGE_SIZES.includes(size) ? size : DEFAULT_CARD_PAGE_SIZE,
  };
}

/** Request for the generated `CatalogService.searchCards`. */
export function toSearchRequest(params: CardSearchParams): SearchCardsRequestParams {
  return {
    query: params.q || undefined,
    game: params.game ?? undefined,
    set: params.set ?? undefined,
    rarity: params.rarity ?? undefined,
    language: params.language ?? undefined,
    edition: params.edition ?? undefined,
    page: params.page,
    size: params.size,
  };
}

/** How many of the five filters are set. */
export function activeFilterCount(params: CardSearchParams): number {
  return [params.game, params.set, params.rarity, params.language, params.edition].filter(Boolean)
    .length;
}

/**
 * Options of one enum filter: the selected game's schema, or the union of every game's values
 * (first-seen order) when no game is selected.
 */
export function filterOptions(
  games: readonly GameResponse[],
  game: string | null,
  key: 'rarities' | 'languages' | 'editions',
): string[] {
  const source = game ? games.filter((candidate) => candidate.slug === game) : games;
  const seen = new Set<string>();
  for (const candidate of source) {
    for (const value of candidate.schema?.[key] ?? []) {
      seen.add(value);
    }
  }
  return [...seen];
}

/**
 * Query parameters after changing one filter. Changing the game clears the set and every value
 * the new game's schema does not know; any filter change goes back to the first page.
 */
export function withFilter(
  params: CardSearchParams,
  key: CardFilterKey,
  value: string | null,
  games: readonly GameResponse[],
): Record<string, string | null> {
  const next: Record<string, string | null> = { [key]: value, page: null };
  if (key === 'game') {
    next['set'] = null;
    const schema = value ? games.find((game) => game.slug === value)?.schema : null;
    if (schema) {
      if (params.rarity && !schema.rarities.includes(params.rarity)) {
        next['rarity'] = null;
      }
      if (params.language && !schema.languages.includes(params.language)) {
        next['language'] = null;
      }
      if (params.edition && !schema.editions.includes(params.edition)) {
        next['edition'] = null;
      }
    }
  }
  return next;
}
