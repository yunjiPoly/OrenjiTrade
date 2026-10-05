import type { CardSearchQuery } from '@/src/api/hooks/catalog';
import type { GameResponse } from '@/src/api/types';

/**
 * Filter rules of the Search tab (mirror of the web's `features/catalog/card-search/
 * card-search-params.ts`): rarity, language and edition options come from the selected game's
 * `GameSchema` (every game's values when none is selected); changing the game clears the set and
 * every value the new game does not know.
 */

export type CardFilterKey = 'game' | 'set' | 'rarity' | 'language' | 'edition';

/** How many of the five filters are set. */
export function activeFilterCount(query: CardSearchQuery): number {
  return [query.game, query.set, query.rarity, query.language, query.edition].filter(Boolean)
    .length;
}

/** Filters other than the game (the chips row shows the game). */
export function extraFilterCount(query: CardSearchQuery): number {
  return [query.set, query.rarity, query.language, query.edition].filter(Boolean).length;
}

/**
 * Options of one enum filter: the selected game's schema, or the union of every game's values
 * (first-seen order) when no game is selected.
 */
export function filterOptions(
  games: readonly GameResponse[],
  game: string | null,
  key: 'rarities' | 'languages' | 'editions'
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

/** The query after changing one filter (see the rules above). */
export function withFilter(
  query: CardSearchQuery,
  key: CardFilterKey,
  value: string | null,
  games: readonly GameResponse[]
): CardSearchQuery {
  const next: CardSearchQuery = { ...query, [key]: value };
  if (key === 'game') {
    next.set = null;
    const schema = value ? games.find((game) => game.slug === value)?.schema : null;
    if (schema) {
      if (next.rarity && !schema.rarities.includes(next.rarity)) {
        next.rarity = null;
      }
      if (next.language && !schema.languages.includes(next.language)) {
        next.language = null;
      }
      if (next.edition && !schema.editions.includes(next.edition)) {
        next.edition = null;
      }
    }
  }
  return next;
}

/** The query without any filter (the text stays). */
export function withoutFilters(query: CardSearchQuery): CardSearchQuery {
  return { ...query, game: null, set: null, rarity: null, language: null, edition: null };
}

/** True when the search narrows the catalog in any way. */
export function hasCriteria(query: CardSearchQuery): boolean {
  return !!query.q || activeFilterCount(query) > 0;
}
